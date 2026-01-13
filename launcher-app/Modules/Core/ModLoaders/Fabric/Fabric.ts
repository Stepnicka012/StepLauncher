import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { EventEmitter } from 'events';

export interface FabricDownloaderOptions {
	version: string;
	root: string;
	concurrency?: number;
	maxRetries?: number;
	loaderVersion?: string;
}

interface FabricLoaderVersion {
	version: string;
	stable: boolean;
	[key: string]: any;
}

interface FabricLibrary {
	name: string;
	url?: string;
	[key: string]: any;
}

interface FabricProfile {
	id: string;
	libraries: FabricLibrary[];
	[key: string]: any;
}

interface DownloadTask {
	url: string;
	dest: string;
	name: string;
	type: 'profile' | 'library' | 'loader';
	retries: number;
}

export interface DownloadProgress {
	total: number;
	downloaded: number;
	currentFile: string;
	speed: number;
}

export class FabricDownloader extends EventEmitter {
	private options: Required<FabricDownloaderOptions>;
	private minecraftPath: string;
	private isDownloading: boolean = false;
	private isPaused: boolean = false;
	private downloadQueue: DownloadTask[] = [];
	private activeDownloads: Set<Promise<void>> = new Set();
	private totalBytes: number = 0;
	private downloadedBytes: number = 0;
	private startTime: number = 0;
	
	private loaderApiUrl = 'https://meta.fabricmc.net/v1/versions/loader';
	private profileBaseUrl = 'https://meta.fabricmc.net/v2/versions/loader';
	
	constructor(options: FabricDownloaderOptions) {
		super();
		
		this.options = {
			concurrency: 10,
			maxRetries: 15,
			loaderVersion: '',
			...options
		};
		
		this.minecraftPath = path.resolve(options.root);
		
		this.setMaxListeners(50);
	}
	
	private getVersionId(loaderVersion: string): string {
		return `fabric-${this.options.version}-${loaderVersion}`;
	}
	
	private async fetchJson<T = any>(url: string): Promise<T> {
		return new Promise((resolve, reject) => {
			https.get(url, (res) => {
				if (res.statusCode !== 200) {
					res.resume();
					return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				}
				
				let data = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(data) as T);
					} catch (e) {
						reject(new Error(`Failed to parse JSON from ${url}: ${(e as Error).message}`));
					}
				});
			})
			.on('error', reject)
			.setTimeout(30000, () => {
				reject(new Error(`Timeout fetching ${url}`));
			});
		});
	}
	
	private async downloadWithProgress(task: DownloadTask): Promise<void> {
		const MAX_REDIRECTS = 5;
		
		const downloadRecursive = async (
			url: string, 
			dest: string, 
			redirectCount = 0
		): Promise<void> => {
			if (redirectCount > MAX_REDIRECTS) {
				throw new Error(`Too many redirects for ${url}`);
			}
			
			if (fs.existsSync(dest)) {
				const stats = fs.statSync(dest);
				if (stats.size > 0) {
					console.log(`  [Skip] Archivo ya existe: ${path.basename(dest)}`);
					return;
				}
			}
			
			if (this.isPaused) {
				await new Promise(resolve => {
					const checkPause = () => {
						if (!this.isPaused) {
							this.removeListener('resumed', checkPause);
							resolve(undefined);
						}
					};
					this.on('resumed', checkPause);
				});
			}
			
			return new Promise((resolve, reject) => {
				const dir = path.dirname(dest);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
				
				const file = fs.createWriteStream(dest, { flags: 'w' });
				
				const client = url.startsWith('https') ? https : http;
				
				let downloaded = 0;
				let lastUpdate = Date.now();
				let speed = 0;
				
				const updateProgress = (chunkLength: number) => {
					downloaded += chunkLength;
					this.downloadedBytes += chunkLength;
					
					const now = Date.now();
					const timeDiff = now - lastUpdate;
					
					if (timeDiff >= 1000) {
						speed = downloaded / (timeDiff / 1000);
						lastUpdate = now;
						downloaded = 0;
					}
					
					this.emit('bytes', chunkLength);
					
					if (this.listenerCount('progress') > 0) {
						const progress: DownloadProgress = {
							total: this.totalBytes,
							downloaded: this.downloadedBytes,
							currentFile: task.name,
							speed: speed
						};
						this.emit('progress', progress);
					}
				};
				
				const request = client.get(url, (res) => {
					const statusCode = res.statusCode || 0;
					
					if ([301, 302, 303, 307, 308].includes(statusCode)) {
						const redirectUrl = res.headers.location;
						if (!redirectUrl) {
							file.close();
							fs.unlink(dest, () => {});
							return reject(new Error(`Redirect without location header for ${url}`));
						}
						file.close();
						fs.unlink(dest, () => {});
						const resolvedUrl = new URL(redirectUrl, url).toString();
						return resolve(downloadRecursive(resolvedUrl, dest, redirectCount + 1));
					}
					
					if (statusCode !== 200) {
						file.close();
						fs.unlink(dest, () => {});
						return reject(new Error(`HTTP ${statusCode} for ${url}`));
					}
					
					const contentLength = parseInt(res.headers['content-length'] || '0', 10);
					if (contentLength > 0) {
						this.totalBytes += contentLength;
					}
					
					res.on('data', (chunk) => {
						if (this.isPaused) {
							request.destroy();
							file.close();
							return;
						}
						updateProgress(chunk.length);
					});
					
					res.pipe(file);
					
					file.on('finish', () => {
						file.close();
						resolve();
					});
					
					file.on('error', (err) => {
						file.close();
						fs.unlink(dest, () => {});
						reject(err);
					});
				});
				
				request.on('error', (err) => {
					file.close();
					fs.unlink(dest, () => {});
					reject(err);
				});
				
				request.setTimeout(30000, () => {
					request.destroy();
					file.close();
					fs.unlink(dest, () => {});
					reject(new Error(`Timeout connecting to ${url}`));
				});
			});
		};
		
		return downloadRecursive(task.url, task.dest);
	}
	
	private getLibraryPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) {
			throw new Error(`Invalid library name format: ${name}`);
		}
		
		const [group, artifact, version] = parts;
		if (!group || !artifact || !version) {
			throw new Error(`Invalid library name format: ${name}`);
		}
		
		const groupPath = group.replace(/\./g, '/');
		return path.join(groupPath, artifact, version, `${artifact}-${version}.jar`);
	}
	
	private getLibraryUrlPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) {
			throw new Error(`Invalid library name format: ${name}`);
		}
		
		const [group, artifact, version] = parts;
		if (!group || !artifact || !version) {
			throw new Error(`Invalid library name format: ${name}`);
		}
		
		const groupPath = group.replace(/\./g, '/');
		return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
	}
	
	private async fetchLatestStableLoader(): Promise<string> {
		try {
			const loaders = await this.fetchJson<FabricLoaderVersion[]>(this.loaderApiUrl);
			if (!Array.isArray(loaders) || loaders.length === 0) {
				throw new Error(`No loader data available for Minecraft version ${this.options.version}`);
			}
			
			const stableLoader = loaders.find((l) => l.stable === true) || loaders[0];
			if (!stableLoader) {
				throw new Error(`No loader version found for ${this.options.version}`);
			}
			
			return stableLoader.version;
		} catch (error) {
			throw new Error(`Failed to fetch loader version: ${(error as Error).message}`);
		}
	}
	
	private async processQueue(): Promise<void> {
		while (this.downloadQueue.length > 0 && this.isDownloading && !this.isPaused) {
			if (this.activeDownloads.size >= this.options.concurrency) {
				await Promise.race(this.activeDownloads);
				continue;
			}
			
			const task = this.downloadQueue.shift();
			if (!task) continue;
			
			const downloadPromise = this.processDownloadTask(task);
			this.activeDownloads.add(downloadPromise);
			
			downloadPromise
			.then(() => {
				this.activeDownloads.delete(downloadPromise);
				this.emit('fileComplete', {
					name: task.name,
					type: task.type,
					url: task.url,
					dest: task.dest
				});
			})
			.catch(async (error) => {
				this.activeDownloads.delete(downloadPromise);
				
				if (task.retries < this.options.maxRetries) {
					task.retries++;
					this.downloadQueue.unshift(task);
					console.warn(`Retrying ${task.name} (${task.retries}/${this.options.maxRetries})`);
				} else {
					this.emit('fileError', {
						name: task.name,
						type: task.type,
						error: error.message,
						url: task.url
					});
				}
			});
		}
		
		if (this.activeDownloads.size > 0) {
			await Promise.all(this.activeDownloads);
		}
	}
	
	private async processDownloadTask(task: DownloadTask): Promise<void> {
		this.emit('fileStart', {
			name: task.name,
			type: task.type,
			url: task.url
		});
		
		await this.downloadWithProgress(task);
	}
	
	public pause(): void {
		if (this.isDownloading && !this.isPaused) {
			this.isPaused = true;
			this.emit('paused');
		}
	}
	
	public resume(): void {
		if (this.isDownloading && this.isPaused) {
			this.isPaused = false;
			this.emit('resumed');
			this.processQueue();
		}
	}
	
	public stop(): void {
		this.isDownloading = false;
		this.isPaused = false;
		this.downloadQueue = [];
		this.activeDownloads.clear();
		this.emit('stopped');
	}
	
	public async start(): Promise<boolean> {
		if (this.isDownloading) {
			throw new Error('Download already in progress');
		}
		
		this.isDownloading = true;
		this.isPaused = false;
		this.downloadQueue = [];
		this.activeDownloads.clear();
		this.totalBytes = 0;
		this.downloadedBytes = 0;
		this.startTime = Date.now();
		
		this.emit('start');
		
		try {
			let loaderVersion = this.options.loaderVersion;
			if (!loaderVersion) {
				this.emit('fileStart', { name: 'Loader Metadata', type: 'loader', url: this.loaderApiUrl });
				loaderVersion = await this.fetchLatestStableLoader();
				this.emit('fileComplete', { name: 'Loader Metadata', type: 'loader' });
			}
			
			const versionId = this.getVersionId(loaderVersion);
			
			const versionDir = path.join(this.minecraftPath, 'versions', versionId);
			const profilePath = path.join(versionDir, `${versionId}.json`);
			
			let profileJson: FabricProfile | null = null;
			let totalLibraries = 0;
			
			if (!fs.existsSync(profilePath)) {
				const profileUrl = `${this.profileBaseUrl}/${this.options.version}/${loaderVersion}/profile/json`;
				
				this.emit('fileStart', { name: 'Profile JSON', type: 'profile', url: profileUrl });
				profileJson = await this.fetchJson<FabricProfile>(profileUrl);
				this.emit('fileComplete', { name: 'Profile JSON', type: 'profile' });
				
				fs.mkdirSync(versionDir, { recursive: true });
				fs.writeFileSync(profilePath, JSON.stringify(profileJson, null, 2));
				
				if (Array.isArray(profileJson.libraries) && profileJson.libraries.length > 0) {
					totalLibraries = profileJson.libraries.length;
					for (const lib of profileJson.libraries) {
						const libPathFs = this.getLibraryPath(lib.name);
						const libPathUrl = this.getLibraryUrlPath(lib.name);
						const urlBase = lib.url || 'https://repo1.maven.org/maven2/';
						const fullUrl = urlBase.endsWith('/') ? urlBase + libPathUrl : `${urlBase}/${libPathUrl}`;
						const dest = path.join(this.minecraftPath, 'libraries', libPathFs);
						
						if (fs.existsSync(dest)) {
							const stats = fs.statSync(dest);
							if (stats.size > 0) {
								console.log(`[Skip] ${lib.name} ya existe.`);
								totalLibraries--;
								continue;
							}
						}
						
						this.downloadQueue.push({
							url: fullUrl,
							dest: dest,
							name: lib.name,
							type: 'library',
							retries: 0
						});
					}
				}
			} else {
				console.log(`Fabric ya está instalado para ${versionId}`);
				this.emit('done', { alreadyInstalled: true });
				return true;
			}
			
			await this.processQueue();
			const hasErrors = this.listenerCount('fileError') > 0;
			
			if (!hasErrors) {
				const elapsed = (Date.now() - this.startTime) / 1000;
				this.emit('done', {
					success: true,
					versionId,
					loaderVersion,
					totalLibraries: totalLibraries,
					elapsedTime: elapsed,
					totalBytes: this.totalBytes
				});
				return true;
			} else {
				this.emit('error', new Error('Some downloads failed'));
				return false;
			}
			
		} catch (error) {
			this.emit('error', error as Error);
			return false;
		} finally {
			this.isDownloading = false;
		}
	}
	
	public getStats() {
		return {
			isDownloading: this.isDownloading,
			isPaused: this.isPaused,
			queueLength: this.downloadQueue.length,
			activeDownloads: this.activeDownloads.size,
			downloadedBytes: this.downloadedBytes,
			totalBytes: this.totalBytes,
			elapsedTime: this.startTime ? (Date.now() - this.startTime) / 1000 : 0
		};
	}
}

export default FabricDownloader;
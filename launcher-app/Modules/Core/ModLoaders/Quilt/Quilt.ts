import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

export interface QuiltDownloaderOptions {
	version: string;
	root: string;
	concurrency?: number;
	maxRetries?: number;
}

export interface DownloadProgress {
	downloaded: number;
	total: number;
}

export interface FileInfo {
	name: string;
	type: string;
	size?: number;
}

export interface QuiltDownloaderEvents {
	start: () => void;
	bytes: (bytes: number) => void;
	done: (result: boolean) => void;
	paused: () => void;
	resumed: () => void;
	stopped: () => void;
	progress: (progress: DownloadProgress) => void;
	fileStart: (file: FileInfo) => void;
	fileComplete: (file: FileInfo) => void;
	fileError: (error: { name: string; error: Error }) => void;
	error: (error: Error) => void;
}

interface QuiltLoader {
	version: string;
	stable: boolean;
	[key: string]: any;
}

interface QuiltLibrary {
	name: string;
	url?: string;
}

interface QuiltProfile {
	libraries: QuiltLibrary[];
	[key: string]: any;
}

export default class QuiltDownloader extends EventEmitter {
	private minecraftPath: string;
	private gameVersion: string;
	public outputDir: string;
	private loaderApiUrl: string;
	private concurrency: number;
	private maxRetries: number;
	private isPaused: boolean = false;
	private isStopped: boolean = false;
	private downloadedBytes: number = 0;
	private totalBytes: number = 0;
	private activeDownloads: number = 0;
	private activeRequests: http.ClientRequest[] = [];
	
	constructor(options: QuiltDownloaderOptions) {
		super();
		this.minecraftPath = path.resolve(options.root);
		this.gameVersion = options.version;
		this.concurrency = options.concurrency || 5;
		this.maxRetries = options.maxRetries || 10;
		
		this.outputDir = path.join(this.minecraftPath, 'temp', 'quilt');
		this.loaderApiUrl = 'https://meta.quiltmc.org/v3/versions/loader';
	}
	
	private getVersionId(loaderVersion: string): string {
		return `quilt-${this.gameVersion}-${loaderVersion}`;
	}
	
	private async fetchJson(url: string): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			const req = https.get(url, res => {
				if (res.statusCode !== 200) {
					return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				}
				
				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e as Error);
					}
				});
			}).on('error', reject);
			
			this.activeRequests.push(req);
		});
	}
	
	private async downloadFileWithRetry(url: string, dest: string, _name: string): Promise<void> {
		let retries = 0;
		
		while (retries <= this.maxRetries) {
			if (this.isStopped) {
				throw new Error('Download stopped');
			}
			
			while (this.isPaused) {
				await new Promise<void>(resolve => setTimeout(resolve, 100));
				if (this.isStopped) {
					throw new Error('Download stopped');
				}
			}
			
			try {
				await this.downloadFile(url, dest, 0);
				return;
			} catch (error) {
				retries++;
				if (retries > this.maxRetries) {
					throw error;
				}
				await new Promise<void>(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
			}
		}
	}
	
	private downloadFile(url: string, dest: string, redirectCount: number): Promise<void> {
		const MAX_REDIRECTS = 5;
		
		return new Promise<void>((resolve, reject) => {
			if (redirectCount > MAX_REDIRECTS) {
				return reject(new Error(`Too many redirects`));
			}
			
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			const file = fs.createWriteStream(dest);
			
			const client = url.startsWith('https') ? https : http;
			
			const request = client.get(url, res => {
				if ([301, 302, 303, 307, 308].includes(res.statusCode!)) {
					const redirectUrl = res.headers.location;
					if (!redirectUrl) {
						file.close();
						fs.unlinkSync(dest);
						return reject(new Error(`Redirect without location`));
					}
					file.close();
					fs.unlinkSync(dest);
					return resolve(this.downloadFile(redirectUrl, dest, redirectCount + 1));
				}
				
				if (res.statusCode !== 200) {
					file.close();
					fs.unlinkSync(dest);
					return reject(new Error(`HTTP ${res.statusCode}`));
				}
				
				const timeoutId = setTimeout(() => {
					request.abort();
					file.close();
					fs.unlinkSync(dest);
					reject(new Error(`Timeout`));
				}, 30000);
				
				res.on('data', (chunk: Buffer) => {
					if (this.isStopped) {
						request.abort();
						file.close();
						fs.unlinkSync(dest);
						reject(new Error('Download stopped'));
						return;
					}
					
					while (this.isPaused) {
						res.pause();
						setTimeout(() => {
							if (!this.isPaused && !this.isStopped) {
								res.resume();
							}
						}, 100);
					}
					
					this.downloadedBytes += chunk.length;
					this.emit('bytes', chunk.length);
					this.emit('progress', {
						downloaded: this.downloadedBytes,
						total: this.totalBytes
					});
				});
				
				res.pipe(file);
				
				file.on('finish', () => {
					clearTimeout(timeoutId);
					file.close();
					resolve();
				});
				
				res.on('error', (err: Error) => {
					clearTimeout(timeoutId);
					file.close();
					fs.unlinkSync(dest);
					reject(err);
				});
			});
			
			this.activeRequests.push(request);
			
			request.on('error', (err: Error) => {
				file.close();
				fs.unlinkSync(dest);
				reject(err);
			});
			
			request.on('close', () => {
				const index = this.activeRequests.indexOf(request);
				if (index > -1) {
					this.activeRequests.splice(index, 1);
				}
			});
		});
	}
	
	private getLibraryPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) throw new Error(`Invalid library name`);
		const [group, artifact, version] = parts;
		const groupPath = group!.replace(/\./g, '/');
		return path.join(groupPath, artifact || "", version || "", `${artifact}-${version}.jar`);
	}
	
	private getLibraryUrlPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) throw new Error(`Invalid library name`);
		const [group, artifact, version] = parts;
		const groupPath = group!.replace(/\./g, '/');
		return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
	}
	
	private async fetchLatestStableLoader(): Promise<string> {
		const loaders = await this.fetchJson(this.loaderApiUrl);
		
		if (!Array.isArray(loaders) || loaders.length === 0) {
			throw new Error('No loader data');
		}
		
		const stableLoaders = loaders.filter((l: QuiltLoader) => l.stable === true);
		
		if (stableLoaders.length > 0) {
			return stableLoaders[0].version;
		}
		
		return loaders[0].version;
	}
	
	public pause(): void {
		this.isPaused = true;
		this.emit('paused');
	}
	
	public resume(): void {
		this.isPaused = false;
		this.emit('resumed');
	}
	
	public stop(): void {
		this.isStopped = true;
		this.activeRequests.forEach(req => req.abort());
		this.activeRequests = [];
		this.emit('stopped');
	}
	
	async start(): Promise<boolean> {
		this.emit('start');
		
		try {
			let loaderVersion: string;
			try {
				loaderVersion = await this.fetchLatestStableLoader();
			} catch (err: any) {
				this.emit('error', err);
				return false;
			}
			
			const versionId = this.getVersionId(loaderVersion);
			
			const profileUrl = `https://meta.quiltmc.org/v3/versions/loader/${this.gameVersion}/${loaderVersion}/profile/json`;
			
			let profileJson: QuiltProfile;
			try {
				profileJson = await this.fetchJson(profileUrl);
			} catch (err: any) {
				this.emit('error', err);
				return false;
			}
			
			try {
				const versionDir = path.join(this.minecraftPath, 'versions', versionId);
				fs.mkdirSync(versionDir, { recursive: true });
				const profilePath = path.join(versionDir, `${versionId}.json`);
				fs.writeFileSync(profilePath, JSON.stringify(profileJson, null, 2));
			} catch (err: any) {
				this.emit('error', err);
				return false;
			}
			
			if (!Array.isArray(profileJson.libraries)) {
				this.emit('done', true);
				return true;
			}
			
			this.totalBytes = profileJson.libraries.length * 500000;
			this.downloadedBytes = 0;
			
			const failedLibs: string[] = [];
			const downloadPromises: Promise<void>[] = [];
			const libraries = profileJson.libraries;
			
			const processDownloads = async (): Promise<void> => {
				for (let i = 0; i < libraries.length; i++) {
					if (this.isStopped) break;
					
					while (this.activeDownloads >= this.concurrency) {
						await new Promise<void>(resolve => setTimeout(resolve, 100));
						if (this.isStopped) break;
					}
					
					if (this.isStopped) break;
					
					const lib = libraries[i];
					this.activeDownloads++;
					
					downloadPromises.push(
						(async (): Promise<void> => {
							try {
								const libPathFs = this.getLibraryPath(lib!.name);
								const libPathUrl = this.getLibraryUrlPath(lib!.name);
								const urlBase = lib!.url || 'https://repo1.maven.org/maven2/';
								const fullUrl = urlBase.endsWith('/') ? urlBase + libPathUrl : urlBase + '/' + libPathUrl;
								const dest = path.join(this.minecraftPath, 'libraries', libPathFs);
								
								if (fs.existsSync(dest)) {
									this.emit('fileComplete', { name: lib!.name, type: 'library' });
									return;
								}
								
								this.emit('fileStart', { name: lib!.name, type: 'library' });
								
								await this.downloadFileWithRetry(fullUrl, dest, lib!.name);
								
								this.emit('fileComplete', { name: lib!.name, type: 'library' });
							} catch (e: any) {
								failedLibs.push(lib!.name);
								this.emit('fileError', { name: lib!.name, error: e });
							} finally {
								this.activeDownloads--;
							}
						})()
					);
				}
			};
			
			await processDownloads();
			await Promise.all(downloadPromises);
			
			if (this.isStopped) {
				this.emit('stopped');
				return false;
			}
			
			if (failedLibs.length > 0) {
				this.emit('done', false);
				return false;
			}
			
			this.emit('done', true);
			return true;
			
		} catch (error: any) {
			this.emit('error', error);
			return false;
		}
	}
}

export { QuiltDownloader };
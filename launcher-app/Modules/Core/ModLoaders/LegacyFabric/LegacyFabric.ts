import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

export interface DownloaderOptions {
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

export interface DownloaderEvents {
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

export default class LegacyFabricDownloader extends EventEmitter {
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
	
	constructor(options: DownloaderOptions) {
		super();
		this.minecraftPath = path.resolve(options.root);
		this.gameVersion = options.version;
		this.concurrency = options.concurrency || 5;
		this.maxRetries = options.maxRetries || 10;
		
		this.outputDir = path.join(this.minecraftPath, 'temp', 'legacyfabric');
		this.loaderApiUrl = `https://meta.legacyfabric.net/v2/versions/loader/${encodeURIComponent(this.gameVersion)}`;
	}
	
	private getVersionId(loaderVersion: string): string {
		return `legacyfabric-${this.gameVersion}-${loaderVersion}`;
	}
	
	private async fetchJson(url: string): Promise<any> {
		return new Promise((resolve, reject) => {
			https.get(url, res => {
				if (res.statusCode !== 200) {
					return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				}
				
				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				});
			}).on('error', reject);
		});
	}
	
	private async downloadFileWithRetry(url: string, dest: string, _name: string): Promise<void> {
		let retries = 0;
		
		while (retries <= this.maxRetries) {
			if (this.isStopped) {
				throw new Error('Download stopped by user');
			}
			
			while (this.isPaused) {
				await new Promise(resolve => setTimeout(resolve, 100));
				if (this.isStopped) {
					throw new Error('Download stopped by user');
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
				await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
			}
		}
	}
	
	private downloadFile(url: string, dest: string, redirectCount: number): Promise<void> {
		const MAX_REDIRECTS = 5;
		
		return new Promise((resolve, reject) => {
			if (redirectCount > MAX_REDIRECTS) {
				return reject(new Error(`Too many redirects for ${url}`));
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
						return reject(new Error(`Redirect without Location for ${url}`));
					}
					file.close();
					fs.unlinkSync(dest);
					return resolve(this.downloadFile(redirectUrl, dest, redirectCount + 1));
				}
				
				if (res.statusCode !== 200) {
					file.close();
					fs.unlinkSync(dest);
					return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				}
				
				let downloaded = 0;
				
				const timeoutId = setTimeout(() => {
					request.abort();
					file.close();
					fs.unlinkSync(dest);
					reject(new Error(`Timeout downloading ${url}`));
				}, 30000);
				
				res.on('data', (chunk: Buffer) => {
					if (this.isStopped) {
						request.abort();
						file.close();
						fs.unlinkSync(dest);
						reject(new Error('Download stopped by user'));
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
					
					downloaded += chunk.length;
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
			
			request.on('error', (err: Error) => {
				file.close();
				fs.unlinkSync(dest);
				reject(err);
			});
		});
	}
	
	private getLibraryPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) throw new Error(`Invalid library name format: ${name}`);
		const [group, artifact, version] = parts;
		const groupPath = group!.replace(/\./g, '/');
		return path.join(groupPath, artifact || "", version || "", `${artifact}-${version}.jar`);
	}
	
	private getLibraryUrlPath(name: string): string {
		const parts = name.split(':');
		if (parts.length !== 3) throw new Error(`Invalid library name format: ${name}`);
		const [group, artifact, version] = parts;
		const groupPath = group?.replace(/\./g, '/');
		return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
	}
	
	private async fetchLatestStableLoader(): Promise<string> {
		const loaders = await this.fetchJson(this.loaderApiUrl);
		if (!Array.isArray(loaders) || loaders.length === 0) {
			throw new Error(`No loader data available for Minecraft version ${this.gameVersion}`);
		}
		const stableLoader = loaders.find((l: any) => l.loader.stable === true) || loaders[0];
		if (!stableLoader) throw new Error(`No loader version found for ${this.gameVersion}`);
		
		return stableLoader.loader.version;
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
		this.emit('stopped');
	}
	
	async start(): Promise<boolean> {
		this.emit('start');
		
		try {
			console.log(`[LegacyFabricInstaller] Searching loader for Minecraft ${this.gameVersion}...`);
			
			let loaderVersion: string;
			try {
				loaderVersion = await this.fetchLatestStableLoader();
			} catch (err: any) {
				console.error(`[LegacyFabricInstaller] Error getting loader: ${err.message}`);
				this.emit('error', err);
				return false;
			}
			
			const versionId = this.getVersionId(loaderVersion);
			
			const profileUrl = `https://meta.legacyfabric.net/v2/versions/loader/${this.gameVersion}/${loaderVersion}/profile/json`;
			console.log(`[LegacyFabricInstaller] Downloading profile from: ${profileUrl}`);
			
			let profileJson: any;
			try {
				profileJson = await this.fetchJson(profileUrl);
			} catch (err: any) {
				console.error(`[LegacyFabricInstaller] Error downloading profile: ${err.message}`);
				this.emit('error', err);
				return false;
			}
			
			try {
				const versionDir = path.join(this.minecraftPath, 'versions', versionId);
				fs.mkdirSync(versionDir, { recursive: true });
				const profilePath = path.join(versionDir, `${versionId}.json`);
				fs.writeFileSync(profilePath, JSON.stringify(profileJson, null, 2));
				console.log(`[LegacyFabricInstaller] Profile saved at: ${profilePath}`);
			} catch (err: any) {
				console.error(`[LegacyFabricInstaller] Error saving profile: ${err.message}`);
				this.emit('error', err);
				return false;
			}
			
			if (!Array.isArray(profileJson.libraries)) {
				console.warn('[LegacyFabricInstaller] No libraries found to download.');
				console.log(`[LegacyFabricInstaller] Installation complete for ${versionId}`);
				this.emit('done', true);
				return true;
			}
			
			console.log(`[LegacyFabricInstaller] Downloading ${profileJson.libraries.length} libraries...`);
			
			this.totalBytes = profileJson.libraries.length * 500000;
			this.downloadedBytes = 0;
			
			let failedLibs: string[] = [];
			const downloadPromises: Promise<void>[] = [];
			const libraries = profileJson.libraries;
			
			const processDownloads = async () => {
				for (let i = 0; i < libraries.length; i++) {
					if (this.isStopped) break;
					
					while (this.activeDownloads >= this.concurrency) {
						await new Promise(resolve => setTimeout(resolve, 100));
						if (this.isStopped) break;
					}
					
					if (this.isStopped) break;
					
					const lib = libraries[i];
					this.activeDownloads++;
					
					downloadPromises.push(
						(async () => {
							try {
								const libPathFs = this.getLibraryPath(lib.name);
								const libPathUrl = this.getLibraryUrlPath(lib.name);
								const urlBase = lib.url || 'https://repo1.maven.org/maven2/';
								const fullUrl = urlBase.endsWith('/') ? urlBase + libPathUrl : urlBase + '/' + libPathUrl;
								const dest = path.join(this.minecraftPath, 'libraries', libPathFs);
								
								if (fs.existsSync(dest)) {
									console.log(`  [Skip] ${lib.name} already exists.`);
									this.emit('fileComplete', { name: lib.name, type: 'library' });
									return;
								}
								
								this.emit('fileStart', { name: lib.name, type: 'library' });
								process.stdout.write(`  Downloading ${lib.name}... `);
								
								await this.downloadFileWithRetry(fullUrl, dest, lib.name);
								
								console.log('OK');
								this.emit('fileComplete', { name: lib.name, type: 'library' });
							} catch (e: any) {
								console.error(`  ERROR downloading ${lib.name}: ${e.message}`);
								failedLibs.push(lib.name);
								this.emit('fileError', { name: lib.name, error: e });
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
				console.log('[LegacyFabricInstaller] Download stopped by user');
				this.emit('stopped');
				return false;
			}
			
			if (failedLibs.length > 0) {
				console.warn(`[LegacyFabricInstaller] Finished with errors in ${failedLibs.length} libraries:`);
				failedLibs.forEach(lib => console.warn(`  - ${lib}`));
				this.emit('done', false);
				return false;
			}
			
			console.log(`[LegacyFabricInstaller] Installation complete for ${versionId}`);
			this.emit('done', true);
			return true;
			
		} catch (error: any) {
			console.error(`[LegacyFabricInstaller] Unexpected error: ${error.message}`);
			this.emit('error', error);
			return false;
		}
	}
}

export { LegacyFabricDownloader };  
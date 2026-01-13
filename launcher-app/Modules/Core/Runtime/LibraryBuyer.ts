import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'fs';
import { stat, unlink } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'path';
import { EventEmitter } from 'node:events';
import https from 'https';
import http from 'http';

import { createTaskLimiter } from "../Utils/Index.js";
import type { LibraryManagerOptions, VersionJson, Library, DownloadResult } from './Types/LibraryBuyer.js';

export class LibraryBuyer extends EventEmitter {
	root: string;
	version: string;
	versionJsonPath: string;
	forceDownload: boolean;
	concurry: number;
	maxRetries: number;
	private paused = false;
	private stopped = false;
	
	constructor(opts: LibraryManagerOptions) {
		super();
		this.root = opts.root;
		this.version = opts.version;
		this.versionJsonPath = opts.versionJsonPath || resolve(this.root, "versions", this.version, `${this.version}.json`);
		this.forceDownload = opts.forceDownload ?? false;
		this.concurry = opts.concurry ?? 8;
		this.maxRetries = opts.maxRetries ?? 3;
	}
	
	pause() { this.paused = true; this.emit("Paused"); }
	resume() { this.paused = false; this.emit("Resumed"); }
	stop() { this.stopped = true; this.emit("Stopped"); }
	
	private async waitIfPaused() {
		while (this.paused) await new Promise(res => setTimeout(res, 40));
		if (this.stopped) throw new Error("Stopped");
	}
	
	private libraryToUrl(library: Library): string[] {
		const urls: string[] = [];
		if (library.downloads?.artifact?.url) urls.push(library.downloads.artifact.url);
		if (library.downloads?.classifiers) {
			const os = this.getCurrentOS();
			const arch = process.arch === 'x64' ? '64' : '32';
			for (const [classifier, artifact] of Object.entries(library.downloads.classifiers)) {
				if (classifier.includes(`natives-${os}`) || classifier.includes(`natives-windows-${arch}`)) {
					urls.push(artifact.url);
				}
			}
		}
		if (!library.downloads && library.name) {
			const baseUrl = library.url || "https://libraries.minecraft.net/";
			const path = this.libraryNameToPath(library.name);
			urls.push(baseUrl + path);
		}
		if (library.url && library.name && !library.downloads) {
			const path = this.libraryNameToPath(library.name);
			urls.push(library.url + path);
		}
		return urls;
	}
	
	private libraryNameToPath(name: string): string {
		const parts = name.split(':');
		if (parts.length < 3) return `${name.replace(/:/g, '/')}.jar`;
		const [group, artifact, version] = parts;
		const groupPath = group!.replace(/\./g, '/');
		return `${groupPath}/${artifact}/${version}/${artifact}-${version}.jar`;
	}
	
	private getCurrentOS(): string {
		switch (process.platform) {
			case 'win32': return 'windows';
			case 'darwin': return 'osx';
			default: return 'linux';
		}
	}
	
	private async safeUnlink(filePath: string) {
		if (existsSync(filePath)) {
			try { await unlink(filePath); } catch { /* ignora */ }
		}
	}
	
	private downloadFile(url: string, filePath: string): Promise<DownloadResult> {
		return new Promise((resolve) => {
			const dir = dirname(filePath);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			
			const file = createWriteStream(filePath);
			const protocol = url.startsWith('https') ? https : http;
			
			const request = protocol.get(url, (response) => {
				if (response.statusCode === 200) {
					response.pipe(file);
					
					file.on('finish', async () => {
						file.close();
						try {
							const stats = await stat(filePath);
							resolve({ success: true, filePath, size: stats.size });
						} catch {
							resolve({ success: true, filePath, size: 0 });
						}
					});
					
					file.on('error', async (err) => {
						file.close();
						await this.safeUnlink(filePath);
						resolve({ success: false, filePath, size: 0, error: err.message });
					});
				} else {
					file.close();
					this.safeUnlink(filePath);
					resolve({ success: false, filePath, size: 0, error: `HTTP ${response.statusCode}` });
				}
			});
			
			request.on('error', async (err: Error) => {
				file.close();
				await this.safeUnlink(filePath);
				resolve({ success: false, filePath, size: 0, error: err.message });
			});
			
			request.setTimeout(30000, async () => {
				request.destroy();
				file.close();
				await this.safeUnlink(filePath);
				resolve({ success: false, filePath, size: 0, error: 'Timeout' });
			});
		});
	}
	
	private async loadVersionJson(): Promise<VersionJson> {
		try {
			if (!existsSync(this.versionJsonPath)) throw new Error(`Version JSON not found: ${this.versionJsonPath}`);
			const data = readFileSync(this.versionJsonPath, 'utf8');
			const versionJson: VersionJson = JSON.parse(data);
			if (versionJson.inheritsFrom) {
				const parentPath = resolve(this.root, "versions", versionJson.inheritsFrom, `${versionJson.inheritsFrom}.json`);
				if (existsSync(parentPath)) {
					const parentData = readFileSync(parentPath, 'utf8');
					const parentJson: VersionJson = JSON.parse(parentData);
					versionJson.libraries = [...(parentJson.libraries || []), ...(versionJson.libraries || [])];
				}
			}
			return versionJson;
		} catch (error: any) {
			throw new Error(`Error loading version JSON: ${error.message}`);
		}
	}
	
	private urlToLocalPath(url: string): string {
		try {
			if (url.includes('libraries.minecraft.net') || url.includes('maven.minecraftforge.net')) {
				const urlObj = new URL(url);
				return join(this.root, 'libraries', urlObj.pathname.substring(1));
			} else {
				const fileName = basename(url);
				return join(this.root, 'libraries', fileName);
			}
		} catch {
			const fileName = basename(url);
			return join(this.root, 'libraries', fileName);
		}
	}
	
	public async checkMissingLibraries(): Promise<{ missing: string[], total: number }> {
		this.emit("StartCheck");
		try {
			const versionJson = await this.loadVersionJson();
			const missingUrls: string[] = [];
			
			for (const library of versionJson.libraries || []) {
				const urls = this.libraryToUrl(library);
				for (const url of urls) {
					const filePath = this.urlToLocalPath(url);
					if (this.forceDownload || !existsSync(filePath)) {
						missingUrls.push(url);
						this.emit("LibraryMissing", { library: library.name, url, filePath: basename(filePath) });
					} else {
						this.emit("LibraryExists", { library: library.name, filePath: basename(filePath) });
					}
				}
			}
			
			this.emit("CheckComplete", { total: versionJson.libraries?.length || 0, missing: missingUrls.length });
			return { missing: missingUrls, total: versionJson.libraries?.length || 0 };
		} catch (error: any) {
			this.emit("CheckError", { error: error.message });
			throw error;
		}
	}
	
	public async downloadMissingLibraries(): Promise<{ success: number, failed: number, total: number }> {
		this.emit("StartDownload");
		const { missing: missingUrls } = await this.checkMissingLibraries();
		if (missingUrls.length === 0) {
			this.emit("DownloadComplete", { success: 0, failed: 0, total: 0 });
			return { success: 0, failed: 0, total: 0 };
		}
		
		const limit = createTaskLimiter(this.concurry);
		let successCount = 0;
		let failedCount = 0;
		
		const downloadTasks = missingUrls.map(url =>
			limit(async () => {
				await this.waitIfPaused();
				const filePath = this.urlToLocalPath(url);
				const fileName = basename(filePath);
				this.emit("FileStart", { url, filePath: fileName });
				
				try {
					const result = await this.downloadFile(url, filePath);
					if (result.success) {
						successCount++;
						this.emit("Bytes", result.size);
						this.emit("FileSuccess", { filePath: fileName, size: result.size, url });
					} else {
						failedCount++;
						this.emit("FileError", { filePath: fileName, error: result.error, url });
					}
					return result;
				} catch (error: any) {
					failedCount++;
					this.emit("FileError", { filePath: fileName, error: error.message, url });
					return { success: false, filePath, size: 0, error: error.message };
				}
			})
		);
		
		await Promise.all(downloadTasks);
		
		this.emit("DownloadComplete", { success: successCount, failed: failedCount, total: missingUrls.length });
		return { success: successCount, failed: failedCount, total: missingUrls.length };
	}
	
	public async getTotalDownloadSize(): Promise<number> {
		const { missing: missingUrls } = await this.checkMissingLibraries();
		let totalSize = 0;
		
		for (const url of missingUrls) {
			try {
				const headResponse = await fetch(url, { method: 'HEAD' });
				if (headResponse.ok) {
					const contentLength = headResponse.headers.get('content-length');
					totalSize += contentLength ? parseInt(contentLength) : 1024 * 1024;
				} else {
					totalSize += 1024 * 1024;
				}
			} catch {
				totalSize += 1024 * 1024;
			}
		}
		
		return totalSize;
	}
	
	public async ensureLibraries(): Promise<boolean> {
		this.emit("Start");
		try {
			const { missing, total } = await this.checkMissingLibraries();
			if (missing.length === 0) {
				this.emit("AllLibrariesExist", { total });
				return true;
			}
			this.emit("LibrariesMissing", { missing: missing.length, total });
			const result = await this.downloadMissingLibraries();
			this.emit("Complete", result);
			return result.failed === 0;
		} catch (error: any) {
			this.emit("Error", { error: error.message });
			throw error;
		}
	}
}

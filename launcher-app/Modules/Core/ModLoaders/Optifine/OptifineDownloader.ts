import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';

export interface Config {
	min_version: string;
	max_threads: number;
	base_dir: string;
	download_previews: boolean;
	manifest_only: boolean;
	silent: boolean;
	max_version?: string;
	download_previews_only?: boolean;
	force_scrape?: boolean;
}

export interface OptiFineEntry {
	minecraft_version: string;
	optifine_version: string;
	mirror_url: string;
	final_url: string;
	forge_version: string;
	release_date: string;
	filename: string;
	is_preview: boolean;
	downloaded: boolean;
	file_size: number;
	local_path: string;
}

export interface DownloadStats {
	total: number;
	downloaded: number;
	skipped: number;
	failed: number;
	bytes: number;
	start_time: number;
	end_time?: number;
	duration?: number;
}

export interface DetailedReport {
	stats: DownloadStats;
	successful: OptiFineEntry[];
	skipped: OptiFineEntry[];
	failed: OptiFineEntry[];
	summary: {
		total_versions: number;
		total_mb: number;
		success_rate: number;
		minecraft_versions: string[];
	};
}

interface HttpResponse {
	data?: string;
	stream?: http.IncomingMessage;
	statusCode: number;
	headers: http.IncomingHttpHeaders;
	finalUrl: string;
}

interface HttpGetResult {
	html: string;
	finalUrl: string;
	headers: http.IncomingHttpHeaders;
	error?: string;
}

interface DownloadResult {
	success: boolean;
	bytes: number;
	skipped: boolean;
	error?: string;
}

export interface OptiFineDownloaderEvents {
	'scrape:start': () => void;
	'scrape:version': (version: string) => void;
	'scrape:complete': (count: number) => void;
	'scrape:error': (error: Error) => void;
	
	'resolve:start': (total: number) => void;
	'resolve:progress': (current: number, total: number) => void;
	'resolve:success': (entry: OptiFineEntry) => void;
	'resolve:failed': (entry: OptiFineEntry, error: string) => void;
	'resolve:complete': (resolved: number, failed: number) => void;
	
	'download:start': (total: number) => void;
	'download:progress': (current: number, total: number, stats: DownloadStats) => void;
	'download:file:start': (entry: OptiFineEntry) => void;
	'download:file:success': (entry: OptiFineEntry, bytes: number) => void;
	'download:file:skipped': (entry: OptiFineEntry) => void;
	'download:file:failed': (entry: OptiFineEntry, error: string) => void;
	'download:complete': (stats: DownloadStats) => void;
	
	'manifest:save': (path: string) => void;
	'manifest:load': (path: string, count: number) => void;
	
	'error': (error: Error) => void;
	'complete': (report: DetailedReport) => void;
}

export declare interface OptiFineDownloader {
	on<K extends keyof OptiFineDownloaderEvents>(
		event: K,
		listener: OptiFineDownloaderEvents[K]
	): this;
	emit<K extends keyof OptiFineDownloaderEvents>(
		event: K,
		...args: Parameters<OptiFineDownloaderEvents[K]>
	): boolean;
}

export class OptiFineDownloader extends EventEmitter {
	private config: Config;
	private urlCache = new Map<string, string>();
	private currentStats: DownloadStats;
	public manifest: OptiFineEntry[] = [];
	
	constructor(config: Partial<Config> = {}) {
		super();
		this.config = {
			min_version: "1.7.10",
			max_threads: 5,
			base_dir: "Minecraft-Core-Master - OptifineDownloader",
			download_previews: true,
			manifest_only: false,
			silent: false,
			...config
		};
		
		this.currentStats = this.createStats();
	}
	
	private createStats(): DownloadStats {
		return {
			total: 0,
			downloaded: 0,
			skipped: 0,
			failed: 0,
			bytes: 0,
			start_time: Date.now()
		};
	}
	
	private decodeHtmlEntities(text: string): string {
		return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'");
	}
	
	private isVersionInRange(version: string, minVersion: string): boolean {
		if (!version || !minVersion) return false;
		
		const v1 = version.split('.').map(Number);
		const v2 = minVersion.split('.').map(Number);
		
		while (v1.length < 3) v1.push(0);
		while (v2.length < 3) v2.push(0);
		
		for (let i = 0; i < 3; i++) {
			if (v1[i]! > v2[i]!) return true;
			if (v1[i]! < v2[i]!) return false;
		}
		
		return true;
	}
	
	private extractUrlParam(url: string, param: string): string {
		const regex = new RegExp(`${param}=([^&]+)`);
		const match = url.match(regex);
		return match ? decodeURIComponent(match[1] || "") : "";
	}
	
	private httpRequest(url: string, options: any = {}): Promise<HttpResponse> {
		return new Promise((resolve, reject) => {
			const urlObj = new URL(url);
			const protocol = urlObj.protocol === 'https:' ? https : http;
			
			const requestOptions: http.RequestOptions = {
				method: options.method || 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					...options.headers
				},
				timeout: options.timeout || 15000
			};
			
			const req = protocol.request(url, requestOptions, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					const redirectUrl = res.headers.location.startsWith('http') 
					? res.headers.location 
					: new URL(res.headers.location, url).href;
					
					if ((options.redirectCount || 0) < 5) {
						this.httpRequest(redirectUrl, { ...options, redirectCount: (options.redirectCount || 0) + 1 })
						.then(resolve)
						.catch(reject);
					} else {
						reject(new Error('Too many redirects'));
					}
					return;
				}
				
				if (options.stream) {
					resolve({ 
						stream: res, 
						statusCode: res.statusCode || 0, 
						headers: res.headers, 
						finalUrl: url 
					});
					return;
				}
				
				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => {
					resolve({
						data,
						statusCode: res.statusCode || 0,
						headers: res.headers,
						finalUrl: url
					});
				});
			});
			
			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Request timeout'));
			});
			
			if (options.body) {
				req.write(options.body);
			}
			
			req.end();
		});
	}
	
	private async httpGet(url: string, retries: number = 2): Promise<HttpGetResult> {
		for (let i = 0; i < retries; i++) {
			try {
				const response = await this.httpRequest(url);
				return {
					html: response.data || "",
					finalUrl: response.finalUrl,
					headers: response.headers
				};
			} catch (error) {
				if (i === retries - 1) {
					return { 
						html: "", 
						finalUrl: url, 
						headers: {}, 
						error: (error as Error).message 
					};
				}
				await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
			}
		}
		return { html: "", finalUrl: url, headers: {} };
	}
	
	public async scrapeManifest(): Promise<OptiFineEntry[]> {
		this.emit('scrape:start');
		
		const manifest: OptiFineEntry[] = [];
		const { html } = await this.httpGet("https://optifine.net/downloads");
		
		if (!html) {
			const error = new Error("No se pudo obtener la página de OptiFine");
			this.emit('scrape:error', error);
			return manifest;
		}
		
		const seenVersions = new Set<string>();
		const h2Regex = /<h2[^>]*>Minecraft\s*([\d.]+)<\/h2>/gi;
		const versionMap = new Map<number, string>();
		let match: RegExpExecArray | null;
		
		while ((match = h2Regex.exec(html)) !== null) {
			versionMap.set(match.index, match[1] || "");
		}
		
		const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
		
		while ((match = tableRegex.exec(html)) !== null) {
			const tableHtml = match[0];
			const tablePosition = match.index;
			
			let currentMinecraftVersion = "";
			let closestIndex = -1;
			
			for (const [index, version] of versionMap.entries()) {
				if (index < tablePosition && index > closestIndex) {
					closestIndex = index;
					currentMinecraftVersion = version;
				}
			}
			
			if (!this.isVersionInRange(currentMinecraftVersion, this.config.min_version)) {
				continue;
			}
			
			this.emit('scrape:version', currentMinecraftVersion);
			
			const isPreview = tableHtml.includes('downloadTable') && !tableHtml.includes('mainTable');
			const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
			let rowMatch: RegExpExecArray | null;
			
			while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
				const rowHtml = rowMatch[0];
				const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
				const cells: string[] = [];
				let cellMatch: RegExpExecArray | null;
				
				while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
					cells.push(cellMatch[0]);
				}
				
				if (cells.length >= 3) {
					const entry: OptiFineEntry = {
						minecraft_version: currentMinecraftVersion,
						optifine_version: cells[0]!.replace(/<[^>]*>/g, '').trim(),
						mirror_url: "",
						final_url: "",
						forge_version: "",
						release_date: cells.length >= 5 ? cells[4]!.replace(/<[^>]*>/g, '').trim() : "",
						filename: "",
						is_preview: isPreview,
						downloaded: false,
						file_size: 0,
						local_path: ""
					};
					
					const mirrorMatch = /<td[^>]*class\s*=\s*["']colMirror["'][^>]*>[\s\S]*?href\s*=\s*["']([^"']*)["']/i.exec(rowHtml);
					if (mirrorMatch) {
						entry.mirror_url = this.decodeHtmlEntities(mirrorMatch[1] || "");
						entry.filename = this.extractUrlParam(entry.mirror_url, "f");
					}
					
					if (entry.optifine_version && entry.mirror_url) {
						const versionKey = `${entry.minecraft_version}_${entry.optifine_version}`;
						
						if (!seenVersions.has(versionKey)) {
							seenVersions.add(versionKey);
							
							if (this.config.download_previews || !entry.is_preview) {
								manifest.push(entry);
							}
						}
					}
				}
			}
		}
		
		this.emit('scrape:complete', manifest.length);
		return manifest;
	}
	
	private async getFinalDownloadUrl(mirrorUrl: string): Promise<string> {
		if (!mirrorUrl) return "";
		
		if (this.urlCache.has(mirrorUrl)) {
			return this.urlCache.get(mirrorUrl)!;
		}
		
		try {
			const { html, finalUrl } = await this.httpGet(mirrorUrl);
			if (!html) return "";
			
			let downloadUrl = "";
			const linkRegex = /<a\s+[^>]*href\s*=\s*["']([^"']*\.jar[^"']*)["']/gi;
			let match: RegExpExecArray | null;
			
			while ((match = linkRegex.exec(html)) !== null) {
				if (match[1]!.includes('downloadx?f=')) {
					downloadUrl = match[1] || "";
					break;
				}
			}
			
			if (!downloadUrl) {
				while ((match = linkRegex.exec(html)) !== null) {
					downloadUrl = match[1] || "";
					break;
				}
			}
			
			if (!downloadUrl) return "";
			
			downloadUrl = this.decodeHtmlEntities(downloadUrl);
			
			if (!downloadUrl.startsWith('http')) {
				const baseMatch = finalUrl.match(/^(https?:\/\/[^\/]+)/);
				if (baseMatch) {
					const baseUrl = baseMatch[1];
					if (downloadUrl.startsWith('/')) {
						downloadUrl = baseUrl + downloadUrl;
					} else {
						downloadUrl = baseUrl + '/' + downloadUrl;
					}
				}
			}
			
			if (downloadUrl.includes('.jar')) {
				this.urlCache.set(mirrorUrl, downloadUrl);
				return downloadUrl;
			}
			
			return await this.getFinalDownloadUrl(downloadUrl);
		} catch (error) {
			return "";
		}
	}
	
	public async resolveAllUrls(manifest: OptiFineEntry[]): Promise<OptiFineEntry[]> {
		this.emit('resolve:start', manifest.length);
		
		const limit = new PLimit(this.config.max_threads);
		let resolved = 0;
		let failed = 0;
		let current = 0;
		
		const promises = manifest.map(entry => 
			limit.run(async () => {
				try {
					if (entry.final_url && entry.final_url.includes('.jar')) {
						resolved++;
						this.emit('resolve:progress', ++current, manifest.length);
						this.emit('resolve:success', entry);
						return;
					}
					
					const finalUrl = await this.getFinalDownloadUrl(entry.mirror_url);
					
					if (finalUrl) {
						entry.final_url = finalUrl;
						
						if (!entry.filename) {
							const urlMatch = finalUrl.match(/[^/]+\.jar/);
							entry.filename = urlMatch ? urlMatch[0] : `${entry.optifine_version}.jar`;
						}
						
						resolved++;
						this.emit('resolve:success', entry);
					} else {
						failed++;
						this.emit('resolve:failed', entry, 'No se pudo obtener URL final');
					}
					
					this.emit('resolve:progress', ++current, manifest.length);
				} catch (error) {
					failed++;
					this.emit('resolve:failed', entry, (error as Error).message);
					this.emit('resolve:progress', ++current, manifest.length);
				}
			})
		);
		
		await Promise.allSettled(promises);
		this.emit('resolve:complete', resolved, failed);
		
		return manifest;
	}
	
	private async downloadFile(url: string, outputPath: string, referer: string = ""): Promise<DownloadResult> {
		if (fs.existsSync(outputPath)) {
			try {
				const stats = fs.statSync(outputPath);
				if (stats.size > 0) {
					return { success: true, bytes: stats.size, skipped: true };
				}
			} catch {}
		}
		
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}
		
		try {
			const response = await this.httpRequest(url, {
				stream: true,
				headers: {
					'Referer': referer || 'https://optifine.net/downloads',
					'Accept': '*/*'
				},
				timeout: 180000
			});
			
			if (!response.stream) {
				return { success: false, bytes: 0, skipped: false, error: 'No stream' };
			}
			
			return new Promise((resolve) => {
				const writer = fs.createWriteStream(outputPath);
				let bytes = 0;
				let lastUpdate = Date.now();
				
				response.stream!.on('data', (chunk: Buffer) => {
					bytes += chunk.length;
					lastUpdate = Date.now();
				});
				
				const timeoutWatcher = setInterval(() => {
					if (Date.now() - lastUpdate > 30000) {
						clearInterval(timeoutWatcher);
						response.stream!.destroy();
						writer.destroy();
						resolve({ success: false, bytes: 0, skipped: false, error: 'Timeout' });
					}
				}, 5000);
				
				writer.on('finish', () => {
					clearInterval(timeoutWatcher);
					if (bytes > 0) {
						resolve({ success: true, bytes, skipped: false });
					} else {
						resolve({ success: false, bytes: 0, skipped: false });
					}
				});
				
				writer.on('error', (err) => {
					clearInterval(timeoutWatcher);
					resolve({ success: false, bytes: 0, skipped: false, error: err.message });
				});
				
				response.stream!.pipe(writer);
			});
		} catch (error) {
			return { success: false, bytes: 0, skipped: false, error: (error as Error).message };
		}
	}
	
	public async downloadAll(manifest: OptiFineEntry[]): Promise<DownloadStats> {
		const jarDir = path.join(this.config.base_dir, "Jar");
		if (!fs.existsSync(jarDir)) {
			fs.mkdirSync(jarDir, { recursive: true });
		}
		
		this.currentStats = this.createStats();
		this.currentStats.total = manifest.length;
		
		this.emit('download:start', manifest.length);
		
		const limit = new PLimit(this.config.max_threads);
		let current = 0;
		
		const downloadPromises = manifest.map(entry => 
			limit.run(async () => {
				try {
					if (!entry.final_url) {
						this.currentStats.failed++;
						this.emit('download:file:failed', entry, 'Sin URL final');
						this.emit('download:progress', ++current, manifest.length, this.currentStats);
						return;
					}
					
					this.emit('download:file:start', entry);
					
					const jarPath = path.join(jarDir, entry.filename);
					const result = await this.downloadFile(entry.final_url, jarPath);
					
					if (result.success) {
						entry.downloaded = true;
						entry.file_size = result.bytes;
						entry.local_path = jarPath;
						
						if (result.skipped) {
							this.currentStats.skipped++;
							this.emit('download:file:skipped', entry);
						} else {
							this.currentStats.downloaded++;
							this.currentStats.bytes += result.bytes;
							this.emit('download:file:success', entry, result.bytes);
						}
					} else {
						entry.downloaded = false;
						this.currentStats.failed++;
						this.emit('download:file:failed', entry, result.error || 'Error desconocido');
					}
					
					this.emit('download:progress', ++current, manifest.length, this.currentStats);
				} catch (error) {
					this.currentStats.failed++;
					this.emit('download:file:failed', entry, (error as Error).message);
					this.emit('download:progress', ++current, manifest.length, this.currentStats);
				}
			})
		);
		
		await Promise.allSettled(downloadPromises);
		
		this.currentStats.end_time = Date.now();
		this.currentStats.duration = (this.currentStats.end_time - this.currentStats.start_time) / 1000;
		
		this.emit('download:complete', this.currentStats);
		
		return this.currentStats;
	}
	
	public loadManifest(): OptiFineEntry[] | null {
		const manifestPath = path.join(this.config.base_dir, "Minecraft-Core-Master - OptifineDownloader_Manifest.json");
		
		if (!fs.existsSync(manifestPath)) {
			return null;
		}
		
		try {
			const data = fs.readFileSync(manifestPath, 'utf8');
			const manifest = JSON.parse(data) as OptiFineEntry[];
			this.emit('manifest:load', manifestPath, manifest.length);
			return manifest;
		} catch (error) {
			this.emit('error', error as Error);
			return null;
		}
	}
	
	public saveManifest(manifest: OptiFineEntry[]): void {
		const manifestPath = path.join(this.config.base_dir, "Minecraft-Core-Master - OptifineDownloader_Manifest.json");
		
		if (!fs.existsSync(this.config.base_dir)) {
			fs.mkdirSync(this.config.base_dir, { recursive: true });
		}
		
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
		this.emit('manifest:save', manifestPath);
	}
	
	public generateReport(manifest: OptiFineEntry[], stats: DownloadStats): DetailedReport {
		const successful = manifest.filter(e => e.downloaded && !e.local_path.includes('skipped'));
		const skipped = manifest.filter(e => e.downloaded && fs.existsSync(e.local_path));
		const failed = manifest.filter(e => !e.downloaded || !e.final_url);
		
		const minecraftVersions = [...new Set(manifest.map(e => e.minecraft_version))].sort();
		const success_rate = stats.total > 0 ? ((stats.downloaded + stats.skipped) / stats.total) * 100 : 0;
		
		return {
			stats,
			successful,
			skipped,
			failed,
			summary: {
				total_versions: manifest.length,
				total_mb: stats.bytes / (1024 * 1024),
				success_rate,
				minecraft_versions: minecraftVersions
			}
		};
	}
	
	public async run(): Promise<DetailedReport> {
		try {
			let manifest: OptiFineEntry[] | null = null;
			if (!this.config.force_scrape) {
				manifest = this.loadManifest();
				
				if (manifest) {
					manifest = manifest.filter(entry => 
						this.isVersionInRange(entry.minecraft_version, this.config.min_version)
					);
					
					if (!this.config.download_previews) {
						manifest = manifest.filter(e => !e.is_preview);
					} else if (this.config.download_previews_only) {
						manifest = manifest.filter(e => e.is_preview);
					}
				}
			}
			if (!manifest || manifest.length === 0) {
				manifest = await this.scrapeManifest();
				
				if (this.config.download_previews_only) {
					manifest = manifest.filter(e => e.is_preview);
				}
				
				await this.resolveAllUrls(manifest);
				this.saveManifest(manifest);
			}
			
			this.manifest = manifest;
			if (this.config.manifest_only) {
				const report = this.generateReport(manifest, this.currentStats);
				this.emit('complete', report);
				return report;
			}
			
			const stats = await this.downloadAll(manifest);
			this.saveManifest(manifest);
			
			const report = this.generateReport(manifest, stats);
			this.emit('complete', report);
			
			return report;
		} catch (error) {
			this.emit('error', error as Error);
			throw error;
		}
	}
}

class PLimit {
	private concurrency: number;
	private running: number = 0;
	private queue: Array<() => void> = [];
	
	constructor(concurrency: number) {
		this.concurrency = concurrency;
	}
	
	async run<T>(fn: () => Promise<T>): Promise<T> {
		while (this.running >= this.concurrency) {
			await new Promise<void>(resolve => this.queue.push(resolve));
		}
		
		this.running++;
		
		try {
			return await fn();
		} finally {
			this.running--;
			const resolve = this.queue.shift();
			if (resolve) resolve();
		}
	}
}
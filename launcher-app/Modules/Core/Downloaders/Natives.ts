import { mkdir } from "node:fs/promises";
import { createWriteStream, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { EventEmitter } from "node:events";
import https from "node:https";
import { createTaskLimiter } from "../Utils/Index.js";
import { Unzipper } from "../Utils/Unzipper.js";

export interface UnzipperOptions {
	validExts?: string[];
	flattenNatives?: boolean;
	cleanAfter?: boolean;
	ignoreFolders?: string[];
}

export interface NativesDownloaderOptions {
	version: string;
	root: string;
	concurry?: number;
	maxRetries?: number;
	installBaseRoot?: boolean;
	internal?: Partial<UnzipperOptions>;
}

const agent = new https.Agent({
	keepAlive: true,
	maxSockets: 200,
	maxFreeSockets: 100,
});

interface VersionManifest {
	versions: Array<{
		id: string;
		url: string;
	}>;
}

interface VersionData {
	libraries: Array<{
		name: string;
		downloads: {
			artifact?: { path: string; sha1: string; size: number; url: string };
			classifiers?: { [key: string]: { path: string; sha1: string; size: number; url: string } };
		};
		natives?: { [key: string]: string };
		rules?: Array<{ action: 'allow' | 'disallow'; os?: { name: string; version?: string } }>;
		extract?: {
			exclude: string[];
		};
	}>;
}

interface DownloadTask {
	url: string;
	sha1: string;
	path: string;
	size: number;
	retries: number;
	libraryName: string;
}

export class NativesDownloader extends EventEmitter {
	private version: string;
	private root: string;
	private concurry: number;
	private installBaseRoot: boolean;
	private maxRetries: number;
	private internal: Partial<UnzipperOptions>;
	
	private limiter: ReturnType<typeof createTaskLimiter>;
	private paused = false;
	private stopped = false;
	private pendingQueue: DownloadTask[] = [];
	private runningTasks = 0;
	private doneEmitted = false;
	private unzipper: Unzipper;
	private downloadedBytes = 0;
	
	constructor(opts: NativesDownloaderOptions) {
		super();
		this.version = opts.version;
		this.root = opts.root;
		this.concurry = opts.concurry ?? 16;
		this.maxRetries = opts.maxRetries ?? 5;
		this.installBaseRoot = opts.installBaseRoot ?? false,
		this.internal = opts.internal ?? {};
		this.unzipper = new Unzipper();
		
		this.limiter = createTaskLimiter(this.concurry);
	}
	
	async start(): Promise<void> {
		this.emit("Start");
		this.stopped = false;
		this.doneEmitted = false;
		this.downloadedBytes = 0;
		
		const manifest = await this.fetchVersionManifest();
		const versionMeta = manifest.versions.find((v: { id: string }) => v.id === this.version);
		if (!versionMeta) throw new Error("Versión no encontrada: " + this.version);
		
		const versionJson: VersionData = await this.downloadJSON(versionMeta.url);
		
		const nativeLibs = this.getNativeLibraries(versionJson.libraries);
		
		this.pendingQueue = [];
		for (const lib of nativeLibs) {
			const downloadInfo = this.getNativeDownloadInfo(lib);
			if (downloadInfo) {
				this.pendingQueue.push({
					url: downloadInfo.url,
					sha1: downloadInfo.sha1,
					path: join(this.root, "libraries", downloadInfo.path),
					size: downloadInfo.size,
					retries: 0,
					libraryName: lib.name
				});
			}
		}
		
		this.processQueue();
	}
	
	pause(): void {
		this.paused = true;
		this.emit("Paused");
	}
	
	resume(): void {
		if (!this.paused) return;
		this.paused = false;
		this.emit("Resumed");
		this.processQueue();
	}
	
	stop(): void {
		this.stopped = true;
		this.pendingQueue = [];
		this.emit("Stopped");
	}
	
	public async getTotalBytes(): Promise<number> {
		const manifest = await this.fetchVersionManifest();
		const versionMeta = manifest.versions.find((v: { id: string }) => v.id === this.version);
		if (!versionMeta) throw new Error("Versión no encontrada");
		
		const versionJson: VersionData = await this.downloadJSON(versionMeta.url);
		const nativeLibs = this.getNativeLibraries(versionJson.libraries);
		
		let total = 0;
		for (const lib of nativeLibs) {
			const downloadInfo = this.getNativeDownloadInfo(lib);
			if (downloadInfo && typeof downloadInfo.size === "number") {
				total += downloadInfo.size;
			}
		}
		return total;
	}
	
	private processQueue(): void {
		if (this.paused || this.stopped) return;
		if (this.pendingQueue.length === 0) return this.checkDone();
		
		while (!this.paused && !this.stopped && this.pendingQueue.length > 0 && this.runningTasks < this.concurry) {
			const task = this.pendingQueue.shift();
			if (!task) continue;
			
			this.runningTasks++;
			
			this.limiter(() => this.downloadAndExtractNative(task))
			.then(() => {
				// Éxito - no hacer nada
			})
			.catch((error) => {
				window.StepLauncherLogger.error(`Error en descarga: ${error.message}`);
			})
			.finally(() => {
				this.runningTasks--;
				this.checkDone();
				if (!this.paused && !this.stopped) this.processQueue();
			});
		}
	}
	
	private checkDone(): void {
		if (this.doneEmitted) return;
		if (this.pendingQueue.length === 0 && this.runningTasks === 0 && !this.paused && !this.stopped) {
			this.doneEmitted = true;
			this.emit("Done");
		}
	}
	
	private async downloadAndExtractNative(task: DownloadTask): Promise<void> {
		await mkdir(dirname(task.path), { recursive: true });
		
		await this.downloadFile(task);
		await this.extractNative(task);
	}
	
	private async downloadFile(task: DownloadTask): Promise<void> {
		return new Promise((resolve, reject) => {
			if (existsSync(task.path)) {
				unlinkSync(task.path);
			}
			
			const file = createWriteStream(task.path);
			let downloaded = 0;
			
			const req = https.get(task.url, { agent }, (res) => {
				if (res.statusCode !== 200) {
					file.destroy();
					return this.retryOrFail(task, reject, `HTTP ${res.statusCode}`);
				}
				
				res.on("data", (chunk: Buffer) => {
					if (this.paused || this.stopped) {
						res.destroy();
						file.destroy();
						return;
					}
					
					downloaded += chunk.length;
					this.downloadedBytes += chunk.length;
					this.emit("Bytes", chunk.length);
				});
				
				res.pipe(file);
				
				file.on("finish", () => {
					file.close(() => {
						resolve();
					});
				});
			});
			
			file.on("error", (error) => {
				file.destroy();
				this.retryOrFail(task, reject, error.message);
			});
			
			req.on("error", (error) => {
				file.destroy();
				this.retryOrFail(task, reject, error.message);
			});
			
			req.setTimeout(30000, () => {
				req.destroy();
				file.destroy();
				this.retryOrFail(task, reject, "Timeout");
			});
		});
	}
	
	private async extractNative(task: DownloadTask): Promise<void> {
		const rootNative = () => {
			if (this.installBaseRoot === true) {
				return resolve(this.root, "natives", this.version);
			} else {
				return resolve(this.root, "versions", this.version, "natives");
			}
		};
		
		const nativesDir = rootNative();
		await mkdir(nativesDir, { recursive: true });
		
		try {
			await this.unzipper.extract({
				src: task.path,
				dest: nativesDir,
				validExts: this.internal?.validExts || ['.dll', '.so', '.dylib', '.jnilib'],
				flattenNatives: this.internal?.flattenNatives || true,
				cleanAfter: this.internal?.cleanAfter || true,
				ignoreFolders: this.internal?.ignoreFolders || ['META-INF']
			});
		} catch (error) {
			window.StepLauncherLogger.error(`Error extrayendo nativo ${task.libraryName}:`, error);
		}
	}
	
	private retryOrFail(task: DownloadTask, reject: (reason?: any) => void, reason: string): void {
		if (existsSync(task.path)) {
			unlinkSync(task.path);
		}
		
		if (task.retries < this.maxRetries) {
			task.retries++;
			this.pendingQueue.push(task);
			reject(new Error(`Retrying: ${reason}`));
		} else {
			reject(new Error(`No se pudo descargar: ${task.libraryName} - ${reason}`));
		}
	}
	
	private getOS(): string {
		const platform = process.platform;
		if (platform === 'win32') return 'windows';
		if (platform === 'darwin') return 'osx';
		if (platform === 'linux') return 'linux';
		return platform;
	}
	
	private getArchitecture(): string {
		const arch = process.arch;
		if (arch === 'x64') return 'x86_64';
		if (arch === 'arm64') return 'arm64';
		if (arch === 'ia32') return 'x86';
		return arch;
	}
	
	private shouldIncludeLibrary(library: { 
		rules?: Array<{ 
			action: string; 
			os?: { 
				name: string; 
				version?: string;
			} 
		}> 
	}): boolean {
		if (!library.rules) return true;
		
		const currentOS = this.getOS();
		let allowed = true;
		
		for (const rule of library.rules) {
			if (rule.os) {
				const osMatches = rule.os.name === currentOS;
				const versionMatches = !rule.os.version || new RegExp(rule.os.version).test(process.version);
				
				if (rule.action === 'allow') {
					allowed = osMatches && versionMatches;
				} else if (rule.action === 'disallow' && osMatches && versionMatches) {
					allowed = false;
				}
			} else {
				if (rule.action === 'allow') {
					allowed = true;
				} else if (rule.action === 'disallow') {
					allowed = false;
				}
			}
		}
		
		return allowed;
	}
	
	private getNativeLibraries(libraries: any[]): any[] {
		const currentOS = this.getOS();
		const currentArch = this.getArchitecture();
		
		return libraries.filter(lib => {
			if (!this.shouldIncludeLibrary(lib)) {
				return false;
			}
			
			if (lib.natives && lib.natives[currentOS]) {
				return true;
			}
			
			if (lib.downloads?.classifiers) {
				const hasNativeClassifier = Object.keys(lib.downloads.classifiers).some(key => 
					key.includes(`natives-${currentOS}`)
				);
				if (hasNativeClassifier) return true;
			}
			
			if (lib.downloads?.artifact?.path.includes(`natives-${currentOS}`)) {
				return this.matchesArchitecture(lib.name + lib.downloads.artifact.path, currentArch);
			}
			
			if (lib.name.includes(`:natives-${currentOS}`)) {
				return this.matchesArchitecture(lib.name, currentArch);
			}
			
			return false;
		});
	}
	
	private matchesArchitecture(name: string, currentArch: string): boolean {
		if (currentArch === 'x86_64') {
			return !name.includes('arm64');
		}
		
		if (currentArch === 'arm64') {
			return name.includes('arm64');
		}
		
		if (currentArch === 'x86') {
			return name.includes('x86') || name.includes('32');
		}
		
		return name.includes(currentArch);
	}
	
	private getNativeDownloadInfo(library: any): { url: string; path: string; size: number; sha1: string } | null {
		const currentOS = this.getOS();
		const currentArch = this.getArchitecture();
		
		if (library.natives?.[currentOS]) {
			let classifierName = library.natives[currentOS];
			
			if (classifierName.includes('${arch}')) {
				const archSubstitution = currentArch === 'x86_64' ? '64' : '32';
				classifierName = classifierName.replace('${arch}', archSubstitution);
			}
			
			const classifier = library.downloads.classifiers?.[classifierName];
			if (classifier) {
				return classifier;
			}
		}
		
		if (library.downloads?.classifiers) {
			const nativeClassifierKey = Object.keys(library.downloads.classifiers).find(key => {
				if (!key.includes(`natives-${currentOS}`)) return false;
				return this.matchesArchitecture(key, currentArch);
			});
			
			if (nativeClassifierKey) {
				return library.downloads.classifiers[nativeClassifierKey];
			}
			
			const fallbackClassifierKey = Object.keys(library.downloads.classifiers).find(key => 
				key.includes(`natives-${currentOS}`)
			);
			if (fallbackClassifierKey) {
				return library.downloads.classifiers[fallbackClassifierKey];
			}
		}
		
		if (library.downloads?.artifact?.path.includes(`natives-${currentOS}`) && 
		this.matchesArchitecture(library.downloads.artifact.path, currentArch)) {
			return library.downloads.artifact;
		}
		
		if (library.downloads?.artifact?.path.includes(`natives-${currentOS}`)) {
			return library.downloads.artifact;
		}
		
		return null;
	}
	
	private async fetchVersionManifest(): Promise<VersionManifest> {
		const url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
		return await this.downloadJSON(url);
	}
	
	private async downloadJSON(url: string): Promise<any> {
		return new Promise((resolve, reject) => {
			https
			.get(url, { agent }, (res) => {
				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode}: ${url}`));
					return;
				}
				
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch (error) {
						reject(new Error(`Invalid JSON from ${url}: ${error}`));
					}
				});
			})
			.on("error", reject);
		});
	}
	
	public getDownloadedBytes(): number {
		return this.downloadedBytes;
	}
}
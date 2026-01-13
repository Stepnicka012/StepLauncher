import { EventEmitter } from "node:events";
import { ipcMain } from "electron";
import { FolderManager } from "../Utils/Folder.js";
import { ClientDownloader } from "../Modules/Core/Downloaders/Client.js";
import { AssetsDownloader } from "../Modules/Core/Downloaders/Assets.js";
import { LibrariesDownloader } from "../Modules/Core/Downloaders/Libraries.js";
import { NativesDownloader } from "../Modules/Core/Downloaders/Natives.js";
import { RuntimeDownloader } from "../Modules/Core/Downloaders/Runtime.js";

const APP_FOLDER = new FolderManager();

export interface DownloadManagerOptions {
	version: string;
	concurrency?: {
		assets?: number;
		libraries?: number;
		natives?: number;
		runtime?: number;
	};
	maxRetries?: number;
	decodeJson?: boolean;
	forceInstallAssets?: boolean;
}

export interface DownloadProgress {
	stage: "downloading" | "done";
	totalBytes: number;
	downloadedBytes: number;
	percentage: number;
	speed: number;
	eta: number;
	stageProgress: {
		client: number;
		assets: number;
		libraries: number;
		natives: number;
		runtime: number;
	};
}

export interface DownloadStats {
	client: { total: number; downloaded: number; done: boolean };
	assets: { total: number; downloaded: number; done: boolean };
	libraries: { total: number; downloaded: number; done: boolean };
	natives: { total: number; downloaded: number; done: boolean };
	runtime: { total: number; downloaded: number; done: boolean };
}

export class MinecraftDownloadManager extends EventEmitter {
	private options: DownloadManagerOptions;
	
	private client: ClientDownloader | null = null;
	private assets: AssetsDownloader | null = null;
	private libraries: LibrariesDownloader | null = null;
	private natives: NativesDownloader | null = null;
	private runtime: RuntimeDownloader | null = null;
	
	private stats: DownloadStats = {
		client: { total: 0, downloaded: 0, done: false },
		assets: { total: 0, downloaded: 0, done: false },
		libraries: { total: 0, downloaded: 0, done: false },
		natives: { total: 0, downloaded: 0, done: false },
		runtime: { total: 0, downloaded: 0, done: false }
	};
	
	private isPaused = false;
	private isStopped = false;
	private startTime = 0;
	private lastBytes = 0;
	private lastTime = 0;
	private speedSamples: number[] = [];
	private progressInterval: NodeJS.Timeout | null = null;
	
	constructor(options: DownloadManagerOptions) {
		super();
		this.options = options;
	}
	
	public async calculateTotalBytes(): Promise<number> {
		this.emit("CalculatingBytes");
		
		const root = APP_FOLDER.getAppConfigPath();
		
		const clientDownloader = new ClientDownloader({
			version: this.options.version,
			root,
			maxRetries: this.options.maxRetries,
			decodeJson: this.options.decodeJson
		});
		
		const assetsDownloader = new AssetsDownloader({
			root,
			version: this.options.version,
			concurry: this.options.concurrency?.assets,
			maxRetries: this.options.maxRetries
		});
		
		if (this.options.forceInstallAssets) {
			assetsDownloader.setForceInstall(true);
		}
		
		const librariesDownloader = new LibrariesDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.libraries,
			maxRetries: this.options.maxRetries
		});
		
		const nativesDownloader = new NativesDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.natives,
			maxRetries: this.options.maxRetries
		});
		
		const runtimeDownloader = new RuntimeDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.runtime,
			maxRetries: this.options.maxRetries
		});
		
		const [clientBytes, assetsBytes, librariesBytes, nativesBytes, runtimeBytes] = 
			await Promise.all([
				clientDownloader.getTotalBytes(),
				assetsDownloader.getTotalBytes(),
				librariesDownloader.getTotalBytes(),
				nativesDownloader.getTotalBytes(),
				runtimeDownloader.getTotalBytes()
			]);
		
		this.stats.client.total = clientBytes;
		this.stats.assets.total = assetsBytes;
		this.stats.libraries.total = librariesBytes;
		this.stats.natives.total = nativesBytes;
		this.stats.runtime.total = runtimeBytes;
		
		const total = clientBytes + assetsBytes + librariesBytes + nativesBytes + runtimeBytes;
		
		this.emit("BytesCalculated", {
			total,
			breakdown: {
				client: clientBytes,
				assets: assetsBytes,
				libraries: librariesBytes,
				natives: nativesBytes,
				runtime: runtimeBytes
			}
		});
		
		return total;
	}
	
	public async start(): Promise<void> {
		this.isStopped = false;
		this.isPaused = false;
		this.startTime = Date.now();
		this.lastTime = this.startTime;
		this.lastBytes = 0;
		this.speedSamples = [];
		
		this.emitProgress();
		
		this.emit("Start");
		this.progressInterval = setInterval(() => {
			this.emitProgress();
		}, 100);
		
		try {
			const allZero = 
				this.stats.client.total === 0 &&
				this.stats.assets.total === 0 &&
				this.stats.libraries.total === 0 &&
				this.stats.natives.total === 0 &&
				this.stats.runtime.total === 0;
			
			if (allZero) {
				this.stats.client.done = true;
				this.stats.assets.done = true;
				this.stats.libraries.done = true;
				this.stats.natives.done = true;
				this.stats.runtime.done = true;
				
				this.emit("StageCompleted", "client");
				this.emit("StageCompleted", "assets");
				this.emit("StageCompleted", "libraries");
				this.emit("StageCompleted", "natives");
				this.emit("StageCompleted", "runtime");
			} else {
				await Promise.all([
					this.downloadClient(),
					this.downloadAssets(),
					this.downloadLibraries(),
					this.downloadNatives(),
					this.downloadRuntime()
				]);
			}
			
			if (this.progressInterval) {
				clearInterval(this.progressInterval);
				this.progressInterval = null;
			}
			
			this.emitProgress();
			this.emit("Done");
		} catch (error) {
			if (this.progressInterval) {
				clearInterval(this.progressInterval);
				this.progressInterval = null;
			}
			this.emit("Error", error);
			throw error;
		}
	}
	
	private async downloadClient(): Promise<void> {
		if (this.isStopped) return;
		
		const root = APP_FOLDER.getAppConfigPath();
		
		this.client = new ClientDownloader({
			version: this.options.version,
			root,
			maxRetries: this.options.maxRetries,
			decodeJson: this.options.decodeJson
		});
		
		this.client.on("Bytes", (bytes: number) => {
			this.stats.client.downloaded += bytes;
		});
		
		await new Promise<void>((resolve, reject) => {
			this.client!.on("Done", () => {
				this.stats.client.done = true;
				this.emit("StageCompleted", "client");
				resolve();
			});
			this.client!.on("Stopped", reject);
			this.client!.start().catch(reject);
		});
	}
	
	private async downloadAssets(): Promise<void> {
		if (this.isStopped) return;
		
		const root = APP_FOLDER.getAppConfigPath();
		
		this.assets = new AssetsDownloader({
			root,
			version: this.options.version,
			concurry: this.options.concurrency?.assets,
			maxRetries: this.options.maxRetries
		});
		
		if (this.options.forceInstallAssets) {
			this.assets.setForceInstall(true);
		}
		
		this.assets.on("Bytes", (bytes: number) => {
			this.stats.assets.downloaded += bytes;
		});
		
		await new Promise<void>((resolve, reject) => {
			this.assets!.on("Done", () => {
				this.stats.assets.done = true;
				this.emit("StageCompleted", "assets");
				resolve();
			});
			this.assets!.on("Stopped", reject);
			this.assets!.start().catch(reject);
		});
	}
	
	private async downloadLibraries(): Promise<void> {
		if (this.isStopped) return;
		
		const root = APP_FOLDER.getAppConfigPath();
		
		this.libraries = new LibrariesDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.libraries,
			maxRetries: this.options.maxRetries
		});
		
		this.libraries.on("Bytes", (bytes: number) => {
			this.stats.libraries.downloaded += bytes;
		});
		
		await new Promise<void>((resolve, reject) => {
			this.libraries!.on("Done", () => {
				this.stats.libraries.done = true;
				this.emit("StageCompleted", "libraries");
				resolve();
			});
			this.libraries!.on("Stopped", reject);
			this.libraries!.start().catch(reject);
		});
	}
	
	private async downloadNatives(): Promise<void> {
		if (this.isStopped) return;
		
		const root = APP_FOLDER.getAppConfigPath();
		
		this.natives = new NativesDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.natives,
			maxRetries: this.options.maxRetries
		});
		
		this.natives.on("Bytes", (bytes: number) => {
			this.stats.natives.downloaded += bytes;
		});
		
		await new Promise<void>((resolve, reject) => {
			this.natives!.on("Done", () => {
				this.stats.natives.done = true;
				this.emit("StageCompleted", "natives");
				resolve();
			});
			this.natives!.on("Stopped", reject);
			this.natives!.start().catch(reject);
		});
	}
	
	private async downloadRuntime(): Promise<void> {
		if (this.isStopped) return;
		const root = APP_FOLDER.getAppConfigPath();
		
		this.runtime = new RuntimeDownloader({
			version: this.options.version,
			root,
			concurry: this.options.concurrency?.runtime,
			maxRetries: this.options.maxRetries
		});
		
		this.runtime.on("Bytes", (bytes: number) => {
			this.stats.runtime.downloaded += bytes;
		});
		
		await new Promise<void>((resolve, reject) => {
			this.runtime!.on("Done", () => {
				this.stats.runtime.done = true;
				this.emit("StageCompleted", "runtime");
				resolve();
			});
			this.runtime!.on("Stopped", reject);
			this.runtime!.start().catch(reject);
		});
	}
	
	private emitProgress(): void {
		const now = Date.now();
		
		const totalBytes = 
			this.stats.client.total +
			this.stats.assets.total +
			this.stats.libraries.total +
			this.stats.natives.total +
			this.stats.runtime.total;
		
		const downloadedBytes = 
			this.stats.client.downloaded +
			this.stats.assets.downloaded +
			this.stats.libraries.downloaded +
			this.stats.natives.downloaded +
			this.stats.runtime.downloaded;
		
		const allStagesDone = 
			this.stats.client.done && 
			this.stats.assets.done && 
			this.stats.libraries.done && 
			this.stats.natives.done && 
			this.stats.runtime.done;
		
		const actualDownloadedBytes = downloadedBytes;
		
		const actualTotalBytes = totalBytes;
		
		let percentage = 0;
		
		if (allStagesDone) {
			percentage = 100;
		}
		else if (actualTotalBytes === 0 && downloadedBytes === 0) {
			percentage = 100;
		}
		else if (actualTotalBytes > 0) {
			percentage = Math.min((actualDownloadedBytes / actualTotalBytes) * 100, 100);
		}
		else if (downloadedBytes > 0) {
			percentage = 100;
		}
		
		const clientPercentage = this.stats.client.total > 0 
			? Math.min((this.stats.client.downloaded / this.stats.client.total) * 100, 100)
			: (this.stats.client.done ? 100 : 0);
		
		const assetsPercentage = this.stats.assets.total > 0 
			? Math.min((this.stats.assets.downloaded / this.stats.assets.total) * 100, 100)
			: (this.stats.assets.done ? 100 : 0);
		
		const librariesPercentage = this.stats.libraries.total > 0 
			? Math.min((this.stats.libraries.downloaded / this.stats.libraries.total) * 100, 100)
			: (this.stats.libraries.done ? 100 : 0);
		
		const nativesPercentage = this.stats.natives.total > 0 
			? Math.min((this.stats.natives.downloaded / this.stats.natives.total) * 100, 100)
			: (this.stats.natives.done ? 100 : 0);
		
		const runtimePercentage = this.stats.runtime.total > 0 
			? Math.min((this.stats.runtime.downloaded / this.stats.runtime.total) * 100, 100)
			: (this.stats.runtime.done ? 100 : 0);
		
		const deltaTime = (now - this.lastTime) / 1000;
		const deltaBytes = downloadedBytes - this.lastBytes;
		
		let speed = 0;
		if (deltaTime > 0.5) {
			speed = deltaBytes / deltaTime;
			this.speedSamples.push(speed);
			if (this.speedSamples.length > 10) this.speedSamples.shift();
			this.lastTime = now;
			this.lastBytes = downloadedBytes;
		}
		
		const avgSpeed = this.speedSamples.length > 0
			? this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
			: 0;
		
		const remainingBytes = actualTotalBytes - actualDownloadedBytes;
		const eta = (avgSpeed > 0 && remainingBytes > 0) ? remainingBytes / avgSpeed : 0;
		
		const progress: DownloadProgress = {
			stage: "downloading",
			totalBytes: actualTotalBytes,
			downloadedBytes: actualDownloadedBytes,
			percentage: Math.max(0, Math.min(percentage, 100)),
			speed: avgSpeed,
			eta,
			stageProgress: {
				client: clientPercentage,
				assets: assetsPercentage,
				libraries: librariesPercentage,
				natives: nativesPercentage,
				runtime: runtimePercentage
			}
		};
		
		this.emit("Progress", progress);
	}
	
	public pause(): void {
		this.isPaused = true;
		this.client?.pause();
		this.assets?.pause();
		this.libraries?.pause();
		this.natives?.pause();
		this.emit("Paused");
	}
	
	public resume(): void {
		this.isPaused = false;
		this.client?.resume();
		this.assets?.resume();
		this.libraries?.resume();
		this.natives?.resume();
		this.emit("Resumed");
	}
	
	public stop(): void {
		this.isStopped = true;
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
		this.client?.stop();
		this.assets?.stop();
		this.libraries?.stop();
		this.natives?.stop();
		this.emit("Stopped");
	}
	
	public getStats(): DownloadStats {
		return { ...this.stats };
	}
}

let activeDownload: MinecraftDownloadManager | null = null;

export function setupDownloadIPC(): void {
	ipcMain.handle("minecraft:calculate-bytes", async (_event, options: DownloadManagerOptions) => {
		try {
			const manager = new MinecraftDownloadManager(options);
			const total = await manager.calculateTotalBytes();
			return { success: true, total };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});
	
	ipcMain.handle("minecraft:start-download", async (event, options: DownloadManagerOptions) => {
		try {
			if (activeDownload) {
				return { success: false, error: "Ya hay una descarga en curso" };
			}
			
			activeDownload = new MinecraftDownloadManager(options);
			
			activeDownload.on("Start", () => {
				event.sender.send("minecraft:download-event", { type: "Start" });
			});
			
			activeDownload.on("Progress", (progress: DownloadProgress) => {
				event.sender.send("minecraft:download-event", { type: "Progress", progress });
			});
			
			activeDownload.on("StageCompleted", (stage: string) => {
				event.sender.send("minecraft:download-event", { type: "StageCompleted", stage });
			});
			
			activeDownload.on("Done", () => {
				event.sender.send("minecraft:download-event", { type: "Done" });
				activeDownload = null;
			});
			
			activeDownload.on("Error", (error: Error) => {
				event.sender.send("minecraft:download-event", { type: "Error", error: error.message });
				activeDownload = null;
			});
			
			activeDownload.on("Stopped", () => {
				event.sender.send("minecraft:download-event", { type: "Stopped" });
				activeDownload = null;
			});
			
			activeDownload.on("Paused", () => {
				event.sender.send("minecraft:download-event", { type: "Paused" });
			});
			
			activeDownload.on("Resumed", () => {
				event.sender.send("minecraft:download-event", { type: "Resumed" });
			});
			
			await activeDownload.calculateTotalBytes();
			activeDownload.start().catch((err) => {
				event.sender.send("minecraft:download-event", { 
					type: "Error", 
					error: err.message 
				});
				activeDownload = null;
			});
			
			return { success: true };
		} catch (error: any) {
			activeDownload = null;
			return { success: false, error: error.message };
		}
	});
	
	ipcMain.handle("minecraft:pause-download", async () => {
		if (!activeDownload) {
			return { success: false, error: "No hay descarga activa" };
		}
		activeDownload.pause();
		return { success: true };
	});
	
	ipcMain.handle("minecraft:resume-download", async () => {
		if (!activeDownload) {
			return { success: false, error: "No hay descarga activa" };
		}
		activeDownload.resume();
		return { success: true };
	});
	
	ipcMain.handle("minecraft:stop-download", async () => {
		if (!activeDownload) {
			return { success: false, error: "No hay descarga activa" };
		}
		activeDownload.stop();
		activeDownload = null;
		return { success: true };
	});
	
	ipcMain.handle("minecraft:get-stats", async () => {
		if (!activeDownload) {
			return { success: false, error: "No hay descarga activa" };
		}
		return { success: true, stats: activeDownload.getStats() };
	});
}
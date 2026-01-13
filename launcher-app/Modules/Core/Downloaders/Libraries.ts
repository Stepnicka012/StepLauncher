import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import https from "node:https";

import { createTaskLimiter } from "../Utils/Index.js";

export interface LibrariesDownloaderOptions {
	version: string;
	root: string;
	concurry?: number | undefined;
	maxRetries?: number | undefined;
}

const agent = new https.Agent({
	keepAlive: true,
	maxSockets: 200,
	maxFreeSockets: 100,
});

export class LibrariesDownloader extends EventEmitter {
	private version: string;
	private root: string;
	private concurry: number;
	private maxRetries: number;
	
	private limiter: ReturnType<typeof createTaskLimiter>;
	private paused = false;
	private stopped = false;
	private pendingQueue: any[] = [];
	private runningTasks = 0;
	
	private doneEmitted = false;
	
	constructor(opts: LibrariesDownloaderOptions) {
		super();
		this.version = opts.version;
		this.root = opts.root;
		this.concurry = opts.concurry ?? 16;
		this.maxRetries = opts.maxRetries ?? 5;
		
		this.limiter = createTaskLimiter(this.concurry);
	}
	
	async start() {
		this.emit("Start");
		this.stopped = false;
		this.doneEmitted = false;
		const manifest = await this.fetchVersionManifest();
		const versionMeta = manifest.versions.find((v: any) => v.id === this.version);
		if (!versionMeta) throw new Error("Versión no encontrada");
		const versionJson = await this.downloadJSON(versionMeta.url);
		const libs = versionJson.libraries.filter((lib: any) => lib.downloads?.artifact);
		this.pendingQueue = [];
		for (const lib of libs) {
			const item = lib.downloads.artifact;
			this.pendingQueue.push({
				url: item.url,
				sha1: item.sha1,
				path: join(this.root, "libraries", item.path),
				size: item.size,
				retries: 0,
			});
		}
		this.processQueue();
	}
	
	pause() {
		this.paused = true;
		this.emit("Paused");
	}
	
	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.emit("Resumed");
		this.processQueue();
	}
	
	stop() {
		this.stopped = true;
		this.pendingQueue = [];
		this.emit("Stopped");
	}
	
	public async getTotalBytes(): Promise<number> {
		const manifest = await this.fetchVersionManifest();
		const versionMeta = manifest.versions.find((v: any) => v.id === this.version);
		if (!versionMeta) throw new Error("Versión no encontrada");
		const versionJson = await this.downloadJSON(versionMeta.url);
		const libs = versionJson.libraries.filter((lib: any) => lib.downloads?.artifact);
		let total = 0;
		for (const lib of libs) {
			const item = lib.downloads.artifact;
			if (typeof item.size === "number") {
				total += item.size;
			}
		}
		return total;
	}
	
	private processQueue() {
		if (this.paused || this.stopped) return;
		if (this.pendingQueue.length === 0) return this.checkDone();
		while (!this.paused && !this.stopped && this.pendingQueue.length > 0) {
			const task = this.pendingQueue.shift();
			this.runningTasks++;
			this.limiter(() => this.downloadLibrary(task))
			.then(() => {})
			.catch(() => {})
			.finally(() => {
				this.runningTasks--;
				this.checkDone();
				if (!this.paused && !this.stopped) this.processQueue();
			});
		}
	}
	
	private checkDone() {
		if (this.doneEmitted) return;
		if (this.pendingQueue.length === 0 && this.runningTasks === 0 && !this.paused && !this.stopped) {
			this.doneEmitted = true;
			this.emit("Done");
		}
	}
	
	private async downloadLibrary(task: any): Promise<void> {
		await mkdir(dirname(task.path), { recursive: true }).catch(() => {});
		
		return new Promise((resolve, reject) => {
			const req = https.get(task.url, { agent }, (res) => {
				if (res.statusCode !== 200) {
					return this.retryOrFail(task, reject);
				}
				
				const file = createWriteStream(task.path);
				
				res.on("data", (chunk) => this.emit("Bytes", chunk.length));
				res.pipe(file);
				
				file.on("finish", () => file.close(() => resolve()));
				file.on("error", reject);
			});
			
			req.on("error", () => this.retryOrFail(task, reject));
		});
	}
	
	private retryOrFail(task: any, reject: Function) {
		if (task.retries++ < this.maxRetries) {
			this.pendingQueue.push(task);
		} else {
			reject(new Error(`No se pudo descargar: ${task.url}`));
		}
	}
	
	private async fetchVersionManifest() {
		const url = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
		return await this.downloadJSON(url);
	}
	
	private async downloadJSON(url: string): Promise<any> {
		return new Promise((resolve, reject) => {
			https
			.get(url, { agent }, (res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => resolve(JSON.parse(data)));
			})
			.on("error", reject);
		});
	}
}

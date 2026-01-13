import { mkdir, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { createTaskLimiter } from "../Utils/Index.js";

export interface AssetsDownloaderOptions {
	root: string;
	version: string;
	concurry?: number | undefined;
	maxRetries?: number | undefined;
}

interface AssetObject {
	hash: string;
	size: number;
}

const VERSION_MANIFEST = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

async function download(url: string, retries = 5): Promise<Buffer> {
	for (let i = 0; i < retries; i++) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed download: ${url}`);
			return Buffer.from(await res.arrayBuffer());
		} catch (err) {
			if (i === retries - 1) throw err;
		}
	}
	throw new Error("Unreachable");
}

async function prepareDirs(root: string) {
	const base = join(root, "assets");
	const dirs = [
		base,
		join(base, "objects"),
		join(base, "indexes"),
	];
	for (const d of dirs) await mkdir(d, { recursive: true });
	return {
		base,
		objects: join(base, "objects"),
		indexes: join(base, "indexes"),
	};
}

export class AssetsDownloader extends EventEmitter {
	root: string;
	version: string;
	concurry: number;
	maxRetries: number;
	private paused = false;
	private stopped = false;
	private versionType: string | null = null;
	private forceInstall = false;
	
	constructor(opts: AssetsDownloaderOptions) {
		super();
		this.root = opts.root;
		this.version = opts.version;
		this.concurry = opts.concurry ?? 15;
		this.maxRetries = opts.maxRetries ?? 10;
	}
	
	pause() {
		this.paused = true;
		this.emit("Paused");
	}
	
	resume() {
		this.paused = false;
		this.emit("Resumed");
	}
	
	stop() {
		this.stopped = true;
		this.emit("Stopped");
	}
	
	setForceInstall(force: boolean) {
		this.forceInstall = force;
		this.emit("ForceInstallChanged", force);
	}
	
	private async waitIfPaused() {
		while (this.paused) { await new Promise((res) => setTimeout(res, 40)); }
		if (this.stopped) throw new Error("Stopped");
	}
	
	private async getVersionIndex() {
		const manifestBuf = await download(VERSION_MANIFEST, this.maxRetries);
		const manifest = JSON.parse(manifestBuf.toString());
		const versionMeta = manifest.versions.find( (v: any) => v.id === this.version );
		if (!versionMeta) throw new Error(`Version not found: ${this.version}`);
		this.versionType = versionMeta.type; 
		const versionJsonBuf = await download(versionMeta.url, this.maxRetries);
		const versionJson = JSON.parse(versionJsonBuf.toString());
		const assetIndexName = versionJson.assetIndex?.id || this.version;
		const indexBuf = await download(versionJson.assetIndex.url, this.maxRetries);
		return {
			indexBuf,
			assetIndexName,
			objects: (JSON.parse(indexBuf.toString()) as {
				objects: Record<string, AssetObject>;
			}).objects
		};
	}
	
	public async getTotalBytes() {
		const dirs = await prepareDirs(this.root);
		const { objects } = await this.getVersionIndex();
		let total = 0;
		for (const obj of Object.values(objects)) {
			if (this.forceInstall) {
				total += obj.size;
				continue;
			}
			
			const sha1 = obj.hash;
			const sub = sha1.slice(0, 2);
			const filePath = join(dirs.objects, sub, sha1);
			try {
				await stat(filePath);
			} catch {
				total += obj.size;
			}
		}
		return total;
	}
	
	private downloadAllResources(objects: Record<string, AssetObject>, dirs: any) {
		const limit = createTaskLimiter(this.concurry);
		return Object.entries(objects).map(([name, obj]) =>
			limit(async () => {
			await this.waitIfPaused();
			const sha1 = obj.hash;
			const sub = sha1.slice(0, 2);
			const url = `https://resources.download.minecraft.net/${sub}/${sha1}`;
			const savePath = join(dirs.resources, name);
			await mkdir(dirname(savePath), { recursive: true });
			
			if (!this.forceInstall) {
				try {
					await stat(savePath);
					this.emit("FileStart", { type: "resource", name, size: obj.size });
					this.emit("Bytes", obj.size);
					this.emit("ResourceFile", name);
					this.emit("FileEnd", { type: "resource", name });
					return;
				} catch {}
			}
			
			this.emit("FileStart", { type: "resource", name, size: obj.size });
			const buf = await download(url, this.maxRetries);
			await writeFile(savePath, buf);
			this.emit("Bytes", buf.length);
			this.emit("ResourceFile", name);
			this.emit("FileEnd", { type: "resource", name });
			return buf;
		})
	);
}

private downloadAllObjects(objects: Record<string, AssetObject>, dirs: any) {
	const limit = createTaskLimiter(this.concurry);
	return Object.values(objects).map((obj) =>
		limit(async () => {
		await this.waitIfPaused();
		const sha1 = obj.hash;
		const sub = sha1.slice(0, 2);
		const savePath = join(dirs.objects, sub, sha1);
		
		if (!this.forceInstall) {
			try {
				await stat(savePath);
				this.emit("FileStart", { type: "object", hash: sha1, size: obj.size });
				this.emit("Bytes", obj.size);
				this.emit("ObjectFile", sha1);
				this.emit("FileEnd", { type: "object", hash: sha1 });
				return;
			} catch {}
		}
		
		await mkdir(dirname(savePath), { recursive: true });
		const url = `https://resources.download.minecraft.net/${sub}/${sha1}`;
		this.emit("FileStart", { type: "object", hash: sha1, size: obj.size });
		const buf = await download(url, this.maxRetries);
		await writeFile(savePath, buf);
		this.emit("Bytes", buf.length);
		this.emit("ObjectFile", sha1);
		this.emit("FileEnd", { type: "object", hash: sha1 });
		return buf;
	})
);
}

private shouldDownloadResources(): boolean {
	if (!this.versionType) return false;
	if (this.versionType === "old_alpha") return true;
	if (this.versionType === "old_beta") return true;
	if (this.versionType === "alpha") return true;
	if (this.versionType === "beta") return true;
	const parts = this.version.split(".").map(n => parseInt(n, 10));
	const major = parts[0] ?? 0;
	const minor = parts[1] ?? 0;
	if (major === 1 && minor < 6) return true;
	if (major < 1) return true;
	return false;
}

public async start() {
	this.emit("Start");
	const dirs = await prepareDirs(this.root);
	const { indexBuf, objects, assetIndexName } = await this.getVersionIndex();
	
	const isLegacy = this.shouldDownloadResources();
	
	let resourceTasks: any[] = [];
	let objectTasks: any[] = [];
	
	if (isLegacy) {
		const resourcesDir = join(this.root, "resources");
		await mkdir(resourcesDir, { recursive: true });
		(dirs as any).resources = resourcesDir; 
		
		await writeFile(join(resourcesDir, "resources.json"), indexBuf);
		
		resourceTasks = this.downloadAllResources(objects, dirs);
	} else {
		await writeFile(join(dirs.indexes, `${assetIndexName}.json`), indexBuf);
		objectTasks = this.downloadAllObjects(objects, dirs);
	}
	
	await Promise.all([
		...resourceTasks,
		...objectTasks
	]);
	
	this.emit("Done");
}
}
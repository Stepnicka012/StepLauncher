import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import https from "node:https";

export interface ClientDownloaderOptions {
	version: string;
	root: string;
	concurry?: number | undefined;
	maxRetries?: number | undefined;
	decodeJson?: boolean | undefined;
}

export class ClientDownloader extends EventEmitter {
	private version: string;
	private root: string;
	private paused = false;
	private stopped = false;
	private maxRetries: number;
	private decodeJson: boolean;
	
	private jarURL = "";
	private jsonURL = "";
	private jsonData: any = null;
	
	constructor(opts: ClientDownloaderOptions) {
		super();
		this.version = opts.version;
		this.root = opts.root;
		this.maxRetries = opts.maxRetries ?? 5;
		this.decodeJson = opts.decodeJson ?? false;
	}
	
	private fetch(url: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			https
			.get(url, (res) => {
				if (res.statusCode !== 200)
					return reject(new Error("HTTP " + res.statusCode));
				
				const data: Buffer[] = [];
				res.on("data", (c) => data.push(c));
				res.on("end", () => resolve(Buffer.concat(data)));
			})
			.on("error", reject);
		});
	}
	
	private async loadManifest() {
		const buf = await this.fetch("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
		const manifest = JSON.parse(buf.toString());
		const entry = manifest.versions.find((v: any) => v.id === this.version);
		if (!entry) throw new Error("Version no encontrada");
		const versionJSON = JSON.parse((await this.fetch(entry.url)).toString());
		this.jarURL = versionJSON.downloads.client.url;
		this.jsonURL = entry.url;
		this.jsonData = versionJSON;
	}
	
	public async getTotalBytes() {
		await this.loadManifest();
		return (
			this.jsonData.downloads.client.size +
			JSON.stringify(this.jsonData, null, 0).length
		);
	}
	
	private async downloadTo(url: string, filePath: string) {
		await mkdir(dirname(filePath), { recursive: true });
		return new Promise<void>((resolve, reject) => {
			const attempt = (retry: number) => {
				if (this.stopped) return resolve();
				const req = https.get(url, (res) => {
					if (res.statusCode !== 200) {
						if (retry < this.maxRetries) return attempt(retry + 1);
						return reject(new Error("HTTP " + res.statusCode));
					}
					const chunks: Buffer[] = [];
					res.on("data", async (chunk) => {
						while (this.paused && !this.stopped) {
							await new Promise((r) => setTimeout(r, 50));
						}
						if (this.stopped) return;
						chunks.push(chunk);
						this.emit("Bytes", chunk.length);
					});
					res.on("end", async () => {
						if (this.stopped) return resolve();
						await writeFile(filePath, Buffer.concat(chunks));
						resolve();
					});
				});
				req.on("error", (e) => {
					if (retry < this.maxRetries) return attempt(retry + 1);
					reject(e);
				});
			};
			attempt(0);
		});
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
	
	async start() {
		this.emit("Start");
		this.paused = false;
		this.stopped = false;
		if (!this.jsonData) await this.loadManifest();
		const jsonPath = join( this.root, "versions", this.version, `${this.version}.json` );
		const jarPath = join( this.root, "versions", this.version, `${this.version}.jar` );
		if (this.decodeJson) {
			await mkdir(dirname(jsonPath), { recursive: true });
			const pretty = JSON.stringify(this.jsonData, null, 2);
			this.emit("Bytes", Buffer.byteLength(pretty, "utf-8"));
			await writeFile(jsonPath, pretty, "utf-8");
		} else {
			await this.downloadTo(this.jsonURL, jsonPath);
		}
		await this.downloadTo(this.jarURL, jarPath);
		if (!this.stopped) this.emit("Done");
	}
}

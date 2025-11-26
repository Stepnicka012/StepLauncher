import https from "node:https";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { TaskLimiter } from "../Utils/Index.js";

interface FileEntry {
  downloads: { raw: { url: string; sha1: string; size: number }; lzma?: any };
  type: string;
  executable?: boolean;
}

interface ManifestJson {
  files: Record<string, FileEntry>;
}

interface JavaManifest {
  manifest: { url: string; size: number; sha1: string };
  version: { name: string };
}

interface JavaAllJson {
  [platform: string]: { [type: string]: JavaManifest[] };
}

interface VersionJson {
  javaVersion: { component: string; majorVersion: number };
}

export interface RuntimeDownloaderOptions {
  version: string;
  root: string;
  concurrency?: number;
  maxRetries?: number;
}

export class RuntimeDownloader extends EventEmitter {
    private options: RuntimeDownloaderOptions;
    private versionManifestUrl = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    private javaAllUrl = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
    private taskLimiter: TaskLimiter;
    private downloadedBytes: number = 0;

    constructor(options: RuntimeDownloaderOptions) {
        super();
        this.options = options;
        this.taskLimiter = new TaskLimiter(options.concurrency || 5);
    }

    public async getTotalBytes(): Promise<number> {
        const javaManifest = await this.getJavaManifest();
        const manifestJson: ManifestJson = await this.fetchJson(javaManifest.manifest.url);
        let total = 0;
        for (const file of Object.values(manifestJson.files)) {
            if (file.type === "file" && file.downloads?.raw?.size) { total += file.downloads.raw.size; }
        }
        return total;
    }

    public async start() {
        this.emit("Start");
        this.downloadedBytes = 0;

        try {
            const javaManifest = await this.getJavaManifest();
            const javaRoot = join(this.options.root, "runtime", `java-${javaManifest.version.name}`);
            const manifestJson: ManifestJson = await this.fetchJson(javaManifest.manifest.url);
            
            const downloadTasks: Promise<void>[] = [];
            
            for (const [relativePath, file] of Object.entries(manifestJson.files)) {
                if (file.type === "directory") continue;
                
                const destPath = join(javaRoot, relativePath);
                await mkdir(dirname(destPath), { recursive: true });
                
                const task = this.taskLimiter.limit(() => 
                    this.downloadFileWithRetry(file.downloads.raw.url, destPath)
                );
                downloadTasks.push(task);
            }
            
            await Promise.all(downloadTasks);
            this.emit("Done", javaRoot);
        } catch (err) {
            this.emit("Stopped", err);
        }
    }

    private async downloadFileWithRetry(url: string, dest: string): Promise<void> {
        const maxRetries = this.options.maxRetries || 3;
        let lastError: Error;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await this.downloadFile(url, dest);
                return;
            } catch (err) {
                lastError = err as Error;
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
        }
        
        throw lastError!;
    }

    private async getJavaManifest(): Promise<JavaManifest> {
        const versionManifest = await this.fetchJson<any>(this.versionManifestUrl);
        const versionData = versionManifest.versions.find((v: any) => v.id === this.options.version);
        if (!versionData) throw new Error("Versión de Minecraft no encontrada");
        const versionJson = await this.fetchJson<VersionJson>(versionData.url);
        const javaType = versionJson.javaVersion.component;
        const platform = this.getPlatform();
        const javaAll = await this.fetchJson<JavaAllJson>(this.javaAllUrl);
        const javaList = javaAll[platform]?.[javaType];
        if (!javaList || javaList.length === 0) { throw new Error(`No hay Java disponible para ${platform} (${javaType})`); }
        const javaManifest: JavaManifest = javaList[javaList.length - 1]!; 
        return javaManifest;
    }

    private getPlatform(): string {
        const plat = process.platform;
        const arch = process.arch;
        if (plat === "win32" && arch === "x64") return "windows-x64";
        if (plat === "win32" && arch === "ia32") return "windows-x86";
        if (plat === "darwin" && arch === "arm64") return "mac-os-arm64";
        if (plat === "darwin") return "mac-os";
        if (plat === "linux" && arch === "x64") return "linux";
        if (plat === "linux" && arch === "ia32") return "linux-i386";
        throw new Error("Plataforma no soportada");
    }

    private fetchJson<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            https.get(url, res => {
                let data = "";
                res.on("data", chunk => (data += chunk));
                res.on("end", () => resolve(JSON.parse(data)));
                res.on("error", reject);
            });
        });
    }

    private downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            https.get(url, res => {
                const chunks: Buffer[] = [];
                let downloaded = 0;
                res.on("data", chunk => {
                    chunks.push(chunk);
                    downloaded += chunk.length;
                    this.downloadedBytes += chunk.length;
                    this.emit("Bytes", this.downloadedBytes);
                });
                res.on("end", async () => {
                    try {
                        await writeFile(dest, Buffer.concat(chunks));
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
                res.on("error", reject);
            });
        });
    }
}
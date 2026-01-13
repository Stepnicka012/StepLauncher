import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { createTaskLimiter } from "../Utils/Index.js";
import https from "node:https";

interface FileEntry {
    downloads?: {
        raw?: {
            url: string;
            sha1: string;
            size: number;
        };
        lzma?: any;
    };
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
    root: string;
    version: string;
    concurry?: number;
    maxRetries?: number;
}

export class RuntimeDownloader extends EventEmitter {
    root: string;
    version: string;
    concurry: number;
    maxRetries: number;
    private paused = false;
    private stopped = false;
    private forceInstall = false;
    private versionManifestUrl = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    private javaAllUrl = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

    constructor(opts: RuntimeDownloaderOptions) {
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

    private async fetchJson<T>(url: string): Promise<T> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                    return;
                }
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(new Error(`Invalid JSON from ${url}: ${error}`));
                    }
                });
            }).on("error", reject);
        });
    }

    private async getJavaManifest(): Promise<JavaManifest> {
        const versionManifest = await this.fetchJson<any>(this.versionManifestUrl);
        const versionData = versionManifest.versions.find((v: any) => v.id === this.version);
        if (!versionData) throw new Error("Versión de Minecraft no encontrada");

        const versionJson = await this.fetchJson<VersionJson>(versionData.url);
        const javaType = versionJson.javaVersion.component;
        const platform = this.getPlatform();

        const javaAll = await this.fetchJson<JavaAllJson>(this.javaAllUrl);
        const javaList = javaAll[platform]?.[javaType];

        if (!javaList || javaList.length === 0) {
            throw new Error(`No hay Java disponible para ${platform} (${javaType})`);
        }

        return javaList[javaList.length - 1]!;
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

    private async prepareDirs(javaManifest: JavaManifest) {
        const javaRoot = join(this.root, "runtime", `java-${javaManifest.version.name}`);
        await mkdir(javaRoot, { recursive: true });
        return javaRoot;
    }

    public async getTotalBytes(): Promise<number> {
        try {
            const javaManifest = await this.getJavaManifest();
            const javaRoot = await this.prepareDirs(javaManifest);
            const manifestJson: ManifestJson = await this.fetchJson(javaManifest.manifest.url);

            let total = 0;

            for (const [relativePath, file] of Object.entries(manifestJson.files)) {
                if (file.type === "directory") continue;
                if (!file.downloads?.raw?.size) continue;

                if (this.forceInstall) {
                    total += file.downloads.raw.size;
                    continue;
                }

                const destPath = join(javaRoot, relativePath);
                try {
                    await stat(destPath);
                } catch {
                    total += file.downloads.raw.size;
                }
            }

            return total;
        } catch (error) {
            this.emit("Error", error);
            throw error;
        }
    }

    private downloadAllFiles(manifestJson: ManifestJson, javaRoot: string) {
        const limit = createTaskLimiter(this.concurry);

        return Object.entries(manifestJson.files).map(([relativePath, file]) =>
            limit(async () => {
                await this.waitIfPaused();

                if (file.type === "directory") return;
                if (!file.downloads?.raw?.url) {
                    this.emit("Error", `Archivo sin URL de descarga: ${relativePath}, tipo: ${file.type}`);
                    return;
                }

                const destPath = join(javaRoot, relativePath);
                const fileInfo = {
                    name: relativePath,
                    size: file.downloads.raw.size,
                    hash: file.downloads.raw.sha1,
                    executable: file.executable || false
                };

                if (!this.forceInstall) {
                    try {
                        await stat(destPath);
                        this.emit("FileStart", { type: "runtime", ...fileInfo });
                        this.emit("Bytes", file.downloads.raw.size);
                        this.emit("RuntimeFile", relativePath);
                        this.emit("FileEnd", { type: "runtime", ...fileInfo });
                        return;
                    } catch {}
                }

                await mkdir(dirname(destPath), { recursive: true });

                this.emit("FileStart", { type: "runtime", ...fileInfo });
                
                // Usamos stream para descargar y emitir bytes por chunks
                await this.downloadFileWithStream(file.downloads.raw.url, destPath, file.executable);
                
                this.emit("RuntimeFile", relativePath);
                this.emit("FileEnd", { type: "runtime", ...fileInfo });
            })
        );
    }

    private async downloadFileWithStream(url: string, destPath: string, executable?: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            const fileStream = createWriteStream(destPath);
            
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                    return;
                }

                res.on('data', (chunk) => {
                    if (this.paused) {
                        res.pause();
                        const checkPause = () => {
                            if (this.paused) {
                                setTimeout(checkPause, 50);
                            } else {
                                res.resume();
                            }
                        };
                        checkPause();
                    }
                    
                    if (this.stopped) {
                        res.destroy();
                        fileStream.destroy();
                        reject(new Error("Stopped"));
                    }
                    
                    this.emit("Bytes", chunk.length);
                });

                res.pipe(fileStream);

                fileStream.on('finish', async () => {
                    fileStream.close();
                    if (executable) {
                        try {
                            await import("node:fs").then(fs => 
                                fs.chmodSync(destPath, 0o755)
                            );
                        } catch {}
                    }
                    resolve();
                });

                fileStream.on('error', reject);
            }).on('error', reject);
        });
    }

    public async start() {
        this.emit("Start");
        
        try {
            const javaManifest = await this.getJavaManifest();
            const javaRoot = await this.prepareDirs(javaManifest);
            const manifestJson: ManifestJson = await this.fetchJson(javaManifest.manifest.url);
            
            const downloadTasks = this.downloadAllFiles(manifestJson, javaRoot);
            await Promise.all(downloadTasks);
            
            this.emit("Done", { javaRoot, version: javaManifest.version.name });
        } catch (error: any) {
            if (error.message === "Stopped") {
                this.emit("Stopped");
            } else {
                this.emit("Error", error);
                throw error;
            }
        }
    }
}
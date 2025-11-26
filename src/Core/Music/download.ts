import type { QualityMode, MediaDownloaderOptions, DownloadOptions, DownloadResult, ProgressData } from "../../Utils/Types.js";
import { searchYouTube } from "./search.js";
import { FolderLauncher } from "../Folder.js";
import youtubedl from "youtube-dl-exec";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";

// Sanitiza títulos inválidos en Windows
function sanitize(text: string) {
    return text
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export class MediaDownloader extends EventEmitter {
    #folder: FolderLauncher;
    #videoDir: string;
    #audioDir: string;

    videoQuality: QualityMode;
    audioQuality: QualityMode;

    constructor(options: MediaDownloaderOptions = {}) {
        super();
        this.#folder = new FolderLauncher();
        this.#videoDir = path.join(this.#folder.getLauncherPath(), "Media", "Video");
        this.#audioDir = path.join(this.#folder.getLauncherPath(), "Media", "Audio");

        this.#ensureFolder(this.#videoDir);
        this.#ensureFolder(this.#audioDir);

        this.videoQuality = options.qualityVideo ?? "high";
        this.audioQuality = options.qualityAudio ?? "high";
    }

    #ensureFolder(dir: string): void {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    async download(url: string, opts: DownloadOptions = {}): Promise<DownloadResult> {
        if (!url.startsWith("http")) throw new Error("URL inválida");

        // Buscar título real
        const data = await searchYouTube(url, 1);
        const realTitle = data[0]?.title || `media_${Math.random().toString(36).slice(2)}`;
        const title = sanitize(realTitle);

        const result: DownloadResult = { title };
        const tasks: Promise<any>[] = [];

        const downloadVideo = opts.downloadVideo ?? true;
        const downloadAudio = opts.downloadAudio ?? true;

        this.emit("start", { url, title });

        // VIDEO
        if (downloadVideo) {
            const final = path.join(this.#videoDir, `${title}.webm`);
            result.videoPath = final;

            tasks.push(
                this.#downloadRaw(url, final, "video", opts.qualityVideo ?? this.videoQuality, p => {
                    this.emit("progress:video", p);
                }).then(() => {
                    this.emit("progress:stepComplete", { step: "video" });
                })
            );
        }

        // AUDIO
        if (downloadAudio) {
            const final = path.join(this.#audioDir, `${title}.m4a`);
            result.audioPath = final;

            tasks.push(
                this.#downloadRaw(url, final, "audio", opts.qualityAudio ?? this.audioQuality, p => {
                    this.emit("progress:audio", p);
                }).then(() => {
                    this.emit("progress:stepComplete", { step: "audio" });
                })
            );
        }

        await Promise.all(tasks);

        this.emit("finish", result);
        return result;
    }

    async #downloadRaw(
        url: string,
        filePath: string,
        type: "audio" | "video",
        quality: QualityMode,
        onProgress: (data: ProgressData) => void
    ): Promise<string> {
        // Si el archivo ya existe, no descargar y emitir 100%
        if (fs.existsSync(filePath)) {
            onProgress({ filePath, percent: 100, readable: "100%" });
            return filePath; // <--- retorna aquí
        }

        const videoMap = {
            low: "bv*[height<=360][ext=webm]/best",
            medium: "bv*[height<=720][ext=webm]/best",
            high: "bv*[height<=1080][ext=webm]/best",
            ultra: "bv*[height>=1080][ext=webm]/best"
        };

        const audioMap = {
            low: "bestaudio[abr<=70][ext=m4a]/bestaudio",
            medium: "bestaudio[abr<=130][ext=m4a]/bestaudio",
            high: "bestaudio[abr<=160][ext=m4a]/bestaudio",
            ultra: "bestaudio[abr>=160][ext=m4a]/bestaudio"
        };

        const flags = {
            format: type === "video" ? videoMap[quality] : audioMap[quality],
            output: filePath,
            noPlaylist: true,
            noPart: true,
            progress: true,
            noCheckCertificate: true,
            rmCacheDir: true,
            noOverwrites: true,
        };

        return new Promise((resolve, reject) => {
            const proc = youtubedl.exec(url, flags, { stdio: ["ignore", "pipe", "pipe"] });

            let lastPercent = -1;

            const parse = (text: string) => {
                const m = text.match(/(\d+(?:\.\d+)?)%/);
                if (!m) return;

                const percent = parseFloat(m[1]!);
                if (percent <= lastPercent) return;
                lastPercent = percent;

                onProgress({
                    filePath,
                    percent,
                    readable: `${percent.toFixed(2)}%`
                });
            };

            proc.stdout?.on("data", d => parse(d.toString()));
            proc.stderr?.on("data", d => parse(d.toString()));

            proc.on("error", reject);
            proc.on("close", () => resolve(filePath));
        });
    }
}

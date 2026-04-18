import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface DownloadProgress {
    downloadedBytes: number;
    totalBytes: number;
    percentage: string;
    downloadedMB: string;
    totalMB: string;
}

export interface DownloadOptions {
    outputDir: string;
    onProgress?: (progress: DownloadProgress) => void;
    onLog?: (message: string) => void;
}

interface GitHubRelease {
    tag_name: string;
    assets: Array<{
        name: string;
        browser_download_url: string;
        size: number;
    }>;
}

export async function downloadNovaCore(options: DownloadOptions): Promise<string> {
    const repo = "Stepnicka012/NovaCore-Engine";
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const log = options.onLog || (() => { });
    const destPath = path.resolve(options.outputDir, 'novacore-engine.jar');

    try {
        log(`Consultando GitHub API para ${repo}...`);
        const response = await fetch(apiUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

        const data = (await response.json()) as GitHubRelease;
        const jarAsset = data.assets.find(asset => asset.name.endsWith('.jar'));
        if (!jarAsset) throw new Error("No se encontró ningún .jar en la release.");

        log(`Versión: ${data.tag_name} → ${jarAsset.name} (${(jarAsset.size / 1024 / 1024).toFixed(2)} MB)`);

        await mkdir(options.outputDir, { recursive: true });

        const fileResponse = await fetch(jarAsset.browser_download_url);
        if (!fileResponse.ok || !fileResponse.body) {
            throw new Error(`Fallo descarga: HTTP ${fileResponse.status}`);
        }

        const totalBytes = jarAsset.size;
        let downloadedBytes = 0;
        let lastReportTime = 0;
        const fileStream = createWriteStream(destPath);

        for await (const chunk of fileResponse.body as any) {
            downloadedBytes += chunk.length;
            fileStream.write(chunk);
            if (options.onProgress) {
                const now = Date.now();
                if (now - lastReportTime >= 150 || downloadedBytes === totalBytes) {
                    lastReportTime = now;
                    options.onProgress({
                        downloadedBytes,
                        totalBytes,
                        percentage: ((downloadedBytes / totalBytes) * 100).toFixed(2),
                        downloadedMB: (downloadedBytes / 1024 / 1024).toFixed(2),
                        totalMB: (totalBytes / 1024 / 1024).toFixed(2)
                    });
                }
            }
        }

        await new Promise<void>((resolve, reject) => {
            fileStream.end((err?: Error) => {
                if (err) reject(err);
                else resolve();
            });
        });

        log(`Engine guardado en: ${destPath}`);
        return destPath;

    } catch (error) {
        throw new Error(`Error descargando engine: ${error instanceof Error ? error.message : error}`);
    }
}
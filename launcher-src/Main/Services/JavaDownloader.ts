import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, readdir, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

export interface DownloadProgress {
    downloadedBytes: number;
    totalBytes: number;
    percentage: string;
    downloadedMB: string;
    totalMB: string;
}

export interface JavaDownloadOptions {
    outputDir: string;
    version?: number;
    imageType?: 'jre' | 'jdk';
    onProgress?: (progress: DownloadProgress) => void;
    onLog?: (message: string) => void;
}

function getPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    let adoptOs = 'windows';
    if (platform === 'darwin') adoptOs = 'mac';
    else if (platform === 'linux') adoptOs = 'linux';
    let adoptArch = 'x64';
    if (arch === 'arm64') adoptArch = 'aarch64';
    return { os: adoptOs, arch: adoptArch };
}

async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', err => reject(err));
        stream.on('end', () => {
            resolve(hash.digest('hex') === expectedChecksum);
        });
    });
}

async function moveContentsUp(sourceDir: string, targetDir: string): Promise<void> {
    const entries = await readdir(sourceDir);
    for (const entry of entries) {
        const srcPath = path.join(sourceDir, entry);
        const destPath = path.join(targetDir, entry);
        try {
            await access(destPath);
            await rm(destPath, { recursive: true, force: true });
        } catch { }
        await rename(srcPath, destPath);
    }
    await rm(sourceDir, { recursive: true });
}

export async function downloadJava(options: JavaDownloadOptions): Promise<string> {
    const log = options.onLog || (() => {});
    const version = options.version || 21;
    const imageType = options.imageType || 'jre';
    const sysInfo = getPlatformInfo();

    const apiUrl = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?architecture=${sysInfo.arch}&image_type=${imageType}&os=${sysInfo.os}`;

    try {
        log(`Buscando ${imageType.toUpperCase()} ${version} para ${sysInfo.os} (${sysInfo.arch})...`);

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        const release = data[0];
        const downloadUrl = release.binary.package.link;
        const fileName = release.binary.package.name;
        const fileSize = release.binary.package.size;
        const checksum = release.binary.package.checksum;

        const javaSubfolder = `Java-${version}-${imageType}`;
        const extractPath = path.resolve(options.outputDir, javaSubfolder);
        await mkdir(extractPath, { recursive: true });

        const zipPath = path.join(options.outputDir, fileName);

        log(`Descargando: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok || !fileResponse.body) throw new Error("Fallo en descarga");

        let downloadedBytes = 0;
        let lastReportTime = 0;
        const fileStream = createWriteStream(zipPath);
        
        for await (const chunk of fileResponse.body as any) {
            downloadedBytes += chunk.length;
            fileStream.write(chunk);
            if (options.onProgress) {
                const now = Date.now();
                if (now - lastReportTime >= 150 || downloadedBytes === fileSize) {
                    lastReportTime = now;
                    options.onProgress({
                        downloadedBytes,
                        totalBytes: fileSize,
                        percentage: ((downloadedBytes / fileSize) * 100).toFixed(2),
                        downloadedMB: (downloadedBytes / 1024 / 1024).toFixed(2),
                        totalMB: (fileSize / 1024 / 1024).toFixed(2)
                    });
                }
            }
        }

        await new Promise<void>((resolve, reject) => {
            fileStream.end((err?: Error) => {
                if (err) reject(err); else resolve();
            });
        });

        if (checksum) {
            log(`Verificando integridad (SHA256)...`);
            const isValid = await verifyChecksum(zipPath, checksum);
            if (!isValid) throw new Error("Fallo en la validación SHA256 del JDK descargado.");
            log(`Integridad validada exitosamente.`);
        }

        if (fileName.endsWith('.zip')) {
            log(`Extrayendo ${fileName} en ${extractPath}...`);
            const zip = new AdmZip(zipPath);
            await new Promise<void>((resolve, reject) => {
                zip.extractAllToAsync(extractPath, true, undefined, (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            const entries = zip.getEntries();
            const rootFolders = new Set<string>();
            for (const entry of entries) {
                const parts = entry.entryName.split('/');
                if (parts.length > 1 && parts[0] !== '') {
                    rootFolders.add(parts[0]!);
                }
            }

            if (rootFolders.size === 1) {
                const topFolder = Array.from(rootFolders)[0]!;
                const sourceFolder = path.join(extractPath, topFolder);
                log(`Moviendo contenido de ${topFolder} a ${extractPath}...`);
                await moveContentsUp(sourceFolder, extractPath);
                log(`Carpeta ${topFolder} eliminada.`);
            } else if (rootFolders.size > 1) {
                log(`Advertencia: múltiples carpetas raíz (${Array.from(rootFolders).join(', ')}). No se mueve nada.`);
            }

            // Eliminar ZIP
            await rm(zipPath);
            log(`ZIP eliminado: ${zipPath}`);
        } else {
            log(`El archivo no es ZIP, se mantiene en: ${zipPath}`);
            return zipPath;
        }

        log(`Java instalado en: ${extractPath}`);
        return extractPath;

    } catch (error) {
        throw new Error(`Error descargando Java: ${error instanceof Error ? error.message : error}`);
    }
}
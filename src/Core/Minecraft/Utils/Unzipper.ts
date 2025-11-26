import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { EventEmitter } from 'events';

interface UnzipperEntry {
    name: string;
    isDirectory: boolean;
    size: number;
}

interface ExtractOptions {
    src: string;
    dest: string;
    validExts?: string[];
    flattenNatives?: boolean;
    cleanAfter?: boolean;
    ignoreFolders?: string[];
}

export class Unzipper extends EventEmitter {
    private entries: UnzipperEntry[] = [];

    constructor() {
        super();
    }

    private isValidZip(buffer: Buffer): boolean {
        if (buffer.length < 4) return false;
        
        // Verificar firma ZIP al inicio
        if (buffer.readUInt32LE(0) === 0x04034b50) return true;
        
        // Buscar firma en los primeros bytes
        for (let i = 0; i < Math.min(buffer.length - 4, 1024); i++) {
            if (buffer.readUInt32LE(i) === 0x04034b50) return true;
        }
        
        return false;
    }

    private safeInflate(data: Buffer): Buffer {
        try {
            return zlib.inflateRawSync(data);
        } catch {
            try {
                return zlib.inflateSync(data);
            } catch (error) {
                throw new Error(`Failed to decompress: ${error}`);
            }
        }
    }

    async extract(options: ExtractOptions): Promise<void> {
        const { src, dest, validExts = [], flattenNatives = true, cleanAfter = true, ignoreFolders = ['META-INF'] } = options;
        
        // Verificaciones iniciales
        if (!fs.existsSync(src)) {
            throw new Error(`File not found: ${src}`);
        }

        const stats = fs.statSync(src);
        if (stats.size === 0) {
            throw new Error(`Empty file: ${src}`);
        }

        const buffer = fs.readFileSync(src);
        if (!this.isValidZip(buffer)) {
            throw new Error(`Invalid ZIP file: ${src}`);
        }

        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        let offset = 0;
        let processed = 0;
        const maxSize = 100 * 1024 * 1024; // 100MB límite

        try {
            while (offset + 30 <= buffer.length && offset < maxSize) {
                // Buscar signature
                while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) !== 0x04034b50) {
                    offset++;
                    if (offset >= maxSize) break;
                }

                if (offset + 30 > buffer.length) break;

                // Leer header
                const compression = buffer.readUInt16LE(offset + 8);
                const compressedSize = buffer.readUInt32LE(offset + 18);
                const fileNameLen = buffer.readUInt16LE(offset + 26);
                const extraLen = buffer.readUInt16LE(offset + 28);

                // Verificaciones de seguridad
                if (fileNameLen > 1000 || extraLen > 10000 || compressedSize > maxSize) {
                    offset += 30 + fileNameLen + extraLen + compressedSize;
                    continue;
                }

                const dataStart = offset + 30 + fileNameLen + extraLen;
                const dataEnd = dataStart + compressedSize;

                if (dataEnd > buffer.length) {
                    this.emit('warning', `Truncated entry in: ${path.basename(src)}`);
                    break;
                }

                const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
                offset = dataEnd;

                // Filtrar entradas no deseadas
                if (this.shouldSkipEntry(fileName, ignoreFolders)) {
                    continue;
                }

                // Procesar entrada
                try {
                    await this.processEntry({
                        fileName,
                        compression,
                        data: buffer.slice(dataStart, dataEnd),
                        dest,
                        validExts,
                        flattenNatives
                    });
                    processed++;
                } catch (error) {
                    this.emit('warning', `Skipping ${fileName}: ${error}`);
                }
            }

            if (processed === 0) {
                this.emit('warning', `No files extracted from: ${path.basename(src)}`);
            } else {
                this.emit('status', `Extracted ${processed} files from ${path.basename(src)}`);
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }

        if (cleanAfter) {
            this.cleanup(dest, validExts, ignoreFolders);
        }

        this.emit('done', this.entries);
    }

    private shouldSkipEntry(fileName: string, ignoreFolders: string[]): boolean {
        if (!fileName) return true;
        if (fileName.includes('..')) return true; // Path traversal
        if (fileName.match(/licen[cs]e/i)) return true; // Licencias
        return ignoreFolders.some(folder => fileName.startsWith(folder + '/'));
    }

    private async processEntry(entry: {
        fileName: string; compression: number; data: Buffer;
        dest: string; validExts: string[]; flattenNatives: boolean;
    }): Promise<void> {
        const { fileName, compression, data, dest, validExts, flattenNatives } = entry;

        if (fileName.endsWith('/')) {
            // Directorio
            const dirPath = path.join(dest, fileName);
            if (dirPath.startsWith(dest)) {
                fs.mkdirSync(dirPath, { recursive: true });
                this.entries.push({ name: fileName, isDirectory: true, size: 0 });
            }
            return;
        }

        const ext = path.extname(fileName).toLowerCase();
        if (validExts.length > 0 && !validExts.includes(ext)) {
            return;
        }

        // Descomprimir datos
        let fileData: Buffer;
        if (compression === 0) {
            fileData = data; // Sin compresión
        } else if (compression === 8) {
            fileData = this.safeInflate(data); // DEFLATE
        } else {
            throw new Error(`Unsupported compression method: ${compression}`);
        }

        // Determinar path de salida
        let outputPath = path.join(dest, fileName);
        if (flattenNatives && ['.dll', '.so', '.dylib', '.jnilib'].includes(ext)) {
            outputPath = path.join(dest, path.basename(fileName));
        }

        // Verificar seguridad del path
        if (!outputPath.startsWith(dest)) {
            throw new Error('Invalid output path');
        }

        // Escribir archivo
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, fileData);

        this.entries.push({
            name: fileName,
            isDirectory: false,
            size: fileData.length
        });

        this.emit('file', {
            name: fileName,
            size: fileData.length,
            path: outputPath
        });
    }

    private cleanup(baseDir: string, validExts: string[], ignoreFolders: string[]): void {
        if (!fs.existsSync(baseDir)) return;

        const cleanDirectory = (dir: string) => {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    if (ignoreFolders.includes(item)) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        cleanDirectory(fullPath);
                        // Eliminar directorio vacío
                        if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
                            fs.rmSync(fullPath, { recursive: true });
                        }
                    }
                } else if (validExts.length > 0) {
                    const ext = path.extname(item).toLowerCase();
                    if (!validExts.includes(ext)) {
                        fs.unlinkSync(fullPath);
                    }
                }
            }
        };

        cleanDirectory(baseDir);
    }

    getEntries(): UnzipperEntry[] {
        return this.entries;
    }
}
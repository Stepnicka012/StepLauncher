// concurrentDownloader.ts
import { EventEmitter } from 'node:events';
import { createWriteStream, promises as fs } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';
import { parse as parseUrl } from 'node:url';

interface DownloadOptions {
    url: string;
    output: string;
    maxRetries?: number;
    concurrency?: number;
}

export class ConcurrentDownloader extends EventEmitter {
    constructor() {
        super();
    }

    async download(options: DownloadOptions) {
        const { url, output, maxRetries = 3, concurrency = 4 } = options;

        try {
            const parsedUrl = parseUrl(url);
            const client = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;

            this.emit('info', `Iniciando descarga concurrente: ${url}`);

            const totalBytes = await this.getContentLength(url);
            if (!totalBytes) {
                this.emit('warn', 'No se pudo obtener el tamaño total del archivo.');
            }
            this.emit('total', (totalBytes / 1024 / 1024).toFixed(2));

            const chunkSize = Math.ceil(totalBytes / concurrency);
            let downloadedBytes = 0;

            // Función que descarga un rango
            const downloadChunk = (start: number, end: number, attempt = 0): Promise<Buffer> => {
                return new Promise((resolve, reject) => {
                    const headers = { Range: `bytes=${start}-${end}` };
                    client({ ...parseUrl(url), headers }, (res) => {
                        if (res.statusCode && res.statusCode >= 400) {
                            if (attempt < maxRetries) {
                                this.emit('warn', `Reintentando chunk ${start}-${end}, intento ${attempt + 1}`);
                                resolve(downloadChunk(start, end, attempt + 1));
                                return;
                            }
                            reject(new Error(`HTTP Status ${res.statusCode}`));
                            return;
                        }

                        const buffers: Buffer[] = [];
                        res.on('data', (chunk: Buffer) => {
                            buffers.push(chunk);
                            downloadedBytes += chunk.length;
                            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
                            this.emit('percentage', percent);
                            this.emit('data', chunk);
                        });

                        res.on('end', () => resolve(Buffer.concat(buffers)));
                        res.on('error', reject);
                    }).on('error', reject);
                });
            };

            // Crear rangos
            const ranges = [];
            for (let i = 0; i < concurrency; i++) {
                const start = i * chunkSize;
                let end = (i + 1) * chunkSize - 1;
                if (end >= totalBytes) end = totalBytes - 1;
                ranges.push({ start, end });
            }

            // Ejecutar concurrencia
            const results: Buffer[] = [];
            await Promise.all(ranges.map((r, idx) => downloadChunk(r.start, r.end).then(buf => {
                results[idx] = buf;
            })));

            // Guardar archivo
            const finalStream = createWriteStream(output);
            for (const buf of results) finalStream.write(buf);
            finalStream.end();
            this.emit('done', `Descarga completa: ${output}`);
        } catch (err: any) {
            this.emit('error', err);
        }
    }

    private getContentLength(url: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const parsedUrl = parseUrl(url);
            const client = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;
            client(url, (res) => {
                const length = parseInt(res.headers['content-length'] || '0', 10);
                res.destroy();
                resolve(length);
            }).on('error', reject);
        });
    }
}

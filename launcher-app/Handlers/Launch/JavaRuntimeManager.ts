// JavaRuntimeManager.ts
import { promises as fs, createWriteStream, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';
import http from 'http';
import { FolderManager } from '../../Utils/Folder.js';
import { MemoryHistory } from './MemoryHistory.js';

export interface JavaRuntimeManifest {
    manifest: { url: string; size: number; sha1: string };
    version: { name: string; released: string };
}

export interface JavaAllJson {
    [platform: string]: {
        [runtimeType: string]: JavaRuntimeManifest[];
    };
}

export interface JavaComponent {
    component: string;
    majorVersion: number;
}

export class JavaRuntimeManager {
    private folderManager: FolderManager;
    private history: MemoryHistory;
    private allJsonUrl = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
    private cachedAllJson: JavaAllJson | null = null;
    private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

    constructor(folderManager: FolderManager, history: MemoryHistory) {
        this.folderManager = folderManager;
        this.history = history;
    }

    private getCacheDir(): string {
        const configPath = this.folderManager.getAppConfigPath();
        return join(configPath, 'launcher', 'cache');
    }

    private getAllJsonCachePath(): string {
        return join(this.getCacheDir(), 'java_runtimes.json');
    }

    private async ensureCacheDir(): Promise<void> {
        const cacheDir = this.getCacheDir();
        try {
            await fs.mkdir(cacheDir, { recursive: true });
        } catch (error) {
            this.history.error('JavaRuntimeManager', `Error al crear directorio de caché: ${error}`);
            console.error(`[ERROR] [JavaRuntimeManager] Error al crear directorio de caché: ${error}`);
            throw error;
        }
    }

    private async downloadFile(url: string, destPath: string): Promise<void> {
        await this.ensureCacheDir();
        
        return new Promise((resolve, reject) => {
            console.log(`[INFO] [JavaRuntimeManager] Descargando: ${url} → ${destPath}`);
            
            const protocol = url.startsWith('https') ? https : http;
            const file = createWriteStream(destPath);
            
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                    return;
                }
                
                let downloaded = 0;
                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                
                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalSize > 0) {
                        const percent = ((downloaded / totalSize) * 100).toFixed(1);
                        console.log(`[DEBUG] [JavaRuntimeManager] Descarga: ${percent}%`);
                    }
                });
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log(`[INFO] [JavaRuntimeManager] Archivo descargado: ${destPath} (${downloaded} bytes)`);
                    resolve();
                });
            }).on('error', async (err) => {
                console.error(`[ERROR] [JavaRuntimeManager] Error de descarga: ${err.message}`);
                await fs.unlink(destPath).catch(() => {});
                reject(err);
            });
        });
    }

    public async downloadAllJson(force: boolean = false): Promise<void> {
        const cachePath = this.getAllJsonCachePath();
        
        try {
            // Verificar si ya tenemos un archivo reciente
            if (!force && existsSync(cachePath)) {
                const stats = await fs.stat(cachePath);
                const fileAge = Date.now() - stats.mtimeMs;
                
                if (fileAge < this.CACHE_DURATION) {
                    console.log(`[INFO] [JavaRuntimeManager] Usando caché existente (edad: ${Math.round(fileAge/1000/60)} minutos)`);
                    return;
                }
                console.log(`[INFO] [JavaRuntimeManager] Caché expirado (edad: ${Math.round(fileAge/1000/60)} minutos), descargando...`);
            }
            
            console.log(`[INFO] [JavaRuntimeManager] Descargando manifest de Java desde: ${this.allJsonUrl}`);
            await this.downloadFile(this.allJsonUrl, cachePath);
            this.cachedAllJson = null;
            
            console.log(`[SUCCESS] [JavaRuntimeManager] Manifest descargado correctamente: ${cachePath}`);
        } catch (error) {
            console.error(`[ERROR] [JavaRuntimeManager] Error al descargar manifest: ${error}`);
            
            if (!existsSync(cachePath)) {
                throw error;
            }
            
            console.warn(`[WARN] [JavaRuntimeManager] Usando caché antiguo debido a error de descarga`);
        }
    }

    private async loadAllJson(): Promise<JavaAllJson> {
        if (this.cachedAllJson) {
            return this.cachedAllJson;
        }
        
        const cachePath = this.getAllJsonCachePath();
        
        try {
            if (existsSync(cachePath)) {
                console.log(`[DEBUG] [JavaRuntimeManager] Cargando manifest desde caché: ${cachePath}`);
                const content = await fs.readFile(cachePath, 'utf-8');
                this.cachedAllJson = JSON.parse(content);
                console.log(`[DEBUG] [JavaRuntimeManager] Manifest cargado, plataformas: ${Object.keys(this.cachedAllJson || "").join(', ')}`);
                return this.cachedAllJson!;
            }
        } catch (error) {
            console.warn(`[WARN] [JavaRuntimeManager] Error al cargar caché: ${error}, descargando...`);
        }

        console.log(`[INFO] [JavaRuntimeManager] No hay caché, descargando manifest...`);
        await this.downloadAllJson(true);
        
        const content = await fs.readFile(cachePath, 'utf-8');
        this.cachedAllJson = JSON.parse(content);
        return this.cachedAllJson!;
    }

    public async getAllJson(): Promise<JavaAllJson> {
        try {
            return await this.loadAllJson();
        } catch (error) {
            console.error(`[ERROR] [JavaRuntimeManager] Error al obtener JSON: ${error}`);
            return {};
        }
    }

    public getPlatformKey(): string {
        const platform = process.platform;
        const arch = process.arch;

        console.log(`[DEBUG] [JavaRuntimeManager] Detección de plataforma: ${platform}/${arch}`);

        if (platform === 'win32' && arch === 'x64') return 'windows-x64';
        if (platform === 'win32' && arch === 'ia32') return 'windows-x86';
        if (platform === 'win32' && arch === 'arm64') return 'windows-arm64';
        if (platform === 'darwin' && arch === 'arm64') return 'mac-os-arm64';
        if (platform === 'darwin') return 'mac-os';
        if (platform === 'linux' && arch === 'x64') return 'linux';
        if (platform === 'linux' && arch === 'ia32') return 'linux-i386';

        console.warn(`[WARN] [JavaRuntimeManager] Plataforma no reconocida: ${platform}/${arch}, usando windows-x64 como fallback`);
        return 'windows-x64';
    }

    public async getJavaRuntimeName(component: string): Promise<string | null> {
        try {
            const allJson = await this.getAllJson();
            const platformKey = this.getPlatformKey();
            
            console.log(`[DEBUG] [JavaRuntimeManager] Buscando runtime: ${component} para plataforma: ${platformKey}`);
            
            const platformRuntimes = allJson[platformKey];
            if (!platformRuntimes) {
                console.warn(`[WARN] [JavaRuntimeManager] No hay runtimes para la plataforma: ${platformKey}`);
                return null;
            }

            const runtimeList = platformRuntimes[component];
            if (!runtimeList || runtimeList.length === 0) {
                console.warn(`[WARN] [JavaRuntimeManager] No hay runtimes para el componente: ${component}`);
                return null;
            }

            // Tomar la última versión
            const latest = runtimeList[runtimeList.length - 1];
            const javaName = `java-${latest!.version.name}`;
            
            console.log(`[INFO] [JavaRuntimeManager] Runtime encontrado: ${javaName} (versión: ${latest!.version.name}, lanzada: ${latest!.version.released})`);
            return javaName;
        } catch (error) {
            console.error(`[ERROR] [JavaRuntimeManager] Error al buscar runtime: ${error}`);
            return null;
        }
    }

    public getJavaExecutablePath(javaName: string): string {
        const runtimeRoot = join(this.folderManager.getAppConfigPath(), 'runtime', javaName);
        const platform = process.platform;

        if (platform === 'win32') {
            return join(runtimeRoot, 'bin', 'javaw.exe');
        } else {
            return join(runtimeRoot, 'bin', 'java');
        }
    }

    public async isJavaInstalled(javaName: string): Promise<boolean> {
        try {
            const executablePath = this.getJavaExecutablePath(javaName);
            console.log(`[DEBUG] [JavaRuntimeManager] Verificando Java instalado: ${executablePath}`);
            await fs.access(executablePath);
            console.log(`[INFO] [JavaRuntimeManager] Java instalado encontrado: ${javaName}`);
            return true;
        } catch {
            console.log(`[INFO] [JavaRuntimeManager] Java no instalado: ${javaName}`);
            return false;
        }
    }

    public async getInstalledJavaRuntimes(): Promise<string[]> {
        try {
            const runtimeRoot = join(this.folderManager.getAppConfigPath(), 'runtime');
            console.log(`[DEBUG] [JavaRuntimeManager] Buscando runtimes en: ${runtimeRoot}`);
            await fs.access(runtimeRoot);
            
            const entries = await fs.readdir(runtimeRoot, { withFileTypes: true });
            const runtimes = entries
                .filter(entry => entry.isDirectory() && entry.name.startsWith('java-'))
                .map(dir => dir.name);
            
            console.log(`[INFO] [JavaRuntimeManager] Runtimes instalados encontrados: ${runtimes.length}`);
            return runtimes;
        } catch {
            console.log(`[INFO] [JavaRuntimeManager] No hay runtimes instalados`);
            return [];
        }
    }

    public async findJavaForVersion(javaComponent: JavaComponent): Promise<{
        javaPath: string;
        javaName: string;
        isInstalled: boolean;
    }> {
        const { component, majorVersion } = javaComponent;
        
        console.log(`[INFO] [JavaRuntimeManager] Buscando Java ${component} (v${majorVersion})`);
        
        try {
            await this.downloadAllJson();
        } catch (error) {
            console.warn(`[WARN] [JavaRuntimeManager] No se pudo obtener manifest: ${error}, buscando Java instalado`);
        }
        
        const javaName = await this.getJavaRuntimeName(component);
        
        if (!javaName) {
            console.warn(`[WARN] [JavaRuntimeManager] No se encontró runtime para ${component}, usando Java del sistema`);
            return {
                javaPath: 'java',
                javaName: 'system-java',
                isInstalled: false
            };
        }

        const isInstalled = await this.isJavaInstalled(javaName);
        const javaPath = isInstalled ? 
            this.getJavaExecutablePath(javaName) : 
            'java';

        console.log(`[INFO] [JavaRuntimeManager] Java encontrado: ${javaName}, instalado: ${isInstalled}, ruta: ${javaPath}`);

        return {
            javaPath,
            javaName,
            isInstalled
        };
    }

    public async clearCache(): Promise<void> {
        try {
            const cacheDir = this.getCacheDir();
            console.log(`[INFO] [JavaRuntimeManager] Limpiando caché: ${cacheDir}`);
            await fs.rm(cacheDir, { recursive: true, force: true });
            this.cachedAllJson = null;
            console.log(`[SUCCESS] [JavaRuntimeManager] Caché limpiado correctamente`);
        } catch (error) {
            console.error(`[ERROR] [JavaRuntimeManager] Error al limpiar caché: ${error}`);
        }
    }
}
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORGE_URL = "https://files.minecraftforge.net/maven/net/minecraftforge/forge/{version}/forge-{version}-installer.jar";

type DownloaderEvents = {
	'start': () => void;
	'bytes': (bytes: number) => void;
	'done': (result: DownloadResult) => void;
	'paused': () => void;
	'resumed': () => void;
	'stopped': () => void;
	'progress': (progress: ProgressInfo) => void;
	'fileStart': (file: FileInfo) => void;
	'fileComplete': (file: FileInfo) => void;
	'fileError': (error: FileError) => void;
	'error': (error: Error) => void;
	'javaCheck': (version: string) => void;
	'downloading': (url: string) => void;
	'installing': () => void;
	'cleanup': (files: string[]) => void;
	'versionResolved': (version: string) => void;
};

export interface DownloaderOptions {
	/** Versión de Forge (ej: "1.14.4-28.2.27") - si no se especifica, usa la última */
	version?: string;
	/** Ruta del ejecutable de Java */
	javaPath?: string;
	/** Directorio raíz de instalación */
	root?: string;
	/** Concurrencia (no utilizado en Forge) */
	concurrency?: number;
	/** Máximo de reintentos */
	maxRetries?: number;
	/** Instalar servidor en lugar de cliente */
	installServer?: boolean;
	/** Forzar reinstalación */
	force?: boolean;
	/** Mostrar logs detallados */
	verbose?: boolean;
	/** Ejecutar sin interfaz gráfica */
	headless?: boolean;
	/** Auto-eliminar logs */
	cleanupLogs?: boolean;
}

export interface ProgressInfo {
	downloaded: number;
	total: number;
	percentage: number;
}

export interface FileInfo {
	name: string;
	type: 'installer' | 'log' | 'config';
	size?: number;
}

interface FileError {
	name: string;
	error: string;
}

export interface DownloadResult {
	success: boolean;
	path: string;
	version: string;
	files: FileInfo[];
}

class ForgeVersionHelper {
	private static readonly PROMOTIONS_URL = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
	
	static async getLatestForgeVersion(): Promise<string> {
		try {
			const response = await fetch(this.PROMOTIONS_URL);
			if (!response.ok) {
				throw new Error(`Error HTTP ${response.status}`);
			}
			
			const data = await response.json();
			
			let latestMinecraftVersion = '';
			let latestForgeVersion = '';
			
			for (const [key, forgeVersion] of Object.entries(data.promos)) {
				if (key.includes('-latest')) {
					const minecraftVersion = key.replace('-latest', '');
					
					if (this.isVersionNewer(minecraftVersion, latestMinecraftVersion)) {
						latestMinecraftVersion = minecraftVersion;
						latestForgeVersion = forgeVersion as string;
					}
				}
			}
			
			if (!latestMinecraftVersion || !latestForgeVersion) {
				throw new Error('No se encontró ninguna versión latest');
			}
			
			return `${latestMinecraftVersion}-${latestForgeVersion}`;
			
		} catch (error) {
			throw new Error(`Error al obtener la última versión: ${error instanceof Error ? error.message : 'Error desconocido'}`);
		}
	}
	
	private static isVersionNewer(version1: string, version2: string): boolean {
		if (!version2) return true;
		
		const v1Parts = version1.split('.').map(Number);
		const v2Parts = version2.split('.').map(Number);
		
		for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
			const v1 = v1Parts[i] || 0;
			const v2 = v2Parts[i] || 0;
			
			if (v1 > v2) return true;
			if (v1 < v2) return false;
		}
		
		return false;
	}
	
	static async getRecommendedForgeVersion(): Promise<string> {
		try {
			const response = await fetch(this.PROMOTIONS_URL);
			if (!response.ok) {
				throw new Error(`Error HTTP ${response.status}`);
			}
			
			const data = await response.json();
			
			let latestMinecraftVersion = '';
			let recommendedForgeVersion = '';
			
			for (const [key, forgeVersion] of Object.entries(data.promos)) {
				if (key.includes('-recommended')) {
					const minecraftVersion = key.replace('-recommended', '');
					
					if (this.isVersionNewer(minecraftVersion, latestMinecraftVersion)) {
						latestMinecraftVersion = minecraftVersion;
						recommendedForgeVersion = forgeVersion as string;
					}
				}
			}
			
			if (!latestMinecraftVersion || !recommendedForgeVersion) {
				return this.getLatestForgeVersion();
			}
			
			return `${latestMinecraftVersion}-${recommendedForgeVersion}`;
			
		} catch (error) {
			throw new Error(`Error al obtener versión recomendada: ${error instanceof Error ? error.message : 'Error desconocido'}`);
		}
	}
}

class ForgeDownloader extends EventEmitter {
	private options: Required<DownloaderOptions>;
	private isPaused = false;
	private isStopped = false;
	private currentProcess: any = null;
	private downloadedBytes = 0;
	private totalBytes = 0;
	
	constructor(options: DownloaderOptions = {}) {
		super();
		
		this.options = {
			version: '',
			javaPath: 'java',
			root: '.minecraft',
			concurrency: 1,
			maxRetries: 3,
			installServer: false,
			force: false,
			verbose: true,
			headless: true,
			cleanupLogs: true,
			...options
		};
	}
	
	async start(): Promise<DownloadResult> {
		this.isPaused = false;
		this.isStopped = false;
		this.emit('start');
		
		try {
			const result = await this.downloadAndInstall();
			this.emit('done', result);
			return result;
		} catch (error: any) {
			this.emit('error', error);
			throw error;
		}
	}
	
	pause(): void {
		this.isPaused = true;
		this.emit('paused');
	}
	
	resume(): void {
		this.isPaused = false;
		this.emit('resumed');
	}
	
	stop(): void {
		this.isStopped = true;
		if (this.currentProcess) {
			this.currentProcess.kill();
			this.currentProcess = null;
		}
		this.emit('stopped');
	}
	
	private async downloadAndInstall(): Promise<DownloadResult> {
		const files: FileInfo[] = [];
		
		await this.checkJava();
		
		let versionToUse = this.options.version;
		if (!versionToUse) {
			versionToUse = await ForgeVersionHelper.getRecommendedForgeVersion();
		}
		
		this.emit('versionResolved', versionToUse);
		console.log(`🎯 Usando versión: ${versionToUse}`);
		
		const installerUrl = FORGE_URL.replace(/{version}/g, versionToUse);
		this.emit('downloading', installerUrl);
		
		await this.createDirectories();
		
		const installerFile: FileInfo = {
			name: `forge-${versionToUse}-installer.jar`,
			type: 'installer'
		};
		
		this.emit('fileStart', installerFile);
		const installerPath = await this.downloadInstaller(installerUrl, versionToUse);
		files.push(installerFile);
		this.emit('fileComplete', installerFile);
		
		this.emit('installing');
		await this.runInstaller(installerPath);
		
		await this.cleanup(installerPath, files);
		
		await this.verifyInstallation(versionToUse);
		
		return {
			success: true,
			path: this.options.root,
			version: versionToUse,
			files
		};
	}
	
	private async checkJava(): Promise<void> {
		return new Promise((resolve, reject) => {
			exec(`"${this.options.javaPath}" -version`, (error, stdout, stderr) => {
				if (error) {
					reject(new Error(`Java no encontrado en: ${this.options.javaPath}`));
				} else {
					const versionOutput = stderr || stdout;
					const versionLine = versionOutput.split('\n')[0] || "";
					this.emit('javaCheck', versionLine);
					resolve();
				}
			});
		});
	}
	
	private async createDirectories(): Promise<void> {
		const dirs = ['logs', 'versions', 'libraries', 'temp'];
		
		for (const dir of dirs) {
			const dirPath = path.join(this.options.root, dir);
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
		}
	}
	
	private async downloadInstaller(url: string, version: string): Promise<string> {
		const outputPath = path.join(__dirname, `forge-${version}-installer.jar`);
		
		if (fs.existsSync(outputPath) && !this.options.force) {
			const stats = fs.statSync(outputPath);
			this.totalBytes = stats.size;
			this.downloadedBytes = stats.size;
			this.emitProgress();
			return outputPath;
		}
		
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Error HTTP ${response.status}: No se pudo descargar Forge`);
		}
		
		this.totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
		this.downloadedBytes = 0;
		
		return new Promise((resolve, reject) => {
			const fileStream = fs.createWriteStream(outputPath);
			const reader = response.body!.getReader();
			
			const readChunk = async () => {
				if (this.isStopped) {
					fileStream.close();
					reject(new Error('Descarga detenida'));
					return;
				}
				
				while (this.isPaused && !this.isStopped) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				
				try {
					const { done, value } = await reader.read();
					
					if (done) {
						fileStream.end();
						resolve(outputPath);
						return;
					}
					
					fileStream.write(value);
					this.downloadedBytes += value.length;
					
					this.emit('bytes', value.length);
					this.emitProgress();
					
					readChunk();
				} catch (error) {
					reject(error);
				}
			};
			
			readChunk();
		});
	}
	
	private emitProgress(): void {
		const progress: ProgressInfo = {
			downloaded: this.downloadedBytes,
			total: this.totalBytes,
			percentage: this.totalBytes > 0 ? (this.downloadedBytes / this.totalBytes) * 100 : 0
		};
		this.emit('progress', progress);
	}
	
	private async runInstaller(installerPath: string): Promise<void> {
		const installType = this.options.installServer ? '--installServer' : '--installClient';
		const command = `"${this.options.javaPath}" -jar "${installerPath}" ${installType} "${path.resolve(this.options.root)}"`;
		
		if (this.options.verbose) {
			console.log(`Ejecutando: ${command}`);
		}
		
		return new Promise((resolve, reject) => {
			const childProcess = exec(command, { 
				maxBuffer: 1024 * 1024 * 50,
				cwd: this.options.root
			});
			
			this.currentProcess = childProcess;
			
			childProcess.on('exit', (code) => {
				this.currentProcess = null;
				if (code === 0 || code === null) {
					resolve();
				} else {
					reject(new Error(`Instalador falló con código: ${code}`));
				}
			});
			
			childProcess.on('error', (error) => {
				this.currentProcess = null;
				reject(error);
			});
			
			if (this.options.verbose) {
				childProcess.stdout?.on('data', (data) => {
					console.log(data.toString());
				});
				childProcess.stderr?.on('data', (data) => {
					console.error(data.toString());
				});
			}
		});
	}
	
	private async cleanup(installerPath: string, files: FileInfo[]): Promise<void> {
		if (fs.existsSync(installerPath)) {
			fs.unlinkSync(installerPath);
		}
		
		if (this.options.cleanupLogs) {
			await this.cleanupLogs(files);
		}
	}
	
	private async cleanupLogs(files: FileInfo[]): Promise<void> {
		const logDir = path.join(this.options.root, 'logs');
		if (fs.existsSync(logDir)) {
			const logFiles = fs.readdirSync(logDir)
			.filter(file => file.endsWith('.log'))
			.map(file => ({
				name: file,
				type: 'log' as const
			}));
			
			logFiles.forEach(file => {
				try {
					fs.unlinkSync(path.join(logDir, file.name));
					files.push(file);
				} catch (error) {
					// Ignorar errores de archivos en uso
				}
			});
			
			this.emit('cleanup', logFiles.map(f => f.name));
		}
	}
	
	private async verifyInstallation(version: string): Promise<void> {
		const minecraftVersion = version.split('-')[0];
		const requiredFiles = [
			'versions',
			'libraries',
			path.join('versions', `forge-${minecraftVersion}`)
		];
		
		for (const file of requiredFiles) {
			const filePath = path.join(this.options.root, file);
			if (!fs.existsSync(filePath)) {
				throw new Error(`Archivo/directorio faltante: ${file}`);
			}
		}
	}
	
	override on<K extends keyof DownloaderEvents>(
		event: K, 
		listener: DownloaderEvents[K]
	): this {
		return super.on(event, listener);
	}
	
	override emit<K extends keyof DownloaderEvents>(
		event: K, 
		...args: Parameters<DownloaderEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}
}

export {
	ForgeDownloader,
	ForgeVersionHelper,
};
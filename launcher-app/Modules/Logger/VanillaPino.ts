import { createWriteStream, WriteStream, promises as fs } from 'fs';
import type {LogLevel,LogEntry,VanillaPinoOptions,DestinationOptions} from '../../Types/Logger/Logger.js';
import { dirname, join } from 'path';
import { EventEmitter } from 'events';
import { hostname } from 'os';

const LEVELS: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
};

const COLORS: Record<LogLevel, string> = {
	trace: '\x1b[90m', // gris
	debug: '\x1b[36m', // cyan
	info: '\x1b[32m',  // verde
	warn: '\x1b[33m',  // amarillo
	error: '\x1b[31m', // rojo
	fatal: '\x1b[41m\x1b[37m', // fondo rojo
};

const RESET = '\x1b[0m';

function formatTime(): string {
	return new Date().toISOString();
}

function formatPrettyTime(): string {
	const now = new Date();
	return now.toLocaleTimeString('es-AR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

function prettyPrint(obj: any, indent = 2, depth = 0, maxDepth = 4 ): string {
	const pad = ' '.repeat(indent * depth);
	
	if (obj === null) return 'null';
	if (obj === undefined) return 'undefined';
	
	const t = typeof obj;
	
	if (t === 'string' || t === 'number' || t === 'boolean') {
		return String(obj);
	}
	
	if (obj instanceof Error) {
		return `Error: ${obj.message}`;
	}
	
	if (depth >= maxDepth) {
		return '[Object]';
	}
	
	if (Array.isArray(obj)) {
		return `Array(${obj.length})`;
	}
	
	if (t === 'object') {
		let out = '';
		for (const [key, value] of Object.entries(obj)) {
			out += `\n${pad}${key}: ${prettyPrint(
				value,
				indent,
				depth + 1,
				maxDepth
			)}`;
		}
		return out || '{}';
	}
	
	return String(obj);
}

async function ensureDir(dirPath: string): Promise<void> {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch (err) {
		// Ignorar si ya existe
	}
}

class Destination {
	private stream: WriteStream | null = null;
	private filePath: string;
	
	constructor(options: DestinationOptions) {
		this.filePath = options.dest;
		
		if (options.mkdir) {
			ensureDir(dirname(this.filePath)).then(() => {
				this.createStream();
			});
		} else {
			this.createStream();
		}
	}
	
	private createStream(): void {
		this.stream = createWriteStream(this.filePath, {
			flags: 'a',
			encoding: 'utf8'
		});
		
		this.stream.on('error', (err) => {
			console.error('[VanillaPino] Stream error:', err);
		});
	}
	
	write(data: string): boolean {
		if (!this.stream) return false;
		return this.stream.write(data);
	}
	
	end(): void {
		if (this.stream) {
			this.stream.end();
			this.stream = null;
		}
	}
}

export class VanillaPino extends EventEmitter {
	private levelNumber: number;
	private levelName: LogLevel;
	private destination: Destination | null = null;
	private options: Required<VanillaPinoOptions>;
	
	private buffer: string[] = [];
	private flushTimer: NodeJS.Timeout | null = null;
	
	private memoryHistory: string[] = [];
	
	// Stats
	private currentFileSize = 0;
	private rotationInProgress = false;
	
	constructor(options: VanillaPinoOptions = {}) {
		super();
		
		this.setMaxListeners(0);
		this.on('error', () => {});
		
		this.options = {
			level: options.level || 'info',
			filePath: options.filePath || join(process.cwd(), 'logs', 'app.log'),
			maxFileSize: options.maxFileSize || 10,
			maxFiles: options.maxFiles || 5,
			maxAgeDays: options.maxAgeDays || 30,
			prettyPrint: options.prettyPrint !== false,
			colors: options.colors !== false,
			bufferSize: options.bufferSize || 100,
			flushInterval: options.flushInterval || 1000,
			maxMemoryLogs: options.maxMemoryLogs || 500,
		};
		
		this.levelNumber = LEVELS[this.options.level];
		this.levelName = this.options.level;
		
		this.initialize();
	}
	
	private async initialize(): Promise<void> {
		try {
			await ensureDir(dirname(this.options.filePath));
			await fs.writeFile(this.options.filePath, '', 'utf-8');
			this.destination = new Destination({
				dest: this.options.filePath,
				sync: false,
				mkdir: true
			});
			
			this.startAutoFlush();
			this.startAutoCleanup();
			await this.checkCurrentFileSize();
			
		} catch (error) {
			console.error('[VanillaPino] Initialization error:', error);
		}
	}
	
	private async checkCurrentFileSize(): Promise<void> {
		try {
			const stats = await fs.stat(this.options.filePath);
			this.currentFileSize = stats.size;
			
			if (this.currentFileSize > this.options.maxFileSize * 1024 * 1024) {
				await this.rotate();
			}
		} catch (err) {
			this.currentFileSize = 0;
		}
	}
	
	private createEntry(level: LogLevel, msg: string, args: unknown[]): LogEntry {
		const entry: LogEntry = {
			time: formatTime(),
			level: level.toUpperCase(),
			msg,
			pid: process.pid,
			hostname: hostname(),
		};
		
		args.forEach((arg, index) => {
			if (typeof arg === 'object' && arg !== null) {
				Object.assign(entry, arg);
			} else if (arg !== undefined) {
				entry[`arg${index}`] = arg;
			}
		});
		
		return entry;
	}
	
	private writeToConsole(entry: LogEntry): void {
		if (!this.options.prettyPrint) return;
		
		const color = this.options.colors ? COLORS[this.levelName] : '';
		const reset = this.options.colors ? RESET : '';
		const time = formatPrettyTime();
		let output = `${color}[${time}] ${entry.level}: ${entry.msg}${reset}`;
		const extras: Record<string, any> = {};
		const baseKeys = ['time', 'level', 'msg', 'pid', 'hostname'];
		
		for (const key in entry) {
			if (!baseKeys.includes(key)) {
				extras[key] = entry[key];
			}
		}
		
		if (Object.keys(extras).length > 0) {
			output += '\n' + prettyPrint(extras);
		}
		console.log(output);
	}
	
	private writeToFile(entry: LogEntry): void {
		const json = JSON.stringify(entry) + '\n';
		this.buffer.push(json);
		this.currentFileSize += Buffer.byteLength(json);
		this.memoryHistory.push(json);
		if (this.memoryHistory.length > this.options.maxMemoryLogs) { this.memoryHistory.shift(); }
		if (this.buffer.length >= this.options.bufferSize) { this.flush(); }
		if (this.currentFileSize > this.options.maxFileSize * 1024 * 1024) { this.rotate(); }
	}
	
	private internalLog(level: LogLevel, msg: string, ...args: unknown[]): void {
		const levelNum = LEVELS[level];
		if (levelNum < this.levelNumber) return;
		try {
			const entry = this.createEntry(level, msg, args);
			
			this.writeToConsole(entry);
			this.writeToFile(entry);
			this.emit('log', entry);
			if (this.listenerCount(level) > 0) {
				this.emit(level, entry);
			}
			
		} catch (error) {
			console.error('[VanillaPino] Logging error:', error);
		}
	}
	
	private flush(): void {
		if (this.buffer.length === 0) return;
		if (!this.destination) return;
		
		const data = this.buffer.join('');
		this.buffer = [];
		
		this.destination.write(data);
	}
	
	private startAutoFlush(): void {
		this.flushTimer = setInterval(() => {
			this.flush();
		}, this.options.flushInterval);
	}
	
	private async rotate(): Promise<void> {
		if (this.rotationInProgress) return;
		
		this.rotationInProgress = true;
		
		try {
			this.flush();
			if (this.destination) {
				this.destination.end();
				this.destination = null;
			}
			await new Promise(resolve => setTimeout(resolve, 100));
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const base = this.options.filePath.replace(/\.log$/, '');
			const rotatedPath = `${base}-${timestamp}.log`;
			
			try {
				await fs.rename(this.options.filePath, rotatedPath);
			} catch (err) {
				// Archivo no existe o ya fue rotado
			}
			this.destination = new Destination({
				dest: this.options.filePath,
				sync: false,
				mkdir: true
			});
			
			this.currentFileSize = 0;
			await this.cleanupOldLogs();
			
		} catch (error) {
			console.error('[VanillaPino] Rotation error:', error);
		} finally {
			this.rotationInProgress = false;
		}
	}
	private async cleanupOldLogs(): Promise<void> {
		try {
			const dir = dirname(this.options.filePath);
			const files = await fs.readdir(dir);
			const base = this.options.filePath.replace(/\.log$/, '').split('/').pop() || 'app';
			
			const cutoff = Date.now() - (this.options.maxAgeDays * 24 * 60 * 60 * 1000);
			
			for (const file of files) {
				if (file.startsWith(base) && file.endsWith('.log') && file !== `${base}.log`) {
					const filePath = join(dir, file);
					try {
						const stats = await fs.stat(filePath);
						if (stats.mtimeMs < cutoff) {
							await fs.unlink(filePath);
						}
					} catch (err) {
						// Ignorar errores
					}
				}
			}
			const logFiles = files
			.filter(f => f.startsWith(base) && f.endsWith('.log') && f !== `${base}.log`)
			.sort()
			.reverse();
			
			if (logFiles.length > this.options.maxFiles) {
				for (const file of logFiles.slice(this.options.maxFiles)) {
					try {
						await fs.unlink(join(dir, file));
					} catch (err) {
						// Ignorar
					}
				}
			}
			
		} catch (error) {
			// Ignorar errores en cleanup
		}
	}
	
	private startAutoCleanup(): void {
		setInterval(() => {
			this.cleanupOldLogs();
		}, 24 * 60 * 60 * 1000);
	}
	
	trace(msg: string, ...args: unknown[]): void {
		this.internalLog('trace', msg, ...args);
	}
	
	debug(msg: string, ...args: unknown[]): void {
		this.internalLog('debug', msg, ...args);
	}
	
	info(msg: string, ...args: unknown[]): void {
		this.internalLog('info', msg, ...args);
	}
	
	warn(msg: string, ...args: unknown[]): void {
		this.internalLog('warn', msg, ...args);
	}
	
	error(msg: string, ...args: unknown[]): void {
		this.internalLog('error', msg, ...args);
	}
	
	fatal(msg: string, ...args: unknown[]): void {
		this.internalLog('fatal', msg, ...args);
	}
	
	log(msg: string, ...args: unknown[]): void {
		this.info(msg, ...args);
	}
	
	getLogLevel(): string {
		return this.levelName;
	}
	
	setLogLevel(newLevel: string): void {
		const lvl = newLevel as LogLevel;
		if (LEVELS[lvl] !== undefined) {
			this.levelName = lvl;
			this.levelNumber = LEVELS[lvl];
		}
	}
	
	setLevel(lvl: LogLevel): void {
		this.levelName = lvl;
		this.levelNumber = LEVELS[lvl];
	}
	
	getLevel(): LogLevel {
		return this.levelName;
	}
	
	getMemoryHistory(): string[] {
		return [...this.memoryHistory];
	}
	
	clearMemoryHistory(): void {
		this.memoryHistory = [];
	}
	
	async readLogs(): Promise<string> {
		try {
			return await fs.readFile(this.options.filePath, 'utf-8');
		} catch (error) {
			throw new Error(`Error leyendo logs: ${error}`);
		}
	}
	
	async clearLogs(): Promise<void> {
		try {
			this.flush();
			await fs.writeFile(this.options.filePath, '', 'utf-8');
			this.currentFileSize = 0;
			this.info('Logs limpiados manualmente');
		} catch (error) {
			throw new Error(`Error limpiando logs: ${error}`);
		}
	}
	
	getLogPath(): string {
		return this.options.filePath;
	}
	
	async destroy(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		
		this.flush();
		
		if (this.destination) {
			this.destination.end();
			this.destination = null;
		}
	}
}

export function destination(options: DestinationOptions): Destination {
	return new Destination(options);
}

export function createLogger(options?: VanillaPinoOptions): VanillaPino {
	return new VanillaPino(options);
}

export default VanillaPino;
import { join, resolve } from 'path';
import { VanillaPino } from './VanillaPino.js';
import type { ElectronPinoOptions } from './Interfaces.js';
import { LogUtils } from './Utils.js';

export class ElectronPino {
    private logger: VanillaPino;
    private options: Required<ElectronPinoOptions>;
    private logFilePath: string;

    constructor(options: ElectronPinoOptions = {}) {
        this.options = {
            logPath: options.logPath || resolve('Temp'),
            logFileName: options.logFileName || 'app.log', // Cambiar a .log
            level: options.level || 'info',
            maxLogDays: options.maxLogDays || 5,
            maxFileSize: options.maxFileSize || 10,
            prettyPrint: options.prettyPrint !== false,
            colors: options.colors !== false,
        };

        this.logFilePath = join(this.options.logPath, this.options.logFileName);
        
        // Crear logger con VanillaPino
        this.logger = new VanillaPino({
            level: this.options.level,
            filePath: this.logFilePath,
            maxFileSize: this.options.maxFileSize,
            maxFiles: 5,
            maxAgeDays: this.options.maxLogDays,
            prettyPrint: this.options.prettyPrint,
            colors: this.options.colors,
            bufferSize: 100,       // Flush cada 100 logs
            flushInterval: 1000,   // O cada 1 segundo
            maxMemoryLogs: 500     // Mantener 500 logs en memoria
        });

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // LogUtils puede seguir siendo usado para tareas adicionales
            await LogUtils.ensureLogDirectory(this.options.logPath);
            await LogUtils.cleanupOldLogs(this.options.logPath, this.options.maxLogDays);

            // Auto-cleanup cada 24 horas (adicional al de VanillaPino)
            setInterval(() => {
                LogUtils.cleanupOldLogs(this.options.logPath, this.options.maxLogDays);
            }, 24 * 60 * 60 * 1000);

        } catch (error) {
            console.error('Error inicializando ElectronPino:', error);
        }
    }

    // ============================================
    // LOGGING METHODS
    // ============================================

    public trace(message: string, ...args: unknown[]): void {
        this.logger.trace(message, ...args);
    }

    public debug(message: string, ...args: unknown[]): void {
        this.logger.debug(message, ...args);
    }

    public info(message: string, ...args: unknown[]): void {
        this.logger.info(message, ...args);
    }

    public warn(message: string, ...args: unknown[]): void {
        this.logger.warn(message, ...args);
    }

    public error(message: string, ...args: unknown[]): void {
        this.logger.error(message, ...args);
    }

    public fatal(message: string, ...args: unknown[]): void {
        this.logger.fatal(message, ...args);
    }

    public log(message: string, ...args: unknown[]): void {
        this.logger.info(message, ...args);
    }

    // ============================================
    // MEMORY HISTORY (Para consola integrada)
    // ============================================

    public getMemoryHistory(): string[] {
        return this.logger.getMemoryHistory();
    }

    public clearMemoryHistory(): void {
        this.logger.clearMemoryHistory();
    }

    // ============================================
    // FILE OPERATIONS
    // ============================================

    public getLogPath(): string {
        return this.logFilePath;
    }

    public async readLogs(): Promise<string> {
        return await this.logger.readLogs();
    }

    public async clearLogs(): Promise<void> {
        return await this.logger.clearLogs();
    }

    // ============================================
    // LEVEL MANAGEMENT
    // ============================================

    public setLevel(level: ElectronPinoOptions['level']): void {
        if (level) {
            this.logger.setLevel(level);
        }
    }

    public getLevel(): string {
        return this.logger.getLevel();
    }

    // ============================================
    // CLEANUP
    // ============================================

    public async destroy(): Promise<void> {
        await this.logger.destroy();
    }
}

// Singleton instance
export const electronPino = new ElectronPino();
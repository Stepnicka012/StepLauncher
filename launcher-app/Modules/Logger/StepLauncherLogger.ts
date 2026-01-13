import { join, resolve } from 'node:path';
import { app } from 'electron';
import { VanillaPino } from './VanillaPino.js';
import type { ElectronPinoOptions } from '../../Types/Logger/Logger.js';
import { LogUtils } from './Utils.js';

export class StepLauncherLogger {
    private logger: VanillaPino;
    private options: Required<ElectronPinoOptions>;
    private logFilePath: string;

    constructor(options: ElectronPinoOptions = {}) {
        const baseLogPath = options.logPath
            ? resolve(options.logPath)
          : join(app.getPath('userData'), 'Logs');

        this.options = {
            logPath: baseLogPath,
            logFileName: options.logFileName || "main.json",
            level: options.level || 'info',
            maxLogDays: options.maxLogDays || 5,
            maxFileSize: options.maxFileSize || 10,
            prettyPrint: options.prettyPrint !== false,
            colors: options.colors !== false,
        };

        this.logFilePath = join(this.options.logPath, this.options.logFileName);

        this.logger = new VanillaPino({
            level: this.options.level,
            filePath: this.logFilePath,
            maxFileSize: this.options.maxFileSize,
            maxFiles: 5,
            maxAgeDays: this.options.maxLogDays,
            prettyPrint: this.options.prettyPrint,
            colors: this.options.colors,
            bufferSize: 100,
            flushInterval: 1000,
            maxMemoryLogs: 125
        });

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            await LogUtils.ensureLogDirectory(this.options.logPath);
        
            setInterval(() => {
                LogUtils.cleanupOldLogs(this.options.logPath, this.options.maxLogDays).catch(() => {});
            }, 24 * 60 * 60 * 1000);

        } catch (error) {
            console.error('Error inicializando StepLauncherLogger:', error);
        }
    }

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

    public async getMemoryHistory(): Promise<string[]> {
        const mem = await Promise.resolve((this.logger as any).getMemoryHistory?.() ?? []);
        return Array.isArray(mem) ? [...mem] : [];
    }

    public clearMemoryHistory(): void {
        this.logger.clearMemoryHistory();
    }

    public getLogPath(): string {
        return this.logFilePath;
    }

    public async readLogs(): Promise<string> {
        return await this.logger.readLogs();
    }

    public async clearLogs(): Promise<void> {
        return await this.logger.clearLogs();
    }

    public setLevel(level: ElectronPinoOptions['level']): void {
        if (level) {
            this.logger.setLevel(level);
        }
    }

    public getLevel(): string {
        return this.logger.getLevel();
    }

    public async destroy(): Promise<void> {
        await this.logger.destroy();
    }
}
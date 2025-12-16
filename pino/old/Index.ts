import pino, { type Level } from 'pino';
import { join, resolve } from 'path';
import { promises as fs } from 'fs';
import { AppConfigManager } from '../App/Folder.js';
import type { ElectronPinoOptions } from './Interfaces.js';
import { LogUtils } from './Utils.js';

const Folder = new AppConfigManager();
const FolderPath = Folder.getAppConfigPath();

export class ElectronPino {
    private logger: pino.Logger;
    private options: Required<ElectronPinoOptions>;
    private logFilePath: string;

    private memoryHistory: string[] = [];
    private maxMemoryRecords = 500;

    constructor(options: ElectronPinoOptions = {}) {
        this.options = {
            logPath: options.logPath || resolve(FolderPath, 'Temp'),
            logFileName: options.logFileName || 'app.json',
            level: options.level || 'info',
            maxLogDays: options.maxLogDays || 5,
            maxFileSize: options.maxFileSize || 10,
            prettyPrint: options.prettyPrint !== false,
            colors: options.colors !== false,
        };

        this.logFilePath = join(this.options.logPath, this.options.logFileName);
        this.logger = this.createLogger();
        this.initialize();
    }

    private pushToHistory(level: string, message: string, details?: any) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            details
        };

        this.memoryHistory.push(JSON.stringify(entry));

        if (this.memoryHistory.length > this.maxMemoryRecords) { this.memoryHistory.shift(); }
    }

    public getMemoryHistory(): string[] { return [...this.memoryHistory]; }

    public clearMemoryHistory(): void { this.memoryHistory = []; }

    private createLogger(): pino.Logger {
        const streams: pino.StreamEntry[] = [];

        streams.push({
            level: this.options.level as Level,
            stream: pino.destination({
                dest: this.logFilePath,
                sync: false,
                mkdir: true
            })
        });

        if (this.options.prettyPrint) {
            streams.push({
                level: this.options.level as Level,
                stream: pino.transport({
                    target: 'pino-pretty',
                    options: {
                        colorize: this.options.colors,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                        messageFormat: '{msg}',
                        levelFirst: false
                    }
                })
            });
        }

        return pino(
            {
                level: this.options.level,
                timestamp: pino.stdTimeFunctions.isoTime,
                formatters: { level: (label) => { return { level: label.toUpperCase() }; } }
            },
            pino.multistream(streams)
        );
    }

    private async initialize(): Promise<void> {
        try {
            await LogUtils.ensureLogDirectory(this.options.logPath);
            await LogUtils.cleanupOldLogs(this.options.logPath, this.options.maxLogDays);
            await LogUtils.rotateLogIfNeeded(
                this.options.logPath,
                this.options.logFileName,
                this.options.maxFileSize
            );

            setInterval(() => {
                LogUtils.cleanupOldLogs(this.options.logPath, this.options.maxLogDays);
            }, 24 * 60 * 60 * 1000);

        } catch (error) {
            console.error('Error inicializando ElectronPino:', error);
        }
    }

    private formatArgs(args: unknown[]): any {
        if (!args || args.length === 0) return null;
        if (args.length === 1 && typeof args[0] === "object") {
            return args[0];
        }
        return args.map(a => {
            if (typeof a === "object") return a;
            return String(a);
        });
    }

    private color(level: string, msg: string): string {
        const colors: Record<string, string> = {
            TRACE: '\x1b[37m',
            DEBUG: '\x1b[36m',
            INFO:  '\x1b[32m',
            WARN:  '\x1b[33m',
            ERROR: '\x1b[31m',
            FATAL: '\x1b[41m',
        };

        const reset = '\x1b[0m';
        const color = colors[level] ?? '\x1b[0m';

        return `${color}${msg}${reset}`;
    }

    public trace(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("TRACE", message);

        formatted
            ? this.logger.trace({ details: formatted }, msg)
            : this.logger.trace(msg);

        this.pushToHistory("TRACE", message, formatted);
    }

    public debug(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("DEBUG", message);

        formatted
            ? this.logger.debug({ details: formatted }, msg)
            : this.logger.debug(msg);

        this.pushToHistory("DEBUG", message, formatted);
    }

    public info(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("INFO", message);

        formatted
            ? this.logger.info({ details: formatted }, msg)
            : this.logger.info(msg);

        this.pushToHistory("INFO", message, formatted);
    }

    public warn(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("WARN", message);

        formatted
            ? this.logger.warn({ details: formatted }, msg)
            : this.logger.warn(msg);

        this.pushToHistory("WARN", message, formatted);
    }

    public error(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("ERROR", message);

        formatted
            ? this.logger.error({ details: formatted }, msg)
            : this.logger.error(msg);

        this.pushToHistory("ERROR", message, formatted);
    }

    public fatal(message: string, ...args: unknown[]): void {
        const formatted = this.formatArgs(args);
        const msg = this.color("FATAL", message);

        formatted
            ? this.logger.fatal({ details: formatted }, msg)
            : this.logger.fatal(msg);

        this.pushToHistory("FATAL", message, formatted);
    }

    public log(message: string, ...args: unknown[]): void {
        this.info(message, ...args);
    }

    public getLogPath(): string {
        return this.logFilePath;
    }

    public async readLogs(): Promise<string> {
        try {
            return await fs.readFile(this.logFilePath, 'utf-8');
        } catch (error) {
            throw new Error(`Error leyendo logs: ${error}`);
        }
    }

    public async clearLogs(): Promise<void> {
        try {
            await fs.writeFile(this.logFilePath, '', 'utf-8');
            this.info('Logs limpiados manualmente');
        } catch (error) {
            throw new Error(`Error limpiando logs: ${error}`);
        }
    }

    public setLevel(level: ElectronPinoOptions['level']): void {
        if (level) { this.logger.level = level; }
    }

    public getLevel(): string { return this.logger.level; }
}

export const electronPino = new ElectronPino();

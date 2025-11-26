import fs from "fs";
import path from "path";
import pino, { type LoggerOptions } from "pino";
import type { LogMode, LogContext } from "./Types.js";
import { Configuration } from "../Core/Configuration.js";

function createLogFile(root: string, mode: LogMode) {
    const date = new Date();
    const logDir = path.join(root, "Temp");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const timeStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}-${String(date.getSeconds()).padStart(2, "0")}`;

    let modeSuffix = "";
    if (mode === "preload") modeSuffix = "-Preload";
    else if (mode === "strict") modeSuffix = "-Strict";

    return path.join(logDir, `StepLauncher${modeSuffix}-${timeStamp}.log`);
}

const colors = {
    error: "\x1b[31m",
    warn: "\x1b[33m",
    info: "\x1b[36m",
    success: "\x1b[32m",
    critical: "\x1b[41m\x1b[37m",
    debug: "\x1b[35m",
    reset: "\x1b[0m",
};

export class ElectronPino {
    private logger: pino.Logger;
    private logFile: string;
    private mode: LogMode;
    private consoleEnabled: boolean;
    private logStream: fs.WriteStream;

    constructor(root: string, mode: LogMode = "normal", consoleEnabled: boolean = false) {
        this.mode = mode;
        this.consoleEnabled = consoleEnabled;

        const config = new Configuration();
        if (config.getPath<boolean>("Launcher.AutoCleanLogs", false)) {
            this.cleanLogs(root);
        }

        this.logFile = createLogFile(root, mode);
        
        // Crear stream con encoding UTF-8
        this.logStream = fs.createWriteStream(this.logFile, { 
            encoding: 'utf8',
            flags: 'a'
        });

        // Escribir BOM UTF-8 al inicio del archivo para mejor compatibilidad
        this.logStream.write('\uFEFF');

        const baseConfig: LoggerOptions = {
            level: mode === "strict" ? "trace" : "info",
            timestamp: pino.stdTimeFunctions.isoTime,
            base: null,
        };

        this.logger = pino(baseConfig, pino.destination(this.logFile));
        
        // Escribir header informativo al inicio del log
        this.writeHumanReadableHeader();
    }

    private cleanLogs(root: string) {
        const logDir = path.join(root, "Temp");
        if (!fs.existsSync(logDir)) return;

        try {
            const files = fs.readdirSync(logDir);
            for (const file of files) {
                const filePath = path.join(logDir, file);
                fs.unlinkSync(filePath);
            }
            console.log("\x1b[32m[ElectronPino] Logs antiguos eliminados\x1b[0m");
        } catch (err) {
            console.log("\x1b[31m[ElectronPino] Error limpiando logs:\x1b[0m", (err as Error).message);
        }
    }

    private writeHumanReadableHeader() {
        const header = `
                        ╔════════════════════════════════════════════════════════════════╗
                        ║                     STEP LAUNCHER LOG FILE                     ║
                        ║                    Archivo de Registro del Sistema             ║
                        ╠════════════════════════════════════════════════════════════════╣
                        ║ Fecha de Creación: ${new Date().toLocaleString('es-ES')}       ║
                        ║ Modo: ${this.mode.toUpperCase().padEnd(47)}                    ║
                        ║ Encoding: UTF-8${' '.padEnd(43)}                               ║
                        ╚════════════════════════════════════════════════════════════════╝
                        `;
        this.logStream.write(header);
    }

    private colorizeMessage(type: keyof typeof colors, message: string) {
        const color = colors[type] || "";
        return `${color}${message}${colors.reset}`;
    }

    private formatContext(context?: LogContext): string {
        if (!context) return "";
        const parts = [];
        if (context.module) parts.push(`Módulo: ${context.module}`);
        if (context.function) parts.push(`Función: ${context.function}`);
        if (context.additionalInfo) parts.push(`Info: ${context.additionalInfo}`);
        return parts.length ? ` (${parts.join(" | ")})` : "";
    }

    private formatHumanReadable(type: string, message: string, context?: LogContext, timestamp?: string): string {
        const time = timestamp ? new Date(timestamp).toLocaleString('es-ES') : new Date().toLocaleString('es-ES');
        const ctx = this.formatContext(context);
        
        // Iconos para mejor legibilidad
        const icons = {
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            success: '✅',
            critical: '🚨',
            debug: '🐛'
        };

        const icon = icons[type as keyof typeof icons] || '📝';
        
        return `[${time}] ${icon} [${type.toUpperCase()}] ${message}${ctx}\n`;
    }

    private log(type: keyof typeof colors, message: string, context?: LogContext) {
        const ctx = this.formatContext(context);
        const formatted = `[${type.toUpperCase()}] ${message}${ctx}`;

        if (this.consoleEnabled) console.log(this.colorizeMessage(type, formatted));

        const timestamp = new Date().toISOString();
        const humanReadable = this.formatHumanReadable(type, message, context, timestamp);
        
        // Escribir versión legible en el archivo
        this.logStream.write(humanReadable);

        // También mantener el formato JSON para análisis programático
        const payload = {
            level: type,
            message,
            context,
            timestamp,
            mode: this.mode,
        };

        switch (type) {
            case "error": this.logger.error(payload); break;
            case "warn": this.logger.warn(payload); break;
            case "success": this.logger.info(payload); break;
            case "critical": this.logger.fatal(payload); break;
            case "debug": this.logger.debug(payload); break;
            default: this.logger.info(payload); break;
        }
    }

    // Método para obtener logs en formato legible
    public getHumanReadableLogs(): string {
        try {
            return fs.readFileSync(this.logFile, 'utf8');
        } catch (error) {
            return `Error leyendo archivo de log: ${error}`;
        }
    }

    // Método para exportar logs en formato más amigable
    public exportReadableLogs(destinationPath: string): boolean {
        try {
            const readableContent = this.getHumanReadableLogs();
            fs.writeFileSync(destinationPath, readableContent, 'utf8');
            return true;
        } catch (error) {
            this.error(`Error exportando logs: ${error}`);
            return false;
        }
    }

    // Método para limpiar y formatear mensajes de error
    private sanitizeMessage(message: string): string {
        return message
            .replace(/\x1b\[[0-9;]*m/g, '') // Remover códigos de color ANSI
            .replace(/\r?\n|\r/g, ' ')       // Reemplazar saltos de línea
            .trim();
    }

    info(message: string, context?: LogContext) { 
        this.log("info", this.sanitizeMessage(message), context); 
    }
    
    warn(message: string, context?: LogContext) { 
        this.log("warn", this.sanitizeMessage(message), context); 
    }
    
    error(message: string | Error, context?: LogContext) {
        const msg = message instanceof Error ? message.stack || message.message : message;
        this.log("error", this.sanitizeMessage(msg), context);
    }
    
    success(message: string, context?: LogContext) { 
        this.log("success", this.sanitizeMessage(message), context); 
    }
    
    critical(message: string, context?: LogContext) { 
        this.log("critical", this.sanitizeMessage(message), context); 
    }
    
    debug(message: string, context?: LogContext) {
        if (this.mode === "strict") this.log("debug", this.sanitizeMessage(message), context);
    }

    // Método para cerrar el stream adecuadamente
    public close() {
        this.logStream.end();
        this.logger.flush();
    }
}
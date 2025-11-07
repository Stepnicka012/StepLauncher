import fs from "fs";
import path from "path";
import pino, { type LoggerOptions } from "pino";
import type { LogMode, LogContext } from "./types.js";

function createLogFile(root: string, mode: LogMode) {
  const date = new Date();
  const logDir = path.join(root, "logs");
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

  constructor(root: string, mode: LogMode = "normal", consoleEnabled: boolean = true) {
    this.mode = mode;
    this.consoleEnabled = consoleEnabled;
    this.logFile = createLogFile(root, mode);

    const baseConfig: LoggerOptions = {
      level: mode === "strict" ? "trace" : "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      base: null,
    };

    this.logger = pino(baseConfig, pino.destination(this.logFile));
  }

  private colorizeMessage(type: keyof typeof colors, message: string) {
    const color = colors[type] || "";
    return `${color}${message}${colors.reset}`;
  }

  private formatContext(context?: LogContext): string {
    if (!context) return "";
    const parts = [];
    if (context.module) parts.push(`Module: ${context.module}`);
    if (context.function) parts.push(`Function: ${context.function}`);
    if (context.additionalInfo) parts.push(`Info: ${context.additionalInfo}`);
    return parts.length ? ` (${parts.join(" | ")})` : "";
  }

  private log(type: keyof typeof colors, message: string, context?: LogContext) {
    const ctx = this.formatContext(context);
    const formatted = `[${type.toUpperCase()}] ${message}${ctx}`;

    if (this.consoleEnabled) console.log(this.colorizeMessage(type, formatted));

    const payload = {
      level: type,
      message,
      context,
      timestamp: new Date().toISOString(),
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

  info(message: string, context?: LogContext) { this.log("info", message, context); }
  warn(message: string, context?: LogContext) { this.log("warn", message, context); }
  error(message: string | Error, context?: LogContext) {
    const msg = message instanceof Error ? message.stack || message.message : message;
    this.log("error", msg, context);
  }
  success(message: string, context?: LogContext) { this.log("success", message, context); }
  critical(message: string, context?: LogContext) { this.log("critical", message, context); }
  debug(message: string, context?: LogContext) {
    if (this.mode === "strict") this.log("debug", message, context);
  }
}

export interface ElectronPinoOptions {
    /** Ruta donde guardar los logs (por defecto: ./logs) */
    logPath?: string;
    /** Nombre del archivo de log (por defecto: app.log) */
    logFileName?: string;
    /** Nivel de log (por defecto: 'info') */
    level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    /** Número máximo de días para mantener logs (por defecto: 30) */
    maxLogDays?: number;
    /** Tamaño máximo del archivo en MB antes de rotar (por defecto: 10) */
    maxFileSize?: number;
    /** Mostrar logs en consola (por defecto: true) */
    prettyPrint?: boolean;
    /** Habilitar colores en consola (por defecto: true) */
    colors?: boolean;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogEntry = {
  time: string;
  level: LogLevel;
  msg: string;
  pid: number;
  hostname: string;
  [key: string]: unknown;
};

export interface LoggerOptions {
  level?: LogLevel;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  maxAgeDays?: number;
  enableConsole?: boolean;
  consoleColors?: boolean;
  bufferSize?: number;
  bufferFlushInterval?: number;
  maxMemoryLogs?: number;
  
  maxStringLength?: number;
  maxObjectDepth?: number;
  maxObjectKeys?: number;
  maxBufferSize?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  consoleSummaryThreshold?: number;
}
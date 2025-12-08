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

export interface LogEntry {
    level: number;
    time: number;
    pid: number;
    hostname: string;
    msg: string;
    [key: string]: unknown;
}
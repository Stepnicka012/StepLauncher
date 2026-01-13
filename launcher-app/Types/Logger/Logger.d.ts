export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
	time: string;
	level: string;
	msg: string;
	pid: number;
	hostname: string;
	[key: string]: any;
}

export interface ElectronPinoOptions {
	/** Ruta donde guardar los logs (por defecto: ./logs) */
	logPath?: string;
	/** Nombre del archivo de log (por defecto: app.log) */
	logFileName?: string | any;
	/** Nivel de log (por defecto: 'info') */
	level?: LogLevel;
	/** Número máximo de días para mantener logs (por defecto: 30) */
	maxLogDays?: number;
	/** Tamaño máximo del archivo en MB antes de rotar (por defecto: 10) */
	maxFileSize?: number;
	/** Mostrar logs en consola (por defecto: true) */
	prettyPrint?: boolean;
	/** Habilitar colores en consola (por defecto: true) */
	colors?: boolean;
}

export interface VanillaPinoOptions {
	level?: LogLevel;
	filePath?: string;
	maxFileSize?: number; // MB
	maxFiles?: number;
	maxAgeDays?: number;
	prettyPrint?: boolean;
	colors?: boolean;
	bufferSize?: number; // Número de logs antes de flush
	flushInterval?: number; // ms entre flushes automáticos
	maxMemoryLogs?: number; // Logs en memoria (para getMemoryHistory)
}

export interface DestinationOptions {
	dest: string;
	sync?: boolean;
	mkdir?: boolean;
}

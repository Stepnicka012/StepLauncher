import type { DownloadManagerOptions, DownloadEventCallback, DownloadStats } from "./Types/App/Preload";

export interface MinecraftDownloadersAPI {
	calculateBytes(options: DownloadManagerOptions): Promise<{ success: boolean; total?: number; error?: string }>;
	startDownload(options: DownloadManagerOptions): Promise<{ success: boolean; error?: string }>;
	pauseDownload(): Promise<{ success: boolean; error?: string }>;
	resumeDownload(): Promise<{ success: boolean; error?: string }>;
	stopDownload(): Promise<{ success: boolean; error?: string }>;
	getStats(): Promise<{ success: boolean; stats?: DownloadStats; error?: string }>;
	onDownloadEvent(callback: DownloadEventCallback): () => void;
}

export interface MinecraftLaunchAPI {
	launch(version: string, options?: any): Promise<any>;
	kill(version: string): Promise<any>;
	listVersions(): Promise<any>;
	getVersionInfo(version: string): Promise<any>;
	updateConfig(config: any): Promise<any>;
	getServiceStatus(): Promise<any>;
	onStatus(cb: (data: any) => void): void;
	onProgress(cb: (data: any) => void): void;
	onStdout(cb: (data: any) => void): void;
	onStderr(cb: (data: any) => void): void;
	onExit(cb: (data: any) => void): void;
	onError(cb: (data: any) => void): void;
	onLaunched(cb: (data: any) => void): void;
	onPreparing(cb: (data: any) => void): void;
	removeAllListeners(channel: string): void;
}

export interface IStepLauncherLoggerAPI {
	trace(message: string, ...args: unknown[]): void;
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	fatal(message: string, ...args: unknown[]): void;
	log(message: string, ...args: unknown[]): void;
	getMemoryHistory(): Promise<string[]>;
	getLogPath(): string;
	readLogs(): Promise<string>;
	clearLogs(): Promise<void>;
	setLevel(level: LogLevel | undefined): void;
	getLevel(): string;
}
export interface LangAPI {
    getText: (key: string, context?: any) => string;
    applyToDOM: () => void;
    setLang?: (lang: string) => void;
    getCurrentLang?: () => string;
    getAvailableLangs?: () => string[];
    reload?: () => void;
    onLangChanged?: (callback: (lang: string) => void) => void;
    changeLanguage?: (lang: string) => void;
    reloadLang?: () => void;
}

export interface ElectronAPI {
	openExternal: (url: string) => string;
	getVersions: () => void;
}

declare global {
	interface Window {
		LangAPI: LangAPI;
		ElectronAPI: ElectronAPI;
		StepLauncherLogger: IStepLauncherLoggerAPI;
		minecraftDownloaders: MinecraftDownloadersAPI;
		minecraftLaunch: MinecraftLaunchAPI;
		TitlebarAPI: import("./Render/Titlebar").TitlebarAPIClass;
	}
}
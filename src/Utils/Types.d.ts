// ─────────────────────────────
// Tipos Generales
// ─────────────────────────────
export type NotificationType = "success" | "warning" | "error";
export type FolderEvent = "clean:start" | "clean:progress" | "clean:done" | "clean:skip";
export type LoadStatus = "pending" | "success" | "error";
export type LogMode = "normal" | "preload" | "strict";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LogContext {
  additionalInfo?: string;
  module?: string;
  function?: string;
  [key: string]: any;
}

// ─────────────────────────────
// Noticias y Changelog
// ─────────────────────────────
export interface NewsImage {
    url: string;
    title?: string;
}

export interface NewsEntry {
    hero: any;
    type: "snapshot" | "release" | string;
    version: string;
    title: string;
    shortText?: string;
    image: NewsImage;
    contentPath: string;
}

export interface ChangelogData {
    title: string;
    version: string;
    body: string;
    image?: NewsImage;
}

export interface StepNewsEntry {
    title: string;
    description: string;
    type: string; // release | snapshot
    hero: {
        background: string;
        image: string;
    };
    url: string;
    date: string;
    id: string;
}

export interface StepChangelogFeatureExternal {
    label: string;
    url: string;
}

export interface StepChangelogFeature {
    title: string;
    data: string;
    img: string[];
    video: string;
    external: StepChangelogFeatureExternal[];
}

export interface StepChangelogBodyItem {
    features: StepChangelogFeature[];
    bugFixed: {
        label: string;
        url: string;
    }[];
}

export interface StepChangelog {
    title: string;
    description: string;
    date: string;
    type: string;
    hero: {
        background: string;
        image: string;
    };
    body: StepChangelogBodyItem[];
}

// ─────────────────────────────
// Paneles
// ─────────────────────────────
export type PanelDef = {
    name: string;
    url: string;
};

export type PanelsManagerOptions = {
    containerSelector?: string;
    executeScripts?: boolean;
    fetchInit?: RequestInit;
};

export interface NotificationOptions {
    type: NotificationType;
    message: string;
    duration?: number; // ms
}

// ─────────────────────────────
// Youtube API
// ─────────────────────────────
export type QualityMode = "low" | "medium" | "high" | "ultra";
export interface VideoSearchResult {
    title: string | undefined;
    url: string | undefined;
    duration: string | undefined;
    durationSeconds: number | undefined;
    thumbnail: string | undefined;
    author: string | undefined;
    description: string | undefined;
    views: number | undefined;
    ago: string | undefined;
    videoId: string | undefined;
    uploadedAt: string | undefined;
}

export interface MediaDownloaderOptions {
    qualityVideo?: QualityMode;
    qualityAudio?: QualityMode;
}

export interface DownloadOptions {
    qualityVideo?: QualityMode;
    qualityAudio?: QualityMode;
    downloadVideo?: boolean;
    downloadAudio?: boolean;
}

export interface ProgressData {
    filePath: string;
    percent: number;
    readable?: string;
}

export interface DownloadResult {
    title: string;
    videoPath?: string;
    audioPath?: string;
    combinedPath?: string;
}

export interface MusicReaderConfig {
  basePath: string;
  recursive?: boolean;
  ignoreFolders?: string[];
  supportedFormats?: string[];
  maxFileSize?: number;
  concurrency?: number;
  timeout?: number;
}

export interface MusicData {
  path: string;
  fileName: string;
  title?: string | undefined;
  artist?: string | undefined;
  album?: string | undefined;
  duration?: number | undefined;
  year?: number | undefined;
  genre?: string[] | undefined;
  coverArt?: {
    base64: string;
    mimeType: string;
} | undefined;
  fileSize: number;
  fileFormat: string;
}

export interface ProcessingResult {
  success: MusicData[];
  errors: Array<{ path: string; error: string }>;
  stats: {
    totalFiles: number;
    processed: number;
    failed: number;
    totalDuration: number;
  };
}

interface LocalMusicAPI {
    scan: (config: MusicReaderConfig) => Promise<{ success: boolean; data?: ProcessingResult; error?: string }>;
    scanSafe: (config: MusicReaderConfig) => Promise<{ success: boolean; data?: ProcessingResult; error?: string }>;
    generateReport: (result: ProcessingResult) => Promise<string>;
    cancelScan: () => Promise<{ success: boolean }>;
    onProgress: (callback: (event: any, data: any) => void) => void;
    removeProgressListener: (callback: (event: any, data: any) => void) => void;
}

// ─────────────────────────────
// Configuración
// ─────────────────────────────
export interface DefaultConfig {
    Version: string;
    TypeVersion: "Stable" | "Beta" | "Dev";
    Launcher: {
        AutoCleanLogs: boolean;
        ConnectDiscord: boolean;
        DefaultLang: string;
        isFirstTimeUser: boolean;
    };
    Minecraft: {
        Memory: {
            Max: string;
            Min: string;
        };
        Downloader: {
            Concurry: number;
            StartOnFinish: boolean;
            InstallJava: boolean;
            VariantJava: "Stable" | "Beta" | "Dev";
        };
    };
}

// ─────────────────────────────
// APIs Expuestas al Renderer
// ─────────────────────────────
export interface LangAPI {
    apply(root?: Document): void;
    translate(key: string): string;
    currentLang(): string;
    setLang(langCode: string): string;
    getParamFromScript(param: string): string;
    getAllTranslations(): Record<string, string>;
}

export interface DiscordRPCAPI {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    setMode(mode: string, version: string): Promise<void>;
    getStatus(): Promise<any>;
    on(event: string, callback: (data: any) => void): void;
}

export interface ConfigurationAPI {
    get(): Promise<DefaultConfig>;
    set(pathKey: string, value: any): Promise<void>;
    exists(): Promise<boolean>;
    save(): Promise<void>;
    reload(): Promise<DefaultConfig>;
    reset(): DefaultConfig;
    getPath<T = any>(pathKey: string, fallback?: T): Promise<T | undefined>;
}

export interface FolderLauncher {
    createFolder(name: string): Promise<void>;
    createLog(logName: string, content: string): Promise<void>;
    createFile(fileName: string, content: string | Buffer, subFolder?: string): Promise<void>;
    exists(relativePath: string): Promise<boolean>;
    list(subFolder?: string): Promise<string[]>;
    cleanLauncher(): Promise<void>;
    cleanMinecraft(): Promise<void>;
    on(event: FolderEvent, callback: (data: any) => void): void;
}

export interface ElectronPino {
    info(msg: string, ctx?: LogContext): Promise<void>;
    warn(msg: string, ctx?: LogContext): Promise<void>;
    error(msg: string | undefined | Error | any, ctx?: LogContext): Promise<void>;
    debug(msg: string, ctx?: LogContext): Promise<void>;
    success(msg: string, ctx?: LogContext): Promise<void>;
    critical(msg: string, ctx?: LogContext): Promise<void>;
}

export interface StepLauncherAPI {
    login(email: string, password: string): Promise<{ data: any; success: boolean; message: string }>;
}

export interface YoutubeAPI {
    search(query: string, limit?: number, offset?: string): Promise<VideoSearchResult[]>;
    download(url: any, options: any): Promise<any>;
    onEvent(cb: (payload: any) => void): void;
}

export interface ElectronAPI {
    StartApp(): void;
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    onWindowStateChange(cb: (state: { maximized: boolean }) => void): void;
    openExternal(url: string): void;
}

// ─────────────────────────────
// Declaraciones Globales
// ─────────────────────────────
declare global {
    interface Window {
        LangAPI: LangAPI;
        FolderLauncher: FolderLauncher;
        ElectronPino: ElectronPino;
        ElectronAPI: ElectronAPI;
        Notification: NotificationOptions;
        Configuration: ConfigurationAPI;
        YoutubeAPI: YoutubeAPI;
        StepLauncherAPI: StepLauncherAPI;
        DiscordRPC: DiscordRPCAPI;
        localMusicAPI: LocalMusicAPI;
    }
}

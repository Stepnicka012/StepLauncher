export type FolderEvent = "clean:start" | "clean:progress" | "clean:done" | "clean:skip";
export type LoadStatus = 'pending' | 'success' | 'error';
export type LogMode = "normal" | "preload" | "strict";

export interface LogContext {
  additionalInfo?: string;
  module?: string;
  function?: string;
}

interface NewsImage {
    url: string;
    title?: string;
}

export interface NewsEntry {
    type: 'snapshot' | 'release' | string;
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
    image?: { url: string; title?: string };
}

export interface DefaultConfig {
    Version: string;
    TypeVersion: "Stable" | "Beta" | "Dev";
    Launcher: {
        AutoCleanCache: boolean;
        AutoCleanLogs: boolean;
        ConnectDiscord: boolean;
        DevTools: boolean;
        DefaultLang: string;
        NewPanel: boolean;
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

export interface LangAPI {
    apply(): void;
    translate(key: string): string;
    currentLang(): string;
    getParamFromScript(config: string): string;
}

export interface ConfigurationAPI {
    get(): DefaultConfig;
    set(pathKey: string, value: any): void;
    exists(): boolean;
    save(): void;
    reload(): void;
    reset(): void;
}


export interface FolderLauncher {
    createFolder(name: string): void;
    createLog(logName: string, content: string): void;
    createFile(fileName: string, content: string | Buffer, subFolder?: string): void;
    exists(relativePath: string): boolean;
    list(subFolder?: string): string[];
    cleanLauncher(): void;
    cleanMinecraft(): void;
    on(event: FolderEvent, callback: (data: any) => void): void;
}

export interface ElectronPino {
    info(msg: string, ctx?: LogContext): void;
    warn(msg: string, ctx?: LogContext): void;
    error(msg: string | Error, ctx?: LogContext): void;
    debug(msg: string, ctx?: LogContext): void;
    success(msg: string, ctx?: LogContext): void;
    critical(msg: string, ctx?: LogContext): void;
}

export interface ElectronAPI {
    StartApp(): void;
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    onWindowStateChange(cb: (state: { maximized: boolean }) => void): void;
    openExternal: (url: string) => void;
}

export interface LangAPI {
    apply: () => void;
    getParamFromScript: (param: string) => string;
    translate: (key: string) => string;
}

export interface WebviewTagWithContentWindow extends Electron.WebviewTag {
    contentWindow?: Window;
}

declare global {
    interface Window {
        LangAPI: LangAPI;
        FolderLauncher: FolderLauncher;
        ElectronPino: ElectronPino;
        ElectronAPI: ElectronAPI;
        Configuration: ConfigurationAPI;
    }  
    interface DocumentEventMap {
        "minecraftNewsLoaded": CustomEvent<{ status: LoadStatus }>;
    }
}
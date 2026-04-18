import type { 
    InstallRequest, LaunchRequest, InstanceInfo, 
    InstanceListResponse, CreateInstanceRequest, 
    UpdateInstanceRequest, EngineInfo, SessionSnapshot,
    ModLoaderRequest
} from "../Main/Services/Java/index.js";

export interface NovaCoreAPI {
    getRequirementsStatus: () => Promise<{ ready: boolean; java: boolean; engine: boolean; paths: any }>;
    bootstrap: () => Promise<any>;
    getStatus: () => Promise<{ connected: boolean; running: boolean; pid?: number }>;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    install: (req: InstallRequest) => Promise<void>;
    pauseInstall: (id: string) => Promise<void>;
    resumeInstall: (id: string) => Promise<void>;
    cancelInstall: (id: string) => Promise<void>;
    launch: (req: LaunchRequest) => Promise<{ launchId: string }>;
    killInstance: (id: string) => Promise<void>;
    getSession: (id: string) => Promise<SessionSnapshot | null>;
    getRecoverySessions: () => Promise<SessionSnapshot[]>;
    getSummary: () => Promise<any>;
    getEngineInfo: () => Promise<EngineInfo>;
    getModLoaders: () => Promise<{ loaders: string[] }>;
    getModLoaderVersions: (loader: string, mc: string) => Promise<any>;
    installModLoader: (req: ModLoaderRequest) => Promise<any>;
    getModLoaderState: (path: string) => Promise<any>;
    deleteModLoaderState: (path: string) => Promise<any>;
    downloadMinecraftRuntime: (ver: string, path: string) => Promise<any>;
    closeEngine: () => Promise<void>;
    on: (event: string, callback: (data: any) => void) => void;
    off: (event: string) => void;
}

export interface ElectronAPI {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
}

declare global {
    interface Window {
        ElectronAPI: ElectronAPI;
        novacore: NovaCoreAPI;
    }
}
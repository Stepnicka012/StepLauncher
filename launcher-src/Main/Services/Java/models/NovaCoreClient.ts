import { WsClient, type WsStatus } from "../internal/WsClient.js";
import { HttpClient } from "../internal/HttpClient.js";
import { InstallFlow } from "./InstallFlow.js";
import { LaunchFlow } from "./LaunchFlow.js";
import type {
    InstallRequest, LaunchRequest,
    NovaCoreEventName, NovaCoreEvents,
    SessionSnapshot, InstanceInfo, EngineInfo,
} from "../types/index.js";
import type { InstallCallbacks } from "./InstallFlow.js";
import type { LaunchCallbacks, LaunchHandle } from "./LaunchFlow.js";

export interface NovaCoreClientOptions {
    httpUrl?: string;
    wsUrl?: string;
    token: string;
    timeoutMs?: number;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    onStatusChange?: (status: WsStatus, error?: Error) => void;
}

export class NovaCoreClient {
    readonly _ws: WsClient;
    readonly _http: HttpClient;
    private installFlow: InstallFlow;
    private launchFlow: LaunchFlow;

    constructor(opts: NovaCoreClientOptions) {
        this._http = new HttpClient(
            opts.httpUrl ?? "http://localhost:7878",
            opts.token,
            opts.timeoutMs ?? 30000,
        );
        this._ws = new WsClient({
            url: opts.wsUrl ?? "ws://localhost:7879",
            token: opts.token,
            autoReconnect: opts.autoReconnect ?? true,
            reconnectDelay: opts.reconnectDelay ?? 1500,
            maxReconnectAttempts: opts.maxReconnectAttempts ?? 0,
            onStatusChange: opts.onStatusChange,
        });
        this.installFlow = new InstallFlow(this._ws, this._http);
        this.launchFlow = new LaunchFlow(this._ws, this._http);
    }

    get isConnected(): boolean { return this._ws.connected; }
    get connectionStatus(): WsStatus { return this._ws.status; }

    connect(): Promise<void> { return this._ws.connect(); }
    disconnect(): void { this._ws.close(); }

    on<K extends NovaCoreEventName>(event: K, handler: (data: NovaCoreEvents[K]) => void): this {
        this._ws.on(event, handler); return this;
    }
    off<K extends NovaCoreEventName>(event: K, handler: (data: NovaCoreEvents[K]) => void): this {
        this._ws.off(event, handler); return this;
    }
    once<K extends NovaCoreEventName>(event: K, handler: (data: NovaCoreEvents[K]) => void): this {
        this._ws.once(event, handler); return this;
    }
    onAny(handler: (event: NovaCoreEventName, data: unknown) => void): this {
        this._ws.onAny(handler); return this;
    }
    waitFor<K extends NovaCoreEventName>(event: K, timeoutMs?: number): Promise<NovaCoreEvents[K]> {
        return this._ws.waitFor(event, timeoutMs);
    }

    install(req: InstallRequest, callbacks?: InstallCallbacks, timeoutMs?: number): Promise<void> {
        return this.installFlow.run(req, callbacks, timeoutMs);
    }
    pauseInstall(sessionId: string): Promise<void> { return this._http.pauseInstall(sessionId); }
    resumeInstall(sessionId: string): Promise<void> { return this._http.resumeInstall(sessionId); }
    cancelInstall(sessionId: string): Promise<void> { return this._http.cancelInstall(sessionId); }

    launch(req: LaunchRequest, callbacks?: LaunchCallbacks): Promise<LaunchHandle> {
        return this.launchFlow.run(req, callbacks);
    }
    killInstance(launchId: string): Promise<void> { return this._http.killInstance(launchId); }
    getRunningInstances(): Promise<InstanceInfo[]> { return this._http.getRunningInstances(); }
    getRunningInstance(launchId: string) { return this._http.getRunningInstance(launchId); }

    getInstancesList() { return this._http.getInstancesList(); }
    createInstance(req: import("../types/index.js").CreateInstanceRequest) { return this._http.createInstance(req); }
    updateInstance(id: string, req: import("../types/index.js").UpdateInstanceRequest) { return this._http.updateInstance(id, req); }
    deleteInstance(id: string) { return this._http.deleteInstance(id); }

    getSession(sessionId: string): Promise<SessionSnapshot | null> { return this._http.getSession(sessionId); }
    async getRecoverySessions(): Promise<SessionSnapshot[]> { return (await this._http.getRecoverySessions()).snapshots; }
    getSummary() { return this._http.getSummary(); }
    getEngineInfo(): Promise<EngineInfo> { return this._http.getEngineInfo(); }

    getModLoaders(): Promise<{ loaders: string[] }> { return this._http.getModLoaders(); }
    getModLoaderVersions(loader: string, mcVersion: string) { return this._http.getModLoaderVersions(loader, mcVersion); }
    installModLoader(req: import("../types/index.js").ModLoaderRequest) { return this._http.installModLoader(req); }
    getModLoaderState(instancePath: string) { return this._http.getModLoaderState(instancePath); }
    deleteModLoaderState(instancePath: string) { return this._http.deleteModLoaderState(instancePath); }

    downloadRuntime(version: string, instancePath: string, sharedPath?: string) { return this._http.downloadRuntime(version, instancePath, sharedPath); }
    closeEngine(): Promise<void> { return this._http.close(); }
}
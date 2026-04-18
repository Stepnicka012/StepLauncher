import type {
    InstallRequest, InstallResponse,
    LaunchRequest, LaunchResponse,
    SessionSnapshot, InstanceInfo, EngineInfo,
} from "../types/index.js";

export class HttpError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "NovaCoreHttpError";
    }
}

export class HttpClient {
    constructor(
        private readonly base: string,
        private readonly token: string,
        private readonly timeoutMs: number,
    ) { }

    install(req: InstallRequest) { return this.post<InstallResponse>("/install", req); }
    pauseInstall(id: string) { return this.post<void>(`/install/pause/${id}`, null); }
    resumeInstall(id: string) { return this.post<void>(`/install/resume/${id}`, null); }
    cancelInstall(id: string) { return this.post<void>(`/install/cancel/${id}`, null); }
    getRecoverySessions() { return this.get<{ count: number; snapshots: SessionSnapshot[] }>("/install/recovery"); }

    launch(req: LaunchRequest) { return this.post<LaunchResponse>("/launch", req); }
    killInstance(id: string) { return this.post<void>(`/launch/kill/${id}`, null); }
    getRunningInstances() { return this.get<any>("/launch/instances").then(r => r.instances ?? []); }
    getRunningInstance(id: string) { return this.get<InstanceInfo>(`/launch/instances/${id}`).catch(e => { if (e instanceof HttpError && e.status === 404) return null; throw e; }); }

    getInstancesList() { return this.get<import("../types/index.js").InstanceListResponse>("/instances"); }
    createInstance(req: import("../types/index.js").CreateInstanceRequest) { return this.post<import("../types/index.js").InstanceRecord>("/instances", req); }
    updateInstance(id: string, req: import("../types/index.js").UpdateInstanceRequest) { return this.req<import("../types/index.js").InstanceRecord>("PATCH", `/instances/${id}`, req); }
    deleteInstance(id: string) { return this.req<void>("DELETE", `/instances/${id}`, null); }

    getSession(id: string) { return this.get<SessionSnapshot>(`/progress?sessionId=${id}`).catch(e => { if (e instanceof HttpError && e.status === 404) return null; throw e; }); }
    getSummary() { return this.get<any>("/progress/summary"); }

    getEngineInfo() { return this.get<EngineInfo>("/system/resources"); }

    getModLoaders() { return this.get<{ loaders: string[] }>("/modloaders"); }
    getModLoaderVersions(loader: string, mcVer: string) { return this.get<{ versions: any[] }>(`/modloaders/versions/${loader}/${mcVer}`); }
    installModLoader(req: import("../types/index.js").ModLoaderRequest) { return this.post<any>("/modloaders/install", req); }
    getModLoaderState(instancePath: string) { return this.get<any>(`/modloaders/state/${encodeURIComponent(instancePath)}`); }
    deleteModLoaderState(instancePath: string) { return this.req<any>("DELETE", `/modloaders/state/${encodeURIComponent(instancePath)}`, null); }

    downloadRuntime(version: string, instancePath: string, sharedPath?: string) { return this.post<any>("/runtime", { version, instancePath, sharedPath }); }

    close() { return this.post<void>("/close", null); }

    private async get<T>(path: string): Promise<T> { return this.req<T>("GET", path, null); }
    private async post<T>(path: string, body: unknown): Promise<T> { return this.req<T>("POST", path, body); }

    private async req<T>(method: string, path: string, body: unknown): Promise<T> {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        let res: Response;
        try {
            const init: RequestInit = {
                method,
                signal: ctrl.signal,
                headers: {
                    "Content-Type": "application/json",
                    "X-Access-Token": this.token,
                },
            };
            if (body !== null) init.body = JSON.stringify(body);
            res = await fetch(`${this.base}${path}`, init);
        } catch (e) {
            throw new HttpError(0, `Network: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            clearTimeout(timer);
        }
        let json: unknown;
        try { json = await res.json(); } catch { json = {}; }
        if (!res.ok) throw new HttpError(res.status, (json as Record<string, string>)["error"] ?? `HTTP ${res.status}`);
        return json as T;
    }
}
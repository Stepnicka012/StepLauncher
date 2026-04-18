import type { WsClient } from "../internal/WsClient.js";
import type { HttpClient } from "../internal/HttpClient.js";
import type { LaunchRequest, NovaCoreEvents } from "../types/index.js";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL" | "DEBUG" | string;

export interface GameLogLine {
    raw: string;
    level: LogLevel;
    logger: string;
    message: string;
    stream: "stdout" | "stderr";
}

export interface LaunchCallbacks {
    onStart?: (launchId: string, pid: number) => void;
    onLog?: (line: GameLogLine) => void;
    onWarn?: (line: string, logger: string) => void;
    onError?: (line: string, logger: string) => void;
    onExit?: (launchId: string, durationMs: number) => void;
    onCrashExit?: (launchId: string, exitCode: number, reason: string) => void;
    onLaunchFailed?: (error: string, missing?: string[]) => void;
}

export class LaunchFlow {
    constructor(
        private readonly ws: WsClient,
        private readonly http: HttpClient,
    ) { }

    async run(req: LaunchRequest, callbacks?: LaunchCallbacks): Promise<LaunchHandle> {
        const res = await this.http.launch(req);
        const { launchId } = res;

        return new Promise<LaunchHandle>((resolveHandle, rejectHandle) => {
            let resolved = false;
            let exitedResolve = (_: void) => { };
            const exited = new Promise<void>(r => { exitedResolve = r; });

            const cleanup = () => {
                this.ws.off("launch_started", onStarted);
                this.ws.off("launch_failed", onFailed);
                this.ws.off("launch_verification_failed", onVerifyFailed);
                this.ws.off("game_log", onLog);
                this.ws.off("launch_exited", onExited);
                this.ws.off("game_crash", onGameCrash);
            };

            const onStarted = (d: NovaCoreEvents["launch_started"]) => {
                if (d.launchId !== launchId || resolved) return;
                resolved = true;
                callbacks?.onStart?.(launchId, d.pid);
                resolveHandle(new LaunchHandle(launchId, this.http, cleanup, exited));
            };

            const onFailed = (d: NovaCoreEvents["launch_failed"]) => {
                if (d.launchId !== launchId) return;
                cleanup();
                callbacks?.onLaunchFailed?.(d.error);
                rejectHandle(new Error(d.error));
            };

            const onVerifyFailed = (d: NovaCoreEvents["launch_verification_failed"]) => {
                if (d.launchId !== launchId) return;
                cleanup();
                callbacks?.onLaunchFailed?.(`Missing components: ${d.missing.join(", ")}. ${d.hint}`, d.missing);
                rejectHandle(new Error(`Launch verification failed: ${d.missing.join(", ")}`));
            };

            const onLog = (d: NovaCoreEvents["game_log"]) => {
                if (d.launchId !== launchId) return;
                const logLine: GameLogLine = {
                    raw: d.line,
                    level: d.level,
                    logger: d.logger,
                    message: d.message,
                    stream: d.stream,
                };
                callbacks?.onLog?.(logLine);
                if (d.level === "WARN") callbacks?.onWarn?.(d.line, d.logger);
                else if (d.level === "ERROR" || d.level === "FATAL") callbacks?.onError?.(d.line, d.logger);
            };

            const onGameCrash = (d: NovaCoreEvents["game_crash"]) => {
                if (d.launchId !== launchId) return;
                callbacks?.onCrashExit?.(launchId, d.exitCode, d.reason);
            };

            const onExited = (d: NovaCoreEvents["launch_exited"]) => {
                if (d.launchId !== launchId) return;
                cleanup();
                callbacks?.onExit?.(launchId, d.durationMs);
                exitedResolve();
            };

            this.ws.on("launch_started", onStarted);
            this.ws.on("launch_failed", onFailed);
            this.ws.on("launch_verification_failed", onVerifyFailed);
            this.ws.on("game_log", onLog);
            this.ws.on("launch_exited", onExited);
            this.ws.on("game_crash", onGameCrash);
        });
    }
}

export class LaunchHandle {
    readonly launchId: string;
    readonly exited: Promise<void>;
    private readonly _http: HttpClient;
    private readonly _cleanup: () => void;

    constructor(launchId: string, http: HttpClient, cleanup: () => void, exited: Promise<void>) {
        this.launchId = launchId;
        this._http = http;
        this._cleanup = cleanup;
        this.exited = exited;
    }

    async kill(): Promise<void> {
        await this._http.killInstance(this.launchId);
        this._cleanup();
    }
}
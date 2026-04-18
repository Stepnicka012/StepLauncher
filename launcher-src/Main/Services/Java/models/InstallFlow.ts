import type { WsClient } from "../internal/WsClient.js";
import type { HttpClient } from "../internal/HttpClient.js";
import type { InstallRequest, ModuleStatus, NovaCoreEvents } from "../types/index.js";

export interface InstallProgress {
    percent: number;
    downloadedMb: number;
    totalMb: number;
    completedFiles: number;
    totalFiles: number;
    message: string;
    processorLog?: string;
}

export interface InstallModuleUpdate {
    module: "client" | "libraries" | "assets" | "natives";
    status: ModuleStatus;
}

export interface InstallCallbacks {
    onStart?: (totalFiles: number, totalBytes: number) => void;
    onProgress?: (progress: InstallProgress) => void;
    onModule?: (update: InstallModuleUpdate) => void;
    onComplete?: (version: string, modloader: string) => void;
    onError?: (reason: string, modules: Record<string, ModuleStatus>) => void;
}

export class InstallFlow {
    constructor(
        private readonly ws: WsClient,
        private readonly http: HttpClient,
    ) { }

    run(req: InstallRequest, callbacks?: InstallCallbacks, timeoutMs = 600000): Promise<void> {
        return new Promise(async (resolve, reject) => {
            let sessionId: string;
            try {
                const res = await this.http.install(req);
                sessionId = res.sessionId;
            } catch (err) {
                reject(err); return;
            }

            let lastProgressMs = 0;
            let currentProcessorLog: string | undefined;

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Installation timeout after ${timeoutMs / 1000}s (session: ${sessionId})`));
            }, timeoutMs);

            const onTasksReady = (d: NovaCoreEvents["tasks_ready"]) => {
                if (d.sessionId !== sessionId) return;
                callbacks?.onStart?.(d.totalTasks, d.totalBytes ?? 0);
            };

            const onProgress = (d: NovaCoreEvents["session_progress"]) => {
                if (d.sessionId !== sessionId) return;
                const now = Date.now();
                if (now - lastProgressMs < 80) return;
                lastProgressMs = now;
                const dlMb = d.downloadedBytes / 1048576;
                const totMb = d.totalBytes / 1048576;
                callbacks?.onProgress?.({
                    percent: d.overallPercent,
                    downloadedMb: Math.round(dlMb * 10) / 10,
                    totalMb: Math.round(totMb * 10) / 10,
                    completedFiles: d.completedFiles + d.skippedFiles,
                    totalFiles: d.totalFiles,
                    message: buildMessage(d),
                    processorLog: currentProcessorLog,
                });
            };

            const onModule = (d: NovaCoreEvents["module_status"]) => {
                if (d.sessionId !== sessionId) return;
                callbacks?.onModule?.({ module: d.module, status: d.status });
            };

            const onProcessorLog = (d: NovaCoreEvents["modloader_processor_log"]) => {
                if (d.sessionId !== sessionId) return;
                currentProcessorLog = d.line;
                callbacks?.onProgress?.({
                    percent: 0,
                    downloadedMb: 0,
                    totalMb: 0,
                    completedFiles: 0,
                    totalFiles: 0,
                    message: "Processing ModLoader...",
                    processorLog: d.line,
                });
            };

            const onCompleted = (d: NovaCoreEvents["install_completed"]) => {
                if (d.sessionId !== sessionId) return;
                cleanup();
                callbacks?.onComplete?.(d.version, d.modloader);
                resolve();
            };

            const onFailed = (d: NovaCoreEvents["install_failed"]) => {
                if (d.sessionId !== sessionId) return;
                cleanup();
                callbacks?.onError?.(d.reason, d.modules);
                reject(new Error(d.reason));
            };

            const onSessionFailed = (d: NovaCoreEvents["session_failed"]) => {
                if (d.sessionId !== sessionId) return;
                cleanup();
                callbacks?.onError?.(d.reason, {});
                reject(new Error(d.reason));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.ws.off("tasks_ready", onTasksReady);
                this.ws.off("session_progress", onProgress);
                this.ws.off("module_status", onModule);
                this.ws.off("install_completed", onCompleted);
                this.ws.off("install_failed", onFailed);
                this.ws.off("session_failed", onSessionFailed);
                this.ws.off("modloader_processor_log", onProcessorLog);
            };

            this.ws.on("tasks_ready", onTasksReady);
            this.ws.on("session_progress", onProgress);
            this.ws.on("module_status", onModule);
            this.ws.on("install_completed", onCompleted);
            this.ws.on("install_failed", onFailed);
            this.ws.on("session_failed", onSessionFailed);
            this.ws.on("modloader_processor_log", onProcessorLog);
        });
    }
}

function buildMessage(d: NovaCoreEvents["session_progress"]): string {
    const done = d.completedFiles + d.skippedFiles;
    const total = d.totalFiles;
    if (total === 0) return "Preparing...";
    return `${done} / ${total} files (${d.overallPercent}%)`;
}
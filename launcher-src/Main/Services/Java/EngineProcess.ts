import { spawn, ChildProcess, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { getStepLauncherFolderPath } from "../../Manager/FolderManager.js";

export interface EngineProcessOptions {
    jar: string;
    java?: string;
    httpPort?: number;
    wsPort?: number;
    instancesDir?: string;
    logDir?: string;
    logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
    launcherName?: string;
    threads?: number;
    startupTimeoutMs?: number;
    verbose?: boolean;
    jvmArgs?: string[];
    autoKillOnExit?: boolean;
    autoRestart?: boolean;
    maxRestarts?: number;
    restartDelay?: number;
    portRetryLimit?: number;
    onStateChange?: (state: EngineProcessState, data?: any) => void;
}

export type EngineProcessState = "starting" | "running" | "stopping" | "stopped" | "crashed" | "restarting";

export interface EngineProcessInfo {
    pid: number;
    token: string;
    httpUrl: string;
    wsUrl: string;
    httpPort: number;
    wsPort: number;
}

export class EngineProcess extends EventEmitter {
    private opts: Required<EngineProcessOptions>;
    private child: ChildProcess | null = null;
    private _info: EngineProcessInfo | null = null;
    private exitHandler: (() => void) | null = null;
    private restartCount = 0;
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private currentHttpPort: number;
    private currentWsPort: number;
    private _state: EngineProcessState = "stopped";

    constructor(opts: EngineProcessOptions) {
        super();
        this.opts = {
            java: "java",
            httpPort: 7878,
            wsPort: 7879,
            instancesDir: resolve("instances"),
            logDir: "",
            logLevel: "INFO",
            launcherName: "StepLauncher",
            threads: 32,
            startupTimeoutMs: 15000,
            verbose: false,
            jvmArgs: [],
            autoKillOnExit: true,
            autoRestart: false,
            maxRestarts: 3,
            restartDelay: 2000,
            portRetryLimit: 10,
            onStateChange: () => {},
            ...opts,
        };
        if (!this.opts.logDir) {
            this.opts.logDir = resolve(this.opts.instancesDir, "..", "logs");
        }
        this.currentHttpPort = this.opts.httpPort;
        this.currentWsPort = this.opts.wsPort;
    }

    get state(): EngineProcessState { return this._state; }
    get info(): EngineProcessInfo | null { return this._info; }
    get running(): boolean { return !!this.child && !this.child.killed; }

    private setState(state: EngineProcessState, data?: any) {
        this._state = state;
        this.opts.onStateChange(state, data);
        this.emit("state", state, data);
    }

    async start(): Promise<EngineProcessInfo> {
        if (this.child && !this.child.killed) throw new Error("Engine already running");
        this.setState("starting");
        this.restartCount = 0;
        return this._startWithPortRetry();
    }

    private async _startWithPortRetry(retries = 0): Promise<EngineProcessInfo> {
        try {
            const info = await this._startProcess();
            this.setState("running", info);
            return info;
        } catch (err: any) {
            if (err.message?.includes("port already in use") && retries < (this.opts.portRetryLimit || 5)) {
                this.currentHttpPort++;
                this.currentWsPort++;
                this.emit("port_retry", { http: this.currentHttpPort, ws: this.currentWsPort });
                return this._startWithPortRetry(retries + 1);
            }
            throw err;
        }
    }

    private async _startProcess(): Promise<EngineProcessInfo> {
        const { jar, java } = this.opts;
        if (!existsSync(jar)) throw new Error(`JAR not found: ${jar}`);

        const args = [
            ...this.opts.jvmArgs,
            "-jar", jar,
            "--port", String(this.currentHttpPort),
            "--ws-port", String(this.currentWsPort),
            "--threads", String(this.opts.threads),
            "--instances-dir", this.opts.instancesDir,
            "--log-dir", resolve(getStepLauncherFolderPath(),"logs"),
            "--log-level", this.opts.logLevel,
            "--launcher-name", this.opts.launcherName,
        ];

        this.child = spawn(java, args, {
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
        });

        const info = await this.waitForReady();
        this._info = info;

        if (this.opts.verbose) {
            this.child.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
            this.child.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
        }

        if (this.opts.autoKillOnExit) this.setupExitHandlers();
        this.child.once("exit", (code, signal) => this.handleProcessExit(code, signal));

        return info;
    }

    private handleProcessExit(code: number | null, signal: string | null) {
        const crashed = code !== 0 && code !== null;
        if (crashed) {
            this.setState("crashed", { code, signal });
            if (this.opts.autoRestart && this.restartCount < this.opts.maxRestarts) {
                this.scheduleRestart();
            }
        } else {
            this.setState("stopped");
        }
        this._info = null;
        this.child = null;
    }

    private scheduleRestart() {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(async () => {
            this.restartCount++;
            this.setState("restarting", { attempt: this.restartCount });
            try {
                await this.start();
            } catch (err) {
                this.setState("crashed", { error: err });
            }
        }, this.opts.restartDelay);
    }

    async stop(): Promise<void> {
        if (!this.child || this.child.killed) return;
        this.setState("stopping");
        this.removeExitHandlers();
        if (this.restartTimer) clearTimeout(this.restartTimer);

        if (this._info) {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 2000);
                await fetch(`${this._info.httpUrl}/close`, {
                    method: "POST",
                    headers: { "X-Access-Token": this._info.token },
                    signal: ctrl.signal
                });
                clearTimeout(t);
            } catch (e) {}
        }

        return new Promise<void>((res) => {
            const timeout = setTimeout(() => { this.kill(); res(); }, 3000);
            this.child!.once("exit", () => { clearTimeout(timeout); res(); });
            this.child!.kill("SIGTERM");
        });
    }

    kill(): void {
        this.removeExitHandlers();
        if (!this.child || this.child.killed) return;
        const pid = this.child.pid;
        if (pid) {
            try {
                if (process.platform === "win32") {
                    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
                } else {
                    const pgid = -pid;
                    process.kill(pgid, "SIGKILL");
                }
            } catch (e) {
                this.child.kill("SIGKILL");
            }
        }
        this.child = null;
        this._info = null;
        this.setState("stopped");
    }

    async restart(): Promise<EngineProcessInfo> {
        await this.stop();
        return this.start();
    }

    private waitForReady(): Promise<EngineProcessInfo> {
        return new Promise<EngineProcessInfo>((resolve, reject) => {
            const { startupTimeoutMs } = this.opts;
            const child = this.child!;
            let token = "";
            let ready = false;
            let buf = "";

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Engine not ready in ${startupTimeoutMs}ms`));
            }, startupTimeoutMs);

            const cleanup = () => {
                clearTimeout(timeout);
                child.stdout?.removeListener("data", onData);
                child.removeListener("error", onError);
                child.removeListener("exit", onExit);
            };

            const onData = (chunk: Buffer) => {
                buf += chunk.toString("utf8");
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!token && trimmed.startsWith("TOKEN:")) {
                        token = trimmed.slice(6).trim();
                    }
                    if (!ready && trimmed.includes("[Core] Ready") && token) {
                        ready = true;
                        cleanup();
                        resolve({
                            pid: child.pid!,
                            token,
                            httpUrl: `http://localhost:${this.currentHttpPort}`,
                            wsUrl: `ws://localhost:${this.currentWsPort}`,
                            httpPort: this.currentHttpPort,
                            wsPort: this.currentWsPort,
                        });
                    }
                }
            };

            const onError = (err: Error) => {
                cleanup();
                if ((err as any).code === "ENOENT") reject(new Error(`Java not found: ${this.opts.java}`));
                else reject(err);
            };

            const onExit = (code: number | null) => {
                cleanup();
                reject(new Error(`Process exited with code ${code} before ready`));
            };

            child.stdout?.on("data", onData);
            child.once("error", onError);
            child.once("exit", onExit);
        });
    }

    private setupExitHandlers() {
        this.exitHandler = () => this.kill();
        process.once("exit", this.exitHandler);
        process.once("SIGINT", this.exitHandler);
        process.once("SIGTERM", this.exitHandler);
        process.once("SIGHUP", this.exitHandler);
    }

    private removeExitHandlers() {
        if (this.exitHandler) {
            process.off("exit", this.exitHandler);
            process.off("SIGINT", this.exitHandler);
            process.off("SIGTERM", this.exitHandler);
            process.off("SIGHUP", this.exitHandler);
            this.exitHandler = null;
        }
    }
}
// NovaCoreIPC.ts
import { EventEmitter } from 'node:events';
import { ipcMain, BrowserWindow, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    NovaCoreManager,
    type JavaInfo,
    type EngineInfo,
    type OverallProgress
} from './NovaCoreManager.js';
import {
    EngineProcess,
    NovaCoreClient,
    type EngineProcessState,
    type EngineProcessInfo,
    type LaunchHandle,
    type InstallCallbacks,
    type LaunchRequest,
    type InstallRequest,
    type LaunchCallbacks
} from '../../Services/Java/index.js';
import { getStepLauncherFolderPath } from '../FolderManager.js';

export interface NovaCoreIPCStatus {
    initialized: boolean;
    engineRunning: boolean;
    clientConnected: boolean;
    javaInfo: JavaInfo | null;
    engineInfo: EngineInfo | null;
    error?: string;
}

export class NovaCoreIPC extends EventEmitter {
    private manager: NovaCoreManager;
    private engineProcess: EngineProcess | null = null;
    private client: NovaCoreClient | null = null;
    private _initialized = false;
    private _initializing = false;
    private currentLaunchHandle: LaunchHandle | null = null;
    private launcherVersion: string;

    constructor() {
        super();
        this.launcherVersion = app.getVersion();
        this.manager = new NovaCoreManager({
            javaVersion: 25,
            javaImageType: 'jdk',
            onProgress: (progress) => this.handleManagerProgress(progress),
            onLog: (msg) => this.handleManagerLog(msg),
            onStep: (step) => this.handleManagerStep(step),
        });
        this.on('error', (err) => {
            console.error('[NovaCoreIPC] Unhandled error:', err);
        });
    }

    private normalizeInstancePath(customPath?: string): string {
        const root = getStepLauncherFolderPath();
        if (!customPath) return root;
        if (path.isAbsolute(customPath)) return customPath;
        return path.join(root, customPath);
    }

    async getStatus(): Promise<NovaCoreIPCStatus> {
        const [javaInfo, engineInfo] = await Promise.all([
            this.manager.getJavaInfo(),
            this.manager.getEngineInfo()
        ]);
        return {
            initialized: this._initialized,
            engineRunning: this.engineProcess?.running ?? false,
            clientConnected: this.client?.isConnected ?? false,
            javaInfo,
            engineInfo,
        };
    }

    async initialize(): Promise<void> {
        if (this._initialized || this._initializing) return;
        this._initializing = true;
        try {
            await this.manager.ensureDirectories();
            const verification = await this.manager.verifyInstallation();
            this.emit('verification', verification);
            this._initialized = true;
            this.emit('initialized');
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.emit('error', error);
            throw err;
        } finally {
            this._initializing = false;
        }
    }

    async startEngine(): Promise<void> {
        const javaInfo = await this.manager.getJavaInfo();
        const engineInfo = await this.manager.getEngineInfo();
        if (!javaInfo) throw new Error('Java not installed. Call downloadComponents first.');
        if (!engineInfo) throw new Error('Engine not installed. Call downloadComponents first.');

        let javaExec = javaInfo.executablePath;
        if (process.platform === 'win32') {
            const javawPath = javaExec.replace('java.exe', 'javaw.exe');
            try {
                await fs.access(javawPath);
                javaExec = javawPath;
            } catch {
                // fallback to java.exe
            }
        }

        await this.startEngineProcess(engineInfo.jarPath, javaExec);
    }

    private async startEngineProcess(jarPath: string, javaPath: string): Promise<void> {
        if (this.engineProcess?.running) return;
        this.engineProcess = new EngineProcess({
            jar: jarPath,
            java: javaPath,
            autoRestart: true,
            maxRestarts: 3,
            restartDelay: 2000,
            portRetryLimit: 10,
            verbose: false,
            onStateChange: (state, data) => this.handleEngineState(state, data),
        });
        const info = await this.engineProcess.start();
        this.emit('engine-started', info);
        await this.connectClient(info);
    }

    private async connectClient(info: EngineProcessInfo): Promise<void> {
        this.client = new NovaCoreClient({
            httpUrl: info.httpUrl,
            wsUrl: info.wsUrl,
            token: info.token,
            autoReconnect: true,
            onStatusChange: (status, error) => {
                this.emit('ws-status', status, error);
                if (status === 'connected') this.emit('client-connected');
                if (status === 'failed') this.emit('client-failed', error);
            },
        });
        await this.client.connect();
        this.setupClientListeners();
    }

    private setupClientListeners(): void {
        if (!this.client) return;
        this.client.onAny((event, data) => {
            this.emit('client-event', event, data);
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send(`nova-core:${event}`, data);
            });
        });
    }

    private handleEngineState(state: EngineProcessState, data?: any): void {
        this.emit('engine-state', state, data);
        if (state === 'crashed') {
            const errMsg = `Engine crashed: ${JSON.stringify(data)}`;
            this.emit('error', new Error(errMsg));
        }
    }

    private handleManagerProgress(progress: OverallProgress): void {
        this.emit('download-progress', progress);
    }
    private handleManagerLog(msg: string): void {
        this.emit('log', msg);
    }
    private handleManagerStep(step: string): void {
        this.emit('step', step);
    }

    async restartEngine(): Promise<void> {
        if (!this.engineProcess) throw new Error('No engine process');
        await this.engineProcess.restart();
    }

    async stopEngine(): Promise<void> {
        if (this.currentLaunchHandle) {
            await this.currentLaunchHandle.kill();
            this.currentLaunchHandle = null;
        }
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
        if (this.engineProcess) {
            await this.engineProcess.stop();
            this.engineProcess = null;
        }
    }

    async downloadComponents(): Promise<void> {
        await this.manager.downloadAll();
        this.emit('components-ready');
    }

    async checkEngineUpdate(): Promise<{ hasUpdate: boolean; latestVersion: string; currentVersion: string }> {
        return this.manager.checkEngineUpdate();
    }

    async updateEngine(): Promise<void> {
        await this.manager.updateEngine();
        const engineInfo = await this.manager.getEngineInfo();
        const javaInfo = await this.manager.getJavaInfo();
        if (engineInfo && javaInfo && this.engineProcess?.running) {
            await this.stopEngine();
            await this.startEngineProcess(engineInfo.jarPath, javaInfo.executablePath);
        }
    }

    async install(req: InstallRequest, callbacks?: InstallCallbacks): Promise<void> {
        if (!this.client) throw new Error('Client not connected');
        const normalizedReq = {
            ...req,
            instancePath: this.normalizeInstancePath(req.instancePath),
            launcher: req.launcher ?? { name: 'StepLauncher', version: this.launcherVersion }
        };
        return this.client.install(normalizedReq, callbacks);
    }

    async launch(req: LaunchRequest, callbacks?: LaunchCallbacks): Promise<{ launchId: string }> {
        if (!this.client) throw new Error('Client not connected');
        const normalizedReq = {
            ...req,
            instancePath: this.normalizeInstancePath(req.instancePath),
            launcher: req.launcher ?? { name: 'StepLauncher', version: this.launcherVersion }
        };
        const handle = await this.client.launch(normalizedReq, callbacks);
        this.currentLaunchHandle = handle;
        return { launchId: handle.launchId };
    }

    async killInstance(launchId: string): Promise<void> {
        if (!this.client) throw new Error('Client not connected');
        return this.client.killInstance(launchId);
    }

    async getRunningInstances() {
        if (!this.client) throw new Error('Client not connected');
        return this.client.getRunningInstances();
    }

    async getInstancesList() {
        if (!this.client) throw new Error('Client not connected');
        return this.client.getInstancesList();
    }

    async createInstance(req: any) {
        if (!this.client) throw new Error('Client not connected');
        return this.client.createInstance(req);
    }

    async updateInstance(id: string, req: any) {
        if (!this.client) throw new Error('Client not connected');
        return this.client.updateInstance(id, req);
    }

    async deleteInstance(id: string) {
        if (!this.client) throw new Error('Client not connected');
        return this.client.deleteInstance(id);
    }

    async getEngineInfo() {
        if (!this.client) throw new Error('Client not connected');
        return this.client.getEngineInfo();
    }

    async getJavaInfo() {
        return this.manager.getJavaInfo();
    }
}

let ipcInstance: NovaCoreIPC | null = null;

export async function initNovaCoreIPC(): Promise<NovaCoreIPC> {
    if (ipcInstance) return ipcInstance;
    ipcInstance = new NovaCoreIPC();
    await ipcInstance.initialize();
    registerIPCHandlers(ipcInstance);
    return ipcInstance;
}

function registerIPCHandlers(ipc: NovaCoreIPC) {
    ipcMain.handle('nova-core:status', () => ipc.getStatus());
    ipcMain.handle('nova-core:start-engine', () => ipc.startEngine());
    ipcMain.handle('nova-core:restart-engine', () => ipc.restartEngine());
    ipcMain.handle('nova-core:stop-engine', () => ipc.stopEngine());
    ipcMain.handle('nova-core:download-components', () => ipc.downloadComponents());
    ipcMain.handle('nova-core:check-update', () => ipc.checkEngineUpdate());
    ipcMain.handle('nova-core:update-engine', () => ipc.updateEngine());
    ipcMain.handle('nova-core:install', async (_, req: InstallRequest) => {
        return new Promise<void>((resolve, reject) => {
            ipc.install(req, {
                onStart: (totalFiles, totalBytes) => {
                    BrowserWindow.getAllWindows()[0]?.webContents.send('nova-core:install-start', { totalFiles, totalBytes });
                },
                onProgress: (progress) => {
                    BrowserWindow.getAllWindows()[0]?.webContents.send('nova-core:install-progress', progress);
                },
                onComplete: (version, modloader) => {
                    BrowserWindow.getAllWindows()[0]?.webContents.send('nova-core:install-complete', { version, modloader });
                    resolve();
                },
                onError: (reason) => {
                    BrowserWindow.getAllWindows()[0]?.webContents.send('nova-core:install-error', reason);
                    reject(new Error(reason));
                },
            }).catch(reject);
        });
    });
    ipcMain.handle('nova-core:launch', async (_, req: LaunchRequest) => {
        return ipc.launch(req);
    });
    ipcMain.handle('nova-core:kill-instance', (_, launchId: string) => ipc.killInstance(launchId));
    ipcMain.handle('nova-core:running-instances', () => ipc.getRunningInstances());
    ipcMain.handle('nova-core:instances-list', () => ipc.getInstancesList());
    ipcMain.handle('nova-core:create-instance', (_, req) => ipc.createInstance(req));
    ipcMain.handle('nova-core:update-instance', (_, id, req) => ipc.updateInstance(id, req));
    ipcMain.handle('nova-core:delete-instance', (_, id) => ipc.deleteInstance(id));
    ipcMain.handle('nova-core:engine-info', () => ipc.getEngineInfo());
}

export function getNovaCoreIPC(): NovaCoreIPC | null {
    return ipcInstance;
}
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { EventEmitter } from 'node:events';
import { FolderManager } from '../../Utils/Folder.js';
import { ArgumentsBuilder } from '../../Modules/Core/Runtime/Argument.js';
import { StepLauncherLogger } from '../../Modules/Logger/StepLauncherLogger.js';
import type { LauncherOptions, LaunchResult } from '../../Modules/Core/Runtime/Types/Arguments.js';
import { MemoryHistory } from './MemoryHistory.js';
import { JavaRuntimeManager } from './JavaRuntimeManager.js';
import { discordRPC } from '../../Modules/App/DiscordRPC.js';

interface RunningInstance {
    pid: number;
    kill: () => boolean;
    version: string;
    launchTime: number;
    emitter: EventEmitter;
}

class MinecraftLauncherService {
    private folderManager: FolderManager;
    private logger: StepLauncherLogger;
    private history: MemoryHistory;
    private javaRuntimeManager: JavaRuntimeManager;
    private runningInstances: Map<number, RunningInstance> = new Map();
    private versionInstances: Map<string, number> = new Map();

    constructor() {
        this.folderManager = new FolderManager();
        this.logger = new StepLauncherLogger({
            level: 'debug',
            prettyPrint: true,
            colors: true
        });
        this.history = new MemoryHistory(1000);
        this.javaRuntimeManager = new JavaRuntimeManager(this.folderManager, this.history);
        
        this.initializeIPC();
        this.initializeJavaRuntimeManager();
    }

    private async initializeJavaRuntimeManager(): Promise<void> {
        try {
            await this.javaRuntimeManager.downloadAllJson();
            this.history.info('LaunchIPC', 'Java Runtime Manager inicializado con manifest');
            this.logger.info('[LaunchIPC] Manifest de Java descargado');
        } catch (error) {
            this.history.warn('LaunchIPC', 'Error al descargar manifest, se usará Java del sistema o caché antiguo', error);
            this.logger.warn('[LaunchIPC] Error al descargar manifest:', error);
        }
    }

    private initializeIPC(): void {
        ipcMain.handle('minecraft:launch', async ( event: IpcMainInvokeEvent, data: { version: string; options?: Partial<LauncherOptions> } ) => {
            try {
                this.history.info('LaunchIPC', `Iniciando Minecraft ${data.version}`);
                this.logger.info(`[LaunchIPC] Iniciando Minecraft ${data.version}`);
                
                const result = await this.launchMinecraft(data.version, data.options || {});
                
                event.sender.send('minecraft:launched', {
                    pid: result.pid,
                    version: data.version,
                    status: 'started'
                });
                
                return { success: true, pid: result.pid };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.history.error('LaunchIPC', `Error al lanzar Minecraft: ${errorMessage}`);
                this.logger.error(`[LaunchIPC] Error al lanzar Minecraft:`, error);
                
                event.sender.send('minecraft:error', {
                    type: 'launch-failed',
                    error: errorMessage
                });
                
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:kill', async ( event: IpcMainInvokeEvent, data: { version: string; pid?: number } ) => {
            try {
                let killed = false;
                let killedPid: number | null = null;
                
                const pidFromVersion = this.versionInstances.get(data.version);
                if (pidFromVersion) {
                    const instance = this.runningInstances.get(pidFromVersion);
                    if (instance) {
                        this.history.info('LaunchIPC', `Matando proceso ${pidFromVersion}`);
                        this.logger.info(`[LaunchIPC] Matando proceso ${pidFromVersion}`);
                        
                        killed = instance.kill();
                        killedPid = pidFromVersion;
                        this.cleanupInstance(pidFromVersion);
                    }
                }
                
                if (data.pid && !killed) {
                    const instance = this.runningInstances.get(data.pid);
                    if (instance) {
                        this.history.info('LaunchIPC', `Matando proceso específico ${data.pid}`);
                        this.logger.info(`[LaunchIPC] Matando proceso específico ${data.pid}`);
                        
                        killed = instance.kill();
                        killedPid = data.pid;
                        this.cleanupInstance(data.pid);
                    }
                }
                
                if (killed && killedPid) {
                    event.sender.send('minecraft:exit', {
                        pid: killedPid,
                        version: data.version,
                        code: 0,
                        signal: 'SIGTERM',
                        message: 'Proceso terminado por el usuario'
                    });
                }
                
                return { success: killed };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.history.error('LaunchIPC', `Error al matar proceso: ${errorMessage}`);
                this.logger.error(`[LaunchIPC] Error al matar proceso:`, error);
                
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:list-versions', async () => {
            try {
                const versions = await this.folderManager.getMinecraftVersions();
                return { success: true, versions };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.history.error('LaunchIPC', `Error al listar versiones: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:version-info', async ( event: IpcMainInvokeEvent, data: { version: string } ) => {
            try {
                const info = await this.folderManager.getVersionInfo(data.version);
                return { success: true, info };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.history.error('LaunchIPC', `Error al obtener información de versión: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:get-history', async (
            event: IpcMainInvokeEvent,
            data: { 
                level?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
                source?: string;
                limit?: number;
                search?: string;
                tags?: string[];
            }
        ) => {
            try {
                let entries = this.history.getAll();
                
                if (data.level) entries = entries.filter(e => e.level === data.level);
                if (data.source) entries = entries.filter(e => e.source === data.source);
                if (data.search) {
                    const searchLower = data.search.toLowerCase();
                    entries = entries.filter(e => 
                        e.message.toLowerCase().includes(searchLower) ||
                        e.source.toLowerCase().includes(searchLower)
                    );
                }
                if (data.tags && data.tags.length > 0) {
                    entries = entries.filter(e => 
                        e.tags?.some(tag => data.tags!.includes(tag))
                    );
                }
                if (data.limit && data.limit > 0) entries = entries.slice(0, data.limit);
                
                return { success: true, entries };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:java-runtimes', async () => {
            try {
                const installed = await this.javaRuntimeManager.getInstalledJavaRuntimes();
                return { success: true, installed };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:update-java-manifest', async () => {
            try {
                this.history.info('LaunchIPC', 'Actualizando manifest de Java');
                this.logger.info('[LaunchIPC] Actualizando manifest de Java');
                
                await this.javaRuntimeManager.downloadAllJson(true);
                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        });

        ipcMain.handle('minecraft:find-java-for-version', async ( event: IpcMainInvokeEvent, data: { version: string } ) => {
            try {
                const versionInfo = await this.folderManager.getVersionInfo(data.version);
                
                if (!versionInfo.javaVersion) {
                    return { 
                        success: true, 
                        java: { 
                            name: 'system-java',
                            path: 'java',
                            component: 'system',
                            installed: true,
                            reason: 'No especifica Java'
                        }
                    };
                }

                const javaResult = await this.javaRuntimeManager.findJavaForVersion({
                    component: versionInfo.javaVersion.component,
                    majorVersion: versionInfo.javaVersion.majorVersion
                });

                return { 
                    success: true, 
                    java: {
                        name: javaResult.javaName,
                        path: javaResult.javaPath,
                        component: versionInfo.javaVersion.component,
                        installed: javaResult.isInstalled,
                        reason: javaResult.isInstalled ? 'Instalado' : 'No instalado, usando Java del sistema'
                    }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        });
    }

    private async launchMinecraft( version: string, userOptions: Partial<LauncherOptions> ): Promise<LaunchResult> {
        this.history.info('LaunchIPC', `Iniciando Minecraft ${version}`);

        const gameRoot = this.folderManager.getAppConfigPath();
        
        const versionExists = await this.folderManager.versionExists(version);
        if (!versionExists) {
            const errorMsg = `La versión ${version} no existe`;
            this.history.error('LaunchIPC', errorMsg);
            throw new Error(errorMsg);
        }

        let javaPath = userOptions.java || 'java';
        let javaName = 'system-java';
        let javaComponent = 'system';

        try {
            const versionInfo = await this.folderManager.getVersionInfo(version);
            
            if (versionInfo.javaVersion && versionInfo.javaVersion.component) {
                this.history.info('LaunchIPC', 
                    `Versión ${version} requiere Java: ${versionInfo.javaVersion.component}`
                );
                
                const javaResult = await this.javaRuntimeManager.findJavaForVersion({
                    component: versionInfo.javaVersion.component,
                    majorVersion: versionInfo.javaVersion.majorVersion
                });

                javaPath = javaResult.javaPath;
                javaName = javaResult.javaName;
                javaComponent = versionInfo.javaVersion.component;
                
                this.history.info('LaunchIPC', 
                    `Java seleccionado: ${javaName} (instalado: ${javaResult.isInstalled})`
                );
            } else {
                this.history.info('LaunchIPC', 'Versión no especifica Java, usando el proporcionado');
            }
        } catch (error) {
            this.history.warn('LaunchIPC', `Error al obtener Java: ${error}, usando Java del sistema`);
        }

        const defaultUserOptions = {
            name: 'Player',
            uuid: '00000000-0000-0000-0000-000000000000',
            access_token: '0',
            user_profiles: '{}',
            meta: { online: false, type: 'mojang' }
        };

        const launcherOptions: LauncherOptions = {
            gameRoot,
            version,
            java: javaPath,
            memory: userOptions.memory || { min: '2G', max: '4G' },
            window: userOptions.window,
            override: userOptions.override,
            user: { ...defaultUserOptions, ...userOptions.user },
            features: userOptions.features,
            launcherName: 'StepLauncher',
            launcherVersion: '1.0.0',
            enforceSandbox: userOptions.enforceSandbox ?? false,
            enableDebug: userOptions.enableDebug ?? true,
            enableSpeedMetrics: userOptions.enableSpeedMetrics ?? true,
            JVM_ARGS: userOptions.JVM_ARGS ?? [],
            MC_ARGS: userOptions.MC_ARGS ?? {}
        };

        this.history.debug('LaunchIPC', `Opciones: versión=${version}, java=${javaPath}`);

        const launchResult = await ArgumentsBuilder(launcherOptions);

        this.setupGameListeners(launcherOptions, launchResult);

        if (launchResult.pid) {
            const instance: RunningInstance = {
                pid: launchResult.pid,
                kill: launchResult.kill,
                version,
                launchTime: Date.now(),
                emitter: launchResult.emitter
            };

            this.runningInstances.set(launchResult.pid, instance);
            this.versionInstances.set(version, launchResult.pid);
            discordRPC.pause();
            this.history.info('LaunchIPC', `Minecraft ${version} iniciado con PID: ${launchResult.pid}`);
        }

        return launchResult;
    }

    private setupGameListeners( options: LauncherOptions, launchResult: LaunchResult ): void {
        const emitter = launchResult.emitter;
        const pid = launchResult.pid;

        emitter.on('stdout', (data: any) => {
            const strData = typeof data === 'string' ? data : String(data);
            const trimmed = strData.trim();
            if (trimmed.length === 0) return;
            
            if (trimmed.includes('ERROR') || trimmed.includes('Exception') || trimmed.includes('Crash')) {
                this.history.error('Minecraft', trimmed);
                this.logger.error(`[Minecraft] ${trimmed}`);
            }
        });

        emitter.on('stderr', (data: any) => {
            const strData = typeof data === 'string' ? data : String(data);
            const trimmed = strData.trim();
            if (trimmed.length === 0) return;
            
            this.history.warn('Minecraft', trimmed);
            this.logger.warn(`[Minecraft] ${trimmed}`);
        });

        emitter.on('exit', (data: any) => {
            this.history.info('Minecraft', `Proceso terminado - Código: ${data.code}`);
            discordRPC.resume();
            if (pid) this.cleanupInstance(pid);
        });

        emitter.on('error', (error: any) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.history.error('Minecraft', `Error: ${errorMessage}`);
            
            if (pid) this.cleanupInstance(pid);
        });
    }

    private cleanupInstance(pid: number): void {
        const instance = this.runningInstances.get(pid);
        if (instance) {
            this.versionInstances.delete(instance.version);
            this.runningInstances.delete(pid);
            this.history.info('LaunchIPC', `Instancia limpiada - PID: ${pid}`);
        }
    }

    public getRunningInstances(): Map<number, RunningInstance> {
        return new Map(this.runningInstances);
    }

    public getHistory(): MemoryHistory {
        return this.history;
    }

    public getJavaRuntimeManager(): JavaRuntimeManager {
        return this.javaRuntimeManager;
    }

    public killAllInstances(): void {
        this.history.info('LaunchIPC', 'Matando todas las instancias');
        
        for (const [pid, instance] of this.runningInstances) {
            try {
                instance.kill();
                this.cleanupInstance(pid);
            } catch (error) {
                this.history.error('LaunchIPC', `Error al matar instancia ${pid}:`, error);
            }
        }
    }
}

let launcherService: MinecraftLauncherService | null = null;

export function initializeMinecraftLauncher(): MinecraftLauncherService {
    if (!launcherService) {
        launcherService = new MinecraftLauncherService();
    }
    return launcherService;
}

export function getMinecraftLauncher(): MinecraftLauncherService | null {
    return launcherService;
}

export function getHistoryInstance(): MemoryHistory | null {
    return launcherService?.getHistory() || null;
}

export function getJavaRuntimeManagerInstance(): JavaRuntimeManager | null {
    return launcherService?.getJavaRuntimeManager() || null;
}
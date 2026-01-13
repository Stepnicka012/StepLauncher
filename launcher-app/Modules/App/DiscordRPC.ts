import { Client } from 'discord-rpc';
import { ipcMain, shell } from 'electron';

export interface PresenceOptions {
    details: string;
    state: string;
    startTimestamp?: number;
    endTimestamp?: number;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
}

export class DiscordRPC {
    private client: Client | null = null;
    private isConnected: boolean = false;
    private isPaused: boolean = false;
    private currentPresence: PresenceOptions | null = null;
    private readonly clientId = '1438239391666405396';
    
    constructor() {
        this.setupIpcHandlers();
    }
    
    private setupIpcHandlers(): void {
        ipcMain.handle('discord-rpc-connect', async () => {
            return await this.connect();
        });
        
        ipcMain.handle('discord-rpc-update', async (_, presence: PresenceOptions) => {
            await this.updatePresence(presence);
        });
        
        ipcMain.handle('discord-rpc-pause', () => {
            this.pause();
        });
        
        ipcMain.handle('discord-rpc-resume', async () => {
            await this.resume();
        });
        
        ipcMain.handle('discord-rpc-shutdown', async () => {
            await this.shutdown();
        });
        
        ipcMain.handle('discord-rpc-status', () => {
            return this.getStatus();
        });
        
        ipcMain.on('open-repository', () => {
            this.openRepository();
        });
    }
    
    async connect(): Promise<boolean> {
        try {
            if (this.isConnected) return true;
            
            this.client = new Client({ transport: 'ipc' });
            
            this.client.on('ready', () => {
                this.isConnected = true;
                console.log('[DiscordRPC] Conectado a Discord');
            });
            
            await this.client.login({ clientId: this.clientId });
            return true;
        } catch (error) {
            console.error('[DiscordRPC] Error al conectar:', error);
            return false;
        }
    }
    
    async updatePresence(options: PresenceOptions): Promise<void> {
        if (!this.isConnected || !this.client || this.isPaused) return;
        
        try {
            const presenceData = {
                ...options,
                largeImageKey: options.largeImageKey,
                largeImageText: options.largeImageText || 'StepLauncher',
                buttons: [
                    {
                        label: 'Ver Repositorio',
                        url: 'https://github.com/stepnicka012/StepLauncher'
                    },
                ],
                instance: false
            };
            
            this.currentPresence = options;
            await this.client.setActivity(presenceData);
        } catch (error) {
            console.error('[DiscordRPC] Error al actualizar presencia:', error);
        }
    }
    
    pause(): void {
        this.isPaused = true;
        if (this.client && this.isConnected) {
            this.client.clearActivity().catch(console.error);
        }
    }
    
    async resume(): Promise<void> {
        this.isPaused = false;
        if (this.currentPresence && this.client && this.isConnected) {
            await this.updatePresence(this.currentPresence);
        }
    }
    
    async shutdown(): Promise<void> {
        try {
            if (this.client) {
                await this.client.clearActivity();
                await this.client.destroy();
            }
        } catch (error) {
            console.error('[DiscordRPC] Error al apagar:', error);
        } finally {
            this.client = null;
            this.isConnected = false;
            this.isPaused = false;
            this.currentPresence = null;
        }
    }
    
    getStatus() {
        return {
            isConnected: this.isConnected,
            isPaused: this.isPaused,
            currentPresence: this.currentPresence
        };
    }
    
    openRepository(): void {
        shell.openExternal('https://github.com/tu-usuario/tu-launcher');
    }
}

export const discordRPC = new DiscordRPC();
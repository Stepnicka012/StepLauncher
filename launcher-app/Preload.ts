import { contextBridge, ipcRenderer, shell } from 'electron';
import { FolderManager } from "./Utils/Folder.js";
import type { DownloadManagerOptions, DownloadEventCallback, DownloadEvent, DownloadStats } from './Types/App/Preload';

const Folder = new FolderManager();

const minecraftLaunch = {
	launch: (version: string, options?: {}) =>  ipcRenderer.invoke('minecraft:launch', { version, ...options }),
	kill: (version: string) =>  ipcRenderer.invoke('minecraft:kill', { version }),
	listVersions: () =>  ipcRenderer.invoke('minecraft:list-versions'),
	getVersionInfo: (version: string) =>  ipcRenderer.invoke('minecraft:version-info', { version }),
    getHistory: (options?: { level?: string; source?: string; limit?: number; search?: string }) => ipcRenderer.invoke('minecraft:get-history', options),
    getHistoryStats: () => ipcRenderer.invoke('minecraft:history-stats'),
    clearHistory: () => ipcRenderer.invoke('minecraft:clear-history'),
    getJavaRuntimes: () => ipcRenderer.invoke('minecraft:java-runtimes'),
    updateJavaManifest: () => ipcRenderer.invoke('minecraft:update-java-manifest'),
    
	onStatus: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:status', (_, data) => callback(data)),
	onProgress: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:progress', (_, data) => callback(data)),
	onStdout: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:stdout', (_, data) => callback(data)),
	onStderr: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:stderr', (_, data) => callback(data)),
	onExit: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:exit', (_, data) => callback(data)),
	onError: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:error', (_, data) => callback(data)),
	onLaunched: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:launched', (_, data) => callback(data)),
	onPreparing: (callback: (data: any) => void) =>  ipcRenderer.on('minecraft:preparing', (_, data) => callback(data)),
	removeAllListeners: (channel: string) =>  ipcRenderer.removeAllListeners(channel),
};

const minecraftDownloaders = {
	calculateBytes: (options: DownloadManagerOptions) =>  ipcRenderer.invoke("minecraft:calculate-bytes", options),
	startDownload: (options: DownloadManagerOptions) =>  ipcRenderer.invoke("minecraft:start-download", options),
	pauseDownload: () =>  ipcRenderer.invoke("minecraft:pause-download"),
	resumeDownload: () =>  ipcRenderer.invoke("minecraft:resume-download"),
	stopDownload: () =>  ipcRenderer.invoke("minecraft:stop-download"),
	getStats: (): Promise<{ success: boolean; stats?: DownloadStats; error?: string }> =>  ipcRenderer.invoke("minecraft:get-stats"),
	onDownloadEvent: (callback: DownloadEventCallback) => { const listener = (_: unknown, data: DownloadEvent) => callback(data);
		ipcRenderer.on("minecraft:download-event", listener);
		return () => ipcRenderer.removeListener("minecraft:download-event", listener);
	}
};

contextBridge.exposeInMainWorld('minecraftLaunch', minecraftLaunch);
contextBridge.exposeInMainWorld('minecraftDownloaders', minecraftDownloaders);

contextBridge.exposeInMainWorld('titlebar', {
	minimize: () => ipcRenderer.send('window:minimize'),
	toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
	close: () => ipcRenderer.send('window:close'),
	setCanClose: (value: boolean) => ipcRenderer.invoke('window:set-can-close', value),
	onCloseBlocked: (callback: () => void) => ipcRenderer.on('window:close-blocked', callback),
	onWindowState: (callback: (state: any) => void) => {
		ipcRenderer.on('window:state', (_event, state) => {
			callback(state);
		});
	}
});

contextBridge.exposeInMainWorld('ElectronAPI', {
	openExternal: (url: string) => shell.openExternal(url),
	getVersions: () => Folder.getMinecraftVersions()
});

contextBridge.exposeInMainWorld('FileDialog', {
	openBackgroundFile: async (type?: 'image' | 'video' | 'both') => {
		return await ipcRenderer.invoke('dialog:openBackgroundFile', { type });
	},

	openJavaExecutable: async () => {
		return await ipcRenderer.invoke('dialog:openJavaExecutable');
	},

	openFile: async (options?: {
		title?: string,
		filters?: Array<{ name: string, extensions: string[] }>,
		properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
	}) => {
		return await ipcRenderer.invoke('dialog:openFile', options);
	}
});

contextBridge.exposeInMainWorld('Config', {
	get: (path: string, defaultValue?: any) => ipcRenderer.invoke('config:get', path, defaultValue),
	set: (path: string, value: any) => ipcRenderer.invoke('config:set', path, value),
	delete: (path: string) => ipcRenderer.invoke('config:delete', path),
	getAll: () => ipcRenderer.invoke('config:getAll'),
	reset: () => ipcRenderer.invoke('config:reset'),
	meta: () => ipcRenderer.invoke('config:meta')
});
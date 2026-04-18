import { contextBridge, ipcRenderer } from 'electron';

const eventChannels = [
    'nova-core:install-start', 'nova-core:install-progress', 'nova-core:install-complete', 'nova-core:install-error',
    'nova-core:log', 'nova-core:step', 'nova-core:download-progress', 'nova-core:engine-state', 'nova-core:ws-status'
];

contextBridge.exposeInMainWorld('ElectronAPI', {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
});

contextBridge.exposeInMainWorld('NovaCoreAPI', {
    getStatus: () => ipcRenderer.invoke('nova-core:status'),
    startEngine: () => ipcRenderer.invoke('nova-core:start-engine'),
    restartEngine: () => ipcRenderer.invoke('nova-core:restart-engine'),
    stopEngine: () => ipcRenderer.invoke('nova-core:stop-engine'),
    downloadComponents: () => ipcRenderer.invoke('nova-core:download-components'),
    checkUpdate: () => ipcRenderer.invoke('nova-core:check-update'),
    updateEngine: () => ipcRenderer.invoke('nova-core:update-engine'),
    install: (req: any) => ipcRenderer.invoke('nova-core:install', req),
    launch: (req: any) => ipcRenderer.invoke('nova-core:launch', req),
    killInstance: (launchId: string) => ipcRenderer.invoke('nova-core:kill-instance', launchId),
    getRunningInstances: () => ipcRenderer.invoke('nova-core:running-instances'),
    getInstancesList: () => ipcRenderer.invoke('nova-core:instances-list'),
    createInstance: (req: any) => ipcRenderer.invoke('nova-core:create-instance', req),
    updateInstance: (id: string, req: any) => ipcRenderer.invoke('nova-core:update-instance', id, req),
    deleteInstance: (id: string) => ipcRenderer.invoke('nova-core:delete-instance', id),
    getEngineInfo: () => ipcRenderer.invoke('nova-core:engine-info'),
    on: (channel: string, callback: (...args: any[]) => void) => {
        if (eventChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => callback(...args));
        }
    },
    off: (channel: string, callback: (...args: any[]) => void) => {
        if (eventChannels.includes(channel)) {
            ipcRenderer.off(channel, callback);
        }
    },
});
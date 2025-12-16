import { contextBridge, ipcRenderer, shell } from 'electron';
import LangManager from './Modules/App/LangManager.js';

const langManager = LangManager.init();

contextBridge.exposeInMainWorld('ElectronAPI', {
    controlWindow: (action: string) => ipcRenderer.invoke('window-control', action),
    openExternal: (url:string) => shell.openExternal(url),
    getTotalRAM: () => ipcRenderer.invoke('get-system-ram')
});

contextBridge.exposeInMainWorld('LangAPI', {
    applyToDOM: () => langManager.applyToDOM(),
    getText: (key: string) => langManager.getText(key),
    setLang: (lang: string) => langManager.setLang(lang),
    getCurrentLang: () => langManager.getCurrentLang(),
    reloadLang: () => langManager.loadLang(langManager.getCurrentLang()),
});

contextBridge.exposeInMainWorld("StepLauncherLogger", {
    trace: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:trace", message, args),
    debug: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:debug", message, args),
    info: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:info", message, args),
    warn: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:warn", message, args),
    error: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:error", message, args),
    fatal: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:fatal", message, args),
    log: (message: string, ...args: unknown[]) => ipcRenderer.invoke("stepLauncherLogger:log", message, args),
    getMemoryHistory: () => ipcRenderer.invoke("stepLauncherLogger:getHistory")
});

if (typeof document !== 'undefined') {
    const apply = () => langManager.applyToDOM();
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', apply); }
    else { apply(); }
}

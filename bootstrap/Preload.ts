import { contextBridge, ipcRenderer } from 'electron';
import LangManager from './LangManager.js';

const langManager = LangManager.init();

contextBridge.exposeInMainWorld('LangAPI', {
    getText: (key: string) => langManager.getText(key),
    setLang: (lang: string) => langManager.setLang(lang),
    getCurrentLang: () => langManager.getCurrentLang(),
    reloadLang: () => langManager.loadLang(langManager.getCurrentLang()),
});

contextBridge.exposeInMainWorld("ElectronPino", {
    trace: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:trace", message, args),
    debug: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:debug", message, args),
    info: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:info", message, args),
    warn: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:warn", message, args),
    error: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:error", message, args),
    fatal: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:fatal", message, args),
    log: (message: string, ...args: unknown[]) => ipcRenderer.invoke("pino:log", message, args),
});

if (typeof document !== 'undefined') {
    const apply = () => langManager.applyToDOM();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    } else {
        apply();
    }
}
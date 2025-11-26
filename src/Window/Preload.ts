import { contextBridge, ipcRenderer, shell } from "electron";
import { LangManager } from "../Utils/Lang.js";
import { loginUser } from "../Utils/Database.js";
import type { FolderEvent } from "../Utils/Types.js";

const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
const langCode = systemLocale.split("-")[0] || "en";
const langManager = new LangManager("en",true);

try {
    langManager.loadLanguage(langCode);
    ipcRenderer.invoke("Logger:info",`[ Preload ] Idioma cargado: ${langManager.lang}`);
} catch (err) {
    ipcRenderer.invoke("Logger:error",`[ Preload ] Error cargando idioma (${langCode}): ${String(err)}`);
}

contextBridge.exposeInMainWorld("LangAPI", {
    apply: (root?: Document) => langManager.applyTranslations(root || document),
    translate: (key: string) => langManager.t(key),
    currentLang: () => langManager.lang,
    setLang: (langCode: string) => {
        langManager.loadLanguage(langCode);
        langManager.applyTranslations(document);
        ipcRenderer.invoke("Logger:info", `[ LangAPI ] Idioma cambiado a: ${langManager.lang}`);
        window.dispatchEvent(new CustomEvent("lang-changed", {
            detail: { lang: langManager.lang }
        }));

        return langManager.lang;
    },
    getParamFromScript: (config: string) => langManager.getParamFromScript(config),
    getAllTranslations: () => langManager.translations
});

contextBridge.exposeInMainWorld("DiscordRPC", {
    connect: () => ipcRenderer.invoke("DiscordRPC:connect"),
    disconnect: () => ipcRenderer.invoke("DiscordRPC:disconnect"),
    setMode: (mode: string, version: string) => ipcRenderer.invoke("DiscordRPC:setMode", mode, version),
    getStatus: () => ipcRenderer.invoke("DiscordRPC:getStatus"),
    on: (event: string, callback: (data: any) => void) => {
        ipcRenderer.on(`DiscordRPC:${event}`, (_e, data) => callback(data));
    }
});

contextBridge.exposeInMainWorld("Configuration", {
    get: () => ipcRenderer.invoke("Configuration:get"),
    set: (pathKey: string, value: any) => ipcRenderer.invoke("Configuration:set", pathKey, value),
    exists: () => ipcRenderer.invoke("Configuration:exists"),
    save: () => ipcRenderer.invoke("Configuration:save"),
    getPath: (pathKey: string, defaultValue?: any) => ipcRenderer.invoke("Configuration:getPath", pathKey, defaultValue),
    reset: () => ipcRenderer.invoke("Configuration:reset"),
    reload: () => ipcRenderer.invoke("Configuration:reload"),
});

contextBridge.exposeInMainWorld("FolderLauncher", {
    list: (subFolder: string) => ipcRenderer.invoke("FolderLauncher:list", subFolder),
    on: (event: FolderEvent, callback: (data: any) => void) => {
        ipcRenderer.on("FolderLauncher:event", (_e, evName, payload) => {
            if (evName === event) callback(payload);
        });
    }
});

contextBridge.exposeInMainWorld("ElectronPino", {
    info: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:info", msg, ctx),
    warn: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:warn", msg, ctx),
    error: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:error", msg, ctx),
    debug: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:debug", msg, ctx),
    success: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:success", msg, ctx),
    critical: (msg: any, ctx?: any) => ipcRenderer.invoke("Logger:critical", msg, ctx),
});

contextBridge.exposeInMainWorld("ElectronAPI", {
    minimize: () => ipcRenderer.send("window-minimize"),
    toggleMaximize: () => ipcRenderer.send("window-toggle-maximize"),
    close: () => ipcRenderer.send("window-close"),
    setZoom: (factor: number) => ipcRenderer.send('set-zoom', factor),
    onWindowStateChange: (cb: (state: any) => void) => ipcRenderer.on("window-state-changed", (_e, state) => cb(state)),
    openExternal: (url: string) => {
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) return;
        shell.openExternal(url).catch(err => window.ElectronPino.warn(`[ElectronAPI] Error al abrir ${url}:`, err));
    }
});

contextBridge.exposeInMainWorld('StepLauncherAPI', {
    login: (email: string, password: string) => loginUser(email, password)
});

contextBridge.exposeInMainWorld('MinecraftDownload', {
    start: (version: string, installJava = false) =>
        ipcRenderer.invoke('minecraft-download:start', { version, installJava }),
    pause: () => ipcRenderer.send('minecraft-download:pause'),
    resume: () => ipcRenderer.send('minecraft-download:resume'),
    stop: () => ipcRenderer.send('minecraft-download:stop'),
    on: (eventName: string, callback: (...args: any[]) => void) => {
        ipcRenderer.send('minecraft-download:on', eventName);
        ipcRenderer.on(`minecraft-download:${eventName}`, (_e, ...args) => callback(...args));
    },
    getDownloadedMB: () => ipcRenderer.invoke('minecraft-download:getDownloadedMB'),
    getDownloadedGB: () => ipcRenderer.invoke('minecraft-download:getDownloadedGB'),
    getPercentage: () => ipcRenderer.invoke('minecraft-download:getPercentage'),
    getCurrentSpeed: () => ipcRenderer.invoke('minecraft-download:getCurrentSpeed'),
    getETA: () => ipcRenderer.invoke('minecraft-download:getETA'),
    isDownloading: () => ipcRenderer.invoke('minecraft-download:isDownloading')
});


contextBridge.exposeInMainWorld("YoutubeAPI",{
    search: async (query: string, limit?: number, offset?: string) => {
        return await ipcRenderer.invoke("YouTube:search", query, limit, offset);
    },
    download: (url: any, options: any) =>
        ipcRenderer.invoke("media:download", { url, options }),
    load: (path: string) => ipcRenderer.invoke("audio:load", path),
    play: () => ipcRenderer.invoke("audio:play"),
    pause: () => ipcRenderer.invoke("audio:pause"),
    stop: () => ipcRenderer.invoke("audio:stop"),
    setTime: (time: number) => ipcRenderer.invoke("audio:setTime", time),
    getTime: () => ipcRenderer.invoke("audio:getTime"),
    getDuration: () => ipcRenderer.invoke("audio:getDuration"),
    setVolume: (vol: number) => ipcRenderer.invoke("audio:setVolume", vol),
    onEvent: (cb: (event: any) => void) =>
        ipcRenderer.on("audio:event", (_e, data) => cb(data)),
})

contextBridge.exposeInMainWorld('localMusicAPI', {
    scan: (config:any) => ipcRenderer.invoke('LocalMusic:scan', config),
    scanSafe: (config:any) => ipcRenderer.invoke('LocalMusic:scanSafe', config),
    generateReport: (result:any) => ipcRenderer.invoke('LocalMusic:generateReport', result),
    cancelScan: () => ipcRenderer.invoke('LocalMusic:cancelScan'),
    
    onProgress: (callback:any) => ipcRenderer.on('LocalMusic:progress', callback),
    removeProgressListener: (callback:any) => ipcRenderer.removeListener('LocalMusic:progress', callback)
});

queueMicrotask(() => {
    ipcRenderer.invoke("Logger:info", "[ Preload ] Preload inicializado correctamente ✅");
});

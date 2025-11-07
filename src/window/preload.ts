import { contextBridge, ipcRenderer, shell } from "electron";
import { LangManager } from "../utils/lang.js";
import { Configuration } from "../core/Configuration.js";
import { FolderLauncher } from "../core/Folder.js";
import { ElectronPino } from "../utils/logger.js";
import type { FolderEvent } from "../utils/types.js";

const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
const langCode = systemLocale.split("-")[0] || "en";

const langManager = new LangManager("en","strict",true);
const STFolder = new FolderLauncher();
const logger = new ElectronPino(STFolder.getLauncherPath(),"normal");
const config = new Configuration();
const folderEvents: FolderEvent[] = ["clean:start", "clean:progress", "clean:done", "clean:skip"];

try {
    if (config.exists()) {
        logger.info("[ Configuration ] Configuración encontrada");
    } else {
        logger.warn("[ Configuration ] No existe configuración, se creará una nueva.");
    }
} catch (err) {
    logger.error(`Error al verificar configuración: ${String(err)}`);
}

try {
    langManager.loadLanguage(langCode);
    logger.info(`[ Preload ] Idioma cargado: ${langManager.lang}`);
} catch (err) {
    logger.error(`[ Preload ] Error cargando idioma (${langCode}): ${String(err)}`);
}

for (const event of folderEvents) {
    STFolder.on(event, (data) => ipcRenderer.send("FolderLauncher:event", event, data));
}

contextBridge.exposeInMainWorld("LangAPI", {
    apply: (root?: Document) => langManager.applyTranslations(root || document),
    translate: (key: string) => langManager.t(key),
    currentLang: () => langManager.lang,
    setLang: (langCode: string) => {
        langManager.loadLanguage(langCode);
        langManager.applyTranslations(document);
        window.dispatchEvent(new CustomEvent("lang-changed", {
            detail: { lang: langCode }
        }));
        return langManager.lang;
    },
    getParamFromScript: (config: string) => langManager.getParamFromScript(config),
    getAllTranslations: () => langManager.translations
});

contextBridge.exposeInMainWorld("Configuration", {
    get: () => config.get(),
    set: (pathKey: string, value: any) => config.set(pathKey, value),
    exists: () => config.exists(),
    save: () => config.save(),
    getPath: (pathKey: string, value: any) => config.getPath(pathKey, value),
    reset: () => {
        const defaults = config["defaultConfig"]();
        config["config"] = defaults;
        config.save();
        return defaults;
    },

    reload: () => {
        const newConfig = config["load"]();
        config["config"] = newConfig;
        return newConfig;
    }
});


contextBridge.exposeInMainWorld("FolderLauncher", {
    createFolder: (name: string) => STFolder.createFolder(name),
    createLog: (logName: string, content: string) => STFolder.createLog(logName, content),
    createFile: (fileName: string, content: string, subFolder: string) => STFolder.createFile(fileName, content, subFolder),
    exists: (relativePath: string) => STFolder.exists(relativePath),
    list: (subFolder: string) => STFolder.list(subFolder),

    cleanLauncher: () => queueMicrotask(() => STFolder.cleanLauncher()),
    cleanMinecraft: () => queueMicrotask(() => STFolder.cleanMinecraft()),

    on: (event: FolderEvent, callback: (data: any) => void) => {
        ipcRenderer.on("FolderLauncher:event", (_e, evName, payload) => {
            if (evName === event) callback(payload);
        });
    },
});

contextBridge.exposeInMainWorld("ElectronPino", {
    info: (msg: any, ctx: any) => logger.info(msg, ctx),
    warn: (msg: any, ctx: any) => logger.warn(msg, ctx),
    error: (msg: any, ctx: any) => logger.error(msg, ctx),
    debug: (msg: any, ctx: any) => logger.debug(msg, ctx),
    success: (msg: any, ctx: any) => logger.success(msg, ctx),
    critical: (msg: any, ctx: any) => logger.critical(msg, ctx),
});

contextBridge.exposeInMainWorld("ElectronAPI", {
    minimize: () => ipcRenderer.send("window-minimize"),
    toggleMaximize: () => ipcRenderer.send("window-toggle-maximize"),
    close: () => ipcRenderer.send("window-close"),
    onWindowStateChange: (cb: any) =>
        ipcRenderer.on("window-state-changed", (_e, state) => cb(state)),
    openExternal: (url: string) => {
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
            console.warn(`[ElectronAPI] URL inválida o no segura: ${url}`);
            return;
        }
        shell.openExternal(url).catch(err => {
            console.error(`[ElectronAPI] Error al abrir ${url}:`, err);
        });
    },
});

contextBridge.exposeInMainWorld("Versions", {
    chromeVersion: () => process.versions.chrome,
    electronVersion: () => process.versions.electron,
});

// -----------------------------
queueMicrotask(() => {
    logger.info("[ Preload ] Preload inicializado correctamente ✅");
});

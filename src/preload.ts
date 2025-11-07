import { contextBridge, ipcRenderer, shell } from "electron";
import { LangManager } from "./utils/lang.js";
import { Configuration } from "./core/Configuration.js";
import { FolderLauncher } from "./core/Folder.js";
import { ElectronPino } from "./utils/logger.js";

const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
const langCode = systemLocale.split("-")[0] || "en";

const STFolder = new FolderLauncher();
const logger = new ElectronPino(STFolder.getLauncherPath(), "preload");
const langManager = new LangManager("en","preload",false);
const config = new Configuration();

try {
    if (config.exists()) {
        logger.info("[ Configuration ] Configuración encontrada");
    } else {
        logger.warn("[ Configuration ] No existe configuración, se creará una nueva.");
    }
} catch (err) {
    logger.error(`[ Configuration ] Error al verificar configuración: ${String(err)}`);
}

try {
    langManager.loadLanguage(langCode);
    logger.info(`[ Preload ] Idioma cargado: ${langManager.lang}`);
} catch (err) {
    logger.error(`[ Preload ] Error cargando idioma (${langCode}): ${String(err)}`);
}

contextBridge.exposeInMainWorld("LangAPI", {
    apply: () => langManager.applyTranslations(document),
    translate: (key: string) => langManager.t(key),
    currentLang: () => langManager.lang,
    getParamFromScript: (config: string) => langManager.getParamFromScript(config),
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
    StartApp: () => ipcRenderer.send("StartApp"),
    close: () => ipcRenderer.send("window-close"),
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

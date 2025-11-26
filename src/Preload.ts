import { contextBridge, ipcRenderer, shell } from "electron";
import { LangManager } from "./Utils/Lang.js";
import { Configuration } from "./Core/Configuration.js";

const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
const langCode = systemLocale.split("-")[0] || "en";

const langManager = new LangManager("en",false);
const config = new Configuration();

try {
    if (config.exists()) {
        console.info("[ Configuration ] Configuración encontrada");
    } else {
        console.warn("[ Configuration ] No existe configuración, se creará una nueva.");
    }
} catch (err) {
    console.error(`[ Configuration ] Error al verificar configuración: ${String(err)}`);
}

try {
    langManager.loadLanguage(langCode);
    console.info(`[ Preload ] Idioma cargado: ${langManager.lang}`);
} catch (err) {
    console.error(`[ Preload ] Error cargando idioma (${langCode}): ${String(err)}`);
}

contextBridge.exposeInMainWorld("LangAPI", {
    apply: () => langManager.applyTranslations(document),
    translate: (key: string) => langManager.t(key),
    currentLang: () => langManager.lang,
    getParamFromScript: (config: string) => langManager.getParamFromScript(config),
});

contextBridge.exposeInMainWorld("ElectronAPI", {
    StartApp: () => ipcRenderer.send("StartApp"),
    close: () => ipcRenderer.send("window-close"),
    openExternal: (url: string) => {
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
            return;
        }
        shell.openExternal(url).catch(err => {
            console.error(`[ElectronAPI] Error al abrir ${url}:`, err);
        });
    },
});

import { ElectronPino } from "./logger.js";
import { FolderLauncher } from "../core/Folder.js";
import { fileURLToPath } from "url";
import type { LogMode } from "./types.js";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = () => path.resolve(__dirname, "../../", "public");

export class LangManager {
    defaultLang: string;
    lang: string;
    translations: Record<string, any>;
    modePino: LogMode;
    logPrint: boolean;
    Logger: ElectronPino;

    constructor(defaultLang = "en", mode: LogMode = "normal", logs: boolean = true) {
        this.defaultLang = defaultLang;
        this.modePino = mode;
        this.lang = defaultLang;
        this.logPrint = logs;
        this.translations = {};

        const STFolder = new FolderLauncher();
        const Folder = STFolder.getLauncherPath();
        this.Logger = new ElectronPino(Folder, this.modePino, this.logPrint);
    }

    loadLanguage(langCode: string): void {
        try {
            const localesPath = path.resolve(PUBLIC_DIR(), "assets", "locales");
            const filePath = path.resolve(localesPath, `${langCode}.json`);

            if (!fs.existsSync(filePath)) {
                this.Logger.warn(`[ LangManager ] No se encontró el idioma "${langCode}", usando "${this.defaultLang}"`);
                if (langCode !== this.defaultLang) {
                    return this.loadLanguage(this.defaultLang);
                } else {
                    this.Logger.error("[ LangManager ] Idioma por defecto no encontrado.");
                    return;
                }
            }

            const data = fs.readFileSync(filePath, "utf-8");
            this.translations = JSON.parse(data);
            this.lang = langCode;

            this.Logger.info(`[ LangManager ] Idioma cargado correctamente: "${langCode}"`);
        } catch (err: any) {
            this.Logger.error(`[ LangManager ] Error al cargar idioma: ${err.message || err}`);
        }
    }

    t(key: string): string {
        if (!key) return key;
        const keys = key.split(".");
        let result: any = this.translations;

        for (const k of keys) {
            if (result && typeof result === "object" && k in result) {
                result = result[k];
            } else {
                return key;
            }
        }

        return typeof result === "string" ? result : key;
    }

    applyTranslations(root: Document = document) {
        const elements = root.querySelectorAll<HTMLElement>("[data-lang]");
        elements.forEach(el => {
            const key = el.getAttribute("data-lang");
            if (!key) return;

            const translation = this.t(key);
            if (!translation) return;

            if (el.tagName.toLowerCase() === "img") {
                (el as HTMLImageElement).src = translation;
            } else {
                el.textContent = translation;
            }
        });
    }

    getParamFromScript(fullPath: string): any {
        if (!fullPath) return null;
        const keys = fullPath.split(".");
        let result: any = this.translations;

        for (const k of keys) {
            if (result && typeof result === "object" && k in result) {
                result = result[k];
            } else {
                return null;
            }
        }

        return result;
    }
}

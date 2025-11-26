import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = () => path.resolve(__dirname, "../../", "public");

export class LangManager {
    defaultLang: string;
    lang: string;
    translations: Record<string, any>;
    logPrint: boolean;

    constructor(defaultLang = "en", logs: boolean = false) {
        this.defaultLang = defaultLang;
        this.lang = defaultLang;
        this.logPrint = logs;
        this.translations = {};
    }

    loadLanguage(langCode: string): void {
        try {
            const localesPath = path.resolve(PUBLIC_DIR(), "assets", "locales");
            const filePath = path.resolve(localesPath, `${langCode}.json`);

            if (!fs.existsSync(filePath)) {
                console.warn(`[ LangManager ] No se encontró el idioma "${langCode}", usando "${this.defaultLang}"`)
                if (langCode !== this.defaultLang) {
                    return this.loadLanguage(this.defaultLang);
                } else {
                    console.error("[ LangManager ] Idioma por defecto no encontrado.");
                    return;
                }
            }

            const data = fs.readFileSync(filePath, "utf-8");
            this.translations = JSON.parse(data);
            this.lang = langCode;

            console.info(`[ LangManager ] Idioma cargado correctamente: "${langCode}"`);
        } catch (err: any) {
            console.error(`[ LangManager ] Error al cargar idioma: ${err.message || err}`);
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

    get(key: string): any {
        if (!key) return null;

        const keys = key.split(".");
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

import fs from "fs";
import path from "path";
import { FolderLauncher } from "./Folder.js";
import type { DefaultConfig } from "../utils/types.js";

export class Configuration {
    private readonly folder: FolderLauncher;
    private readonly configPath: string;
    private config: DefaultConfig;

    constructor() {
        this.folder = new FolderLauncher();
        this.configPath = path.join(this.folder.getLauncherPath(), "configuration.json");

        if (!fs.existsSync(this.configPath)) {
            this.config = this.defaultConfig();
            this.save();
        } else {
            this.config = this.load();
        }

        this.config = this.mergeDefaults(this.config, this.defaultConfig());
        this.save();
    }

    public exists(): boolean {
        return fs.existsSync(this.configPath);
    }

    private defaultConfig(): DefaultConfig {
        return {
            Version: "1.0.0",
            TypeVersion: "Stable",
            Launcher: {
                AutoCleanCache: true,
                AutoCleanLogs: true,
                ConnectDiscord: true,
                DevTools: false,
                DefaultLang: "es",
                NewPanel: true
            },
            Minecraft: {
                Memory: {
                    Max: "",
                    Min: "",
                },
                Downloader: {
                    Concurry: 2,
                    StartOnFinish: false,
                    InstallJava: false,
                    VariantJava: "Stable",
                },
            },
        };
    }

    
    private load(): DefaultConfig {
        try {
            const data = fs.readFileSync(this.configPath, "utf-8");
            return JSON.parse(data);
        } catch (err) {
            console.error("[StepLauncher] Error al leer configuración:", (err as Error).message);
            return this.defaultConfig();
        }
    }

    public save(): void {
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 4), "utf-8");
    }

    public get(): DefaultConfig {
        return this.config;
    }

    public set(pathKey: string, value: any): void {
        const keys = pathKey.split(".");
        let target: any = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i] || "";
            if (!target[key]) target[key] = {};
            target = target[key];
        }

        target[keys[keys.length - 1] || ""] = value;
        this.save();
    }

    public getPath<T = any>(pathKey: string, _string: any): T | undefined {
        const keys = pathKey.split(".");
        let target: any = this.config;

        for (let key of keys) {
            if (target && typeof target === "object" && key in target) {
                target = target[key];
            } else {
                return undefined;
            }
        }

        return target as T;
    }

    private mergeDefaults<T extends object>(data: T, defaults: T): T {
        const result: any = { ...defaults };
        for (const key in data) {
            if (data[key] && typeof data[key] === "object" && !Array.isArray(data[key])) {
                result[key] = this.mergeDefaults(data[key], (defaults as any)[key] || {});
            } else {
                result[key] = data[key];
            }
        }
        return result;
    }
}

// --------------------------------------------------
// const config = new Configuration
//();
// console.log("¿Existe config.json?:", config.exists() ? "✅ Sí" : "❌ No");
// console.log(config.get());
// config.set("Launcher.DevTools", true);
// if (config.exists()) {
//     console.log("✅ Configuración encontrada!");
// } else {
//     console.log("❌ No existe configuración, se creará una nueva.");
// }

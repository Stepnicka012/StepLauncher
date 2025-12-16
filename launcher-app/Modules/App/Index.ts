import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ConfigValue, ConfigObject, ConfigOptions } from '../../Types/App/Config.js';

class ConfigManager {
    private configPath: string;
    private config: ConfigObject;
    private options: Required<ConfigOptions>;
    private isLoaded: boolean = false;

    constructor(configPath: string, options: ConfigOptions = {}) {
        this.configPath = resolve(configPath);
        this.options = {
        createDirs: options.createDirs ?? true,
        prettyPrint: options.prettyPrint ?? true,
        encoding: options.encoding ?? 'utf-8',
        defaultConfig: options.defaultConfig ?? {},
        readOnly: options.readOnly ?? false,
        };
        this.config = this.loadConfig();
    }

    private loadConfig(): ConfigObject {
        try {
            if (existsSync(this.configPath)) {
                const fileContent = readFileSync(this.configPath, this.options.encoding);
                const parsedConfig = JSON.parse(fileContent);
                this.isLoaded = true;
                return parsedConfig;
            } else {
                const defaultConfig = this.options.defaultConfig;
                this.createConfigFile(defaultConfig);
                this.isLoaded = false;
                return { ...defaultConfig };
            }
        } catch (error) {
            window.StepLauncherLogger.error('Error cargando configuración:', error);
            
            const defaultConfig = this.options.defaultConfig;
            this.createConfigFile(defaultConfig);
            return { ...defaultConfig };
        }
    }

    private createConfigFile(config: ConfigObject): void {
        try {
            if (this.options.readOnly) return;

            const dir = dirname(this.configPath);
            
            if (this.options.createDirs && !existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            this.saveConfig(config);
        } catch (error) {
            window.StepLauncherLogger.error('Error creando archivo de configuración:', error);
        }
    }

    private saveConfig(config: ConfigObject): void {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return;
        }

        try {
            const content = this.options.prettyPrint 
                ? JSON.stringify(config, null, 2)
                : JSON.stringify(config);

            writeFileSync(this.configPath, content, this.options.encoding);
        } catch (error) {
            window.StepLauncherLogger.error('Error guardando configuración:', error);
            throw error;
        }
    }

    get<T = ConfigValue>(path: string, defaultValue?: T): T {
        const keys = path.split('.');
        let current: any = this.config;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue as T;
            }
        }

        return current as T;
    }

    edit(path: string, value: ConfigValue): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        const keys = path.split('.');
        let current: any = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            
            if (!(key || "" in current) || typeof current[key || ""] !== 'object') {
                current[key || ""] = {};
            }
            current = current[key!];
        }

        const finalKey = keys[keys.length - 1];
        current[finalKey!] = value;

        this.saveConfig(this.config);
        return this;
    }

    editMultiple(updates: { [path: string]: ConfigValue }): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        Object.entries(updates).forEach(([path, value]) => {
            this.edit(path, value);
        });

        return this;
    }

    has(path: string): boolean {
        const keys = path.split('.');
        let current: any = this.config;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return false;
            }
        }

        return true;
    }

    delete(path: string): boolean {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return false;
        }

        const keys = path.split('.');
        let current: any = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key || "" in current) || typeof current[key || ""] !== 'object') {
                return false;
            }
            current = current[key!];
        }

        const finalKey = keys[keys.length - 1];
        if (finalKey! in current) {
            delete current[finalKey || ""];
            this.saveConfig(this.config);
            return true;
        }

        return false;
    }

    getAll(): ConfigObject {
        return { ...this.config };
    }

    merge(newConfig: ConfigObject): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        this.config = this.deepMerge(this.config, newConfig);
        this.saveConfig(this.config);
        return this;
    }

    private deepMerge(target: ConfigObject, source: ConfigObject): ConfigObject {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(
                (result[key] as ConfigObject) || {},
                source[key] as ConfigObject
                );
            } else {
                result[key]  = source[key];
            }
        }

        return result;
    }

    reset(): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        this.config = { ...this.options.defaultConfig };
        this.saveConfig(this.config);
        return this;
    }

    setAll(newConfig: ConfigObject): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        this.config = { ...newConfig };
        this.saveConfig(this.config);
        return this;
    }

    getConfigPath(): string {
        return this.configPath;
    }

    wasLoadedFromFile(): boolean {
        return this.isLoaded;
    }

    reload(): this {
        this.config = this.loadConfig();
        return this;
    }

    export(): string {
        return this.options.prettyPrint 
        ? JSON.stringify(this.config, null, 2)
        : JSON.stringify(this.config);
    }

    import(jsonString: string): this {
        if (this.options.readOnly) {
            window.StepLauncherLogger.warn('ConfigManager está en modo solo lectura. No se guardarán cambios.');
            return this;
        }

        try {
            const importedConfig = JSON.parse(jsonString);
            this.config = { ...importedConfig };
            this.saveConfig(this.config);
            return this;
        } catch (error) {
            window.StepLauncherLogger.error('Error importando configuración:', error);
            throw error;
        }
    }
}

export function createConfigManager(configPath: string, options?: ConfigOptions): ConfigManager {
    return new ConfigManager(configPath, options);
}

export default ConfigManager;
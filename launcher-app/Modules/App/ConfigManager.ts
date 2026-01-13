import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ConfigValue, ConfigObject, ConfigOptions } from '../../Types/App/Config.js';
import type { IStepLauncherLoggerAPI } from '../../Types/global.js';

class ConfigManager {
	private configPath: string;
	private config: ConfigObject;
	private options: Required<ConfigOptions>;
	private isLoaded = false;
	private logger: IStepLauncherLoggerAPI | undefined;

	constructor(
		configPath: string,
		options: ConfigOptions = {},
		logger?: IStepLauncherLoggerAPI
	) {
		this.configPath = resolve(configPath);
		this.logger = logger;

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
			}

			this.createConfigFile(this.options.defaultConfig);
			this.isLoaded = false;
			return { ...this.options.defaultConfig };

		} catch (error) {
			this.logger?.error('Error cargando configuración', error);
			this.createConfigFile(this.options.defaultConfig);
			return { ...this.options.defaultConfig };
		}
	}

	private createConfigFile(config: ConfigObject): void {
		if (this.options.readOnly) return;

		try {
			const dir = dirname(this.configPath);

			if (this.options.createDirs && !existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			this.saveConfig(config);
		} catch (error) {
			this.logger?.error('Error creando archivo de configuración', error);
		}
	}

	private saveConfig(config: ConfigObject): void {
		if (this.options.readOnly) {
			this.logger?.warn('ConfigManager en modo solo lectura');
			return;
		}

		try {
			const content = this.options.prettyPrint
				? JSON.stringify(config, null, 2)
				: JSON.stringify(config);

			writeFileSync(this.configPath, content, this.options.encoding);
		} catch (error) {
			this.logger?.error('Error guardando configuración', error);
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
			this.logger?.warn('ConfigManager en modo solo lectura');
			return this;
		}

		const keys = path.split('.');
		let current: any = this.config;

		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			if (!current[key!] || typeof current[key!] !== 'object') {
				current[key!] = {};
			}
			current = current[key!];
		}

		current[keys[keys.length - 1]!] = value;
		this.saveConfig(this.config);
		return this;
	}

	delete(path: string): boolean {
		if (this.options.readOnly) {
			this.logger?.warn('ConfigManager en modo solo lectura');
			return false;
		}

		const keys = path.split('.');
		let current: any = this.config;

		for (let i = 0; i < keys.length - 1; i++) {
			if (!current[keys[i]!]) return false;
			current = current[keys[i]!];
		}

		if (keys[keys.length - 1]! in current) {
			delete current[keys[keys.length - 1]!];
			this.saveConfig(this.config);
			return true;
		}

		return false;
	}

	getAll(): ConfigObject {
		return { ...this.config };
	}

	reset(): this {
		if (this.options.readOnly) {
			this.logger?.warn('ConfigManager en modo solo lectura');
			return this;
		}

		this.config = { ...this.options.defaultConfig };
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
}

export function createConfigManager(
	configPath: string,
	logger: IStepLauncherLoggerAPI,
	options?: ConfigOptions
): ConfigManager {
	return new ConfigManager(configPath, options,logger);
}

export default ConfigManager;

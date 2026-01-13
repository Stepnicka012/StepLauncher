import { ipcMain } from "electron";
import type ConfigManager from "../Modules/App/ConfigManager.js";

export function setupConfigIPC(config: ConfigManager) {

	ipcMain.handle("config:get", (_, path: string, defaultValue?: any) => {
		return config.get(path, defaultValue);
	});

	ipcMain.handle("config:set", (_, path: string, value: any) => {
		config.edit(path, value);
		return true;
	});
	
	ipcMain.handle("config:delete", (_, path: string) => {
		return config.delete(path);
	});

	ipcMain.handle("config:getAll", () => {
		return config.getAll();
	});

	ipcMain.handle("config:reset", () => {
		config.reset();
		return true;
	});

	ipcMain.handle("config:meta", () => {
		return {
			path: config.getConfigPath(),
			loadedFromFile: config.wasLoadedFromFile()
		};
	});
}

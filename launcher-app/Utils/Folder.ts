import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

const APP_NAME = '.StepLauncher';

export class FolderManager {
    private appName: string;

    constructor(appName: string = APP_NAME) {
        this.appName = appName;
    }

    public getAppConfigPath(): string {
        const platform = process.platform;
        let configPath: string;

        switch (platform) {
            case 'win32':
                const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
                configPath = path.join(appData, this.appName);
                break;

            case 'darwin':
            case 'linux':
            default:
                const xdgConfigHome = process.env.XDG_CONFIG_HOME;
                if (xdgConfigHome) {
                    configPath = path.join(xdgConfigHome, this.appName);
                } else {
                    configPath = path.join(os.homedir(), this.appName);
                }
                break;
        }

        return configPath;
    }

    public async ensureConfigDirExists(): Promise<void> {
        const dirPath = this.getAppConfigPath();
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            throw new Error(`No se pudo crear la carpeta de configuración: ${dirPath}`);
        }
    }

    public getFilePath(filename: string): string {
        return path.join(this.getAppConfigPath(), filename);
    }

    public getVersionsDirectory(): string {
        return path.join(this.getAppConfigPath(), 'versions');
    }

    public async getMinecraftVersions(): Promise<string[]> {
        try {
            const versionsDir = this.getVersionsDirectory();
            
            try {
                await fs.access(versionsDir);
            } catch {
                console.warn(`El directorio de versiones no existe en tu launcher: ${versionsDir}`);
                return [];
            }

            const entries = await fs.readdir(versionsDir, { withFileTypes: true });
            
            const versionDirs = entries
                .filter(entry => entry.isDirectory())
                .map(dir => dir.name);

            return versionDirs;
        } catch (error) {
            console.error('Error al leer las versiones de Minecraft:', error);
            throw new Error(`No se pudieron obtener las versiones: ${error}`);
        }
    }

    public async getVersionInfo(versionName: string): Promise<any> {
        try {
            const versionDir = path.join(this.getVersionsDirectory(), versionName);
            const jsonFile = path.join(versionDir, `${versionName}.json`);
            
            await fs.access(jsonFile);
            
            const content = await fs.readFile(jsonFile, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error al leer información de la versión ${versionName}:`, error);
            throw new Error(`No se pudo obtener información de la versión ${versionName}`);
        }
    }

    public async versionExists(versionName: string): Promise<boolean> {
        try {
            const versionDir = path.join(this.getVersionsDirectory(), versionName);
            await fs.access(versionDir);
            return true;
        } catch {
            return false;
        }
    }

    public async deleteVersion(versionName: string): Promise<void> {
        try {
            const versionDir = path.join(this.getVersionsDirectory(), versionName);
            await fs.rm(versionDir, { recursive: true, force: true });
            console.log(`Versión eliminada: ${versionName}`);
        } catch (error) {
            throw new Error(`No se pudo eliminar la versión ${versionName}: ${error}`);
        }
    }

    public async getAllVersionsInfo(): Promise<Array<{name: string, data?: any}>> {
        try {
            const versions = await this.getMinecraftVersions();
            const versionsInfo = [];

            for (const version of versions) {
                try {
                    const info = await this.getVersionInfo(version);
                    versionsInfo.push({ name: version, data: info });
                } catch (error) {
                    // Si no hay JSON, solo agregamos el nombre
                    versionsInfo.push({ name: version, data: null });
                }
            }

            return versionsInfo;
        } catch (error) {
            console.error('Error al obtener información de todas las versiones:', error);
            return [];
        }
    }
}

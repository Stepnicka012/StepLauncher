import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';

const APP_NAME = 'StepLauncher';

export class AppConfigManager {
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
}

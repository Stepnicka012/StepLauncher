import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';

export function getStepLauncherFolderPath(): string {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
        const appData = process.env.APPDATA;
        if (!appData) {
            throw new Error('APPDATA environment variable is not defined');
        }
        return path.join(appData, '.StepLauncher');
    } else {
        return path.join(os.homedir(), '.StepLauncher');
    }
}

export async function ensureStepLauncherFolder(): Promise<string> {
    const folderPath = getStepLauncherFolderPath();
    await fsPromises.mkdir(folderPath, { recursive: true });
    return folderPath;
}

export function ensureStepLauncherFolderSync(): string {
    const folderPath = getStepLauncherFolderPath();
    fs.mkdirSync(folderPath, { recursive: true });
    return folderPath;
}

export function getStepLauncherSubPath(subpath?: string): string {
    const base = getStepLauncherFolderPath();
    return subpath ? path.join(base, subpath) : base;
}

export async function stepLauncherFolderExists(): Promise<boolean> {
    try {
        const folderPath = getStepLauncherFolderPath();
        const stat = await fsPromises.stat(folderPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

export function stepLauncherFolderExistsSync(): boolean {
    try {
        const folderPath = getStepLauncherFolderPath();
        const stat = fs.statSync(folderPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}
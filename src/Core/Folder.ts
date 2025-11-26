import fs from "fs";
import path from "path";
import os from "os";
import EventEmitter from "events";

export class FolderLauncher extends EventEmitter {
    public readonly rootPath: string;

    constructor() {
        super();

        this.rootPath = path.join(
            process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
            ".StepLauncher"
        );

        this.ensureFolder(this.rootPath);
    }

    private ensureFolder(folderPath: string): void {
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    }

    public list(subFolder?: string): string[] {
        const folder = subFolder ? path.join(this.rootPath, subFolder) : this.rootPath;
        this.ensureFolder(folder);
        return fs.readdirSync(folder);
    }

    public getRootPath(): string {
        return this.rootPath;
    }

    public getLauncherPath(): string {
        const launcherPath = path.join(this.rootPath, "Launcher");
        this.ensureFolder(launcherPath);
        return launcherPath;
    }

    public getLogsPath(): string {
        const logsPath = path.join(this.getLauncherPath(), "logs");
        this.ensureFolder(logsPath);
        return logsPath;
    }
}

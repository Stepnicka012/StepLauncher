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

    private formatDate(date: Date): string {
        return `${date.getFullYear()}-${(date.getMonth() + 1)
            .toString()
            .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}_${date
            .getHours()
            .toString()
            .padStart(2, "0")}-${date.getMinutes().toString().padStart(2, "0")}-${date
            .getSeconds()
            .toString()
            .padStart(2, "0")}`;
    }

    public createFolder(folderName: string): string {
        const folderPath = path.join(this.rootPath, folderName);
        this.ensureFolder(folderPath);
        return folderPath;
    }

    public createLog(level: string, content: string): string {
        const logsFolder = path.join(this.rootPath, "Launcher", "logs");
        this.ensureFolder(logsFolder);

        const fileName = `StepLauncher-${level}-${this.formatDate(new Date())}.log`;
        const logFilePath = path.join(logsFolder, fileName);

        fs.writeFileSync(logFilePath, content, { encoding: "utf-8" });
        return logFilePath;
    }

    public createFile(fileName: string, content: string | Buffer, subFolder?: string): string {
        const folder = subFolder ? path.join(this.rootPath, subFolder) : this.rootPath;
        this.ensureFolder(folder);

        const filePath = path.join(folder, fileName);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    
    public exists(relativePath: string): boolean {
        return fs.existsSync(path.join(this.rootPath, relativePath));
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

    public cleanLauncher(): { removedFiles: number; removedFolders: number; details: string[] } {
        const folders = [path.join(this.rootPath, "Launcher", "logs")];
        return this.internalClean("Launcher", folders);
    }

    public cleanMinecraft(): { removedFiles: number; removedFolders: number; details: string[] } {
        const folders = [
            path.join(this.rootPath, "logs"),
            path.join(this.rootPath, "cache"),
        ];
        return this.internalClean("Minecraft", folders);
    }

    private internalClean( name: string, folders: string[] ): { removedFiles: number; removedFolders: number; details: string[] } {
        let removedFiles = 0;
        let removedFolders = 0;
        const details: string[] = [];

        this.emit("scan:start", { target: name, folders });

        for (const folder of folders) {
            this.emit("scan:folder", { target: name, folder });

            if (!fs.existsSync(folder)) {
                this.emit("clean:skip", { target: name, folder, reason: "No existe" });
                details.push(`[${name}] No existe: ${folder}`);
                continue;
            }

            const entries = fs.readdirSync(folder);
            if (entries.length === 0) {
                this.emit("clean:skip", { target: name, folder, reason: "Vacío" });
                details.push(`[${name}] Sin archivos: ${folder}`);
                continue;
            }

            for (const entry of entries) {
                const entryPath = path.join(folder, entry);
                try {
                    const stats = fs.lstatSync(entryPath);
                    if (stats.isDirectory()) {
                        fs.rmSync(entryPath, { recursive: true, force: true });
                        removedFolders++;
                        this.emit("clean:folder", { target: name, entryPath });
                    } else {
                        fs.unlinkSync(entryPath);
                        removedFiles++;
                        this.emit("clean:file", { target: name, entryPath });
                    }
                    details.push(`[${name}] Eliminado: ${entryPath}`);
                } catch (err) {
                    details.push(`[${name}] Error: ${entryPath} (${(err as Error).message})`);
                }
            }
        }

        const result = { removedFiles, removedFolders, details };
        this.emit("clean:finish", { target: name, ...result });
        return result;
    }
}

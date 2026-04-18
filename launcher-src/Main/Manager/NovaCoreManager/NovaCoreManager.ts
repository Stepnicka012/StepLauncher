import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadNovaCore } from '../../Services/EngineDownloader.js';
import { downloadJava } from '../../Services/JavaDownloader.js';
import { getStepLauncherFolderPath } from '../FolderManager.js';

export interface NovaCoreManagerOptions {
    rootDir?: string;
    javaVersion?: number;
    javaImageType?: 'jre' | 'jdk';
    onProgress?: (progress: OverallProgress) => void;
    onLog?: (message: string) => void;
    onStep?: (step: string) => void;
}

export interface OverallProgress {
    step: 'java' | 'engine' | 'idle';
    subProgress?: {
        downloadedBytes: number;
        totalBytes: number;
        percentage: number;
        downloadedMB: string;
        totalMB: string;
    };
    overallPercent: number;
}

export interface JavaInfo {
    homePath: string;
    executablePath: string;
    version: number;
}

export interface EngineInfo {
    jarPath: string;
    version: string;
}

export class NovaCoreManager extends EventEmitter {
    private rootDir: string;
    private javaVersion: number;
    private javaImageType: 'jre' | 'jdk';
    private javaDir: string;
    private engineDir: string;
    private engineJarPath: string;
    private versionFilePath: string;

    constructor(options: NovaCoreManagerOptions = {}) {
        super();
        this.rootDir = options.rootDir ?? getStepLauncherFolderPath();
        this.javaVersion = options.javaVersion ?? 25;
        this.javaImageType = options.javaImageType ?? 'jdk';
        this.javaDir = path.join(this.rootDir, 'bin', 'java');
        this.engineDir = path.join(this.rootDir, 'bin', 'engine');
        this.engineJarPath = path.join(this.engineDir, 'novacore-engine.jar');
        this.versionFilePath = path.join(this.engineDir, 'version.txt');

        if (options.onProgress) this.on('progress', options.onProgress);
        if (options.onLog) this.on('log', options.onLog);
        if (options.onStep) this.on('step', options.onStep);
    }

    private log(message: string) {
        this.emit('log', message);
    }

    private step(step: string) {
        this.emit('step', step);
    }

    private progress(progress: OverallProgress) {
        this.emit('progress', progress);
    }

    async ensureDirectories(): Promise<void> {
        await fs.mkdir(this.javaDir, { recursive: true });
        await fs.mkdir(this.engineDir, { recursive: true });
    }

    async getJavaInfo(): Promise<JavaInfo | null> {
        try {
            const entries = await fs.readdir(this.javaDir);
            for (const entry of entries) {
                const fullPath = path.join(this.javaDir, entry);
                const stat = await fs.stat(fullPath).catch(() => null);
                if (!stat?.isDirectory()) continue;
                
                const executableName = process.platform === 'win32' ? 'java.exe' : 'java';
                const execPath = path.join(fullPath, 'bin', executableName);
                try {
                    await fs.access(execPath);
                    let version = this.javaVersion;
                    const match = entry.match(/\d+/);
                    if (match) version = parseInt(match[0], 10);
                    return { homePath: fullPath, executablePath: execPath, version };
                } catch { }
            }
            return null;
        } catch {
            return null;
        }
    }

    async getEngineInfo(): Promise<EngineInfo | null> {
        try {
            await fs.access(this.engineJarPath);
            let version = 'unknown';
            try {
                version = await fs.readFile(this.versionFilePath, 'utf-8');
                version = version.trim();
            } catch { }
            return { jarPath: this.engineJarPath, version };
        } catch {
            return null;
        }
    }

    async downloadJava(): Promise<JavaInfo> {
        this.step('java');
        this.log(`Downloading Java ${this.javaVersion} JDK...`);
        const javaPath = await downloadJava({
            outputDir: this.javaDir,
            version: this.javaVersion,
            imageType: this.javaImageType,
            onProgress: (progress) => {
                this.progress({
                    step: 'java',
                    subProgress: {
                        downloadedBytes: progress.downloadedBytes,
                        totalBytes: progress.totalBytes,
                        percentage: parseFloat(progress.percentage),
                        downloadedMB: progress.downloadedMB,
                        totalMB: progress.totalMB,
                    },
                    overallPercent: 0,
                });
            },
            onLog: (msg) => this.log(`[Java] ${msg}`),
        });
        this.log(`Java installed at: ${javaPath}`);
        const info = await this.getJavaInfo();
        if (!info) throw new Error('Java installation verification failed');
        return info;
    }

    async downloadEngine(): Promise<EngineInfo> {
        this.step('engine');
        this.log('Downloading NovaCore Engine...');
        const jarPath = await downloadNovaCore({
            outputDir: this.engineDir,
            onProgress: (progress) => {
                this.progress({
                    step: 'engine',
                    subProgress: {
                        downloadedBytes: progress.downloadedBytes,
                        totalBytes: progress.totalBytes,
                        percentage: parseFloat(progress.percentage),
                        downloadedMB: progress.downloadedMB,
                        totalMB: progress.totalMB,
                    },
                    overallPercent: 0,
                });
            },
            onLog: (msg) => this.log(`[Engine] ${msg}`),
        });
        const version = await this.fetchLatestEngineVersion();
        await fs.writeFile(this.versionFilePath, version, 'utf-8');
        this.log(`Engine version ${version} saved`);
        return { jarPath, version };
    }

    async downloadAll(): Promise<{ java: JavaInfo; engine: EngineInfo }> {
        await this.ensureDirectories();
        const java = await this.downloadJava();
        const engine = await this.downloadEngine();
        this.progress({ step: 'idle', overallPercent: 100 });
        this.log('All components downloaded successfully');
        return { java, engine };
    }

    async checkEngineUpdate(): Promise<{ hasUpdate: boolean; latestVersion: string; currentVersion: string }> {
        const latest = await this.fetchLatestEngineVersion();
        const current = (await this.getEngineInfo())?.version ?? 'none';
        return {
            hasUpdate: latest !== current,
            latestVersion: latest,
            currentVersion: current,
        };
    }

    private async fetchLatestEngineVersion(): Promise<string> {
        const repo = 'Stepnicka012/NovaCore-Engine';
        const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
        const response = await fetch(apiUrl, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
        const data = await response.json() as { tag_name: string };
        return data.tag_name;
    }

    async updateEngine(): Promise<EngineInfo> {
        this.log('Updating NovaCore Engine...');
        const oldJar = this.engineJarPath;
        const backupPath = oldJar + '.old';
        try {
            await fs.rename(oldJar, backupPath);
        } catch { }
        try {
            const newEngine = await this.downloadEngine();
            await fs.rm(backupPath, { force: true });
            return newEngine;
        } catch (err) {
            try {
                await fs.rename(backupPath, oldJar);
            } catch { }
            throw err;
        }
    }

    async verifyInstallation(): Promise<{ javaOk: boolean; engineOk: boolean; details: string }> {
        const java = await this.getJavaInfo();
        const engine = await this.getEngineInfo();
        let details = '';
        let javaOk = false, engineOk = false;
        if (java) {
            javaOk = true;
            details += `Java found at ${java.executablePath}\n`;
        } else {
            details += `Java ${this.javaVersion} JDK not found\n`;
        }
        if (engine) {
            engineOk = true;
            details += `Engine found at ${engine.jarPath} (version ${engine.version})\n`;
        } else {
            details += `Engine JAR not found\n`;
        }
        return { javaOk, engineOk, details };
    }
}
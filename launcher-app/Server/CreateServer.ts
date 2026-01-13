import express, { type Request, type Response } from 'express';
import { platform, totalmem, freemem, type as osType, release, arch, cpus } from 'os';
import { join, dirname, resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(resolve(__dirname, '../../launcher-renderer/Application/Server')));

app.use((req: any, res: any, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

interface SystemInfo {
    os: string;
    ram: string;
    cpu: string;
    cores: number;
    platform: string;
}

interface MinecraftConfig {
    jvmArgs: string;
    fullCommand: string;
}

interface DiagnosticData {
    problem_source: string;
    severity: string;
    description: string;
    jvm_args: string;
    full_mc_command: string;
    os_info: string;
    ram_free: string;
    extra_sys_info?: string;
    raw_logs: string;
}

class DiagnosticDataStore {
    private systemInfo: SystemInfo | null = null;
    private minecraftConfig: MinecraftConfig | null = null;
    private logs: string[] = [];
    
    setSystemInfo(info: SystemInfo): void {
        this.systemInfo = info;
    }
    
    setMinecraftConfig(config: MinecraftConfig): void {
        this.minecraftConfig = config;
    }
    
    addLog(log: string): void {
        const sanitized = this.sanitize(log);
        this.logs.push(sanitized);
        if (this.logs.length > 500) this.logs.shift();
    }
    
    setLogs(logs: string[]): void {
        this.logs = logs.map(log => this.sanitize(log));
    }
    
    clearLogs(): void {
        this.logs = [];
    }
    
    getSystemInfo(): SystemInfo {
        if (!this.systemInfo) {
            return this.generateDefaultSystemInfo();
        }
        return this.systemInfo;
    }
    
    getMinecraftConfig(): MinecraftConfig {
        if (!this.minecraftConfig) {
            return { jvmArgs: '', fullCommand: '' };
        }
        return this.minecraftConfig;
    }
    
    getLogs(): string[] {
        return [...this.logs];
    }
    
    private sanitize(text: string): string {
        return text
            .replace(/[<>]/g, '')
            .replace(/`/g, '')
            .replace(/\|/g, '')
            .replace(/[{}]/g, '')
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }
    
    private generateDefaultSystemInfo(): SystemInfo {
        const totalRAM = (totalmem() / 1024 / 1024 / 1024).toFixed(1);
        const freeRAM = (freemem() / 1024 / 1024 / 1024).toFixed(1);
        const cpu = cpus();
        
        return {
            os: `${osType()} ${release()} (${arch()})`,
            ram: `${freeRAM} GB / ${totalRAM} GB libre`,
            cpu: cpu[0]?.model ?? 'Unknown CPU',
            cores: cpu.length,
            platform: platform()
        };
    }
}

const dataStore = new DiagnosticDataStore();

app.get('/', (req: Request, res: Response) => {
    res.sendFile(resolve(__dirname, '../../launcher-renderer/Application/Server/Report.html'));
});

app.get('/debug', (req: Request, res: Response) => {
    res.sendFile(resolve(__dirname, '../../launcher-renderer/Application/Server/Debug.html'));
});
app.get('/api/system-info', (req: Request, res: Response) => {
    try {
        const info = dataStore.getSystemInfo();
        res.json(info);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errMsg });
    }
});

app.get('/api/minecraft-args', (req: Request, res: Response) => {
    try {
        const config = dataStore.getMinecraftConfig();
        res.json(config);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errMsg });
    }
});

app.get('/api/logs', (req: Request, res: Response) => {
    try {
        const logs = dataStore.getLogs();
        res.json({ logs });
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errMsg });
    }
});

app.post('/api/prepare-diagnostic', (req: Request, res: Response) => {
    try {
        const data = req.body as DiagnosticData;
        
        const diagnosticsDir = join(__dirname, 'diagnostics');
        
        if (!existsSync(diagnosticsDir)) {
            mkdirSync(diagnosticsDir, { recursive: true });
        }
        
        const diagnosticFile = join(diagnosticsDir, `diagnostic_${Date.now()}.json`);
        writeFileSync(diagnosticFile, JSON.stringify(data, null, 2));
        
        res.json({ 
            success: true, 
            message: 'Datos preparados correctamente',
            file: diagnosticFile
        });
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errMsg });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

export function setSystemInfo(info: SystemInfo): void {
    dataStore.setSystemInfo(info);
}

export function setMinecraftConfig(config: MinecraftConfig): void {
    dataStore.setMinecraftConfig(config);
}

export function addLog(log: string): void {
    dataStore.addLog(log);
}

export function setLogs(logs: string[]): void {
    dataStore.setLogs(logs);
}

export function clearLogs(): void {
    dataStore.clearLogs();
}

export { dataStore };
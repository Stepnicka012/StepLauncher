import { promises as fs } from 'fs';
import { join } from 'path';

export class LogUtils {
    static async cleanupOldLogs(logPath: string, maxLogDays: number): Promise<void> {
        try {
        const files = await fs.readdir(logPath);
        const now = Date.now();
        const maxAge = maxLogDays * 24 * 60 * 60 * 1000; // Convertir a milisegundos

        for (const file of files) {
            if (file.endsWith('.log')) {
            const filePath = join(logPath, file);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                await fs.unlink(filePath);
            }
            }
        }
        } catch (error) {}
    }

    static async ensureLogDirectory(logPath: string): Promise<void> {
        try {
            await fs.access(logPath);
        } catch {
            await fs.mkdir(logPath, { recursive: true });
        }
    }

    static async rotateLogIfNeeded( logPath: string, logFileName: string, maxFileSize: number ): Promise<void> {
        try {
            const filePath = join(logPath, logFileName);
            const stats = await fs.stat(filePath);
            const maxSizeBytes = maxFileSize * 1024 * 1024;

            if (stats.size > maxSizeBytes) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedName = `${logFileName.replace('.log', '')}-${timestamp}.log`;
                await fs.rename(filePath, join(logPath, rotatedName));
            }
        } catch (error) {
        // El archivo puede no existir aún, eso está bien
        }
    }
}
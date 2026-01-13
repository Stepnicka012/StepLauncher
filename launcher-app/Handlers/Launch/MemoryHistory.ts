// MemoryHistory.ts
export interface HistoryEntry {
    id: string;
    timestamp: number;
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    source: string;
    message: string;
    data?: any;
    tags?: string[];
}

export class MemoryHistory {
    private entries: HistoryEntry[] = [];
    private maxSize: number;
    private idCounter = 0;

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
    }

    add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
        const fullEntry: HistoryEntry = {
            ...entry,
            id: `hist_${Date.now()}_${this.idCounter++}`,
            timestamp: Date.now()
        };

        this.entries.unshift(fullEntry);

        if (this.entries.length > this.maxSize) {
            this.entries.pop();
        }

        return fullEntry;
    }

    error(source: string, message: string, data?: any, tags?: string[]): HistoryEntry {
        return this.add({
            level: 'error',
            source,
            message,
            data,
            tags: tags || ['error']
        });
    }

    warn(source: string, message: string, data?: any, tags?: string[]): HistoryEntry {
        return this.add({
            level: 'warn',
            source,
            message,
            data,
            tags: tags || ['warning']
        });
    }

    info(source: string, message: string, data?: any, tags?: string[]): HistoryEntry {
        return this.add({
            level: 'info',
            source,
            message,
            data,
            tags: tags || ['info']
        });
    }

    debug(source: string, message: string, data?: any, tags?: string[]): HistoryEntry {
        return this.add({
            level: 'debug',
            source,
            message,
            data,
            tags: tags || ['debug']
        });
    }

    trace(source: string, message: string, data?: any, tags?: string[]): HistoryEntry {
        return this.add({
            level: 'trace',
            source,
            message,
            data,
            tags: tags || ['trace']
        });
    }

    // Nuevo método para logs completos (sin filtrar para historial)
    log(source: string, message: string, level: HistoryEntry['level'] = 'info', data?: any): void {
        // Solo mostrar en logger principal
        console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] [${source}] ${message}`);
        
        // Guardar en historial solo si es importante
        if (level === 'error' || level === 'warn' || (level === 'info' && message.length < 500)) {
            this.add({ level, source, message, data });
        }
    }

    getAll(level?: HistoryEntry['level'], source?: string): HistoryEntry[] {
        let filtered = this.entries;
        
        if (level) filtered = filtered.filter(entry => entry.level === level);
        if (source) filtered = filtered.filter(entry => entry.source === source);
        
        return filtered;
    }

    getRecent(count: number = 50): HistoryEntry[] {
        return this.entries.slice(0, Math.min(count, this.entries.length));
    }

    getByTag(tag: string): HistoryEntry[] {
        return this.entries.filter(entry => entry.tags?.includes(tag));
    }

    clear(): void {
        this.entries = [];
        this.idCounter = 0;
    }

    getStats(): {
        total: number;
        byLevel: Record<string, number>;
        bySource: Record<string, number>;
        oldestTimestamp: number | null;
        newestTimestamp: number | null;
    } {
        const byLevel: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        
        this.entries.forEach(entry => {
            byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
            bySource[entry.source] = (bySource[entry.source] || 0) + 1;
        });

        return {
            total: this.entries.length,
            byLevel,
            bySource,
            oldestTimestamp: this.entries.length > 0 ? this.entries[this.entries.length - 1]!.timestamp : null,
            newestTimestamp: this.entries.length > 0 ? this.entries[0]!.timestamp : null
        };
    }

    search(query: string): HistoryEntry[] {
        const q = query.toLowerCase();
        return this.entries.filter(entry => 
            entry.message.toLowerCase().includes(q) ||
            entry.source.toLowerCase().includes(q) ||
            entry.tags?.some(tag => tag.toLowerCase().includes(q))
        );
    }

    get size(): number {
        return this.entries.length;
    }
}
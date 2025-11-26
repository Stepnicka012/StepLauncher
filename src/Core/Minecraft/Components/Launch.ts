import { EventEmitter } from 'node:events';
import { ArgumentsBuilder, type LauncherOptions, type LaunchResult } from '../Minecraft/Arguments.js';

// Tipos de eventos mejorados
export interface MinecraftLaunchEvents {
    // Eventos simples (poca info)
    'status': (message: string) => void;
    'progress': (type: string, percentage: number, currentFile?: string) => void;
    'game-start': () => void;
    'game-exit': (code: number | null, signal: string | null) => void;
    'error': (error: Error) => void;
    
    // Eventos detallados (mucha info)
    'debug:phase': (phase: string, duration: number, metadata?: any) => void;
    'debug:libraries': (data: {
        total: number;
        lwjgl: string[];
        natives: string[];
        classpath: string[];
    }) => void;
    'debug:arguments': (type: 'jvm' | 'game', args: string[], analysis: any) => void;
    'debug:performance': (metrics: {
        totalTime: number;
        phaseTimes: Record<string, number>;
        memoryUsage: NodeJS.MemoryUsage;
    }) => void;
    
    // Eventos del juego en tiempo real
    'game:loading': (stage: string, progress: number) => void;
    'game:world': (action: 'creating' | 'loading' | 'joining', details: any) => void;
    'game:connection': (type: 'server' | 'realms' | 'lan', address: string) => void;
    'game:performance': (fps: number, memory: string, chunkUpdates: number) => void;
    'game:chat': (message: string, type: 'player' | 'system' | 'command') => void;
    
    // Eventos técnicos avanzados
    'technical:classpath': (files: string[], analysis: ClasspathAnalysis) => void;
    'technical:memory': (usage: MemoryMetrics, recommendations: string[]) => void;
    'technical:render': (renderer: string, gpu: string, opengl: string) => void;
}

interface ClasspathAnalysis {
    totalJars: number;
    missing: string[];
    duplicates: string[];
    versionConflicts: string[];
    loadOrder: string[];
}

interface MemoryMetrics {
    heapUsed: number;
    heapMax: number;
    nativeUsed: number;
    gcTime: number;
    recommendation: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
}

export interface MinecraftLaunchOptions extends LauncherOptions {
    enableDetailedEvents?: boolean;
    enableTechnicalEvents?: boolean;
    enableGameEvents?: boolean;
    monitorPerformance?: boolean;
    monitorMemory?: boolean;
    monitorNetwork?: boolean;
    progressCallback?: (type: string, progress: number) => void;
    statusCallback?: (message: string) => void;
}

export class MinecraftLaunch extends EventEmitter {
    private options: MinecraftLaunchOptions;
    private launchProcess: LaunchResult | null = null;
    private performanceMonitor: NodeJS.Timeout | null = null;
    private gameState: {
        isRunning: boolean;
        startTime: number;
        phase: string;
        performance: {
            fps: number;
            memory: string;
            chunks: number;
        };
        } = {
            isRunning: false,
            startTime: 0,
            phase: 'idle',
        performance: {
            fps: 0,
            memory: '0MB',
            chunks: 0
        }
    };

    constructor(options: MinecraftLaunchOptions) {
        super();
        this.options = {
            enableDetailedEvents: true,
            enableTechnicalEvents: false,
            enableGameEvents: true,
            monitorPerformance: true,
            ...options
        };
    }

    async launch(): Promise<void> {
        try {
        this.emit('status', '🚀 Iniciando Minecraft...');
        this.gameState.phase = 'pre-launch';

        this.launchProcess = await ArgumentsBuilder(this.options);
        
        this.setupRealTimeMonitoring();
        
        this.emit('status', '✅ Minecraft lanzado exitosamente');
        
        } catch (error) {
        this.emit('error', error as Error);
        throw error;
        }
    }


    private setupRealTimeMonitoring(): void {
        if (!this.launchProcess) return;

        const { emitter } = this.launchProcess;

        emitter.on('status', (message: string) => {
        this.emit('status', message);
        this.options.statusCallback?.(message);
        });

        emitter.on('progress', (data: { type: string; message: string }) => {
        const percentage = this.extractPercentage(data.message);
        this.emit('progress', data.type, percentage, data.message);
        this.options.progressCallback?.(data.type, percentage);
        });

        emitter.on('game-started', () => {
        this.gameState.isRunning = true;
        this.gameState.startTime = Date.now();
        this.gameState.phase = 'running';
        this.emit('game-start');
        });

        emitter.on('game-exit', (data: any) => {
        this.gameState.isRunning = false;
        this.emit('game-exit', data.code, data.signal);
        this.cleanup();
        });

        emitter.on('error', (error: Error) => {
        this.emit('error', error);
        });

        if (this.options.enableDetailedEvents) {
        this.setupDetailedEvents(emitter);
        }

        if (this.options.enableTechnicalEvents) {
        this.setupTechnicalEvents(emitter);
        }

        if (this.options.enableGameEvents) {
        this.setupGameEvents(emitter);
        }

        if (this.options.monitorPerformance) {
        this.setupPerformanceMonitoring();
        }
    }

    private setupDetailedEvents(emitter: EventEmitter): void {
        emitter.on('phase-start', (phase: string) => {
        this.gameState.phase = phase;
        this.emit('debug:phase', `start:${phase}`, 0, { phase });
        });

        emitter.on('phase-end', (phase: string, time: number) => {
        this.emit('debug:phase', `end:${phase}`, time, { 
            phase, 
            duration: time,
            timestamp: Date.now()
        });
        });

        emitter.on('speed', (data: { phase: string; time: number; [key: string]: any }) => {
        this.emit('debug:performance', {
            totalTime: data.time,
            phaseTimes: { [data.phase]: data.time },
            memoryUsage: process.memoryUsage()
        });
        });

        emitter.on('debug', (data: { type: string; [key: string]: any }) => {
        switch (data.type) {
            case 'jvm-args':
            this.emit('debug:arguments', 'jvm', data.args, {
                memory: data.memory,
                classpathCount: data.classpathCount,
                proxy: data.proxy
            });
            break;

            case 'game-args':
            this.emit('debug:arguments', 'game', data.args, {
                window: data.window,
                features: data.features,
                assets: {
                root: data.assetsRoot,
                index: data.assetsIndexName
                }
            });
            break;

            case 'classpath':
            this.emit('debug:libraries', {
                total: data.count,
                lwjgl: data.classpath.filter((p: string) => p.includes('lwjgl')),
                natives: [data.nativesDir],
                classpath: data.classpath
            });
            
            this.analyzeClasspath(data.classpath);
            break;

            case 'final-command':
            this.emit('debug:performance', {
                totalTime: 0,
                phaseTimes: {},
                memoryUsage: process.memoryUsage()
            });
            break;
        }
        });

        emitter.on('libraries-processed', (data: any) => {
        this.emit('debug:libraries', {
            total: data.libraryCount,
            lwjgl: [],
            natives: [],
            classpath: []
        });
        });
    }

    private setupTechnicalEvents(emitter: EventEmitter): void {
        emitter.on('stdout', (output: string) => {
        this.processTechnicalOutput(output);
        });

        emitter.on('stderr', (output: string) => {
        this.processTechnicalOutput(output);
        });
    }

    private setupGameEvents(emitter: EventEmitter): void {
        let gameOutputBuffer = '';

        emitter.on('stdout', (output: string) => {
        gameOutputBuffer += output;
        
        const lines = gameOutputBuffer.split('\n');
        gameOutputBuffer = lines.pop() || '';

        for (const line of lines) {
            this.processGameOutput(line.trim());
        }
        });

        emitter.on('stderr', (output: string) => {
        this.processGameOutput(output.trim());
        });
    }

    private processGameOutput(line: string): void {
        if (!line) return;

        if (line.includes('Loading') || line.includes('Preparing')) {
        const stage = this.extractLoadingStage(line);
        const progress = this.extractLoadingProgress(line);
        this.emit('game:loading', stage, progress);
        }

        else if (line.includes('Creating level') || line.includes('Loading level')) {
        this.emit('game:world', 'creating', { action: 'create' });
        }
        else if (line.includes('Joined game') || line.includes('Connecting to')) {
        const serverInfo = this.extractServerInfo(line);
        this.emit('game:connection', 'server', serverInfo);
        }

        else if (line.includes('<') && line.includes('>')) {
        const chatData = this.extractChatMessage(line);
        this.emit('game:chat', chatData.message, 'player');
        }
        else if (line.startsWith('[System]') || line.includes('issued server command')) {
        this.emit('game:chat', line, 'system');
        }

        else if (line.includes('FPS:') || line.includes('Allocated:')) {
        const perfData = this.extractPerformanceInfo(line);
        if (perfData.fps > 0) {
            this.gameState.performance = perfData;
            this.emit('game:performance', perfData.fps, perfData.memory, perfData.chunks);
        }
        }

        else if (line.includes('OpenGL') || line.includes('GPU') || line.includes('Renderer')) {
        const renderInfo = this.extractRenderInfo(line);
        if (renderInfo.renderer) {
            this.emit('technical:render', renderInfo.renderer, renderInfo.gpu, renderInfo.opengl);
        }
        }
    }

    private processTechnicalOutput(output: string): void {
        if (output.includes('Allocated:') || output.includes('Heap:')) {
        const memoryInfo = this.extractMemoryInfo(output);
        if (memoryInfo.heapUsed > 0) {
            this.emit('technical:memory', memoryInfo, this.generateMemoryRecommendations(memoryInfo));
        }
        }

        if (output.includes('Warning:') || output.includes('Can\'t keep up!')) {
        this.emit('game:performance', 
            Math.max(0, this.gameState.performance.fps - 10),
            this.gameState.performance.memory,
            this.gameState.performance.chunks
        );
        }
    }

    private setupPerformanceMonitoring(): void {
        this.performanceMonitor = setInterval(() => {
        if (this.gameState.isRunning) {
            const memoryUsage = process.memoryUsage();
            this.emit('debug:performance', {
            totalTime: Date.now() - this.gameState.startTime,
            phaseTimes: this.launchProcess?.stats.phaseTimes || {},
            memoryUsage
            });

            // Monitoreo de memoria del sistema
            this.emit('technical:memory', 
            this.calculateMemoryMetrics(memoryUsage),
            this.generateSystemRecommendations(memoryUsage)
            );
        }
        }, 5000);
    }

    private analyzeClasspath(classpath: string[]): void {
        const analysis: ClasspathAnalysis = {
        totalJars: classpath.length,
        missing: [],
        duplicates: this.findDuplicateLibraries(classpath),
        versionConflicts: this.findVersionConflicts(classpath),
        loadOrder: classpath
        };

        this.emit('technical:classpath', classpath, analysis);
    }

    private extractPercentage(message: string): number {
        const match = message.match(/(\d+)%/);
        return match ? parseInt(match[1]!) : 0;
    }

    private extractLoadingStage(line: string): string {
        if (line.includes('Loading')) return 'loading';
        if (line.includes('Preparing')) return 'preparing';
        if (line.includes('Building')) return 'building';
        return 'unknown';
    }

    private extractLoadingProgress(line: string): number {
        const match = line.match(/(\d+)\/(\d+)/);
        if (match) {
        const current = parseInt(match[1]!);
        const total = parseInt(match[2]!);
        return total > 0 ? (current / total) * 100 : 0;
        }
        return 0;
    }

    private extractServerInfo(line: string): string {
        const match = line.match(/(\d+\.\d+\.\d+\.\d+:\d+)|([\w.-]+\.[a-z]{2,})/);
        return match ? match[0] : 'unknown';
    }

    private extractChatMessage(line: string): { player: string; message: string } {
        const match = line.match(/<(\w+)> (.+)/);
        return {
        player: match ? match[1]! : 'unknown',
        message: match ? match[2]! : line
        };
    }

    private extractPerformanceInfo(line: string): { fps: number; memory: string; chunks: number } {
        const fpsMatch = line.match(/FPS:? (\d+)/);
        const memoryMatch = line.match(/(\d+\.?\d*[KMG]?B)/);
        const chunksMatch = line.match(/(\d+)\s*chunks/);

        return {
        fps: fpsMatch ? parseInt(fpsMatch[1]!) : 0,
        memory: memoryMatch ? memoryMatch[1]! : '0MB',
        chunks: chunksMatch ? parseInt(chunksMatch[1]!) : 0
        };
    }

    private extractRenderInfo(line: string): { renderer: string; gpu: string; opengl: string } {
        const gpuMatch = line.match(/GPU:? ([^,\n]+)/);
        const rendererMatch = line.match(/Renderer:? ([^,\n]+)/);
        const openglMatch = line.match(/OpenGL:? ([^,\n]+)/);

        return {
        renderer: rendererMatch ? rendererMatch[1]! : '',
        gpu: gpuMatch ? gpuMatch[1]! : '',
        opengl: openglMatch ? openglMatch[1]! : ''
        };
    }

    private extractMemoryInfo(line: string): MemoryMetrics {
        const heapMatch = line.match(/Heap:? (\d+)[KMG]?\/?(\d+)?[KMG]?/);
        const nativeMatch = line.match(/Native:? (\d+)[KMG]?/);
        
        return {
        heapUsed: heapMatch ? parseInt(heapMatch[1]!) * 1024 * 1024 : 0,
        heapMax: heapMatch && heapMatch[2] ? parseInt(heapMatch[2]) * 1024 * 1024 : 0,
        nativeUsed: nativeMatch ? parseInt(nativeMatch[1]!) * 1024 * 1024 : 0,
        gcTime: 0,
        recommendation: 'OPTIMAL'
        };
    }

    private calculateMemoryMetrics(usage: NodeJS.MemoryUsage): MemoryMetrics {
        const heapUsage = usage.heapUsed / (1024 * 1024);
        const heapMax = usage.heapTotal / (1024 * 1024);
        
        let recommendation: 'OPTIMAL' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
        if (heapUsage > heapMax * 0.9) recommendation = 'CRITICAL';
        else if (heapUsage > heapMax * 0.7) recommendation = 'WARNING';

        return {
        heapUsed: heapUsage,
        heapMax: heapMax,
        nativeUsed: usage.rss / (1024 * 1024),
        gcTime: 0,
        recommendation
        };
    }

    private findDuplicateLibraries(classpath: string[]): string[] {
        const seen = new Set();
        const duplicates: string[] = [];
        
        classpath.forEach(lib => {
        const libName = lib.split('/').pop();
        if (seen.has(libName)) {
            duplicates.push(lib);
        }
        seen.add(libName);
        });
        
        return duplicates;
    }

    private findVersionConflicts(classpath: string[]): string[] {
        const libVersions = new Map();
        const conflicts: string[] = [];

        classpath.forEach(lib => {
        const match = lib.match(/([\w.-]+)-(\d+\.\d+\.\d+)/);
        if (match) {
            const [, name, version] = match;
            if (libVersions.has(name) && libVersions.get(name) !== version) {
            conflicts.push(`${name} (${libVersions.get(name)} vs ${version})`);
            }
            libVersions.set(name, version);
        }
        });

        return conflicts;
    }

    private generateMemoryRecommendations(metrics: MemoryMetrics): string[] {
        const recommendations: string[] = [];
        
        if (metrics.recommendation === 'CRITICAL') {
        recommendations.push('Aumentar memoria máxima de Java (-Xmx)');
        recommendations.push('Cerrar otras aplicaciones');
        } else if (metrics.recommendation === 'WARNING') {
        recommendations.push('Monitorizar uso de memoria');
        recommendations.push('Considerar optimizar configuración');
        }
        
        return recommendations;
    }

    private generateSystemRecommendations(usage: NodeJS.MemoryUsage): string[] {
        const recommendations: string[] = [];
        const usedPercent = (usage.heapUsed / usage.heapTotal) * 100;

        if (usedPercent > 90) {
        recommendations.push('🚨 CRÍTICO: Memoria casi agotada');
        } else if (usedPercent > 70) {
        recommendations.push('⚠️  Memoria en niveles altos');
        }

        return recommendations;
    }

    private cleanup(): void {
        if (this.performanceMonitor) {
        clearInterval(this.performanceMonitor);
        this.performanceMonitor = null;
        }
        
        this.gameState.isRunning = false;
        this.gameState.phase = 'exited';
    }

    kill(): boolean {
        this.cleanup();
        return this.launchProcess?.kill() || false;
    }

    getState() {
        return {
        ...this.gameState,
        runningTime: this.gameState.isRunning ? Date.now() - this.gameState.startTime : 0,
        pid: this.launchProcess?.pid
        };
    }

    getStats() {
        return this.launchProcess?.stats || null;
    }
}

export type { ClasspathAnalysis, MemoryMetrics };
export type MinecraftLaunchEventMap = MinecraftLaunchEvents;
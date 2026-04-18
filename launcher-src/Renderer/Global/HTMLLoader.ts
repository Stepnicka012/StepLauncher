import { Virtualizer, type VirtualizerOptions } from "./Virtual/Index.js";
import { memo } from "./Virtual/Utils.js";

interface HTMLFrameLoaderOptions {
    debug?: boolean;
}
interface PageConfig {
    id: string;
    url: string;
    delay?: number;
    onOpen?: (element: HTMLElement, loader: HTMLFrameLoader) => void;
    onClose?: (element: HTMLElement, loader: HTMLFrameLoader) => void;
    onScriptLoad?: (scriptModule: any, loader: HTMLFrameLoader) => void;
    virtualScroll?: boolean;
    chunkSize?: number;
    maxCacheAge?: number;
    allowReexecuteScript?: boolean;
    preloadScript?: boolean;
    priority?: "low" | "normal" | "high";
    scriptOptions?: Record<string, any>;
}

interface PageMeta {
    script?: string;
    scriptEntry?: string;
    lazyImages?: string;
    removeImages?: string;
    virtualScroll?: string;
    chunkSize?: string;
    preloadScript?: string;
}

interface CachedPage {
    id: string;
    element: HTMLElement;
    meta: PageMeta;
    scriptModule: any;
    content: string;
    isActive: boolean;
    scriptExecuted: boolean;
    scriptLoadedOnPreload: boolean;
    lastAccess: number;
    accessCount: number;
    onOpen?: (element: HTMLElement, loader: HTMLFrameLoader) => void;
    onClose?: (element: HTMLElement, loader: HTMLFrameLoader) => void;
    onScriptLoad?: (scriptModule: any, loader: HTMLFrameLoader) => void;
    virtualScrollHandler?: IntersectionObserver;
    virtualizer?: Virtualizer<any, any>;
    abortController?: AbortController;
    allowReexecuteScript?: boolean;
    priority: "low" | "normal" | "high";
}

interface ParsedContent {
    meta: PageMeta;
    content: string;
}
interface ScriptOptions {
    debug?: boolean;
    [key: string]: any;
}

interface ScriptAPI {
    config: any;
    fileDialog: any;
    settingsManager: any;
    virtualizer?: Virtualizer<any, any>;
    options: ScriptOptions;
}

interface PerformanceMetrics {
    loadsCount: number;
    cacheHits: number;
    cacheMisses: number;
    avgLoadTime: number;
}

export class HTMLFrameLoader {
    private container: HTMLElement;
    private pages = new Map<string, PageConfig>();
    private cache = new Map<string, CachedPage>();
    private activePage: string | null = null;
    private isTransitioning = false;
    
    private debug: boolean = false;
    private readonly MAX_CACHE_SIZE = 8;
    private readonly IDLE_THRESHOLD = 300000; // 5 minutes
    private readonly CHUNK_THRESHOLD = 150000;
    private readonly DEFAULT_CHUNK_SIZE = 30000;
    
    private cleanupInterval: number | null = null;
    private performanceMetrics: PerformanceMetrics = {
        loadsCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgLoadTime: 0,
    };
    
    constructor(
        containerId: string = "HTML_Container",
        options?: HTMLFrameLoaderOptions,
    ) {
        const el = document.getElementById(containerId);
        if (!el)
            throw new Error(`[HTMLFrameLoader] Container #${containerId} not found`);
        this.container = el;
        this.debug = options?.debug ?? false;
        this.init();
    }
    
    private init(): void {
        this.container.classList.add("HTML_Container");
        this.bindEvents();
        this.startCleanupRoutine();
        this.setupPerformanceMonitoring();
    }
    
    private bindEvents(): void {
        document.addEventListener("click", this.handleClick.bind(this), {
            passive: false,
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && this.activePage) {
                const page = this.cache.get(this.activePage);
                if (page?.virtualizer) {
                    page.virtualizer.measure();
                }
            }
        });
    }
    
    private handleClick(e: Event): void {
        const target = e.target as HTMLElement;
        
        const opener = target.closest<HTMLElement>("[data-html-open]");
        if (opener) {
            e.preventDefault();
            const pageId = opener.dataset.htmlOpen;
            if (pageId) this.open(pageId);
            return;
        }
        
        const closer = target.closest<HTMLElement>("[data-html-close]");
        if (closer) {
            e.preventDefault();
            const pageId = closer.dataset.htmlClose || this.activePage;
            if (pageId) this.close(pageId);
        }
    }
    
    private setupPerformanceMonitoring(): void {
        if (!this.debug) return;
        
        setInterval(() => {
            console.log("[HTMLFrameLoader] Performance Metrics:", {
                ...this.performanceMetrics,
                cacheSize: this.cache.size,
                hitRate:
                (this.performanceMetrics.cacheHits /
                    Math.max(
                        1,
                        this.performanceMetrics.cacheHits +
                        this.performanceMetrics.cacheMisses,
                    )) *
                    100,
                });
            }, 60000);
        }
        
        private startCleanupRoutine(): void {
            this.cleanupInterval = window.setInterval(() => {
                this.clearUnusedPages();
            }, 90000);
        }
        
        private clearUnusedPages(): void {
            const now = Date.now();
            const toDelete: string[] = [];
            
            const entries = Array.from(this.cache.entries())
            .filter(([_, page]) => !page.isActive)
            .map(([key, page]) => ({
                key,
                page,
                score: this.calculateEvictionScore(page, now),
            }))
            .sort((a, b) => b.score - a.score);
            
            for (const { key, page } of entries) {
                if (now - page.lastAccess > this.IDLE_THRESHOLD) {
                    toDelete.push(key);
                }
            }
            
            if (this.cache.size - toDelete.length > this.MAX_CACHE_SIZE) {
                const excess = this.cache.size - toDelete.length - this.MAX_CACHE_SIZE;
                for (let i = 0; i < excess && i < entries.length; i++) {
                    if (!toDelete.includes(entries[i]!.key)) {
                        toDelete.push(entries[i]!.key);
                    }
                }
            }
            
            for (const key of toDelete) {
                this.destroy(key);
            }
        }
        
        private calculateEvictionScore(page: CachedPage, now: number): number {
            const timeSinceAccess = now - page.lastAccess;
            const priorityWeight =
            page.priority === "high" ? 0.3 : page.priority === "normal" ? 1.0 : 1.5;
            const accessWeight = 1 / (page.accessCount + 1);
            
            return timeSinceAccess * accessWeight * priorityWeight;
        }
        
        public register(...configs: PageConfig[]): void {
            for (const cfg of configs) {
                if (!cfg.id || !cfg.url) {
                    console.warn("[HTMLFrameLoader] Invalid config", cfg);
                    continue;
                }
                const key = String(cfg.id).toLowerCase();
                cfg.id = String(cfg.id);
                cfg.priority = cfg.priority || "normal";
                this.pages.set(key, cfg);
            }
        }
        
        public async open(id: string): Promise<void> {
            if (this.isTransitioning) return;
            
            const key = String(id).toLowerCase();
            const config = this.pages.get(key);
            if (!config) {
                console.warn(`[HTMLFrameLoader] Page "${id}" not registered`);
                return;
            }
            
            this.isTransitioning = true;
            const startTime = performance.now();
            
            try {
                let wasInCache = this.cache.has(key);
                
                if (!wasInCache) {
                    await this.load(config);
                    this.performanceMetrics.cacheMisses++;
                } else {
                    const cached = this.cache.get(key);
                    if (cached) {
                        cached.lastAccess = Date.now();
                        cached.accessCount++;
                    }
                    this.performanceMetrics.cacheHits++;
                }
                
                if (config.delay) await this.wait(config.delay);
                
                await this.show(key);
                
                const loadTime = performance.now() - startTime;
                this.performanceMetrics.loadsCount++;
                this.performanceMetrics.avgLoadTime =
                (this.performanceMetrics.avgLoadTime *
                    (this.performanceMetrics.loadsCount - 1) +
                    loadTime) /
                    this.performanceMetrics.loadsCount;
                } finally {
                    this.isTransitioning = false;
                }
            }
            
            public async close(id: string): Promise<void> {
                const key = String(id).toLowerCase();
                const cached = this.cache.get(key);
                if (!cached) return;
                
                await this.nextFrame();
                this.hide(key);
            }
            
            public async preload(...ids: string[]): Promise<void> {
                const promises: Promise<void>[] = [];
                
                for (const id of ids) {
                    const key = id.toLowerCase();
                    const config = this.pages.get(key);
                    if (!config || this.cache.has(key)) continue;
                    
                    promises.push(this.loadWithPreloadScript(config));
                }
                
                await Promise.allSettled(promises);
            }
            
            private async loadWithPreloadScript(config: PageConfig): Promise<void> {
                await this.load(config, true);
                
                const key = config.id.toLowerCase();
                const page = this.cache.get(key);
                
                if (page) {
                    page.isActive = false;
                    
                    const shouldPreloadScript =
                    config.preloadScript || page.meta.preloadScript === "true";
                    
                    if (
                        shouldPreloadScript &&
                        page.scriptModule &&
                        !page.scriptLoadedOnPreload
                    ) {
                        await this.executeScriptOnPreload(page);
                        page.scriptLoadedOnPreload = true;
                        page.onScriptLoad?.(page.scriptModule, this);
                    }
                }
            }
            
            private async executeScriptOnPreload(page: CachedPage): Promise<void> {
                if (!page.scriptModule) return;
                
                return new Promise((resolve) => {
                    const entry = page.meta.scriptEntry || "preload";
                    const mod = page.scriptModule;
                    let fn: any = null;
                    
                    if (typeof mod[entry] === "function") {
                        fn = mod[entry];
                    } else if (mod.default && typeof mod.default[entry] === "function") {
                        fn = mod.default[entry];
                    } else if (typeof mod.preload === "function") {
                        fn = mod.preload;
                    } else if (mod.default && typeof mod.default.preload === "function") {
                        fn = mod.default.preload;
                    }
                    
                    if (typeof fn === "function") {
                        const api: ScriptAPI = {
                            config: (window as any).Config || null,
                            fileDialog: (window as any).FileDialog || null,
                            settingsManager: (window as any).AppSettingsManager || null,
                            virtualizer: page.virtualizer,
                            options: {
                                debug: this.debug,
                                ...this.getScriptOptions(page.id),
                                isPreload: true,
                            },
                        };
                        
                        try {
                            const result = fn(page.element, this, api);
                            page.scriptExecuted = true;
                            
                            if (result instanceof Promise) {
                                result
                                .then(() => resolve())
                                .catch((err) => {
                                    console.error(
                                        "[HTMLFrameLoader] Error in async preload script",
                                        err,
                                    );
                                    resolve();
                                });
                            } else {
                                resolve();
                            }
                        } catch (err) {
                            console.error(
                                "[HTMLFrameLoader] Error executing preload script",
                                err,
                            );
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                });
            }
            
            private async load(
                config: PageConfig,
                isPreload: boolean = false,
            ): Promise<void> {
                const key = String(config.id).toLowerCase();
                if (this.cache.has(key)) return;
                
                const abortController = new AbortController();
                let meta: PageMeta = {};
                let scriptModule: any = null;
                
                try {
                    const res = await fetch(config.url, {
                        signal: abortController.signal,
                        priority: config.priority === "high" ? "high" : "auto",
                    } as RequestInit);
                    
                    if (!res.ok) {
                        throw new Error(
                            `[HTMLFrameLoader] HTTP ${res.status} at ${config.url}`,
                        );
                    }
                    
                    const raw = await res.text();
                    const parsed = this.parseContent(raw);
                    
                    meta = parsed.meta;
                    const htmlContent = this.optimize(parsed.content, meta);
                    
                    const contentDiv = document.createElement("div");
                    contentDiv.id = config.id;
                    contentDiv.className = "HTML_Content";
                    contentDiv.style.display = "none";
                    
                    const chunkSize =
                    config.chunkSize ||
                    (meta.chunkSize ? parseInt(meta.chunkSize) : this.DEFAULT_CHUNK_SIZE);
                    const shouldChunk =
                    chunkSize > 0 || htmlContent.length > this.CHUNK_THRESHOLD;
                    
                    if (shouldChunk) {
                        await this.loadContentChunked(contentDiv, htmlContent, chunkSize);
                    } else {
                        contentDiv.innerHTML = htmlContent;
                    }
                    
                    this.container.appendChild(contentDiv);
                    
                    if (meta.script) {
                        scriptModule = await this.loadScript(meta.script, config.url);
                    }
                    
                    const cachedPage: CachedPage = {
                        id: config.id,
                        element: contentDiv,
                        meta,
                        scriptModule,
                        content: htmlContent,
                        isActive: false,
                        scriptExecuted: false,
                        scriptLoadedOnPreload: false,
                        lastAccess: Date.now(),
                        accessCount: 0,
                        onOpen: config.onOpen,
                        onClose: config.onClose,
                        onScriptLoad: config.onScriptLoad,
                        abortController,
                        allowReexecuteScript: config.allowReexecuteScript,
                        priority: config.priority || "normal",
                    };
                    
                    this.cache.set(key, cachedPage);
                    
                    const shouldVirtualScroll =
                    config.virtualScroll || meta.virtualScroll === "true";
                    if (shouldVirtualScroll) {
                        cachedPage.virtualizer = this.setupVirtualScroll(
                            contentDiv,
                            cachedPage,
                        );
                    }
                } catch (err: any) {
                    if (err.name !== "AbortError") {
                        console.error("[HTMLFrameLoader] Load error:", err);
                    }
                    throw err;
                }
            }
            
            private async loadContentChunked(
                container: HTMLElement,
                html: string,
                chunkSize: number,
            ): Promise<void> {
                const chunks: string[] = [];
                let remaining = html;
                
                while (remaining.length > 0) {
                    let chunk = remaining.slice(0, chunkSize);
                    
                    const lastCloseTag = chunk.lastIndexOf(">");
                    if (lastCloseTag !== -1 && lastCloseTag < chunk.length - 1) {
                        chunk = chunk.slice(0, lastCloseTag + 1);
                    }
                    
                    chunks.push(chunk);
                    remaining = remaining.slice(chunk.length);
                }
                
                for (let i = 0; i < chunks.length; i++) {
                    const wrapper = document.createElement("div");
                    wrapper.innerHTML = chunks[i]!;
                    container.appendChild(wrapper);
                    
                    if (i % 3 === 0) {
                        await this.nextFrame();
                    }
                }
            }
            
            private async loadScript(scriptPath: string, baseUrl: string): Promise<any> {
                try {
                    const rootDir = window.location.href.substring(
                        0,
                        window.location.href.lastIndexOf("/") + 1,
                    );
                    const scriptUrl = new URL(scriptPath, rootDir).href;
                    
                    if (this.debug)
                        console.log("Script path:", scriptPath, "Base URL:", baseUrl);
                    if (this.debug) console.log("Primary script URL:", scriptUrl);
                    
                    return await import(/* @vite-ignore */ scriptUrl);
                } catch (err) {
                    console.error("[HTMLFrameLoader] Script load error:", scriptPath, err);
                    
                    let absoluteBaseUrl = baseUrl;
                    
                    if (
                        baseUrl.startsWith("./") ||
                        baseUrl.startsWith("../") ||
                        (!baseUrl.startsWith("http://") &&
                        !baseUrl.startsWith("https://") &&
                        !baseUrl.startsWith("file://") &&
                        !baseUrl.startsWith("blob:"))
                    ) {
                        const currentDir = window.location.href.substring(
                            0,
                            window.location.href.lastIndexOf("/") + 1,
                        );
                        absoluteBaseUrl = new URL(baseUrl, currentDir).href;
                    }
                    
                    const fallbackAttempts = [
                        () => new URL(scriptPath, absoluteBaseUrl).href,
                        () => new URL(scriptPath, window.location.href).href,
                        () => new URL(scriptPath, window.location.origin + "/").href,
                        () => {
                            const cleanPath = scriptPath.replace(/^(\.\.\/|\.\/)+/, "");
                            return new URL(cleanPath, window.location.origin + "/").href;
                        },
                    ];
                    
                    for (const attempt of fallbackAttempts) {
                        try {
                            const fallbackUrl = attempt();
                            if (this.debug) console.log("Attempting fallback URL:", fallbackUrl);
                            const module = await import(/* @vite-ignore */ fallbackUrl);
                            if (this.debug) console.log("Success with fallback!");
                            return module;
                        } catch (e) {
                            console.error("Fallback attempt failed:", e);
                        }
                    }
                    
                    return null;
                }
            }
            
            private setupVirtualScroll(
                element: HTMLElement,
                cachedPage: CachedPage,
            ): Virtualizer<HTMLElement, any> {
                const scrollElement =
                (element.querySelector(".virtual-scroll-container") as HTMLElement) ||
                element;
                
                const items = Array.from(element.querySelectorAll("[data-virtual-item]"));
                const itemCount = items.length;
                
                if (itemCount === 0) {
                    console.warn(
                        "[HTMLFrameLoader] No virtual items found for",
                        cachedPage.id,
                    );
                    return null as any;
                }
                
                const estimateSize = memo(
                    () => [itemCount] as const,
                    () => 100,
                    {
                        key: false,
                        debug: () => false,
                    },
                );
                
                const virtualizerOptions: Partial<VirtualizerOptions<HTMLElement, any>> = {
                    count: itemCount,
                    getScrollElement: () => scrollElement,
                    estimateSize,
                    overscan: 5,
                    scrollMargin: 0,
                    gap: 0,
                    scrollPaddingStart: 0,
                    scrollPaddingEnd: 0,
                    horizontal: false,
                    debug: this.debug,
                };
                
                const virtualizer = new Virtualizer(
                    virtualizerOptions as VirtualizerOptions<HTMLElement, any>,
                );
                
                const renderVirtualItems = () => {
                    const virtualItems = virtualizer.getVirtualItems();
                    
                    items.forEach((item, index) => {
                        const virtualItem = virtualItems.find((vi) => vi.index === index);
                        const htmlItem = item as HTMLElement;
                        
                        if (virtualItem) {
                            htmlItem.style.display = "";
                            htmlItem.style.transform = `translateY(${virtualItem.start}px)`;
                        } else {
                            htmlItem.style.display = "none";
                        }
                    });
                };
                
                virtualizer._didMount();
                virtualizer.calculateRange();
                renderVirtualItems();
                
                scrollElement.addEventListener("scroll", () => {
                    virtualizer.calculateRange();
                    renderVirtualItems();
                });
                
                return virtualizer;
            }
            
            private async show(id: string): Promise<void> {
                const ApplicationView = document.getElementById("Main_Root");
                const key = String(id).toLowerCase();
                const page = this.cache.get(key);
                if (!page) return;
                
                if (this.activePage && this.activePage !== key) {
                    const prevPage = this.cache.get(this.activePage);
                    if (prevPage) {
                        prevPage.onClose?.(prevPage.element, this);
                    }
                }
                
                this.hideAllPanels();
                await this.nextFrame();
                
                this.container.classList.add("Visible");
                this.container.style.display = "block";
                ApplicationView?.classList.add("Unvisible");
                
                page.element.style.display = "block";
                page.element.classList.remove("Unvisible");
                page.element.classList.add("Visible");
                page.isActive = true;
                page.lastAccess = Date.now();
                this.activePage = key;
                
                await this.nextFrame();
                
                if (!page.scriptExecuted || page.allowReexecuteScript) {
                    this.executeScriptOptimized(page);
                }
                
                page.onOpen?.(page.element, this);
                
                if (page.virtualizer) {
                    page.virtualizer.measure();
                    page.virtualizer.calculateRange();
                }
            }
            
            private hideAllPanels(): void {
                for (const p of this.cache.values()) {
                    p.element.style.display = "none";
                    p.element.classList.remove("Visible");
                    p.element.classList.add("Unvisible");
                    p.isActive = false;
                }
            }
            
            private hide(id: string): void {
                const key = id.toLowerCase();
                const page = this.cache.get(key);
                if (!page) return;
                
                page.element.style.display = "none";
                page.element.classList.remove("Visible");
                page.element.classList.add("Unvisible");
                page.isActive = false;
                
                const hasActive = [...this.cache.values()].some((p) => p.isActive);
                
                if (!hasActive) {
                    this.container.classList.remove("Visible");
                    this.container.style.display = "none";
                    document.getElementById("Main_Root")?.classList.remove("Unvisible");
                    this.activePage = null;
                }
                
                page.onClose?.(page.element, this);
            }
            
            private executeScriptOptimized(page: CachedPage): void {
                if (!page.scriptModule) return;
                
                if (page.scriptExecuted && !page.allowReexecuteScript) {
                    return;
                }
                
                const runScript = () => {
                    const entry = page.meta.scriptEntry || "default";
                    const mod = page.scriptModule;
                    let fn: any = null;
                    
                    if (typeof mod[entry] === "function") {
                        fn = mod[entry];
                    } else if (mod.default && typeof mod.default[entry] === "function") {
                        fn = mod.default[entry];
                    } else if (entry === "default" && typeof mod.default === "function") {
                        fn = mod.default;
                    }
                    
                    if (typeof fn === "function") {
                        const api: ScriptAPI = {
                            config: (window as any).Config || null,
                            fileDialog: (window as any).FileDialog || null,
                            settingsManager: (window as any).AppSettingsManager || null,
                            virtualizer: page.virtualizer,
                            options: {
                                debug: this.debug,
                                ...this.getScriptOptions(page.id),
                            },
                        };
                        
                        try {
                            fn(page.element, this, api);
                            page.scriptExecuted = true;
                            
                            if (this.debug) {
                                console.log(
                                    `[HTMLFrameLoader] Script executed for "${page.id}" with options:`,
                                    api.options,
                                );
                            }
                        } catch (err) {
                            console.error("[HTMLFrameLoader] Script execution error", err);
                        }
                    }
                };
                
                if ("requestIdleCallback" in window) {
                    requestIdleCallback(runScript, { timeout: 2000 });
                } else {
                    setTimeout(runScript, 0);
                }
            }
            
            private destroyScript(page: CachedPage): void {
                if (!page.scriptModule) return;
                
                const mod = page.scriptModule;
                let destroyFn: any = null;
                
                if (typeof mod.destroy === "function") {
                    destroyFn = mod.destroy;
                } else if (mod.default && typeof mod.default.destroy === "function") {
                    destroyFn = mod.default.destroy;
                } else if (typeof mod.Destroy === "function") {
                    destroyFn = mod.Destroy;
                } else if (mod.default && typeof mod.default.Destroy === "function") {
                    destroyFn = mod.default.Destroy;
                }
                
                if (typeof destroyFn === "function") {
                    try {
                        destroyFn(page.element, this);
                        console.log(`[HTMLFrameLoader] Destroyed script for "${page.id}"`);
                    } catch (err) {
                        console.error(
                            `[HTMLFrameLoader] Error destroying script for "${page.id}"`,
                            err,
                        );
                    }
                }
                
                page.scriptExecuted = false;
                page.scriptLoadedOnPreload = false;
            }
            private getScriptOptions(pageId: string): ScriptOptions {
                const config = this.pages.get(pageId.toLowerCase());
                if (!config) return {};
                
                return {
                    debug: this.debug,
                    pageId: config.id,
                    pageUrl: config.url,
                    allowReexecute: config.allowReexecuteScript || false,
                    priority: config.priority || "normal",
                };
            }
            private parseContent(raw: string): ParsedContent {
                const metaRegex = /<!---\s*([\s\S]*?)\s*--->/;
                const match = raw.match(metaRegex);
                
                if (!match) {
                    return { meta: {}, content: raw };
                }
                
                const content = raw.replace(match[0], "").trim();
                const meta: PageMeta = {};
                const lines = match[1]!.split("\n");
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith("//")) continue;
                    
                    const colonIdx = trimmed.indexOf(":");
                    if (colonIdx === -1) continue;
                    
                    const key = trimmed.slice(0, colonIdx).trim();
                    const value = trimmed
                    .slice(colonIdx + 1)
                    .replace(/['",]/g, "")
                    .trim();
                    
                    if (key && value) {
                        (meta as any)[key] = value;
                    }
                }
                
                return { meta, content };
            }
            
            private optimize(html: string, meta: PageMeta): string {
                if (meta.lazyImages === "true") {
                    html = html.replace(/<img\s+src=/gi, '<img loading="lazy" src=');
                }
                if (meta.removeImages === "true") {
                    html = html.replace(/<img[^>]*>/gi, "");
                }
                return html;
            }
            
            public destroy(id: string): void {
                const key = String(id).toLowerCase();
                const page = this.cache.get(key);
                if (!page) return;
                
                if (page.isActive) {
                    this.hide(key);
                }
                
                this.destroyScript(page);
                
                page.abortController?.abort();
                page.virtualScrollHandler?.disconnect();
                
                if (page.virtualizer) {
                    page.virtualizer.measure();
                    page.virtualizer = undefined;
                }
                
                page.element.remove();
                this.cache.delete(key);
            }
            
            public destroyAll(): void {
                if (this.cleanupInterval !== null) {
                    clearInterval(this.cleanupInterval);
                }
                
                for (const key of this.cache.keys()) {
                    this.destroy(key);
                }
                
                this.cache.clear();
                this.pages.clear();
            }
            
            private nextFrame(): Promise<void> {
                return new Promise((r) => requestAnimationFrame(() => r()));
            }
            
            private wait(ms: number): Promise<void> {
                return new Promise((r) => setTimeout(r, ms));
            }
            
            public getActive(): string | null {
                if (!this.activePage) return null;
                const page = this.cache.get(this.activePage);
                return page?.id ?? null;
            }
            
            public isOpen(id: string): boolean {
                const key = String(id).toLowerCase();
                return this.cache.get(key)?.isActive ?? false;
            }
            
            public getRegistered(): string[] {
                return Array.from(this.pages.values()).map((v: PageConfig) => v.id);
            }
            
            public getCached(): string[] {
                return Array.from(this.cache.values()).map((v: CachedPage) => v.id);
            }
            
            public getCacheStats(): {
                size: number;
                maxSize: number;
                idleThreshold: number;
                metrics: PerformanceMetrics;
            } {
                return {
                    size: this.cache.size,
                    maxSize: this.MAX_CACHE_SIZE,
                    idleThreshold: this.IDLE_THRESHOLD,
                    metrics: { ...this.performanceMetrics },
                };
            }
            
            public getPageMetrics(id: string): {
                accessCount: number;
                lastAccess: number;
                isActive: boolean;
                scriptExecuted: boolean;
                scriptLoadedOnPreload: boolean;
                hasVirtualizer: boolean;
            } | null {
                const key = String(id).toLowerCase();
                const page = this.cache.get(key);
                if (!page) return null;
                
                return {
                    accessCount: page.accessCount,
                    lastAccess: page.lastAccess,
                    isActive: page.isActive,
                    scriptExecuted: page.scriptExecuted,
                    scriptLoadedOnPreload: page.scriptLoadedOnPreload,
                    hasVirtualizer: !!page.virtualizer,
                };
            }
            
            public forceRefresh(id: string): Promise<void> {
                const key = String(id).toLowerCase();
                const config = this.pages.get(key);
                if (!config) {
                    console.warn(`[HTMLFrameLoader] Page "${id}" not registered`);
                    return Promise.resolve();
                }
                
                this.destroy(id);
                return this.load(config);
            }
        }
        
import type {
    PageRequest,
    PageMetadata,
    ParsedHTML,
    CachedPanel
} from '../../Types/Dev/HTMLLoader.js';

import { LoaderScreen } from '../Global/Loader.js';

export class HTMLLoader {
    private container: HTMLElement;
    private loader = LoaderScreen;
    public pages = new Map<string, PageRequest>();
    private sidebar = document.getElementById('Sidebar');
    private content = document.querySelector('.App-Content') as HTMLElement | null;
    public cache = new Map<string, CachedPanel>();

    constructor() {
        const el = document.getElementById('HTMLContainerPanels');
        if (!el) throw new Error('[HTMLLoader] #HTMLContainerPanels no encontrado');
        this.container = el;
        this.bindEvents();
    }

    private metaBool(v: any): boolean {
        return v === true || v === 'true';
    }

    private nextFrame(): Promise<void> {
        return new Promise(r => requestAnimationFrame(() => r()));
    }

    private wait(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    public register(...pages: PageRequest[]): void {
        for (const page of pages) {
            this.pages.set(page.id, page);
        }
    }

    public getPages(): Map<string, PageRequest> {
        const visiblePages = new Map<string, PageRequest>();
        this.pages.forEach((page) => {
            if (!page.remove) {
                if (!page.title) {
                    window.StepLauncherLogger.warn(`[HTMLLoader] El panel "${page.id}" no tiene title definido`);
                    return;
                }
                visiblePages.set(page.title, page);
            }
        });
        return visiblePages;
    }
    public getCache(): Map<string, CachedPanel> {
        const visibleCache = new Map<string, CachedPanel>();
        this.cache.forEach((panel) => {
            const page = this.pages.get(panel.id);
            if (!page?.cleanUp) {
                visibleCache.set(panel.id, panel);
            }
        });
        return visibleCache;
    }

    public async preloadPage(id: string) {
        const page = this.pages.get(id);
        if (!page) return;
        await this.load(page);
    }

    private optimizeHtml(html: string, meta: PageMetadata): string {
        if (meta.removeImages) return html.replace(/<img[^>]*>/g, '');
        if (meta.lazyLoadImages) {
            return html.replace(/<img\s+src=/gi, '<img data-src=');
        }
        return html;
    }

    private async loadScript(path: string): Promise<any> {
        return await import(/* @vite-ignore */ path);
    }

    private reExecuteEntry(panel: CachedPanel): void {
        if (panel.scriptExecuted) return;

        const entry = panel.metadata.scriptEntryPoint;
        const mod = panel.scriptModule;
        if (!entry || !mod) return;

        let fn: any = null;
        if (typeof mod[entry] === 'function') fn = mod[entry];
        else if (mod.default && typeof mod.default[entry] === 'function') fn = mod.default[entry];
        else if (entry === 'default' && typeof mod.default === 'function') fn = mod.default;

        if (typeof fn === 'function') {
            // Pasarle el elemento y opcionalmente HTMLLoader
            fn(panel.element, this);
        } else {
            console.warn(`[HTMLLoader] EntryPoint '${entry}' no encontrado`, mod);
        }

        panel.scriptExecuted = true;
    }


    private bindEvents(): void {
        document.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;

            const close = target.closest<HTMLElement>('[data-closePanel]');
            if (close) {
                this.close(close.dataset.closepanel!);
                return;
            }

            const open = target.closest<HTMLElement>('[data-openPanel]');
            if (open) {
                this.open(open.dataset.openpanel!);
            }
        });
    }

    private applyLayoutMeta(meta: PageMetadata): void {
        if (this.sidebar) {
            this.sidebar.classList.toggle('HTMLLoader-Hide-Sidebar', this.metaBool(meta.hideSidebar));
        }
        if (this.content) {
            this.content.classList.toggle('HTMLLoader-Hide-Content', this.metaBool(meta.hideContentMain));
        }
    }

    public async open(id: string): Promise<void> {
        const page = this.pages.get(id);
        if (!page) return;

        this.loader.open();
        await this.nextFrame();

        try {
            if (!this.cache.has(id)) {
                await this.load(page);
            }
        } finally {
            this.loader.close();
        }

        await this.nextFrame();
        if (page.timeout > 0) await this.wait(page.timeout);

        this.show(id);
    }

    public async close(id: string): Promise<void> {
        const page = this.pages.get(id);
        if (!page) return;
        this.loader.open();
        await this.nextFrame();
        try {
            if (!this.cache.has(id)) {
                await this.load(page);
            }
        } finally {
            this.loader.close();
        }

        await this.nextFrame();
        if (page.timeout > 0) await this.wait(page.timeout);
        this.loader.open();
        this.unload(id);
    }

    private unload(id: string): void {
        const panel = this.cache.get(id);
        if (!panel) return;
        panel.element.classList.remove('HTMLLoader-Panel-Active');
        panel.element.classList.add('HTMLLoader-Panel-Unvisible');
        
        this.container.classList.remove('HTMLLoader-Panel-Active');
        this.container.classList.add('HTMLLoader-Panel-Unvisible');

        panel.isActive = false
        this.applyLayoutMeta({ styles: [] });
        panel.onClose?.(panel, this);
    }

    public async load(page: PageRequest): Promise<void> {
        if (this.cache.has(page.id)) return;

        let el = document.getElementById(page.id) as HTMLDivElement | null;
        let metadata: PageMetadata = { styles: [] };
        let optimizedHtml: string;
        let scriptModule: any = null;

        if (!el) {
            // No existe → fetch + parse
            const res = await fetch(page.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.text();
            const parsed = this.parseHtml(raw);
            metadata = parsed.metadata;
            optimizedHtml = this.optimizeHtml(parsed.htmlContent, metadata);

            el = document.createElement('div');
            el.id = page.id;
            el.classList.add('HTMLLoader-Panel-Unvisible');
            el.innerHTML = optimizedHtml;

            this.container.appendChild(el);
        } else {
            // Ya existe → fetch metadata desde URL
            const res = await fetch(page.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.text();
            metadata = this.parseHtml(raw).metadata;
            optimizedHtml = el.innerHTML;
        }

        if (metadata.scriptPath) {
            scriptModule = await this.loadScript(metadata.scriptPath);
        }

        this.cache.set(page.id, {
            id: page.id,
            title: page.title!,
            htmlContent: optimizedHtml,
            metadata,
            scriptModule,
            element: el,
            isLoaded: true,
            isActive: false,
            
        });

        el.classList.add('HTMLLoader-Panel-Unvisible');
    }

    private show(id: string): void {
        const panel = this.cache.get(id);
        if (!panel) return;

        for (const p of this.cache.values()) {
            if (p.isActive && p.id !== id) {
                p.element.classList.add('HTMLLoader-Panel-Unvisible');
                p.element.classList.remove('HTMLLoader-Panel-Active');
                p.isActive = false;
                p.onClose?.(p, this);
            }
        }

        this.container.classList.add('HTMLLoader-Panel-Active');
        this.container.classList.remove('HTMLLoader-Panel-Unvisible');

        panel.element.classList.remove('HTMLLoader-Panel-Unvisible');
        panel.element.classList.add('HTMLLoader-Panel-Active');
        panel.isActive = true;

        this.applyLayoutMeta(panel.metadata);

        this.reExecuteEntry(panel);
        panel.onOpen?.(panel,this);

        this.loader.open();
        window.LangAPI.applyToDOM();
    }

    private parseHtml(raw: string): ParsedHTML {
        const match = raw.match(/<!---\s*([\s\S]*?)\s*--->/);
        const metadata: PageMetadata = { styles: [] };
        if (!match) return { metadata, htmlContent: raw };

        const html = raw.replace(match[0], '').trim();
        const lines = match[1]!.split('\n');
        let key: string | null = null;

        for (const l of lines) {
            const line = l.trim();
            if (!line || line.startsWith('//')) continue;
            if (line.includes(':')) {
                const [k, ...r] = line.split(':');
                key = k!.trim();
                const v = r.join(':').replace(/['",]/g, '').trim();
                key === 'styles' ? metadata.styles.push(v) : (metadata as any)[key] = v;
            } else if (key === 'styles') {
                metadata.styles.push(line.replace(/['",]/g, '').trim());
            }
        }

        return { metadata, htmlContent: html };
    }

    public destroy(id: string): void {
        const panel = this.cache.get(id);
        if (!panel) return;
        panel.element.remove();
        this.cache.delete(id);
        this.applyLayoutMeta({ styles: [] });
        this.loader.open();
    }

    public cleanUpCache(id: string): void {
        const panel = this.cache.get(id);
        if (!panel) return;
        panel.scriptModule = null;
        panel.metadata = { styles: [] };
        panel.htmlContent = '';
    }
}

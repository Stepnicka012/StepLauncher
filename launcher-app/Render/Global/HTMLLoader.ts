export class HTMLFrameLoader {
    private container: HTMLElement;
    private pages = new Map<string, any>();
    private cache = new Map<string, any>();
    // store activePage as the normalized key (lowercase)
    private activePage: string | null = null;

    constructor(containerId: string = 'HTML_Container') {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`[HTMLFrameLoader] #${containerId} no encontrado`);
        this.container = el;
        this.init();
    }

    private init(): void {
        this.container.classList.add('HTML_Container');
        this.bindEvents();
    }

    private bindEvents(): void {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            const opener = target.closest<HTMLElement>('[data-html-open]');
            if (opener) {
                e.preventDefault();
                const pageId = opener.dataset.htmlOpen!;
                this.open(pageId);
                return;
            }

            const closer = target.closest<HTMLElement>('[data-html-close]');
            if (closer) {
                e.preventDefault();
                const pageId = closer.dataset.htmlClose || this.activePage;
                if (pageId) this.close(pageId);
            }
        });
    }

    private nextFrame(): Promise<void> {
        return new Promise(r => requestAnimationFrame(() => r()));
    }

    private wait(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    public register(...configs: any[]): void {
        for (const cfg of configs) {
            if (!cfg.id || !cfg.url) {
                console.warn('[HTMLFrameLoader] Configuración inválida', cfg);
                continue;
            }
            const key = String(cfg.id).toLowerCase();
            cfg.id = String(cfg.id);
            this.pages.set(key, cfg);
        }
    }

    public async open(id: string): Promise<void> {
        const key = String(id).toLowerCase();
        const config = this.pages.get(key);
        if (!config) {
            console.warn(`[HTMLFrameLoader] Página "${id}" no registrada`);
            return;
        }

        await this.nextFrame();

        if (!this.cache.has(key)) {
            await this.load(config);
        }

        if (config.delay) await this.wait(config.delay);
        
        this.show(key);
    }

    public async close(id: string): Promise<void> {
        const key = String(id).toLowerCase();
        const cached = this.cache.get(key);
        if (!cached) return;

        await this.nextFrame();
        this.hide(key);
    }

    private async load(config: any): Promise<void> {
        const key = String(config.id).toLowerCase();
        if (this.cache.has(key)) return;

        let contentDiv = this.container.querySelector<HTMLElement>(`#${config.id}`);
        let meta: any = {};
        let htmlContent: string;
        let scriptModule: any = null;

        if (!contentDiv) {
            const res = await fetch(config.url);
            if (!res.ok) throw new Error(`[HTMLFrameLoader] Error HTTP ${res.status} en ${config.url}`);
            
            const raw = await res.text();
            const parsed = this.parseContent(raw);
            
            meta = parsed.meta;
            htmlContent = this.optimize(parsed.content, meta);

            contentDiv = document.createElement('div');
            contentDiv.id = config.id;
            contentDiv.className = 'HTML_Content';
            contentDiv.innerHTML = htmlContent;

            this.container.appendChild(contentDiv);
        } else {
            htmlContent = contentDiv.innerHTML;
            
            const res = await fetch(config.url);
            if (res.ok) {
                const raw = await res.text();
                meta = this.parseContent(raw).meta;
            }
        }

        if (meta.script) {
            try {
                const base = new URL(config.url, location.href);
                const scriptUrl = new URL(meta.script, base).href;
                scriptModule = await import(/* @vite-ignore */ scriptUrl);
            } catch (err) {
                console.error(`[HTMLFrameLoader] Error cargando script para "${config.id}"`, err);
            }
        }

        this.cache.set(key, {
            id: config.id,
            element: contentDiv,
            meta,
            scriptModule,
            content: htmlContent,
            isActive: false,
            scriptExecuted: false,
            onOpen: config.onOpen,
            onClose: config.onClose
        });
    }

    private show(id: string): void {
        const key = String(id).toLowerCase();
        const page = this.cache.get(key);
        if (!page) return;

        if (this.activePage && this.activePage !== key) {
            this.hide(this.activePage);
        }

        this.container.classList.add('Visible');
        page.element.classList.add('Visible');
        page.isActive = true;
        this.activePage = key;

        this.executeScript(page);
        page.onOpen?.(page.element, this);
    }

    private hide(id: string): void {
        const key = String(id).toLowerCase();
        const page = this.cache.get(key);
        if (!page) return;

        page.element.classList.remove('Visible');
        page.isActive = false;

        const hasActive = Array.from(this.cache.values()).some((p: any) => p.isActive);
        if (!hasActive) {
            this.container.classList.remove('Visible');
            this.activePage = null;
        }

        page.onClose?.(page.element, this);
    }

    private executeScript(page: any): void {
        if (page.scriptExecuted || !page.scriptModule) return;

        const entry = page.meta.scriptEntry || 'default';
        const mod = page.scriptModule;
        let fn: any = null;

        if (typeof mod[entry] === 'function') {
            fn = mod[entry];
        } else if (mod.default && typeof mod.default[entry] === 'function') {
            fn = mod.default[entry];
        } else if (entry === 'default' && typeof mod.default === 'function') {
            fn = mod.default;
        }

        if (typeof fn === 'function') {
            const api = {
                config: (window as any).Config || null,
                fileDialog: (window as any).FileDialog || null,
                settingsManager: (window as any).AppSettingsManager || null
            };

            try {
                fn(page.element, this, api);
            } catch (err) {
                console.error('[HTMLFrameLoader] Error ejecutando entrypoint del módulo', err);
            }

            page.scriptExecuted = true;
        } else {
            console.warn(`[HTMLFrameLoader] EntryPoint "${entry}" no encontrado en módulo`, mod);
        }
    }

    private parseContent(raw: string): any {
        const metaRegex = /<!---\s*([\s\S]*?)\s*--->/;
        const match = raw.match(metaRegex);
        
        if (!match) {
            return { meta: {}, content: raw };
        }

        const content = raw.replace(match[0], '').trim();
        const meta: any = {};
        const lines = match[1]!.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;

            const colonIdx = trimmed.indexOf(':');
            if (colonIdx === -1) continue;

            const key = trimmed.slice(0, colonIdx).trim();
            const value = trimmed.slice(colonIdx + 1).replace(/['",]/g, '').trim();

            if (key && value) {
                meta[key] = value;
            }
        }

        return { meta, content };
    }

    private optimize(html: string, meta: any): string {
        if (meta.lazyImages === 'true') {
            return html.replace(/<img\s+src=/gi, '<img loading="lazy" src=');
        }
        if (meta.removeImages === 'true') {
            return html.replace(/<img[^>]*>/gi, '');
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

        page.element.remove();
        this.cache.delete(key);
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
        return Array.from(this.pages.values()).map((v: any) => v.id);
    }

    public getCached(): string[] {
        return Array.from(this.cache.values()).map((v: any) => v.id);
    }
}
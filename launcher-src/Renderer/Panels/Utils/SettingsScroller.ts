type PanelID = string;

interface SettingsScrollerOptions {
    containerSelector?: string;
    sectionSelector?: string;
    activeClass?: string;
    debug?: boolean;
    smooth?: boolean;
}

interface PanelMap {
    id: PanelID;
    element: HTMLElement;
    index: number;
}

export class SettingsScroller {
    private container: HTMLElement;
    private sections: HTMLElement[];
    private panels: PanelMap[] = [];
    private activeIndex: number = 0;
    private resizeObserver?: ResizeObserver;
    private intersectionObserver?: IntersectionObserver;
    private isScrolling = false;
    private options: Required<SettingsScrollerOptions>;
    public windowResizeControl?: any;
    public panelCanvases = new Map();

    constructor(options?: SettingsScrollerOptions) {
        this.options = {
            containerSelector: ".Settings_Content",
            sectionSelector: "section[data-setting-panel]",
            activeClass: "Active",
            debug: false,
            smooth: true,
            ...options
        };
        const container = document.querySelector<HTMLElement>(this.options.containerSelector);
        if (!container) throw new Error("[SettingsScroller] Container not found");
        this.container = container;
        this.sections = Array.from(container.querySelectorAll<HTMLElement>(this.options.sectionSelector));
        this.init();
    }
    
    private init(): void {
        this.setupStyles();
        this.mapPanels();
        this.bindButtons();
        this.setupObservers();
        setTimeout(() => this.snapTo(0, false), 50);
    }
    
    private setupStyles(): void {
        this.container.style.overflow = "hidden";
        this.container.style.scrollBehavior = "smooth";
        this.container.style.scrollSnapType = "x mandatory";
        
        this.sections.forEach(section => {
            section.style.scrollSnapAlign = "start";
            const content = section.querySelector('.Content_Section') as HTMLElement;
            if (content) {
                content.style.overflowY = "auto";
                content.style.height = "100%";
            }
        });

        const styleId = "settings-scroller-styles";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.innerHTML = `
                .is-grabbing { cursor: grabbing !important; }
            `;
            document.head.appendChild(style);
        }
    }
    
    private mapPanels(): void {
        this.panels = this.sections.map((el, index) => ({
            id: el.dataset.settingPanel!,
            element: el,
            index
        }));
    }
    
    private bindButtons(): void {
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest<HTMLElement>("[data-setting-panel-open]");
            if (!btn) return;
            this.open(btn.dataset.settingPanelOpen!);
        });
    }

    registerCanvas(panelId: string, canvas: any) {
        if (!this.panelCanvases.has(panelId)) {
            this.panelCanvases.set(panelId, new Set());
        }
        this.panelCanvases.get(panelId).add(canvas);
        if (this.panels.find(p => p.id === panelId)?.index !== this.activeIndex) {
            canvas.pause?.();
        }
    }

    setupObservers() {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry: any) => {
                const id = entry.target.dataset.settingPanel;
                const canvases = this.panelCanvases.get(id);

                if (entry.isIntersecting) {
                    if (!this.isScrolling) {
                        const panel = this.panels.find(p => p.id === id);
                        if (panel) this.setActive(panel.index);
                    }
                    canvases?.forEach((c: any) => c.resume?.());
                    if (id === "minecraft" && this.windowResizeControl)
                        this.windowResizeControl.resume();
                } else {
                    canvases?.forEach((c: any) => c.pause?.());
                    if (id === "minecraft" && this.windowResizeControl)
                        this.windowResizeControl.pause();
                }
            });
        }, { root: this.container, threshold: 0.6 });

        this.panels.forEach(p => this.intersectionObserver!.observe(p.element));

        this.resizeObserver = new ResizeObserver(() => {
            if (!this.isScrolling) this.snapTo(this.activeIndex, false);
        });
        this.resizeObserver.observe(this.container);
    }
    
    public open(id: PanelID): void {
        const panel = this.panels.find(p => p.id === id);
        if (panel) this.snapTo(panel.index, true);
    }
    
    private snapTo(index: number, smooth: boolean): void {
        if (index < 0 || index >= this.panels.length) return;
        const panel = this.panels[index]!;
        this.isScrolling = true;
        this.container.scrollTo({
            left: panel.element.offsetLeft,
            behavior: smooth && this.options.smooth ? "smooth" : "auto"
        });
        this.setActive(index);
        setTimeout(() => { this.isScrolling = false; }, 400);
    }
    
    private setActive(index: number): void {
        this.activeIndex = index;
        const activeId = this.panels[index]!.id;
        this.panels.forEach((p, i) => p.element.classList.toggle(this.options.activeClass, i === index));
        document.querySelectorAll<HTMLElement>(`[data-setting-panel-open]`).forEach(btn => {
            btn.classList.toggle(this.options.activeClass, btn.dataset.settingPanelOpen === activeId);
        });
    }
    
    public destroy(): void {
        this.resizeObserver?.disconnect();
        this.intersectionObserver?.disconnect();
    }
}
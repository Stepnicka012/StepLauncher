import { BaseCanvasController, CanvasState } from '../CanvasManager.js';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface CanvasSelectConfig {
    width?: number;
    height?: number;
    borderRadius?: number;
    fontFamily?: 'Lexend' | 'Comfortaa' | 'InstrumentSans' | 'Inter' | string;
    fontSize?: number;
    options?: SelectOption[];
}

export class CanvasSelect extends BaseCanvasController {
    private container: HTMLDivElement;
    private dropCanvas: HTMLCanvasElement | null = null;
    private dropCtx: CanvasRenderingContext2D | null = null;

    private options: SelectOption[] = [];
    private selectedIndex: number = -1;
    private hoveredIndex: number = -1;
    
    private isOpen: boolean = false;
    private isDisabled: boolean = false;

    private width: number;
    private height: number;
    private radius: number;
    private fontStr: string;
    
    private colors = {
        bg: "#111",
        hoverBg: "#222",
        border: "rgba(34, 34, 34, 0.33)",
        shadow: "rgba(0, 0, 0, 0.3)",
        accent: "aqua",
        text: "#fff",
        textMuted: "#666"
    };

    private hoverAlphas: number[] = [];
    private dropOpacity: number = 0;
    private marqueeOffset: number = 0;
    private hasRenderedOnce = false;

    constructor(parentElement: HTMLElement, config: CanvasSelectConfig = {}) {
        const width = config.width ?? 220;
        const height = config.height ?? 36;
        const mainCanvas = document.createElement('canvas');
        const mainCtx = mainCanvas.getContext('2d', { alpha: true })!;
        
        super(mainCanvas, mainCtx);
        
        this.width = width;
        this.height = height;
        this.radius = config.borderRadius ?? 8;
        this.fontStr = `${config.fontSize ?? 13}px ${config.fontFamily ?? 'Inter'}`;

        this.container = document.createElement('div');
        this.container.className = "canvas-select-container";
        this.container.style.cssText = `position:relative; width:${this.width}px; height:${this.height}px; user-select:none;`;

        this.setupCanvas(this.canvas, this.width, this.height);
        this.container.appendChild(this.canvas);
        parentElement.appendChild(this.container);

        if (config.options) this.setOptions(config.options);

        this.bindEvents();
        this.requestRender();
    }

    private setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): void {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
    }

    private createDropCanvas(): void {
        if (this.dropCanvas) return;
        
        this.dropCanvas = document.createElement('canvas');
        const totalH = this.options.length * this.height;
        this.setupCanvas(this.dropCanvas, this.width, totalH);
        
        this.dropCanvas.style.position = 'absolute';
        this.dropCanvas.style.left = '0';
        this.dropCanvas.style.zIndex = '1000';
        this.dropCanvas.style.borderRadius = `${this.radius}px`;
        this.dropCanvas.style.boxShadow = `0px 10px 30px ${this.colors.shadow}`;
        this.dropCanvas.style.pointerEvents = 'auto';
        
        this.dropCtx = this.dropCanvas.getContext('2d')!;
        this.updateDropdownPosition();
        this.container.appendChild(this.dropCanvas);
    }

    private removeDropCanvas(): void {
        if (this.dropCanvas) {
            this.container.removeChild(this.dropCanvas);
            this.dropCanvas = null;
            this.dropCtx = null;
        }
    }

    private bindEvents(): void {
        this.canvas.onclick = () => {
            if (this.isDisabled) return;
            this.requestRender();
            this.isOpen ? this.close() : this.open();
        };
        
        window.addEventListener('mousedown', (e) => {
            if (!this.container.contains(e.target as Node)) this.close();
        });

        this.container.addEventListener('mousemove', (e) => {
            if (!this.dropCanvas || !this.isOpen) return;
            this.requestRender();
            const rect = this.dropCanvas.getBoundingClientRect();
            const y = e.clientY - rect.top;
            this.hoveredIndex = Math.floor(y / this.height);
        });

        this.container.addEventListener('click', (e) => {
            if (!this.dropCanvas || !this.isOpen) return;
            this.requestRender();
            if (this.hoveredIndex >= 0 && this.hoveredIndex < this.options.length) {
                const opt = this.options[this.hoveredIndex];
                if (!opt?.disabled) {
                    this.selectedIndex = this.hoveredIndex;
                    this.dispatchEvent(new CustomEvent('change', { detail: opt }));
                    this.close();
                }
            }
        });
    }

    private updateDropdownPosition(): void {
        if (!this.dropCanvas) return;
        const rect = this.container.getBoundingClientRect();
        const dropH = this.options.length * this.height;
        const fitsBelow = (window.innerHeight - rect.bottom) > dropH + 10;
        this.dropCanvas.style.top = fitsBelow ? `${this.height + 6}px` : `-${dropH + 6}px`;
    }

    private open(): void {
        this.isOpen = true;
        this.createDropCanvas();
        this.requestRender();
    }

    private close(): void {
        this.isOpen = false;
        this.hoveredIndex = -1;
        this.requestRender();
    }

    private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

    public update(dt: number): void {
        const targetOpacity = this.isOpen ? 1 : 0;
        this.dropOpacity = this.lerp(this.dropOpacity, targetOpacity, 0.2);

        if (!this.isOpen && this.dropOpacity < 0.01 && this.dropCanvas) {
            this.removeDropCanvas();
        }

        if (this.state === CanvasState.IDLE) return;

        const activeText = this.options[this.selectedIndex]?.label ?? "Select...";
        this.ctx.font = this.fontStr;
        const tw = this.ctx.measureText(activeText).width;
        const avail = this.width - 20;

        if (tw > avail) {
            this.marqueeOffset -= 30 * dt;
            if (Math.abs(this.marqueeOffset) > tw + 40) this.marqueeOffset = 0;
        } else {
            this.marqueeOffset = 0;
        }

        if (this.isOpen && this.dropCanvas) {
            this.options.forEach((_, i) => {
                const isHover = this.hoveredIndex === i;
                this.hoverAlphas[i] = this.lerp(this.hoverAlphas[i] || 0, isHover ? 1 : 0, 0.2);
            });
        }

        const isAnimating = this.isOpen || this.dropOpacity > 0.01 || Math.abs(this.marqueeOffset) > 0.01;
        if (!isAnimating && this.hasRenderedOnce) {
            this.pause();
        }
    }

    public render(): void {
        this.syncTheme();
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        
        ctx.beginPath();
        ctx.roundRect(0.5, 0.5, this.width - 1, this.height - 1, this.radius);
        ctx.fillStyle = this.colors.bg;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.isOpen ? this.colors.accent : this.colors.border;
        ctx.stroke();

        const activeText = this.options[this.selectedIndex]?.label ?? "Select...";
        ctx.font = this.fontStr;
        ctx.fillStyle = this.colors.text;
        ctx.textBaseline = "middle";

        const avail = this.width - 20;
        const tw = ctx.measureText(activeText).width;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(10, 0, avail, this.height, 0);
        ctx.clip();

        const mainVOffset = 1; 
        if (tw > avail) {
            ctx.fillText(activeText, 10 + this.marqueeOffset, (this.height / 2) + mainVOffset);
            ctx.fillText(activeText, 10 + this.marqueeOffset + tw + 40, (this.height / 2) + mainVOffset);
        } else {
            ctx.fillText(activeText, 10, (this.height / 2) + mainVOffset);
        }
        ctx.restore();

        if (this.dropCtx && this.dropCanvas) {
            const dCtx = this.dropCtx;
            this.dropCanvas.style.opacity = this.dropOpacity.toString();
            dCtx.clearRect(0, 0, this.width, this.dropCanvas.height);
            
            dCtx.beginPath();
            dCtx.roundRect(0, 0, this.width, this.dropCanvas.height, this.radius);
            dCtx.fillStyle = this.colors.bg;
            dCtx.fill();
            dCtx.strokeStyle = this.colors.border;
            dCtx.stroke();

            this.options.forEach((opt, i) => {
                const y = i * this.height;
                if (this.hoverAlphas[i]! > 0.01) {
                    dCtx.globalAlpha = this.hoverAlphas[i]!;
                    dCtx.fillStyle = this.colors.hoverBg;
                    dCtx.fillRect(2, y + 2, this.width - 4, this.height - 4);
                    dCtx.fillStyle = this.colors.accent;
                    dCtx.fillRect(2, y + 4, 2, this.height - 8);
                }
                dCtx.globalAlpha = 1;
                dCtx.font = this.fontStr;
                dCtx.textBaseline = "middle";
                dCtx.fillStyle = this.selectedIndex === i ? this.colors.accent : (opt.disabled ? this.colors.textMuted : this.colors.text);
                dCtx.fillText(opt.label, 15, y + (this.height / 2) + 1);
            });
        }

        this.hasRenderedOnce = true;
    }

    public setOptions(opts: SelectOption[]) {
        this.options = opts;
        this.hoverAlphas = new Array(opts.length).fill(0);
        if (this.selectedIndex === -1 && opts.length > 0) this.selectedIndex = 0;
        this.requestRender();
    }

    private syncTheme(): void {
        const style = getComputedStyle(document.documentElement);
        const panelsBg = style.getPropertyValue('--panels-bg').trim()
            || style.getPropertyValue('--background-panels').trim()
            || '#111';
        const buttonHover = style.getPropertyValue('--background-button-hotbar-hover').trim() || '#222';

        this.colors.bg = panelsBg;
        this.colors.hoverBg = buttonHover;
        this.colors.border = 'rgba(255,255,255,0.08)';
        this.colors.shadow = 'rgba(0, 0, 0, 0.32)';
        this.colors.accent = 'aqua';
        this.colors.text = '#fff';
        this.colors.textMuted = '#777';

        if (this.dropCanvas) {
            this.dropCanvas.style.boxShadow = `0px 10px 30px ${this.colors.shadow}`;
        }
    }
}

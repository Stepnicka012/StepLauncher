import { BaseCanvasController, CanvasState } from '../CanvasManager.js';

interface Preset {
    readonly label: string;
    readonly w: number;
    readonly h: number;
}

interface Resolution {
    width: number;
    height: number;
}

export interface WrcLabels {
    widthLabel:   string;
    heightLabel:  string;
    presetsLabel: string;
    customChip:   string;
    previewLabel: string;
}

type OnChangeCallback = (width: number, height: number) => void;

const PRESETS: readonly Preset[] = [
    { label: 'Default',    w: 854,  h: 480  },
    { label: '720p',       w: 1280, h: 720  },
    { label: '1080p',      w: 1920, h: 1080 },
    { label: '1440p',      w: 2560, h: 1440 },
    { label: '4K',         w: 3840, h: 2160 },
] as const;

const DEFAULT_LABELS: WrcLabels = {
    widthLabel:   'ANCHO',
    heightLabel:  'ALTO',
    presetsLabel: 'PRESETS',
    customChip:   'Personalizada',
    previewLabel: 'PREVIEW',
};

const STYLES = `
.wrc-root {
    --accent:       #00c8d4;
    --accent-bg:    rgba(0, 200, 212, 0.08);
    --bg:           #111113;
    --bg2:          #18181b;
    --bg3:          #222226;
    --border:       rgba(255,255,255,0.07);
    --border-h:     rgba(255,255,255,0.14);
    --text:         #f0f0f2;
    --text-dim:     #888890;
    --text-hint:    #44444a;
    --radius:       10px;
    --radius-sm:    6px;
    --expand-speed: 320ms;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--text);
    user-select: none;
}
.wrc-root * { box-sizing: border-box; margin: 0; padding: 0; }

.wrc-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    width: 280px;
    transition: border-color .2s;
}
.wrc-card:hover { border-color: var(--border-h); }

.wrc-collapsed {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    cursor: pointer;
    gap: 10px;
}
.wrc-collapsed-res {
    font-size: 13px;
    color: var(--text);
    letter-spacing: .02em;
}
.wrc-collapsed-meta {
    display: flex;
    align-items: center;
    gap: 6px;
}
.wrc-collapsed-ratio {
    font-size: 10px;
    color: var(--text-dim);
}
.wrc-chevron {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-hint);
    transition: transform var(--expand-speed) cubic-bezier(.4,0,.2,1);
}
.wrc-root.expanded .wrc-chevron { transform: rotate(180deg); }

.wrc-body {
    display: grid;
    grid-template-rows: 0fr;
    border-top: 1px solid transparent;
    transition: grid-template-rows var(--expand-speed) cubic-bezier(.4,0,.2,1),
                border-color var(--expand-speed);
}
.wrc-root.expanded {
    transition: margin var(--expand-speed) ease-in-out;
    margin-top: 15rem;
}
.wrc-root.expanded .wrc-body {
    grid-template-rows: 1fr;
    border-top-color: var(--border);
}
.wrc-body-inner { overflow: hidden; }

.wrc-section {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
}
.wrc-section:last-child { border-bottom: none; }
.wrc-section-label {
    font-size: 9px;
    letter-spacing: .1em;
    color: var(--text-hint);
    margin-bottom: 8px;
}

.wrc-dims { display: flex; align-items: center; gap: 8px; }
.wrc-dim-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.wrc-dim-label { font-size: 9px; letter-spacing: .1em; color: var(--text-dim); }
.wrc-dim-field {
    display: flex; align-items: center;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color .15s;
    overflow: hidden;
}
.wrc-dim-field:focus-within { border-color: var(--accent); }
.wrc-dim-input {
    flex: 1; background: transparent; border: none; outline: none;
    padding: 6px 8px; font-size: 13px; font-family: inherit;
    color: var(--text); width: 0; min-width: 0;
}
.wrc-dim-unit { font-size: 10px; color: var(--text-hint); padding-right: 8px; }
.wrc-sep { font-size: 14px; color: var(--text-hint); padding-top: 16px; flex-shrink: 0; }

.wrc-chips { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
.wrc-chip {
    font-size: 10px; padding: 2px 8px; border-radius: 20px;
    border: 1px solid var(--border); color: var(--text-dim); background: var(--bg2);
}
.wrc-chip.accent { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.wrc-chip.warn   { border-color: rgba(255,180,0,.4); color: #f0b400; background: rgba(255,180,0,.06); }

.wrc-presets { display: flex; flex-wrap: wrap; gap: 5px; }
.wrc-preset {
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 3px 9px;
    font-size: 11px; font-family: inherit; color: var(--text-dim);
    cursor: pointer; transition: all .12s;
}
.wrc-preset:hover:not(:disabled) { border-color: var(--border-h); color: var(--text); }
.wrc-preset.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.wrc-preset:disabled { opacity: .3; cursor: not-allowed; }

.wrc-sliders { display: flex; flex-direction: column; gap: 8px; }
.wrc-sl-row { display: flex; align-items: center; gap: 8px; }
.wrc-sl-axis { font-size: 10px; color: var(--text-dim); width: 10px; flex-shrink: 0; }
.wrc-sl-val  { font-size: 11px; color: var(--text-dim); min-width: 34px; text-align: right; flex-shrink: 0; }
.wrc-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 3px; background: var(--bg3); border-radius: 2px; outline: none; cursor: pointer;
}
.wrc-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: var(--accent); cursor: pointer; transition: transform .1s;
}
.wrc-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
.wrc-slider:disabled { opacity: .3; cursor: not-allowed; }

.wrc-preview-wrap {
    background: var(--bg2); border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    padding: 10px; min-height: 90px; position: relative; overflow: hidden;
}
.wrc-preview-lbl {
    position: absolute; bottom: 6px; right: 8px;
    font-size: 9px; color: var(--text-hint); letter-spacing: .05em;
}
`;

class PreviewCanvas extends BaseCanvasController {
    private targetW = 1920;
    private targetH = 1080;
    private visualW = 1920;
    private visualH = 1080;
    private readonly accentColor = '#00c8d4';
    private readonly maxW = 220;
    private readonly maxH = 70;

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) throw new Error('PreviewCanvas: no se pudo obtener el contexto 2D.');
        super(canvas, ctx);
        this._setupSize();
    }

    private _setupSize(): void {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width  = this.maxW * dpr;
        this.canvas.height = this.maxH * dpr;
        this.canvas.style.width  = `${this.maxW}px`;
        this.canvas.style.height = `${this.maxH}px`;
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);
    }

    setResolution(w: number, h: number): void {
        this.targetW = w;
        this.targetH = h;
    }

    override update(dt: number): void {
        if (this.state === CanvasState.IDLE) return;
        const speed = 1 - Math.pow(0.01, dt);
        this.visualW += (this.targetW - this.visualW) * speed;
        this.visualH += (this.targetH - this.visualH) * speed;
    }

    override render(): void {
        const W = this.maxW;
        const H = this.maxH;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, W, H);

        const ratio = this.visualW / this.visualH;
        const padX = 8, padY = 8;
        const availW = W - padX * 2;
        const availH = H - padY * 2;
        let rw = availW;
        let rh = rw / ratio;
        if (rh > availH) { rh = availH; rw = rh * ratio; }
        const rx = padX + (availW - rw) / 2;
        const ry = padY + (availH - rh) / 2;

        ctx.fillStyle = '#0a0a0c';
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, 6);
        ctx.fill();

        ctx.fillStyle = '#1e1e22';
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 2);
        ctx.fill();

        ctx.strokeStyle = this.accentColor;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(0,200,212,0.45)';
        ctx.font = `500 9px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            `${Math.round(this.targetW)} × ${Math.round(this.targetH)}`,
            rx + rw / 2,
            ry + rh / 2
        );

        ctx.strokeStyle = 'rgba(0,200,212,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(rx + rw / 2, ry);   ctx.lineTo(rx + rw / 2, ry + rh);
        ctx.moveTo(rx, ry + rh / 2);   ctx.lineTo(rx + rw, ry + rh / 2);
        ctx.stroke();
    }

    override pause():  void { this.setState(CanvasState.IDLE);   }
    override resume(): void { this.setState(CanvasState.ACTIVE); }
}

export class WindowResizeControl {
    widthVal  = 1920;
    heightVal = 1080;
    onChange: OnChangeCallback | null = null;

    private _labels: WrcLabels = { ...DEFAULT_LABELS };
    private _expanded = false;

    private _root:          HTMLDivElement   | null = null;
    private _card:          HTMLDivElement   | null = null;
    private _preview:       PreviewCanvas    | null = null;

    private _collapsedRes:   HTMLSpanElement | null = null;
    private _collapsedRatio: HTMLSpanElement | null = null;

    private _inputW:     HTMLInputElement | null = null;
    private _inputH:     HTMLInputElement | null = null;
    private _labelW:     HTMLElement      | null = null;
    private _labelH:     HTMLElement      | null = null;
    private _sliderW:    HTMLInputElement | null = null;
    private _sliderH:    HTMLInputElement | null = null;
    private _sliderWVal: HTMLSpanElement  | null = null;
    private _sliderHVal: HTMLSpanElement  | null = null;
    private _ratioChip:  HTMLSpanElement  | null = null;
    private _presetChip: HTMLSpanElement  | null = null;
    private _presetsLbl: HTMLElement      | null = null;
    private _previewLbl: HTMLSpanElement  | null = null;
    private _presetBtns: Array<{ btn: HTMLButtonElement; w: number; h: number }> = [];

    private _outsideHandler: ((e: MouseEvent) => void) | null = null;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`WindowResizeControl: #${containerId} no encontrado.`);
        this._injectStyles();
        this._build(container);
        this._apply(this.widthVal, this.heightVal);
    }

    private _injectStyles(): void {
        const id = 'wrc-styles';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    private _build(container: HTMLElement): void {
        this._root = document.createElement('div');
        this._root.className = 'wrc-root';

        this._card = document.createElement('div');
        this._card.className = 'wrc-card';
        this._card.appendChild(this._buildCollapsed());
        this._card.appendChild(this._buildBody());

        this._root.appendChild(this._card);
        container.appendChild(this._root);
    }

    private _buildCollapsed(): HTMLDivElement {
        const row = document.createElement('div');
        row.className = 'wrc-collapsed';
        row.addEventListener('click', () => this._toggleExpand());

        this._collapsedRes = document.createElement('span');
        this._collapsedRes.className = 'wrc-collapsed-res';

        const meta = document.createElement('div');
        meta.className = 'wrc-collapsed-meta';

        this._collapsedRatio = document.createElement('span');
        this._collapsedRatio.className = 'wrc-collapsed-ratio';

        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 14 14');
        chevron.setAttribute('fill', 'none');
        chevron.classList.add('wrc-chevron');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M2.5 5L7 9.5L11.5 5');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        chevron.appendChild(path);

        meta.appendChild(this._collapsedRatio);
        meta.appendChild(chevron);
        row.appendChild(this._collapsedRes);
        row.appendChild(meta);
        return row;
    }

    private _buildBody(): HTMLDivElement {
        const body = document.createElement('div');
        body.className = 'wrc-body';

        const inner = document.createElement('div');
        inner.className = 'wrc-body-inner';
        inner.appendChild(this._buildDimsSection());
        inner.appendChild(this._buildPresetsSection());
        inner.appendChild(this._buildSlidersSection());
        inner.appendChild(this._buildPreviewSection());

        body.appendChild(inner);
        return body;
    }

    private _buildDimsSection(): HTMLDivElement {
        const sec = document.createElement('div');
        sec.className = 'wrc-section';

        const dims = document.createElement('div');
        dims.className = 'wrc-dims';

        const makeField = (axis: 'w' | 'h'): HTMLDivElement => {
            const isW = axis === 'w';
            const group = document.createElement('div');
            group.className = 'wrc-dim-group';

            const lbl = document.createElement('div');
            lbl.className = 'wrc-dim-label';
            lbl.textContent = isW ? this._labels.widthLabel : this._labels.heightLabel;
            if (isW) this._labelW = lbl;
            else     this._labelH = lbl;

            const field = document.createElement('div');
            field.className = 'wrc-dim-field';

            const input = document.createElement('input');
            input.className = 'wrc-dim-input';
            input.type  = 'number';
            input.min   = String(isW ? 640 : 360);
            input.max   = String(isW ? 7680 : 4320);
            input.step  = '1';
            input.value = String(isW ? this.widthVal : this.heightVal);
            input.addEventListener('input', () => {
                const v = parseInt(input.value) || 0;
                isW ? this._apply(v, this.heightVal) : this._apply(this.widthVal, v);
            });

            if (isW) this._inputW = input;
            else     this._inputH = input;

            const unit = document.createElement('span');
            unit.className = 'wrc-dim-unit';
            unit.textContent = 'px';

            field.appendChild(input);
            field.appendChild(unit);
            group.appendChild(lbl);
            group.appendChild(field);
            return group;
        };

        const sep = document.createElement('span');
        sep.className = 'wrc-sep';
        sep.textContent = '×';

        dims.appendChild(makeField('w'));
        dims.appendChild(sep);
        dims.appendChild(makeField('h'));
        sec.appendChild(dims);

        const chips = document.createElement('div');
        chips.className = 'wrc-chips';

        this._ratioChip = document.createElement('span');
        this._ratioChip.className = 'wrc-chip';

        this._presetChip = document.createElement('span');
        this._presetChip.className = 'wrc-chip accent';

        chips.appendChild(this._ratioChip);
        chips.appendChild(this._presetChip);
        sec.appendChild(chips);
        return sec;
    }

    private _buildPresetsSection(): HTMLDivElement {
        const sec = document.createElement('div');
        sec.className = 'wrc-section';

        this._presetsLbl = document.createElement('div');
        this._presetsLbl.className = 'wrc-section-label';
        this._presetsLbl.textContent = this._labels.presetsLabel;
        sec.appendChild(this._presetsLbl);

        const wrap = document.createElement('div');
        wrap.className = 'wrc-presets';

        for (const p of PRESETS) {
            const btn = document.createElement('button');
            btn.className = 'wrc-preset';
            btn.textContent = p.label;
            btn.addEventListener('click', () => this._apply(p.w, p.h));
            this._presetBtns.push({ btn, w: p.w, h: p.h });
            wrap.appendChild(btn);
        }

        sec.appendChild(wrap);
        return sec;
    }

    private _buildSlidersSection(): HTMLDivElement {
        const sec = document.createElement('div');
        sec.className = 'wrc-section';

        const group = document.createElement('div');
        group.className = 'wrc-sliders';

        const makeSlider = (axis: 'w' | 'h', min: number, max: number, val: number): HTMLDivElement => {
            const isW = axis === 'w';
            const row = document.createElement('div');
            row.className = 'wrc-sl-row';

            const lbl = document.createElement('span');
            lbl.className = 'wrc-sl-axis';
            lbl.textContent = axis.toUpperCase();

            const slider = document.createElement('input');
            slider.className = 'wrc-slider';
            slider.type  = 'range';
            slider.min   = String(min);
            slider.max   = String(max);
            slider.step  = '1';
            slider.value = String(val);

            const valEl = document.createElement('span');
            valEl.className = 'wrc-sl-val';
            valEl.textContent = String(val);

            slider.addEventListener('input', () => {
                valEl.textContent = slider.value;
                const v = parseInt(slider.value);
                isW ? this._apply(v, this.heightVal) : this._apply(this.widthVal, v);
            });

            if (isW) { this._sliderW = slider; this._sliderWVal = valEl; }
            else     { this._sliderH = slider; this._sliderHVal = valEl; }

            row.appendChild(lbl);
            row.appendChild(slider);
            row.appendChild(valEl);
            return row;
        };

        group.appendChild(makeSlider('w', 640,  3840, this.widthVal));
        group.appendChild(makeSlider('h', 360,  2160, this.heightVal));
        sec.appendChild(group);
        return sec;
    }

    private _buildPreviewSection(): HTMLDivElement {
        const sec = document.createElement('div');
        sec.className = 'wrc-section';

        const wrap = document.createElement('div');
        wrap.className = 'wrc-preview-wrap';

        const canvas = document.createElement('canvas');
        this._preview = new PreviewCanvas(canvas);

        this._previewLbl = document.createElement('span');
        this._previewLbl.className = 'wrc-preview-lbl';
        this._previewLbl.textContent = this._labels.previewLabel;

        wrap.appendChild(canvas);
        wrap.appendChild(this._previewLbl);
        sec.appendChild(wrap);
        return sec;
    }

    private _toggleExpand(): void {
        this._expanded ? this._collapse() : this._expand();
    }

    private _expand(): void {
        if (this._expanded) return;
        this._expanded = true;
        this._root?.classList.add('expanded');
        this._preview?.resume();

        this._outsideHandler = (e: MouseEvent) => {
            if (this._card && !this._card.contains(e.target as Node)) {
                this._collapse();
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', this._outsideHandler!);
        }, 0);
    }

    private _collapse(): void {
        if (!this._expanded) return;
        this._expanded = false;
        this._root?.classList.remove('expanded');
        this._preview?.pause();

        if (this._outsideHandler) {
            document.removeEventListener('mousedown', this._outsideHandler);
            this._outsideHandler = null;
        }
    }

    private _gcd(a: number, b: number): number {
        return b === 0 ? a : this._gcd(b, a % b);
    }

    private _getRatio(w: number, h: number): string {
        const g = this._gcd(w, h);
        return `${w / g}:${h / g}`;
    }

    private _apply(w: number, h: number): void {
        this.widthVal  = Math.max(640,  Math.min(7680, w || 640));
        this.heightVal = Math.max(360,  Math.min(4320, h || 360));

        const ratio = this._getRatio(this.widthVal, this.heightVal);

        if (this._collapsedRes)
            this._collapsedRes.textContent = `${this.widthVal}×${this.heightVal}`;
        if (this._collapsedRatio)
            this._collapsedRatio.textContent = ratio;

        if (this._inputW) this._inputW.value = String(this.widthVal);
        if (this._inputH) this._inputH.value = String(this.heightVal);

        const clampedW = Math.min(this.widthVal,  3840);
        const clampedH = Math.min(this.heightVal, 2160);
        if (this._sliderW)    this._sliderW.value          = String(clampedW);
        if (this._sliderH)    this._sliderH.value          = String(clampedH);
        if (this._sliderWVal) this._sliderWVal.textContent  = String(clampedW);
        if (this._sliderHVal) this._sliderHVal.textContent  = String(clampedH);

        if (this._ratioChip)
            this._ratioChip.textContent = ratio;

        const matchPreset = PRESETS.find(p => p.w === this.widthVal && p.h === this.heightVal);
        if (this._presetChip) {
            this._presetChip.textContent = matchPreset?.label ?? this._labels.customChip;
            this._presetChip.className   = `wrc-chip ${matchPreset ? 'accent' : 'warn'}`;
        }

        for (const { btn, w: pw, h: ph } of this._presetBtns) {
            btn.classList.toggle('active', pw === this.widthVal && ph === this.heightVal);
        }

        this._preview?.setResolution(this.widthVal, this.heightVal);
        this.onChange?.(this.widthVal, this.heightVal);
    }


    setResolution(w: number, h: number): void {
        this._apply(w, h);
    }

    getResolution(): Resolution {
        return { width: this.widthVal, height: this.heightVal };
    }

    setLabels(labels: Partial<WrcLabels>): void {
        this._labels = { ...this._labels, ...labels };

        if (this._labelW)     this._labelW.textContent     = this._labels.widthLabel;
        if (this._labelH)     this._labelH.textContent     = this._labels.heightLabel;
        if (this._presetsLbl) this._presetsLbl.textContent = this._labels.presetsLabel;
        if (this._previewLbl) this._previewLbl.textContent = this._labels.previewLabel;

        const matchPreset = PRESETS.find(p => p.w === this.widthVal && p.h === this.heightVal);
        if (this._presetChip && !matchPreset)
            this._presetChip.textContent = this._labels.customChip;
    }

    expand():  void { this._expand();   }
    collapse(): void { this._collapse(); }

    pause():  void { this._preview?.pause();  }
    resume(): void { this._preview?.resume(); }

    destroy(): void {
        this._collapse();
        this._preview?.destroy();
        this._root?.remove();
        this._root    = null;
        this._preview = null;
        this._card    = null;
    }
}
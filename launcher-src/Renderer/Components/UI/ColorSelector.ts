import type { PickerValue } from "./PickerValue.js";

export interface RGB { r: number; g: number; b: number; }
export interface ColorResult { hex: string; rgb: string; rgba: string; hsl: string; hsla: string; }
export interface ColorPickerOptions { container: HTMLElement; initialColor?: string; onChange?: (color: ColorResult) => void; }

type Expandable = { expand: () => void; collapse: () => void; isExpanded: boolean; };
let activePicker: Expandable | null = null;
function requestExpand(picker: Expandable) {
    if (activePicker && activePicker !== picker) activePicker.collapse();
    activePicker = picker;
    picker.expand();
}
function notifyCollapse(picker: Expandable) { if (activePicker === picker) activePicker = null; }

export function createColorPicker(options: ColorPickerOptions): PickerValue {
    const { container, initialColor = "#ff0000", onChange } = options;
    let hue = 0, saturation = 100, brightness = 100, alpha = 1;
    let isDraggingMain = false, isDraggingHue = false, isDraggingAlpha = false, isExpanded = false, paused = false, destroyed = false;
    let rafId: number | null = null;

    const host = document.createElement("div");
    host.style.cssText = "position:relative;width:44px;height:44px;z-index:1;";
    
    const trigger = document.createElement("div");
    trigger.style.cssText = `
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
                          linear-gradient(-45deg, #808080 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #808080 75%),
                          linear-gradient(-45deg, transparent 75%, #808080 75%);
        background-size: 8px 8px;
        background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.1);
        box-sizing: border-box;
        transition: transform 0.15s;
    `;
    const triggerColor = document.createElement("div");
    triggerColor.style.cssText = "width:100%;height:100%;border-radius:10px;";
    trigger.appendChild(triggerColor);

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed;
        width: 240px;
        background: #1a1a1a;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
        padding: 10px;
        display: none;
        flex-direction: column;
        gap: 8px;
        z-index: 1500;
        font-family: 'InstrumentSans', Arial, sans-serif;
        user-select: none;
        backdrop-filter: none;
        pointer-events: auto;
    `;
    
    const mainCanvas = document.createElement("canvas");
    mainCanvas.width = 220; 
    mainCanvas.height = 120;
    mainCanvas.style.cssText = "width:100%;height:120px;border-radius:6px;cursor:crosshair;";
    
    const hueCanvas = document.createElement("canvas");
    hueCanvas.width = 220; 
    hueCanvas.height = 10;
    hueCanvas.style.cssText = "width:100%;height:10px;border-radius:5px;cursor:pointer;";
    
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = 220; 
    alphaCanvas.height = 10;
    alphaCanvas.style.cssText = "width:100%;height:10px;border-radius:5px;cursor:pointer;";
    
    const hexContainer = document.createElement("div");
    hexContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255,255,255,0.05);
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.1);
    `;
    const hexLabel = document.createElement("span");
    hexLabel.textContent = "HEX"; 
    hexLabel.style.cssText = "font-size:10px;color:rgba(255,255,255,0.5);font-weight:600;";
    const hexInput = document.createElement("input");
    hexInput.style.cssText = `
        background: transparent;
        border: none;
        color: #fff;
        font-family: monospace;
        font-size: 11px;
        text-align: right;
        width: 65px;
        outline: none;
    `;
    hexContainer.appendChild(hexLabel); 
    hexContainer.appendChild(hexInput);
    
    panel.appendChild(mainCanvas); 
    panel.appendChild(hueCanvas); 
    panel.appendChild(alphaCanvas); 
    panel.appendChild(hexContainer);
    host.appendChild(trigger); 
    container.appendChild(host);

    function hsbToRgb(h: number, s: number, b: number): RGB {
        s /= 100; b /= 100;
        const k = (n: number) => (n + h / 60) % 6;
        const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
        return { r: Math.round(255 * f(5)), g: Math.round(255 * f(3)), b: Math.round(255 * f(1)) };
    }
    
    function rgbToHex(r: number, g: number, b: number, a: number): string {
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex === 'ff' ? '' : alphaHex}`.toUpperCase();
    }
    
    function parseColor(color: string) {
        const canvas = document.createElement('canvas'); 
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = color; 
        const hex = ctx.fillStyle;
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        brightness = (max / 255) * 100;
        saturation = max === 0 ? 0 : (d / max) * 100;
        if (max === min) hue = 0;
        else {
            if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) hue = (b - r) / d + 2;
            else hue = (r - g) / d + 4;
            hue *= 60;
        }
        alpha = color.startsWith('rgba') ? parseFloat(color.split(',')[3]!) : 1;
    }
    
    function drawMain() {
        const ctx = mainCanvas.getContext("2d")!;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`; 
        ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        const gradWhite = ctx.createLinearGradient(0, 0, mainCanvas.width, 0);
        gradWhite.addColorStop(0, "white"); 
        gradWhite.addColorStop(1, "transparent");
        ctx.fillStyle = gradWhite; 
        ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        const gradBlack = ctx.createLinearGradient(0, 0, 0, mainCanvas.height);
        gradBlack.addColorStop(0, "transparent"); 
        gradBlack.addColorStop(1, "black");
        ctx.fillStyle = gradBlack; 
        ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        ctx.beginPath();
        const x = (saturation / 100) * mainCanvas.width, y = (1 - brightness / 100) * mainCanvas.height;
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.strokeStyle = brightness > 50 && saturation < 50 ? "#000" : "#fff"; 
        ctx.lineWidth = 2; 
        ctx.stroke();
    }
    
    function drawHue() {
        const ctx = hueCanvas.getContext("2d")!;
        const grad = ctx.createLinearGradient(0, 0, hueCanvas.width, 0);
        for (let i = 0; i <= 360; i += 30) grad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
        ctx.fillStyle = grad; 
        ctx.fillRect(0, 0, hueCanvas.width, hueCanvas.height);
        ctx.strokeStyle = "#fff"; 
        ctx.lineWidth = 2;
        const x = (hue / 360) * hueCanvas.width; 
        ctx.strokeRect(x - 2, 0, 4, hueCanvas.height);
    }
    
    function drawAlpha() {
        const ctx = alphaCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, alphaCanvas.width, alphaCanvas.height);
        const rgb = hsbToRgb(hue, saturation, brightness);
        const grad = ctx.createLinearGradient(0, 0, alphaCanvas.width, 0);
        grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
        ctx.fillStyle = grad; 
        ctx.fillRect(0, 0, alphaCanvas.width, alphaCanvas.height);
        ctx.strokeStyle = "#fff"; 
        ctx.lineWidth = 2;
        const x = alpha * alphaCanvas.width; 
        ctx.strokeRect(x - 2, 0, 4, alphaCanvas.height);
    }
    
    function renderNow() {
        if (destroyed || paused) return;
        const rgb = hsbToRgb(hue, saturation, brightness);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b, alpha);
        triggerColor.style.backgroundColor = hex; 
        hexInput.value = hex;
        drawMain(); 
        drawHue(); 
        drawAlpha();
        if (onChange) onChange({ hex, rgb: `rgb(${rgb.r},${rgb.g},${rgb.b})`, rgba: `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`, hsl: "", hsla: "" });
    }
    
    function scheduleRender() { 
        if (rafId === null) rafId = requestAnimationFrame(() => { rafId = null; renderNow(); }); 
    }

    function positionPanel() {
        const rect = trigger.getBoundingClientRect();
        const panelWidth = 240, panelHeight = 250;
        let left = rect.left, top = rect.bottom + 6;
        if (left + panelWidth > window.innerWidth - 10) left = window.innerWidth - panelWidth - 10;
        if (top + panelHeight > window.innerHeight - 10) top = rect.top - panelHeight - 6;
        if (top < 10) top = 10;
        panel.style.left = left + "px"; 
        panel.style.top = top + "px";
    }

    const picker: Expandable = {
        expand: () => {
            if (isExpanded || paused) return;
            isExpanded = true;
            document.body.appendChild(panel);
            panel.style.display = "flex";
            positionPanel();
            scheduleRender();
            const onClickOutside = (e: MouseEvent) => {
                if (!panel.contains(e.target as Node) && !trigger.contains(e.target as Node)) {
                    picker.collapse();
                    document.removeEventListener("click", onClickOutside);
                }
            };
            setTimeout(() => document.addEventListener("click", onClickOutside), 10);
            window.addEventListener("resize", positionPanel);
        },
        collapse: () => {
            if (!isExpanded) return;
            isExpanded = false;
            panel.style.display = "none";
            if (panel.parentNode) panel.parentNode.removeChild(panel);
            host.appendChild(panel);
            notifyCollapse(picker);
            window.removeEventListener("resize", positionPanel);
        },
        get isExpanded() { return isExpanded; }
    };

    function handleMain(e: MouseEvent) {
        const rect = mainCanvas.getBoundingClientRect();
        saturation = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        brightness = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100));
        scheduleRender();
    }
    function handleHue(e: MouseEvent) {
        const rect = hueCanvas.getBoundingClientRect();
        hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
        scheduleRender();
    }
    function handleAlpha(e: MouseEvent) {
        const rect = alphaCanvas.getBoundingClientRect();
        alpha = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        scheduleRender();
    }
    
    const onMove = (e: MouseEvent) => {
        if (isDraggingMain) handleMain(e);
        if (isDraggingHue) handleHue(e);
        if (isDraggingAlpha) handleAlpha(e);
    };
    const onUp = () => { isDraggingMain = isDraggingHue = isDraggingAlpha = false; };

    mainCanvas.addEventListener("mousedown", (e) => { isDraggingMain = true; handleMain(e); e.stopPropagation(); });
    hueCanvas.addEventListener("mousedown", (e) => { isDraggingHue = true; handleHue(e); e.stopPropagation(); });
    alphaCanvas.addEventListener("mousedown", (e) => { isDraggingAlpha = true; handleAlpha(e); e.stopPropagation(); });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker.isExpanded) picker.collapse();
        else requestExpand(picker);
    });

    parseColor(initialColor);
    renderNow();

    return {
        getValue: () => rgbToHex(hsbToRgb(hue, saturation, brightness).r, hsbToRgb(hue, saturation, brightness).g, hsbToRgb(hue, saturation, brightness).b, alpha),
        setValue: (value) => { if (typeof value === "string") { parseColor(value); scheduleRender(); } },
        pause: () => { paused = true; picker.collapse(); },
        resume: () => { paused = false; renderNow(); },
        destroy: () => {
            destroyed = true;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (rafId !== null) cancelAnimationFrame(rafId);
            host.remove();
            if (panel.parentNode) panel.remove();
        }
    };
}
import type { PickerValue } from "./PickerValue.js";

export interface AnglePickerOptions { container: HTMLElement; initialAngle?: number; onChange?: (angle: number) => void; }

type Expandable = { expand: () => void; collapse: () => void; isExpanded: boolean; };
let activePicker: Expandable | null = null;
function requestExpand(picker: Expandable) {
    if (activePicker && activePicker !== picker) activePicker.collapse();
    activePicker = picker;
    picker.expand();
}
function notifyCollapse(picker: Expandable) { if (activePicker === picker) activePicker = null; }

export function createAnglePicker(options: AnglePickerOptions): PickerValue {
    const { container, initialAngle = 0, onChange } = options;
    let currentAngle = initialAngle, isDragging = false, isExpanded = false, paused = false, destroyed = false;
    let rafId: number | null = null;

    const host = document.createElement("div");
    host.style.cssText = "position:relative;width:44px;height:44px;z-index:1;";
    
    const trigger = document.createElement("div");
    trigger.style.cssText = `
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: #1e1e1e;
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s;
    `;
    trigger.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" opacity="0.2"/>
            <line x1="12" y1="12" x2="12" y2="5" stroke="currentColor" id="angle-line"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
        position: fixed;
        width: 200px;
        background: #1a1a1a;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
        padding: 10px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 1500;
        font-family: 'InstrumentSans', Arial, sans-serif;
        user-select: none;
    `;
    
    const canvas = document.createElement("canvas");
    canvas.width = 160; 
    canvas.height = 160;
    canvas.style.cssText = "width:160px;height:160px;cursor:crosshair;touch-action:none;";
    
    const valueDisplay = document.createElement("div");
    valueDisplay.style.cssText = "font-size:22px;font-weight:700;color:#fff;";
    const degreeSpan = document.createElement("span");
    degreeSpan.textContent = "°"; 
    degreeSpan.style.cssText = "font-size:13px;color:rgba(255,255,255,0.5);margin-left:2px;";
    
    const presetsContainer = document.createElement("div");
    presetsContainer.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:5px;width:100%;";
    [0, 45, 90, 135, 180, 225, 270, 315].forEach(angle => {
        const btn = document.createElement("button");
        btn.textContent = `${angle}°`;
        btn.style.cssText = `
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            padding: 4px 0;
            border-radius: 5px;
            font-size: 10px;
            cursor: pointer;
        `;
        btn.onclick = (e) => { e.stopPropagation(); currentAngle = angle; scheduleRender(); };
        presetsContainer.appendChild(btn);
    });
    
    const valRow = document.createElement("div");
    valRow.style.cssText = "display:flex;align-items:baseline;justify-content:center;";
    valRow.appendChild(valueDisplay); 
    valRow.appendChild(degreeSpan);
    panel.appendChild(canvas); 
    panel.appendChild(valRow); 
    panel.appendChild(presetsContainer);
    host.appendChild(trigger); 
    container.appendChild(host);

    function drawAngle() {
        const ctx = canvas.getContext("2d")!;
        const cx = 80, cy = 80, radius = 60;
        ctx.clearRect(0, 0, 160, 160);
        ctx.beginPath(); 
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; 
        ctx.lineWidth = 3; 
        ctx.stroke();
        const rad = (currentAngle - 90) * (Math.PI / 180);
        ctx.beginPath(); 
        ctx.moveTo(cx, cy); 
        ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
        ctx.strokeStyle = "#fff"; 
        ctx.lineWidth = 3; 
        ctx.lineCap = "round"; 
        ctx.stroke();
        ctx.beginPath(); 
        ctx.arc(cx, cy, 4, 0, 2 * Math.PI); 
        ctx.fillStyle = "#fff"; 
        ctx.fill();
        const hx = cx + Math.cos(rad) * radius, hy = cy + Math.sin(rad) * radius;
        ctx.beginPath(); 
        ctx.arc(hx, hy, 6, 0, 2 * Math.PI); 
        ctx.fillStyle = "#fff"; 
        ctx.fill();
        ctx.strokeStyle = "#000"; 
        ctx.lineWidth = 2; 
        ctx.stroke();
    }
    
    function renderNow() {
        if (destroyed || paused) return;
        valueDisplay.textContent = Math.round(currentAngle).toString();
        const line = trigger.querySelector("#angle-line") as SVGLineElement;
        if (line) {
            const rad = (currentAngle - 90) * (Math.PI / 180), r = 8;
            const x = 12 + Math.cos(rad) * r, y = 12 + Math.sin(rad) * r;
            line.setAttribute("x2", x.toString()); 
            line.setAttribute("y2", y.toString());
        }
        drawAngle();
        if (onChange) onChange(currentAngle);
    }
    
    function scheduleRender() { 
        if (rafId === null) rafId = requestAnimationFrame(() => { rafId = null; renderNow(); }); 
    }

    function positionPanel() {
        const rect = trigger.getBoundingClientRect();
        const panelWidth = 200, panelHeight = 270;
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

    function handleInput(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        currentAngle = angle;
        scheduleRender();
    }
    
    const onMove = (e: MouseEvent) => { if (isDragging) handleInput(e); };
    const onUp = () => { isDragging = false; };

    canvas.addEventListener("mousedown", (e) => { isDragging = true; handleInput(e); e.stopPropagation(); });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker.isExpanded) picker.collapse();
        else requestExpand(picker);
    });

    renderNow();

    return {
        getValue: () => currentAngle,
        setValue: (value) => { if (typeof value === "number") { currentAngle = value; scheduleRender(); } },
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
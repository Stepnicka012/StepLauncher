export type LuminaState = "success" | "error" | "warning" | "info" | "loading" | "action";
export type LuminaPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface LuminaButton {
    label: string;
    onClick: () => void;
}

export interface LuminaOptions {
    id?: string;
    title?: string;
    description?: string;
    state?: LuminaState;
    position?: LuminaPosition;
    duration?: number | null;
    icon?: string | null;
    fill?: string;
    roundness?: number;
    button?: LuminaButton;
    autopilot?: boolean | { expand?: number; collapse?: number };
}

export interface LuminaPromiseOptions<T = unknown> {
    loading: Pick<LuminaOptions, "title" | "icon">;
    success: LuminaOptions | ((data: T) => LuminaOptions);
    error: LuminaOptions | ((err: unknown) => LuminaOptions);
    position?: LuminaPosition;
}

const PILL_H = 38;
const TOAST_W = 360;
const DEFAULT_DUR = 6000;
const EXIT_DUR = 500;
const DEFAULT_ROUND = 19;
const BLUR_RATIO = 0.45;
const GOO_OVERLAP = 10;
const PILL_PAD = 24;
const HEADER_EXIT = 420;
const AP_EXPAND = 400;
const AP_COLLAPSE = 4500;

const ICONS: Record<LuminaState, string> = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    loading: `<svg class="ln-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
    action: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
};

interface ToastItem {
    id: string;
    instanceId: string;
    title?: string;
    description?: string;
    state?: LuminaState;
    position: LuminaPosition;
    duration: number | null;
    icon?: string | null;
    fill?: string;
    roundness?: number;
    button?: LuminaButton;
    autopilot?: LuminaOptions["autopilot"];
    exiting?: boolean;
}

type Listener = (t: ToastItem[]) => void;
let _ctr = 0;
const uid = () => `ln-${++_ctr}-${Date.now().toString(36)}`;

const store = {
    toasts: [] as ToastItem[],
    listeners: new Set<Listener>(),
    position: "top-right" as LuminaPosition,
    emit() {
        for (const fn of this.listeners) fn(this.toasts);
    },
    set(fn: (p: ToastItem[]) => ToastItem[]) {
        this.toasts = fn(this.toasts);
        this.emit();
    },
};

function buildItem(
    o: LuminaOptions,
    id: string,
    fp?: LuminaPosition,
): ToastItem {
    return {
        id,
        instanceId: uid(),
        title: o.title,
        description: o.description,
        state: o.state,
        position: o.position ?? fp ?? store.position,
        duration: o.duration !== undefined ? o.duration : DEFAULT_DUR,
        icon: o.icon,
        fill: o.fill,
        roundness: o.roundness,
        button: o.button,
        autopilot: o.autopilot,
    };
}

function createToast(o: LuminaOptions): string {
    const id = o.id ?? uid();
    const prev = store.toasts.find((t) => t.id === id && !t.exiting);
    const item = buildItem(o, id, prev?.position);
    store.set(
        prev
        ? (p) => p.map((t) => (t.id === id ? item : t))
        : (p) => [...p.filter((t) => t.id !== id), item],
    );
    return id;
}

function updateToast(id: string, o: LuminaOptions) {
    const ex = store.toasts.find((t) => t.id === id);
    if (!ex) return;
    store.set((p) =>
        p.map((t) => (t.id === id ? buildItem({ ...o, id }, id, ex.position) : t)),
);
}

function dismissToast(id: string) {
    const it = store.toasts.find((t) => t.id === id);
    if (!it || it.exiting) return;
    store.set((p) => p.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => store.set((p) => p.filter((t) => t.id !== id)), EXIT_DUR);
}

export const lumina = {
    show: (o: LuminaOptions) => createToast(o),
    success: (o: LuminaOptions) => createToast({ ...o, state: "success" }),
    error: (o: LuminaOptions) => createToast({ ...o, state: "error" }),
    warning: (o: LuminaOptions) => createToast({ ...o, state: "warning" }),
    info: (o: LuminaOptions) => createToast({ ...o, state: "info" }),
    action: (o: LuminaOptions) => createToast({ ...o, state: "action" }),
    loading: (o: LuminaOptions) =>
        createToast({ ...o, state: "loading", duration: null }),
    update: updateToast,
    dismiss: dismissToast,
    clear: (pos?: LuminaPosition) =>
        store.set((p) => (pos ? p.filter((t) => t.position !== pos) : [])),
    promise<T>(
        promise: Promise<T> | (() => Promise<T>),
        opts: LuminaPromiseOptions<T>,
    ): Promise<T> {
        const id = createToast({
            ...opts.loading,
            state: "loading",
            duration: null,
            position: opts.position,
            autopilot: false,
        });
        const p = typeof promise === "function" ? promise() : promise;
        p.then((data) => {
            const s =
            typeof opts.success === "function" ? opts.success(data) : opts.success;
            updateToast(id, { ...s, state: "success", id });
        }).catch((err) => {
            const e = typeof opts.error === "function" ? opts.error(err) : opts.error;
            updateToast(id, { ...e, state: "error", id });
        });
        return p;
    },
};

interface Entry {
    el: HTMLButtonElement;
    item: ToastItem;
    pillRect: SVGRectElement;
    bodyRect: SVGRectElement;
    header: HTMLElement;
    content: HTMLElement;
    stack: HTMLElement;
    expanded: boolean;
    pillW: number;
    contentH: number;
    tDismiss: number | null;
    tExpand: number | null;
    tCollapse: number | null;
    roInner?: ResizeObserver;
    roDesc?: ResizeObserver;
}

const NS = "http://www.w3.org/2000/svg";

class LuminaNotify extends HTMLElement {
    private sh!: ShadowRoot;
    private vps!: Map<LuminaPosition, HTMLElement>;
    private entries: Map<string, Entry> = new Map();
    private hovered = false;
    private _sub!: Listener;
    
    constructor() {
        super();
        this.sh = this.attachShadow({ mode: "open" });
        this._buildShadow();
    }
    
    connectedCallback() {
        this._sub = (ts) => this._sync(ts);
        store.listeners.add(this._sub);
    }
    
    disconnectedCallback() {
        store.listeners.delete(this._sub);
        for (const e of this.entries.values()) {
            e.roInner?.disconnect();
            e.roDesc?.disconnect();
        }
    }
    
    private _buildShadow() {
        const externalLink =
        document.querySelector<HTMLLinkElement>("link[data-lumina]");
        if (externalLink) {
            this.sh.appendChild(externalLink.cloneNode());
        }
        
        const root = document.createElement("div");
        root.id = "ln-root";
        this.vps = new Map();
        for (const pos of [
            "top-left",
            "top-center",
            "top-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
        ] as LuminaPosition[]) {
            const vp = document.createElement("section");
            vp.setAttribute("data-ln-vp", pos);
            vp.setAttribute("aria-live", "polite");
            root.appendChild(vp);
            this.vps.set(pos, vp);
        }
        this.sh.appendChild(root);
    }
    
    private _sync(toasts: ToastItem[]) {
        const alive = new Set(toasts.map((t) => t.id));
        for (const item of toasts) {
            const e = this.entries.get(item.id);
            if (!e) this._mount(item);
            else if (item.instanceId !== e.item.instanceId) this._patch(e, item);
            else if (item.exiting && !e.item.exiting) {
                e.item = item;
                this._exit(e);
            }
        }
        for (const [id, e] of this.entries) {
            if (!alive.has(id)) {
                e.roInner?.disconnect();
                e.roDesc?.disconnect();
                e.el.remove();
                this.entries.delete(id);
            }
        }
    }
    
    private _mount(item: ToastItem) {
        const isBottom = item.position.startsWith("bottom");
        const edge = isBottom ? "top" : "bottom";
        const fill = item.fill ?? "#1c1c1e";
        const R = item.roundness ?? DEFAULT_ROUND;
        const blur = R * BLUR_RATIO;
        const fid = `lg-${item.id}`;
        const st = item.state ?? "success";
        
        const el = document.createElement("button") as HTMLButtonElement;
        el.type = "button";
        el.setAttribute("data-ln-toast", "");
        el.setAttribute("data-state", st);
        el.setAttribute("data-edge", edge);
        
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("data-ln-canvas", "");
        svg.setAttribute("data-edge", edge);
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("width", String(TOAST_W));
        svg.setAttribute("height", String(PILL_H));
        svg.setAttribute("viewBox", `0 0 ${TOAST_W} ${PILL_H}`);
        
        const defs = document.createElementNS(NS, "defs");
        defs.innerHTML = `
      <filter id="${fid}" x="-20%" y="-100%" width="140%" height="300%"
              color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blur.toFixed(2)}" result="b"/>
        <feColorMatrix in="b" mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
          result="g"/>
        <feComposite in="SourceGraphic" in2="g" operator="atop"/>
      </filter>`;
        svg.appendChild(defs);
        
        const g = document.createElementNS(NS, "g");
        g.setAttribute("filter", `url(#${fid})`);
        
        const pillRect = document.createElementNS(NS, "rect") as SVGRectElement;
        pillRect.setAttribute("data-ln-pill", "");
        pillRect.setAttribute("fill", fill);
        pillRect.setAttribute("rx", String(R));
        pillRect.setAttribute("ry", String(R));
        pillRect.setAttribute("x", "0");
        pillRect.setAttribute("y", "0");
        pillRect.setAttribute("width", "40");
        pillRect.setAttribute("height", String(PILL_H));
        
        const bodyRect = document.createElementNS(NS, "rect") as SVGRectElement;
        bodyRect.setAttribute("data-ln-body", "");
        bodyRect.setAttribute("fill", fill);
        bodyRect.setAttribute("rx", String(R));
        bodyRect.setAttribute("ry", String(R));
        bodyRect.setAttribute("x", "0");
        bodyRect.setAttribute("y", String(PILL_H - GOO_OVERLAP));
        bodyRect.setAttribute("width", String(TOAST_W));
        bodyRect.setAttribute("height", "0");
        
        g.append(pillRect, bodyRect);
        svg.appendChild(g);
        el.appendChild(svg);
        
        const header = document.createElement("div");
        header.setAttribute("data-ln-header", "");
        header.setAttribute("data-edge", edge);
        const stack = document.createElement("div");
        stack.setAttribute("data-ln-stack", "");
        header.appendChild(stack);
        this._injectHeader(stack, item, true);
        el.appendChild(header);
        
        const content = document.createElement("div");
        content.setAttribute("data-ln-content", "");
        content.setAttribute("data-edge", edge);
        const hasDesc = !!(item.description || item.button);
        if (hasDesc) content.innerHTML = this._contentHTML(item);
        el.appendChild(content);
        
        const entry: Entry = {
            el,
            item,
            pillRect,
            bodyRect,
            header,
            content,
            stack,
            expanded: false,
            pillW: 0,
            contentH: 0,
            tDismiss: null,
            tExpand: null,
            tCollapse: null,
        };
        this.entries.set(item.id, entry);
        
        const vp = this.vps.get(item.position)!;
        isBottom ? vp.appendChild(el) : vp.prepend(el);
        
        const inner = stack.querySelector<HTMLElement>("[data-ln-inner]");
        if (inner) {
            const measure = () => {
                const innerWidth = inner.getBoundingClientRect().width;
                const targetW = innerWidth + PILL_PAD;
                const w = Math.min(Math.max(targetW, PILL_H), TOAST_W);
                
                if (Math.abs(w - entry.pillW) > 1) {
                    entry.pillW = w;
                    this._applyPillW(entry);
                }
            };
            requestAnimationFrame(measure);
            const ro = new ResizeObserver(measure);
            ro.observe(inner);
            entry.roInner = ro;
        }
        
        if (hasDesc) {
            const desc = content.querySelector<HTMLElement>("[data-ln-desc]");
            if (desc) {
                requestAnimationFrame(() => {
                    entry.contentH = desc.scrollHeight;
                });
                const ro = new ResizeObserver(() => {
                    entry.contentH = desc.scrollHeight;
                });
                ro.observe(desc);
                entry.roDesc = ro;
            }
        }
        
        el.addEventListener("mouseenter", () => this._onEnter(item.id));
        el.addEventListener("mouseleave", () => this._onLeave(item.id));
        el.addEventListener("click", (ev) => this._onClick(ev, item.id));
        this._addSwipe(el, item.id);
        
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
            el.setAttribute("data-ready", "");
            this._scheduleTimers(entry);
        }),
    );
}

private _patch(e: Entry, newItem: ToastItem) {
    const prev = e.item;
    e.item = newItem;
    e.el.setAttribute("data-state", newItem.state ?? "success");
    
    if (newItem.fill !== prev.fill) {
        const f = newItem.fill ?? "#1c1c1e";
        e.pillRect.setAttribute("fill", f);
        e.bodyRect.setAttribute("fill", f);
    }
    
    this._injectHeader(e.stack, newItem, false);
    
    // Re-observe the new [data-ln-inner] so pillW is recalculated
    // after the header swap (the old element is no longer in the DOM).
    e.roInner?.disconnect();
    const newInner = e.stack.querySelector<HTMLElement>(
        '[data-ln-inner][data-layer="current"]',
    );
    if (newInner) {
        const measure = () => {
            const w = Math.min(
                Math.max(newInner.getBoundingClientRect().width + PILL_PAD, PILL_H),
                TOAST_W,
            );
            if (Math.abs(w - e.pillW) > 1) {
                e.pillW = w;
                this._applyPillW(e);
            }
        };
        requestAnimationFrame(measure);
        const ro = new ResizeObserver(measure);
        ro.observe(newInner);
        e.roInner = ro;
    }
    
    const hasDesc = !!(newItem.description || newItem.button);
    if (
        newItem.description !== prev.description ||
        newItem.button !== prev.button
    ) {
        e.roDesc?.disconnect();
        e.content.innerHTML = hasDesc ? this._contentHTML(newItem) : "";
        if (hasDesc) {
            const desc = e.content.querySelector<HTMLElement>("[data-ln-desc]");
            if (desc) {
                requestAnimationFrame(() => {
                    e.contentH = desc.scrollHeight;
                });
                const ro = new ResizeObserver(() => {
                    e.contentH = desc.scrollHeight;
                });
                ro.observe(desc);
                e.roDesc = ro;
            }
        } else {
            e.contentH = 0;
        }
    }
    
    this._clearTimers(e);
    if (e.expanded && (newItem.state === "loading" || !hasDesc))
        this._collapse(e);
    this._scheduleTimers(e);
}

private _injectHeader(stack: HTMLElement, item: ToastItem, initial: boolean) {
    if (!initial) {
        const old = stack.querySelector<HTMLElement>('[data-layer="current"]');
        if (old) {
            old.setAttribute("data-layer", "prev");
            old.setAttribute("data-exiting", "true");
            setTimeout(() => old.remove(), HEADER_EXIT);
        }
    }
    const inner = document.createElement("div");
    inner.setAttribute("data-ln-inner", "");
    inner.setAttribute("data-layer", "current");
    inner.innerHTML = this._badgeHTML(item) + this._titleHTML(item);
    stack.prepend(inner);
}

private _scheduleTimers(e: Entry) {
    if (this.hovered) return;
    const { item } = e;
    const hasDesc = !!(item.description || item.button);
    const ap = item.autopilot;
    
    if (
        hasDesc &&
        item.state !== "loading" &&
        ap !== false &&
        ap !== undefined
    ) {
        const cfg = typeof ap === "object" ? ap : undefined;
        e.tExpand = window.setTimeout(() => {
            this._expand(e);
            e.tCollapse = window.setTimeout(
                () => this._collapse(e),
                cfg?.collapse ?? AP_COLLAPSE,
            );
        }, cfg?.expand ?? AP_EXPAND);
    }
    
    if (item.duration && item.duration > 0) {
        e.tDismiss = window.setTimeout(
            () => dismissToast(item.id),
            item.duration,
        );
    }
}

private _clearTimers(e: Entry) {
    if (e.tDismiss) {
        clearTimeout(e.tDismiss);
        e.tDismiss = null;
    }
    if (e.tExpand) {
        clearTimeout(e.tExpand);
        e.tExpand = null;
    }
    if (e.tCollapse) {
        clearTimeout(e.tCollapse);
        e.tCollapse = null;
    }
}

private _expand(e: Entry) {
    if (e.expanded) return;
    if (e.item.state === "loading") return;
    if (!e.item.description && !e.item.button) return;
    e.expanded = true;
    const bodyH = Math.max(e.contentH + 24, 56);
    const totalH = PILL_H + bodyH;
    e.bodyRect.style.height = `${bodyH + GOO_OVERLAP}px`;
    e.el.style.setProperty("--h", `${totalH}px`);
    e.content.setAttribute("data-visible", "");
}

private _collapse(e: Entry) {
    if (!e.expanded) return;
    e.expanded = false;
    e.bodyRect.style.height = "0px";
    e.el.style.setProperty("--h", `${PILL_H}px`);
    e.content.removeAttribute("data-visible");
    e.header.style.transform = "";
}

private _applyPillW(e: Entry) {
    const pos = e.item.position;
    const align = pos.includes("right")
    ? "right"
    : pos.includes("center")
    ? "center"
    : "left";
    
    const w = e.pillW;
    let pillX = 0;
    if (align === "right") pillX = TOAST_W - w;
    if (align === "center") pillX = (TOAST_W - w) / 2;
    
    e.pillRect.setAttribute("x", `${pillX}`);
    e.pillRect.setAttribute("width", `${w}`);
    e.header.style.left = `${pillX}px`;
    e.header.style.width = `${w}px`;
    
    e.content.style.left = "0px";
    e.content.style.width = `${TOAST_W}px`;
    
    const isBottom = pos.startsWith("bottom");
    if (isBottom) {
        e.header.style.top = "auto";
        e.header.style.bottom = "0";
        e.content.style.top = "auto";
        e.content.style.bottom = `${PILL_H}px`;
    } else {
        e.header.style.top = "0";
        e.header.style.bottom = "auto";
        e.content.style.top = `${PILL_H}px`;
        e.content.style.bottom = "auto";
    }
}

private _exit(e: Entry) {
    this._clearTimers(e);
    if (e.expanded) this._collapse(e);
    e.el.setAttribute("data-exiting", "");
}

private _onEnter(id: string) {
    this.hovered = true;
    for (const e of this.entries.values()) this._clearTimers(e);
    const e = this.entries.get(id);
    if (e && !e.expanded) this._expand(e);
}

private _onLeave(id: string) {
    this.hovered = false;
    const e = this.entries.get(id);
    if (e?.expanded) this._collapse(e);
    for (const e2 of this.entries.values()) {
        if (!e2.item.exiting) this._scheduleTimers(e2);
    }
}

private _onClick(ev: MouseEvent, id: string) {
    if ((ev.target as HTMLElement).closest("[data-ln-btn]")) return;
    const e = this.entries.get(id);
    if (!e) return;
    if (!e.expanded && (e.item.description || e.item.button)) this._expand(e);
    else dismissToast(id);
}

private _addSwipe(el: HTMLButtonElement, id: string) {
    let startY: number | null = null;
    el.addEventListener(
        "pointerdown",
        (ev: PointerEvent) => {
            if ((ev.target as HTMLElement).closest("[data-ln-btn]")) return;
            startY = ev.clientY;
            el.setPointerCapture(ev.pointerId);
        },
        { passive: true },
    );
    el.addEventListener(
        "pointermove",
        (ev: PointerEvent) => {
            if (startY === null) return;
            const dy = ev.clientY - startY;
            el.style.transform = `translateY(${Math.sign(dy) * Math.min(Math.abs(dy), 18)}px)`;
        },
        { passive: true },
    );
    el.addEventListener("pointerup", (ev: PointerEvent) => {
        if (startY === null) return;
        const dy = ev.clientY - startY;
        el.style.transform = "";
        startY = null;
        if (Math.abs(dy) > 30) dismissToast(id);
    });
}

private _badgeHTML(item: ToastItem): string {
    const s = item.state ?? "success";
    const icon = item.icon !== undefined ? item.icon : ICONS[s];
    if (!icon) return "";
    return `<span data-ln-badge data-state="${s}">${icon}</span>`;
}

private _titleHTML(item: ToastItem): string {
    const s = item.state ?? "success";
    return `<span data-ln-title data-state="${s}">${item.title ?? s}</span>`;
}

private _contentHTML(item: ToastItem): string {
    const s = item.state ?? "success";
    const btn = item.button
    ? `<button data-ln-btn data-state="${s}" type="button">${item.button.label}</button>`
    : "";
    return `<div data-ln-desc><p data-ln-msg>${item.description ?? ""}</p>${btn}</div>`;
}
}

customElements.define("lumina-notify", LuminaNotify);

(function autoMount() {
    if (typeof document === "undefined") return;
    const go = () => {
        if (!document.querySelector("lumina-notify"))
            document.body.appendChild(document.createElement("lumina-notify"));
    };
    document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", go)
    : go();
})();

export default lumina;

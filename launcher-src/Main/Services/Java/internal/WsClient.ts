import type { NovaCoreEventName, NovaCoreEvents, WsBaseEvent } from "../types/index.js";

type Callback<K extends NovaCoreEventName> = (data: NovaCoreEvents[K], raw: WsBaseEvent) => void;
type AnyCallback = (data: unknown, raw: WsBaseEvent) => void;

export type WsStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "failed";

export interface WsClientOptions {
    url: string;
    token: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    onStatusChange?: (status: WsStatus, error?: Error) => void;
}

let WebSocketImpl: any;
if (typeof WebSocket === "undefined") {
    try {
        WebSocketImpl = require("ws");
    } catch (e) {
        throw new Error("WebSocket not available in this environment. Install 'ws' package.");
    }
} else {
    WebSocketImpl = WebSocket;
}

export class WsClient {
    private opts: Required<WsClientOptions>;
    private ws: any | null = null;
    private attempts = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private dead = false;
    private map = new Map<NovaCoreEventName | "*", Set<AnyCallback>>();
    private _status: WsStatus = "disconnected";

    constructor(opts: WsClientOptions) {
        this.opts = {
            autoReconnect: true,
            reconnectDelay: 1500,
            maxReconnectAttempts: 0,
            onStatusChange: () => {},
            ...opts,
        };
    }

    get status(): WsStatus { return this._status; }
    get connected(): boolean { return this.ws?.readyState === 1; }

    private setStatus(status: WsStatus, error?: Error) {
        this._status = status;
        this.opts.onStatusChange(status, error);
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.dead) return reject(new Error("Client closed"));
            this.setStatus("connecting");
            const url = `${this.opts.url}?token=${encodeURIComponent(this.opts.token)}`;
            try {
                this.ws = new WebSocketImpl(url);
            } catch (e) {
                this.setStatus("failed", e as Error);
                reject(e);
                return;
            }

            let resolved = false;
            const onOpen = () => {
                this.attempts = 0;
                this.setStatus("connected");
                if (!resolved) resolve();
                resolved = true;
            };
            const onMessage = (e: any) => this.dispatch(typeof e.data === "string" ? e.data : e.data.toString());
            const onError = (err: any) => {
                this.setStatus("failed", err);
                if (!resolved) reject(err);
                resolved = true;
                this.scheduleReconnect();
            };
            const onClose = () => {
                this.setStatus("disconnected");
                this.scheduleReconnect();
            };

            this.ws.onopen = onOpen;
            this.ws.onmessage = onMessage;
            this.ws.onerror = onError;
            this.ws.onclose = onClose;
        });
    }

    close(): void {
        this.dead = true;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.ws) {
            this.ws.close(1000, "bye");
            this.ws = null;
        }
        this.setStatus("disconnected");
    }

    on<K extends NovaCoreEventName>(event: K, cb: Callback<K>): this {
        this.add(event, cb as AnyCallback);
        return this;
    }
    off<K extends NovaCoreEventName>(event: K, cb: Callback<K>): this {
        this.map.get(event)?.delete(cb as AnyCallback);
        return this;
    }
    once<K extends NovaCoreEventName>(event: K, cb: Callback<K>): this {
        const w: AnyCallback = (d, r) => { this.off(event, w as unknown as Callback<K>); (cb as AnyCallback)(d, r); };
        this.add(event, w);
        return this;
    }
    onAny(cb: (event: NovaCoreEventName, data: unknown) => void): this {
        this.add("*", (d, r) => cb(r.event as NovaCoreEventName, d));
        return this;
    }
    waitFor<K extends NovaCoreEventName>(event: K, ms = 30000): Promise<NovaCoreEvents[K]> {
        return new Promise((res, rej) => {
            const t = setTimeout(() => { this.off(event, cb); rej(new Error(`Timeout: "${event}"`)); }, ms);
            const cb: Callback<K> = (d) => { clearTimeout(t); res(d); };
            this.once(event, cb);
        });
    }

    private add(k: NovaCoreEventName | "*", cb: AnyCallback) {
        if (!this.map.has(k)) this.map.set(k, new Set());
        this.map.get(k)!.add(cb);
    }

    private dispatch(raw: string) {
        let p: WsBaseEvent;
        try { p = JSON.parse(raw) as WsBaseEvent; } catch { return; }
        const key = p.event as NovaCoreEventName;
        this.map.get(key)?.forEach(cb => { try { cb(p.data, p); } catch {} });
        this.map.get("*")?.forEach(cb => { try { cb(p.data, p); } catch {} });
    }

    private scheduleReconnect() {
        if (this.dead || !this.opts.autoReconnect) return;
        const { maxReconnectAttempts: max, reconnectDelay: base } = this.opts;
        if (max > 0 && this.attempts >= max) return;
        this.attempts++;
        const delay = base * Math.min(this.attempts, 6);
        this.setStatus("reconnecting", undefined);
        this.timer = setTimeout(() => {
            if (!this.dead) this.connect().catch(() => {});
        }, delay);
    }
}
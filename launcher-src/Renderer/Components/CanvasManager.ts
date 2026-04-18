export enum CanvasState {
    IDLE,
    ACTIVE,
    HIDDEN, 
    DESTROYED
}

export class CanvasManager {
    private static instance: CanvasManager;
    private canvases: Set<BaseCanvasController> = new Set();
    private lastTime: number = performance.now();
    private frameId: number = 0;

    private constructor() {
        this.loop = this.loop.bind(this);
        this.frameId = requestAnimationFrame(this.loop);
    }

    public static getInstance(): CanvasManager {
        if (!CanvasManager.instance) {
            CanvasManager.instance = new CanvasManager();
        }
        return CanvasManager.instance;
    }

    public register(canvas: BaseCanvasController): void {
        this.canvases.add(canvas);
    }

    public unregister(canvas: BaseCanvasController): void {
        this.canvases.delete(canvas);
    }

    private loop(time: number): void {
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        for (const canvas of this.canvases) {
            if (canvas.state === CanvasState.DESTROYED) {
                this.unregister(canvas);
                continue;
            }

            if (canvas.state !== CanvasState.ACTIVE) continue;
            if (!canvas.visible || !canvas.isIntersecting) continue;

            canvas.update(dt);
            canvas.render();
        }

        this.frameId = requestAnimationFrame(this.loop);
    }
}

export abstract class BaseCanvasController extends EventTarget {
    public state: CanvasState = CanvasState.ACTIVE;
    public visible: boolean = true;
    public isIntersecting: boolean = true;
    
    public canvas: HTMLCanvasElement;
    public ctx: CanvasRenderingContext2D;

    private observer: IntersectionObserver;

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        super();
        this.canvas = canvas;
        this.ctx = ctx;

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                this.isIntersecting = entry.isIntersecting;
            });
        });
        this.observer.observe(this.canvas);

        CanvasManager.getInstance().register(this);
    }

    public setState(state: CanvasState): void {
        this.state = state;
    }

    public show(): void {
        this.visible = true;
        this.setState(CanvasState.ACTIVE);
        this.canvas.style.display = '';
        this.canvas.style.visibility = 'visible';
    }

    public hide(): void {
        this.visible = false;
        this.setState(CanvasState.HIDDEN);
        this.canvas.style.display = 'none';
        this.canvas.style.visibility = 'hidden';
    }

    public destroy(): void {
        this.setState(CanvasState.DESTROYED);
        this.observer.disconnect();
        
        this.canvas.width = 0;
        this.canvas.height = 0;
        this.canvas.remove();
        
        CanvasManager.getInstance().unregister(this);
    }

    pause() { this.setState(CanvasState.IDLE); }
    resume() { this.setState(CanvasState.ACTIVE); }
    requestRender() { if (this.state !== CanvasState.DESTROYED) this.setState(CanvasState.ACTIVE); }
    
    abstract update(dt: number): void;
    abstract render(): void;
}

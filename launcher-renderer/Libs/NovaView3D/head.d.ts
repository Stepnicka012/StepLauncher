export interface HeadModelOptions {
    rotation?: {
        x?: number;
        y?: number;
    };
    animationEnabled?: boolean;
    swayIntensity?: number;
    swaySpeed?: number;
}

export declare class HeadModel {
    constructor(
        canvas:  HTMLCanvasElement,
        skinUrl: string,
        options?: HeadModelOptions
    );
}
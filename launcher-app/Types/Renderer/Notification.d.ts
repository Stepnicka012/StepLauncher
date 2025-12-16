export interface NotificationOptions {
    icon: string;
    message: string;
    timeout?: number;
    sound?: string;
}

export interface ActiveNotification {
    element: HTMLElement;
    id: string;
    timeoutId: number | null;
    progressInterval: number | null;
    remainingTime: number;
    totalTime: number;
}
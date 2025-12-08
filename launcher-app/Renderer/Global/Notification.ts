import type { ActiveNotification, NotificationOptions } from '../../Types/Renderer/Notification.js';

export class NotificationManager {
    private static instance: NotificationManager;
    private activeNotifications: Map<string, ActiveNotification> = new Map();
    private container: HTMLElement | undefined;
    private readonly NOTIFICATION_HEIGHT = 3.5; // rem (2.5rem + 1rem de margen)

    private constructor() {
        this.createContainer();
    }

    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    private createContainer(): void {
        this.container = document.createElement('div');
        this.container.className = 'notifications-container';
        document.body.appendChild(this.container);
    }

    public activate(options: NotificationOptions): string {
        const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const notification = this.createNotificationElement(notificationId, options);
        
        notification.style.opacity = '0';
        notification.style.transform = `translateX(100%) translateY(0rem) scale(0.8)`;
        
        this.container!.appendChild(notification);
        
        const notificationsArray = Array.from(this.activeNotifications.values());
        const topPosition = notificationsArray.length * this.NOTIFICATION_HEIGHT;
        
        let timeoutId: number | null = null;
        let progressInterval: number | null = null;
        
        const notificationData: ActiveNotification = {
            element: notification,
            id: notificationId,
            timeoutId,
            progressInterval,
            remainingTime: options.timeout || 0,
            totalTime: options.timeout || 0
        };
        
        this.activeNotifications.set(notificationId, notificationData);
        
        // Animar entrada
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.transform = `translateX(0) translateY(${topPosition}rem) scale(1)`;
                
                // Iniciar timeout con barra de progreso después de la animación de entrada
                if (options.timeout && options.timeout > 0) {
                    setTimeout(() => {
                        const result = this.startTimeout(notification, notificationId, options.timeout!);
                        notificationData.timeoutId = result.timeoutId;
                        notificationData.progressInterval = result.progressInterval;
                    }, 300);
                }
            });
        });
        
        // Configurar botón de cierre
        const closeButton = notification.querySelector('.ButtonExitNotification');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.removeNotification(notificationId);
            });
        }
        
        // Pausar progreso al hacer hover
        notification.addEventListener('mouseenter', () => {
            if (options.timeout && options.timeout > 0) {
                this.pauseNotification(notificationId);
            }
        });
        
        notification.addEventListener('mouseleave', () => {
            if (options.timeout && options.timeout > 0) {
                this.resumeNotification(notificationId);
            }
        });
        
        return notificationId;
    }

    private createNotificationElement(id: string, options: NotificationOptions): HTMLElement {
        const notification = document.createElement('div');
        notification.id = id;
        notification.className = 'Notification';

        // Icono
        const iconContainer = document.createElement('div');
        iconContainer.className = 'Icon';

        const iconImg = document.createElement('img');
        iconImg.id = 'IconNotification';
        iconImg.src = options.icon;
        iconImg.alt = 'Notification icon';
        iconContainer.appendChild(iconImg);

        const messageContainer = document.createElement('div');
        messageContainer.className = 'Message';

        const messageParagraph = document.createElement('p');
        messageParagraph.id = 'Message';
        messageParagraph.textContent = options.message;
        messageContainer.appendChild(messageParagraph);

        const closeButton = document.createElement('div');
        closeButton.className = 'ButtonExitNotification';
        
        const closeIcon = document.createElement('img');
        closeIcon.src = './resources/Svg/close.svg';
        closeIcon.alt = 'Close notification';
        closeButton.appendChild(closeIcon);

        const progressBar = document.createElement('div');
        progressBar.className = 'ProgressTimeOut';
        progressBar.style.width = '0%';

        notification.appendChild(iconContainer);
        notification.appendChild(messageContainer);
        notification.appendChild(closeButton);
        notification.appendChild(progressBar);

        return notification;
    }

    private startTimeout(notification: HTMLElement, notificationId: string, timeout: number): {
        timeoutId: number;
        progressInterval: number;
    } {
        const progressBar = notification.querySelector('.ProgressTimeOut') as HTMLElement;
        const startTime = Date.now();
        const endTime = startTime + timeout;
        
        const updateProgress = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min((elapsed / timeout) * 100, 100);
            
            progressBar.style.width = `${progress}%`;
        
            const notificationData = this.activeNotifications.get(notificationId);
            if (notificationData) {
                notificationData.remainingTime = Math.max(0, endTime - now);
            }
            
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        };
        
        updateProgress();
        
        const progressInterval = window.setInterval(updateProgress, 16);
        
        const timeoutId = window.setTimeout(() => {
            this.removeNotification(notificationId);
        }, timeout);
        
        return { timeoutId, progressInterval };
    }

    private pauseNotification(notificationId: string): void {
        const notificationData = this.activeNotifications.get(notificationId);
        if (!notificationData || notificationData.timeoutId === null) return;
        
        clearTimeout(notificationData.timeoutId);
        if (notificationData.progressInterval) {
            clearInterval(notificationData.progressInterval);
        }
        
        notificationData.timeoutId = null;
        notificationData.progressInterval = null;
    }

    private resumeNotification(notificationId: string): void {
        const notificationData = this.activeNotifications.get(notificationId);
        if (!notificationData || notificationData.remainingTime <= 0) return;
        
        const result = this.startTimeout(
            notificationData.element,
            notificationId,
            notificationData.remainingTime
        );
        
        notificationData.timeoutId = result.timeoutId;
        notificationData.progressInterval = result.progressInterval;
        notificationData.totalTime = notificationData.remainingTime;
    }

    private removeNotification(notificationId: string): void {
        const notificationData = this.activeNotifications.get(notificationId);
        if (!notificationData) return;
        
        if (notificationData.timeoutId !== null) {
            clearTimeout(notificationData.timeoutId);
        }
        if (notificationData.progressInterval !== null) {
            clearInterval(notificationData.progressInterval);
        }
        
        notificationData.element.style.opacity = '0';
        notificationData.element.style.transform = `translateX(100%) translateY(${this.getNotificationTopPosition(notificationId)}rem) scale(0.8)`;
        
        setTimeout(() => {
            if (notificationData.element.parentNode) {
                notificationData.element.parentNode.removeChild(notificationData.element);
            }
            
            this.activeNotifications.delete(notificationId);
            
            this.reorganizeNotifications();
        }, 300);
    }

    private getNotificationTopPosition(notificationId: string): number {
        const notificationsArray = Array.from(this.activeNotifications.keys());
        const index = notificationsArray.indexOf(notificationId);
        return index * this.NOTIFICATION_HEIGHT;
    }

    private reorganizeNotifications(): void {
        const notificationsArray = Array.from(this.activeNotifications.values());
        
        notificationsArray.forEach((notificationData, index) => {
            const topPosition = index * this.NOTIFICATION_HEIGHT;
            
            requestAnimationFrame(() => {
                notificationData.element.style.transform = `translateX(0) translateY(${topPosition}rem) scale(1)`;
            });
        });
    }

    public removeAll(): void {
        this.activeNotifications.forEach((notificationData, notificationId) => {
            if (notificationData.timeoutId !== null) {
                clearTimeout(notificationData.timeoutId);
            }
            if (notificationData.progressInterval !== null) {
                clearInterval(notificationData.progressInterval);
            }
            
            notificationData.element.style.opacity = '0';
            notificationData.element.style.transform = `translateX(100%) translateY(${this.getNotificationTopPosition(notificationId)}rem) scale(0.8)`;
        });
        
        setTimeout(() => {
            this.activeNotifications.forEach(notificationData => {
                if (notificationData.element.parentNode) {
                    notificationData.element.parentNode.removeChild(notificationData.element);
                }
            });
            
            this.activeNotifications.clear();
        }, 300);
    }

    public getNotificationCount(): number {
        return this.activeNotifications.size;
    }

    public getNotificationIds(): string[] {
        return Array.from(this.activeNotifications.keys());
    }
}
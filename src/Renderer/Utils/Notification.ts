import type { NotificationType, NotificationOptions } from "../../Utils/Types.js";

export class Notification {
    private static container: HTMLDivElement;
    private static spacing = 3; // rem

    private static ensureContainer() {
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.style.position = "fixed";
            this.container.style.top = "3rem";
            this.container.style.right = "0.5rem";
            this.container.style.display = "flex";
            this.container.style.flexDirection = "column";
            this.container.style.alignItems = "flex-end";
            this.container.style.zIndex = "5000";
            document.body.appendChild(this.container);
        }
    }

    static new(options: NotificationOptions) {
        const duration = options.duration ?? 3500;
        this.ensureContainer();

        const notification = document.createElement("div");
        notification.className = `NotificationContainer ${options.type}`;
        notification.style.opacity = "0";
        notification.style.transform = "translateX(120%) translateY(0rem)";
        notification.style.position = "fixed";
        notification.style.transition = "opacity 250ms ease, transform 0.5s ease-in-out";

        notification.innerHTML = `
            <div class="NotificationContent">
                <div><img src="${this.getIcon(options.type)}"></div>
                <div><p>${options.message}</p></div>
            </div>
            <div class="NotificationCloseButton">
                <img src="./assets/icons/Svg/Window/close.svg">
            </div>
            <div class="NotificationTimeOut"></div>
        `;
        window.ElectronPino.info(`[ Notificacion ] Tipo • ${options.type} - Mensaje • ${options.message}`);

        this.container.prepend(notification);

        const close = notification.querySelector(".NotificationCloseButton") as HTMLDivElement;
        const bar = notification.querySelector(".NotificationTimeOut") as HTMLDivElement;

        // Animación de entrada desde la derecha
        requestAnimationFrame(() => {
            notification.style.opacity = "1";
            notification.style.transform = "translateX(0) translateY(0rem)";
        });

        bar.style.width = "100%";
        bar.style.transition = `width ${duration}ms linear`;
        requestAnimationFrame(() => (bar.style.width = "0%"));

        const timeout = setTimeout(() => this.close(notification), duration);
        close.onclick = () => {
            clearTimeout(timeout);
            this.close(notification);
        };

        this.animatePositions();

        return notification;
    }

    private static close(notification: HTMLElement) {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(120%) translateY(0rem)";

        setTimeout(() => {
            notification.remove();
            this.animatePositions();
        }, 300);
    }

    private static animatePositions() {
        if (!this.container) return;
        const children = Array.from(this.container.children) as HTMLElement[];
        let offsetRem = 0;

        children.forEach(child => {
            const translateXMatch = child.style.transform.match(/translateX\(([^)]+)\)/);
            const translateX = translateXMatch ? translateXMatch[1] : "0";
            const heightRem = child.offsetHeight / 60;

            child.style.transition = "transform 0.5s ease-in-out, opacity 0.25s ease";
            child.style.transform = `translateX(${translateX}) translateY(${offsetRem}rem)`;

            offsetRem += heightRem + this.spacing;
        });
    }

    private static getIcon(type: NotificationType): string {
        switch (type) {
            case "success": return "./assets/icons/Warning/Octagon_Check.png";
            case "warning": return "./assets/icons/Warning/Triangle_Warning.png";
            case "error": return "./assets/icons/Warning/Stop_Sign.png";
        }
    }
}

export class LoadSettingsManager {
    private config: any = null;
    private isLoaded = false;

    constructor() {
        // load immediately (fire-and-forget)
        this.reload().catch(() => {});
    }

    public async reload(): Promise<any> {
        try {
            const cfg = (window as any).Config;
            if (!cfg) return null;
            const all = await cfg.getAll();
            this.config = all || {};
            this.isLoaded = true;
            this.applyBackgroundFromConfig(this.config);
            return this.config;
        } catch (e) {
            console.warn('[LoadSettingsManager] Error reloading config', e);
            return null;
        }
    }

    public getCached(): any {
        return this.config;
    }

    private normalizePathToUrl(p: string) {
        if (!p) return p;
        const trimmed = String(p).trim();
        // disallow remote URLs for security - only local
        if (/^(https?:)\/\//i.test(trimmed)) return null;
        if (/^file:\/\//i.test(trimmed)) return encodeURI(trimmed);
        if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
            const fixed = trimmed.replace(/\\/g, '/');
            return 'file:///' + encodeURI(fixed);
        }
        try {
            return new URL(trimmed, location.href).href;
        } catch (e) {
            return encodeURI(trimmed);
        }
    }

    private applyBackgroundFromConfig(c: any) {
        try {
            const useVideo = !!(c && c.ui && c.ui.useVideo);
            const videoPath = c?.ui?.backgroundVideo;
            const image = c?.ui?.backgroundImage;
            const blur = c?.ui?.blur || '4px';

            const parentDoc = document;

            if (useVideo && videoPath) {
                const url = this.normalizePathToUrl(videoPath);
                if (!url) return; // only local allowed

                let container = parentDoc.querySelector('.BACKGROUND_VIDEO') as HTMLElement | null;
                if (!container) {
                    container = parentDoc.querySelector('.BACKGROUND_VIDEO_INJECTED') as HTMLElement | null;
                }

                if (!container) {
                    container = parentDoc.createElement('div');
                    container.className = 'BACKGROUND_VIDEO_INJECTED';
                    container.style.position = 'fixed';
                    container.style.inset = '0';
                    container.style.zIndex = '-1';
                    container.style.overflow = 'hidden';

                    const video = parentDoc.createElement('video');
                    video.autoplay = true;
                    video.muted = true;
                    video.loop = true;
                    (video as any).playsInline = true;
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'cover';
                    video.style.filter = `blur(${blur})`;
                    container.appendChild(video);
                    parentDoc.body.prepend(container);
                }

                const videoEl = container.querySelector('video') as HTMLVideoElement | null;
                if (videoEl) {
                    videoEl.src = url;
                    videoEl.load();
                    videoEl.play().catch(()=>{});
                }

                parentDoc.documentElement.style.setProperty('--filter-blur', blur);
            } else {
                const injected = parentDoc.querySelector('.BACKGROUND_VIDEO_INJECTED');
                if (injected) injected.remove();

                if (image) {
                    const imageUrl = this.normalizePathToUrl(image);
                    if (imageUrl) {
                        parentDoc.documentElement.style.setProperty('--bg-color-app', `url('${imageUrl}')`);
                        parentDoc.documentElement.style.setProperty('--filter-blur', blur);
                    }
                } else {
                    parentDoc.documentElement.style.removeProperty('--bg-color-app');
                    parentDoc.documentElement.style.removeProperty('--filter-blur');
                }
            }
        } catch (e) {
            console.warn('[LoadSettingsManager] No se pudo aplicar background', e);
        }
    }
}

// attach singleton for other modules to use
export function createAndAttachLoadSettings() {
    const mgr = new LoadSettingsManager();
    (window as any).AppSettingsManager = mgr;
    return mgr;
}

export default LoadSettingsManager;

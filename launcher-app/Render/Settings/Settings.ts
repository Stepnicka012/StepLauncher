export default function SettingsModule(element: HTMLElement, loader?: any, api?: any): void {
    const $ = (sel: string) => element.querySelector<HTMLInputElement>(`#${sel}`);
    const cfg: any = api?.config || (window as any).Config;
    const fileDialog: any = (window as any).FileDialog;
    const settingsManager: any = api?.settingsManager || (window as any).AppSettingsManager || null;

    const normalizePathToUrl = (p: string | null): string | null => {
        if (!p) return null;
        const trimmed = String(p).trim();
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
    };

    function applyBackgroundFromConfig(c: any): void {
        try {
            const useVideo = !!(c && c.ui && c.ui.useVideo);
            const videoPath = c?.ui?.backgroundVideo;
            const image = c?.ui?.backgroundImage;
            const blur = c?.ui?.blur || '4px';
            const parentDoc = document;

            const container = parentDoc.querySelector('.BACKGROUND_VIDEO') as HTMLElement | null;

            if (useVideo && videoPath) {
                const url = normalizePathToUrl(videoPath);
                if (!url || !container) return;

                const videoEl = container.querySelector('video') as HTMLVideoElement | null;
                if (videoEl) {
                    const source = videoEl.querySelector('source');
                    if (source) {
                        source.src = url;
                    } else {
                        videoEl.src = url;
                    }
                    videoEl.load();
                    videoEl.play().catch(() => {});
                }

                container.style.display = '';
                parentDoc.documentElement.style.setProperty('--filter-blur', blur);
            } else {
                if (container) {
                    container.style.display = 'none';
                    const videoEl = container.querySelector('video') as HTMLVideoElement | null;
                    if (videoEl) {
                        videoEl.pause();
                        videoEl.src = '';
                    }
                }

                if (image) {
                    const imageUrl = normalizePathToUrl(image);
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
            console.warn('No se pudo aplicar background', e);
        }
    }

    function populateFromConfig(c: any): void {
        try {
            const setValue = (id: string, value: any) => {
                const el = $(id);
                if (!el) return;
                const type = el.type;
                if (type === 'checkbox') el.checked = !!value;
                else el.value = value ?? '';
            };

            const cfgObj = c || {};
            setValue('s-java', cfgObj.java || (cfgObj?.config?.java || ''));
            setValue('s-memory-min', cfgObj.memory?.min || '');
            setValue('s-memory-max', cfgObj.memory?.max || '');
            setValue('s-window-width', cfgObj.window?.width || '');
            setValue('s-window-height', cfgObj.window?.height || '');
            setValue('s-window-fullscreen', !!cfgObj.window?.fullscreen);
            setValue('s-close-on-launch', !!cfgObj.behavior?.closeOnLaunch);
            setValue('s-use-video', !!cfgObj.ui?.useVideo);
            setValue('s-video-path', cfgObj.ui?.backgroundVideo || '');
            setValue('s-bg-image', cfgObj.ui?.backgroundImage || '');
            setValue('s-bg-blur', cfgObj.ui?.blur || '');
            setValue('s-show-notifications', !!cfgObj.behavior?.showNotifications);
            setValue('s-user-name', cfgObj.user?.name || '');
            setValue('s-reopen-on-exit', !!cfgObj.behavior?.reopenOnExit);
            setValue('s-launch-after-install', !!cfgObj.behavior?.launchAfterInstall);

            applyBackgroundFromConfig(cfgObj);
        } catch (e) {
            console.warn('Error aplicando config al formulario', e);
        }
    }

    // Setup file dialog buttons
    function setupFileDialogs(): void {
        const javaBrowseBtn = element.querySelector('.browse-java');
        const videoBrowseBtn = element.querySelector('.browse-video');
        const imageBrowseBtn = element.querySelector('.browse-image');

        if (javaBrowseBtn && fileDialog) {
            javaBrowseBtn.addEventListener('click', async () => {
                try {
                    const result = await fileDialog.openJavaExecutable();
                    if (!result.canceled && result.filePath) {
                        const input = $('s-java');
                        if (input) input.value = result.filePath;
                    }
                } catch (err) {
                    console.error('Error seleccionando Java:', err);
                }
            });
        }

        if (videoBrowseBtn && fileDialog) {
            videoBrowseBtn.addEventListener('click', async () => {
                try {
                    const result = await fileDialog.openBackgroundFile('video');
                    if (!result.canceled && result.filePath) {
                        const input = $('s-video-path');
                        if (input) input.value = result.filePath;
                    }
                } catch (err) {
                    console.error('Error seleccionando video:', err);
                }
            });
        }

        if (imageBrowseBtn && fileDialog) {
            imageBrowseBtn.addEventListener('click', async () => {
                try {
                    const result = await fileDialog.openBackgroundFile('image');
                    if (!result.canceled && result.filePath) {
                        const input = $('s-bg-image');
                        if (input) input.value = result.filePath;
                    }
                } catch (err) {
                    console.error('Error seleccionando imagen:', err);
                }
            });
        }
    }

    const refreshBtn = $('s-refresh');
    const saveBtn = $('s-save');
    const resetBtn = $('s-resert-config');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            try {
                if (settingsManager && typeof settingsManager.reload === 'function') {
                    const updated = await settingsManager.reload();
                    populateFromConfig(updated || settingsManager.getCached());
                } else {
                    const all = await cfg.getAll();
                    populateFromConfig(all);
                }
            } catch (e) {
                console.warn('Error en refresh', e);
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            try {
                const get = (id: string) => $(id);
                await cfg.set('java', get('s-java')?.value || null);
                await cfg.set('memory.min', get('s-memory-min')?.value || null);
                await cfg.set('memory.max', get('s-memory-max')?.value || null);
                await cfg.set('window.width', Number(get('s-window-width')?.value) || null);
                await cfg.set('window.height', Number(get('s-window-height')?.value) || null);
                await cfg.set('window.fullscreen', !!get('s-window-fullscreen')?.checked);
                await cfg.set('behavior.closeOnLaunch', !!get('s-close-on-launch')?.checked);
                await cfg.set('ui.useVideo', !!get('s-use-video')?.checked);

                const vidVal = get('s-video-path')?.value || null;
                const normalizedVid = (() => {
                    if (!vidVal) return null;
                    const t = String(vidVal).trim();
                    if (/^(https?:)\/\//i.test(t)) return null;
                    return t;
                })();
                await cfg.set('ui.backgroundVideo', normalizedVid);

                await cfg.set('ui.backgroundImage', get('s-bg-image')?.value || null);
                await cfg.set('ui.blur', get('s-bg-blur')?.value || null);
                await cfg.set('behavior.showNotifications', !!get('s-show-notifications')?.checked);
                await cfg.set('user.name', get('s-user-name')?.value || null);
                await cfg.set('behavior.reopenOnExit', !!get('s-reopen-on-exit')?.checked);
                await cfg.set('behavior.launchAfterInstall', !!get('s-launch-after-install')?.checked);

                if (settingsManager && typeof settingsManager.reload === 'function') {
                    const updated = await settingsManager.reload();
                    populateFromConfig(updated || settingsManager.getCached());
                } else {
                    const all = await cfg.getAll();
                    applyBackgroundFromConfig(all);
                    populateFromConfig(all);
                }

                alert('Configuración guardada');
            } catch (e) {
                console.error('Error guardando configuración', e);
                alert('Error guardando configuración');
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('¿Estás seguro de resetear toda la configuración?')) return;
            try {
                await cfg.clear?.();
                const all = await cfg.getAll();
                populateFromConfig(all);
                alert('Configuración reseteada');
            } catch (e) {
                console.error('Error reseteando configuración', e);
                alert('Error reseteando configuración');
            }
        });
    }

    // Initialize file dialogs
    setupFileDialogs();

    // Populate initial config
    const cached = settingsManager?.getCached ? settingsManager.getCached() : null;
    if (cached) {
        populateFromConfig(cached);
    } else {
        cfg.getAll().then((all: any) => populateFromConfig(all)).catch(() => {});
    }
}
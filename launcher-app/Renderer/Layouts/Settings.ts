import type { HTMLLoader } from '../Dev/HTMLLoader.js';
import { NotificationManager } from '../Global/Notification.js';

async function initRAMControls(panelElement: HTMLElement) {
    const ramMinInput = panelElement.querySelector<HTMLInputElement>('#ram-min');
    const ramMaxInput = panelElement.querySelector<HTMLInputElement>('#ram-max');
    const ramMinDisplay = panelElement.querySelector<HTMLSpanElement>('#ram-min-display');
    const ramMaxDisplay = panelElement.querySelector<HTMLSpanElement>('#ram-max-display');

    if (!ramMinInput || !ramMaxInput || !ramMinDisplay || !ramMaxDisplay) return;

    const totalRAM = await window.ElectronAPI.getTotalRAM(); // MB
    ramMinInput.min = '512';
    ramMinInput.max = totalRAM.toString();
    ramMaxInput.min = '512';
    ramMaxInput.max = totalRAM.toString();
    ramMinInput.value = Math.min(2048, totalRAM).toString();
    ramMaxInput.value = Math.min(4096, totalRAM).toString();
    ramMinDisplay.textContent = ramMinInput.value;
    ramMaxDisplay.textContent = ramMaxInput.value;
    ramMinInput.addEventListener('input', () => {
        let minVal = parseInt(ramMinInput.value, 10);
        let maxVal = parseInt(ramMaxInput.value, 10);
        if (minVal > maxVal) {
            ramMaxInput.value = minVal.toString();
            ramMaxDisplay.textContent = minVal.toString();
        }
        ramMinDisplay.textContent = minVal.toString();
    });

    ramMaxInput.addEventListener('input', () => {
        let minVal = parseInt(ramMinInput.value, 10);
        let maxVal = parseInt(ramMaxInput.value, 10);
        if (maxVal < minVal) {
            ramMinInput.value = maxVal.toString();
            ramMinDisplay.textContent = maxVal.toString();
        }
        ramMaxDisplay.textContent = maxVal.toString();
    });
}

function initPanelControls(panelElement: HTMLElement, htmlLoader: HTMLLoader) {
    const preloadSelect = panelElement.querySelector<HTMLSelectElement>('#LoadPanelSelect');
    const loadPanelButton = panelElement.querySelector<HTMLButtonElement>('#LoadPanel');
    const clearCacheSelect = panelElement.querySelector<HTMLSelectElement>('#CleanUpCacheSelect');
    const clearCacheButton = panelElement.querySelector<HTMLButtonElement>('#Limpiar');

    const refreshCacheOptions = () => {
        if (!clearCacheSelect) return;
        clearCacheSelect.innerHTML = '';
        htmlLoader.getCache().forEach((panel, id) => {
            const option = document.createElement('option');
            option.value = panel.id;
            option.textContent = panel.title || panel.id;
            clearCacheSelect.appendChild(option);
        });

    };

    if (preloadSelect && loadPanelButton) {
        preloadSelect.innerHTML = '';
        htmlLoader.getPages().forEach((page, id) => {
            const option = document.createElement('option');
            option.value = page.id;
            option.textContent = page.title || page.id;
            preloadSelect.appendChild(option);
        });


        loadPanelButton.addEventListener('click', async () => {
            const id = preloadSelect.value;
            if (!id) return;
            try {
                await htmlLoader.preloadPage(id);
                NotificationManager.getInstance().activate({
                    icon: './Static/Img/Notifications/Octagon_Check.png',
                    message: window.LangAPI.getText("Notifications.Panels.SuccessLoad"),
                    sound: './Static/Sounds/notification-off.mp3',
                    timeout: 3500,
                })
                refreshCacheOptions();
            } catch (err: unknown | any) {
                NotificationManager.getInstance().activate({
                    icon: './Static/Img/Notifications/Octagon_Warning.png',
                    message: window.LangAPI.getText("Notifications.Panels.ErrorLoad"),
                    sound: './Static/Sounds/notification-on-slowed.mp3',
                    timeout: 5500,
                })
                window.StepLauncherLogger.error(err);
            }
        });
    }

    if (clearCacheSelect && clearCacheButton) {
        clearCacheButton.addEventListener('click', () => {
            const id = clearCacheSelect.value;
            if (!id) return;
            htmlLoader.cleanUpCache(id);
            NotificationManager.getInstance().activate({
                icon: './Static/Img/Notifications/Octagon_Check.png',
                message: "Cache del panel ah sido eliminada",
                sound: './Static/Sounds/notification-on.mp3',
                timeout: 3500,
            })
            refreshCacheOptions();
        });
    }

    refreshCacheOptions();
}

function sidebarSettings(panelElement: HTMLElement) {
    const sidebarItems = Array.from(
        panelElement.querySelectorAll<HTMLElement>('.App-Configuration-Sidebar-ItemSidebar[data-settingssubpanel]')
    );

    const panels = Array.from(
        panelElement.querySelectorAll<HTMLElement>('.SECTION_CONFIG')
    );

    if (!sidebarItems.length || !panels.length) {
        window.StepLauncherLogger.warn('[Settings] No items or panels found');
        return;
    }

    const hideAllPanels = () => {
        panels.forEach(p => {
            p.classList.remove('Active');
            p.classList.add('Unvisible');
        });
    };

    const deactivateSidebar = () => {
        sidebarItems.forEach(i => i.classList.remove('Active'));
    };

    sidebarItems.forEach(item => {
        item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();

            const target = item.dataset.settingssubpanel;
            if (!target) return;

            deactivateSidebar();
            item.classList.add('Active');
            hideAllPanels();
            const panel = panels.find(p => p.dataset.settingssubpanelid === target);
            if (!panel) {
                window.StepLauncherLogger.warn('[Settings] Panel no encontrado:', target);
                return;
            }

            panel.classList.remove('Unvisible');
            panel.classList.add('Active');
        }, true);
    });

    const initial = panels.find(p => p.classList.contains('Active'));
    if (initial) {
        const btn = sidebarItems.find(i => i.dataset.settingssubpanel === initial.dataset.settingssubpanelid);
        btn?.classList.add('Active');
        panels.forEach(p => {
            if (p !== initial) p.classList.add('Unvisible');
        });
    }
}


export function initSettings(panelElement: HTMLDivElement, loader: HTMLLoader) {
    window.StepLauncherLogger.info('Settings Inicializado');
    sidebarSettings(panelElement);
    initRAMControls(panelElement);
    initPanelControls(panelElement, loader);
}

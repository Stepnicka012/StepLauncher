import { initLoadVersion } from '../Download/Versions.js';
import { initDownloadUI } from "../Download/DownloadUI.js";
import { initLaunchVersions } from '../Launch/LaunchVersions.js';
let downloadInitialized = false;
let launchInitialized = false;

function openDialog(dialogId: string) {
    document.querySelectorAll<HTMLDialogElement>('.Dialogs_Container dialog').forEach(d => {
        if (d.classList.contains('ACTIVE_DIALOG')) {
            const container = d.closest<HTMLDivElement>('.Dialogs_Container');
            d.classList.remove('ACTIVE_DIALOG');
            d.classList.add('HIDDEN_DIALOG');
            container?.classList.remove('Active');
        }
    });

    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    if (!dialog) return;
    const container = dialog.closest<HTMLDivElement>('.Dialogs_Container');
    if (!container) return;

    container.classList.add('Active');
    dialog.classList.remove('HIDDEN_DIALOG');
    dialog.classList.add('ACTIVE_DIALOG');
}

function closeDialog(dialog: HTMLDialogElement) {
    const container = dialog.closest<HTMLDivElement>('.Dialogs_Container');
    dialog.classList.remove('ACTIVE_DIALOG');
    dialog.classList.add('HIDDEN_DIALOG');
    container?.classList.remove('Active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll<HTMLElement>('[data-open-dialog]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const dialogId = btn.dataset.openDialog;
            if (!dialogId) return;
            const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
            if (!dialog) return;
            openDialog(dialogId);

            if (dialogId === 'DownloadDialog' && !downloadInitialized) {
                if (!dialog.querySelector('.Versions')) {
                    await new Promise(r => setTimeout(r, 50));
                }

                initLoadVersion();
				initDownloadUI();
                downloadInitialized = true;
            }
            if (dialogId === 'LaunchDialog' && !launchInitialized) {
                if (!dialog.querySelector('.Launch-Selector-Version select')) {
                    await new Promise(r => setTimeout(r, 50));
                }
                await initLaunchVersions();
                await import('../Launch/LaunchVersions.js').then(mod => mod.initLaunchButton());

                launchInitialized = true;
            }
            else if (dialogId === 'LaunchDialog' && launchInitialized) {
                await import('../Launch/LaunchVersions.js').then(mod => mod.refreshLaunchVersions());
            }
        });
    });

	document.getElementById('DISCORD_LINK')?.addEventListener('click',()=>{
		window.ElectronAPI.openExternal('https://discord.gg/37dYy9apwE');
		
	});

    document.querySelectorAll<HTMLDialogElement>('.Dialogs_Container dialog').forEach(dialog => {
        const closeBtn = dialog.querySelector<HTMLElement>('.Dialog-Close');
        closeBtn?.addEventListener('click', () => closeDialog(dialog));
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const activeDialog = document.querySelector<HTMLDialogElement>('dialog.ACTIVE_DIALOG');
            if (activeDialog) closeDialog(activeDialog);
        }
    });
});
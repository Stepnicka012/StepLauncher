import type { DialogControl } from '../../Types/Render/Dialog';
let dialogsInitialized = false;

function openDialog(dialogId: string) {
    document.querySelectorAll<HTMLDialogElement>('.Dialogs_Container dialog').forEach(d => {
        if (d.open) closeDialog(d);
    });

    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
    if (!dialog) return;
    const container = dialog.closest<HTMLDivElement>('.Dialogs_Container');
    if (!container) return;

    container.classList.add('Active');
    dialog.classList.remove("HIDDEN_DIALOG");
    dialog.classList.add("ACTIVE_DIALOG");
}

function closeDialog(dialog: HTMLDialogElement) {
    const container = dialog.closest<HTMLDivElement>('.Dialogs_Container');
    dialog.classList.remove("ACTIVE_DIALOG");
    dialog.classList.add("HIDDEN_DIALOG");
    container?.classList.remove('Active');
}

function initDialogs() {
    if (dialogsInitialized) return;
    dialogsInitialized = true;

    document.querySelectorAll<HTMLElement>('[data-open-dialog]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!btn.dataset.openDialog) return;
            openDialog(btn.dataset.openDialog);
        });
    });

    document.querySelectorAll<HTMLDialogElement>('.Dialogs_Container dialog').forEach(dialog => {
        const closeBtn = dialog.querySelector<HTMLElement>('.Dialog-Close');
        closeBtn?.addEventListener('click', () => closeDialog(dialog));
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const openDialogEl = document.querySelector<HTMLDialogElement>('dialog[open]');
            if (openDialogEl) closeDialog(openDialogEl);
        }
    });
}

export const Dialogs: DialogControl = {
    openDialog,
    closeDialog,
    initDialogs
};

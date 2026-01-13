export type DialogControl = {
    openDialog: (dialogId: string) => void;
    closeDialog: (dialog: HTMLDialogElement) => void;
    initDialogs: () => void;
};

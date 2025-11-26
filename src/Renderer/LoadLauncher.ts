const dialog = document.querySelector<HTMLDivElement>('.Dialog');
const backdrop = dialog?.querySelector<HTMLDivElement>('.DialogBackdrop');
const closeButton = document.querySelector<HTMLButtonElement>('.TittleBar-Load button');
const continueButton = dialog?.querySelector<HTMLButtonElement>('.Continue');
const exitButton = dialog?.querySelector<HTMLButtonElement>('.Exit');

function showDialog(): void {
    if (!dialog) return;
    dialog.classList.add('visible');
    pauseTimer();
}

function hideDialog(): void {
    if (!dialog) return;
    dialog.classList.remove('visible');
    resumeTimer();
}

let timerId: number | null = null;
let remainingTime = 10000;
let startTimestamp: number | null = null;

function startTimer(): void {
    startTimestamp = Date.now();
    timerId = window.setTimeout(() => {
        window.ElectronAPI.StartApp();
        timerId = null;
    }, remainingTime);
}

function pauseTimer(): void {
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
        if (startTimestamp) remainingTime -= Date.now() - startTimestamp;
    }
}

function resumeTimer(): void {
    if (!timerId && remainingTime > 0) startTimer();
}

function initDialog(): void {
    if (closeButton) closeButton.addEventListener('click', showDialog);
    if (backdrop) backdrop.addEventListener('click', hideDialog);

    if (continueButton) {
        continueButton.addEventListener('click', () => {
            hideDialog();
        });
    }

    if (exitButton) {
        exitButton.addEventListener('click', () => {
            showDialog();
        });
    }
}

const bg = new Image();
bg.src = "./assets/background/2.jpg";

bg.onload = () => {
    document.body.style.setProperty('--bg-image', `url(${bg.src})`);
    document.body.classList.add('BodyLoad');
};

initDialog();
startTimer();

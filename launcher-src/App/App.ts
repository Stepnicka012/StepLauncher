import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { initNovaCoreIPC, getNovaCoreIPC, NovaCoreIPC } from '../Main/Manager/NovaCoreManager/NovaCoreIPC.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __ROOT_RENDERER = resolve(__dirname, '../../launcher-renderer');

let win: BrowserWindow | null;
let novaCoreIPC: NovaCoreIPC | null = null;

function MainWindow() {
    win = new BrowserWindow({
        height: 650,
        width: 1200,
        minWidth: 1000,
        minHeight: 650,
        backgroundColor: "#000",
        frame: false,
        center: true,
        icon: join(__ROOT_RENDERER, 'Assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        title: 'StepLauncher',
        webPreferences: {
            preload: join(__dirname, './Preload.js'),
            backgroundThrottling: false,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(join(__ROOT_RENDERER, 'Home.html'));
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });
}

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => {
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle('window:close', () => win?.close());

async function shutdownEngine() {
    if (novaCoreIPC) {
        console.log('Deteniendo NovaCore Engine...');
        try {
            await novaCoreIPC.stopEngine();
            console.log('NovaCore Engine detenido correctamente');
        } catch (err) {
            console.error('Error al detener el engine:', err);
        }
    }
}

app.whenReady().then(async () => {
    MainWindow();
    try {
        novaCoreIPC = await initNovaCoreIPC();
        console.log('NovaCore IPC initialized');
    } catch (err) {
        console.error('Failed to initialize NovaCore IPC:', err);
    }
});

app.on('before-quit', async (event) => {
    if (novaCoreIPC && novaCoreIPC['engineProcess']?.running) {
        event.preventDefault();
        await shutdownEngine();
        app.exit(0);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        shutdownEngine().then(() => app.quit());
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        MainWindow();
    }
});

process.on('SIGINT', async () => {
    console.log('SIGINT recibido');
    await shutdownEngine();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM recibido');
    await shutdownEngine();
    process.exit(0);
});
import { ipcMain, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = () => path.resolve(__dirname,'../','../','public');

export function MainWindow() {
    const win = new BrowserWindow({
        height: 600,
        minHeight: 600,
        width: 1000,
        minWidth: 900,
        title: 'StepLauncher',
        center: true,
        frame: false,
        backgroundColor: "#000",
        icon: path.resolve(PUBLIC_DIR(), 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname,'preload.js'),
            backgroundThrottling:false,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag:true,
            sandbox:false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(), 'launcher.html'));

    win.on('maximize', () => win.webContents.send('window-state-changed', { maximized: true }));
    win.on('unmaximize', () => win.webContents.send('window-state-changed', { maximized: false }));
    
    ipcMain.on('window-minimize', () => { if(win) win.minimize(); });
    ipcMain.on('window-toggle-maximize', () => {
        if(!win) return;
        if(win.isMaximized()) win.unmaximize();
        else win.maximize();
    });
    ipcMain.on('window-close', () => { if(win) win.close(); });
}
import { app, BrowserWindow, ipcMain } from 'electron';
import { disconnectDiscordRPC } from "./Core/DiscordRPC.js";
import { MainWindow } from "./Window/MainWindow.js";
import { initUpdater } from './Window/Updater.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = () => path.resolve(__dirname,'../','public');

let win: BrowserWindow | null;

function LoadWindow() {
    win = new BrowserWindow({
        height: 450,
        width: 350,
        title: 'StepLauncher',
        center: true,
        frame: false,
        maximizable:false,
        resizable: false,
        icon: path.resolve(PUBLIC_DIR(), 'assets', 'icon.png'),
        backgroundColor: "#000",
        show:false,
        webPreferences: {
            preload: path.join(__dirname,'preload.js'),
            backgroundThrottling:false,
            contextIsolation: true,
            nodeIntegration: true,
            webSecurity: true,
            webgl:false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(), 'loadLauncher.html'));
    win.once('ready-to-show', () => {
        initUpdater(win!);
    });
    
    win.on("close",()=>{
        win = null;
    });

    win.webContents.once('did-finish-load', () => {
        if (win) win.show();
    });
    
    ipcMain.on('window-close', () => { if(win) win.close(); });
    ipcMain.on("StartApp", (_event) => {
        if (win) {
            win.close();
            MainWindow();
        }
    })
}

app.whenReady().then(()=>{
    LoadWindow();
});

app.on('window-all-closed', () => {
    disconnectDiscordRPC();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        LoadWindow();
    }
});
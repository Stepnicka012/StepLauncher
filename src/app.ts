import { app, BrowserWindow, ipcMain } from 'electron';
import { MainWindow } from "./window/MainWindow.js";
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
            webSecurity: true,
            backgroundThrottling:false,
            contextIsolation: true,
            nodeIntegration: true,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(), 'loadLauncher.html'));

    win.on("close",()=>{
        win = null;
    });

    win.webContents.once('did-finish-load', () => {
        setTimeout(() => {
            if (win) win.show();
        }, 100);
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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        LoadWindow();
    }
});
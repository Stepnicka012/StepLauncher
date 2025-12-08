import { app, BrowserWindow, ipcMain } from 'electron';
import { AppConfigManager } from './Modules/App/Folder.js';
import { ElectronPino } from './Modules/ElectronPino/Index.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)
const PUBLIC_DIR = () => path.join(__dirname,'../', 'launcher-renderer');

const Folder = new AppConfigManager(".StepLauncher");
const Logger = new ElectronPino({
    logPath: path.resolve(Folder.getAppConfigPath(),"Temp"),
    logFileName: 'main.log',
    level: 'debug',
    maxLogDays: 7,
    maxFileSize: 5,
    prettyPrint: true,
    colors: true
});

Logger.info("Logger Inicializado");

let win: BrowserWindow | null;

const iconFile = process.platform === 'win32' 
    ? 'icon.ico' 
    : 'icon.png';
const iconPath = path.resolve(PUBLIC_DIR(), `./Static/Resources/${iconFile}`);

export function MainWindow() {
    win = new BrowserWindow({
        height: 600,
        width: 1200,
        minHeight: 600,
        minWidth: 1000,
        center:true,
        frame:false,
        backgroundColor: "#181C22",
        title: 'StepLauncher',
        icon: iconPath,
        webPreferences: {
            preload: path.resolve(__dirname,'./Handlers/AppPreload.js'),
            backgroundThrottling: false,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(),'index.html'));
};

ipcMain.handle("pino:trace", (_, message: string, args: unknown[]) => {
    Logger.trace(message, ...args);
});

ipcMain.handle("pino:debug", (_, message: string, args: unknown[]) => {
    Logger.debug(message, ...args);
});

ipcMain.handle("pino:info", (_, message: string, args: unknown[]) => {
    Logger.info(message, ...args);
});

ipcMain.handle("pino:warn", (_, message: string, args: unknown[]) => {
    Logger.warn(message, ...args);
});

ipcMain.handle("pino:error", (_, message: string, args: unknown[]) => {
    Logger.error(message, ...args);
});

ipcMain.handle("pino:fatal", (_, message: string, args: unknown[]) => {
    Logger.fatal(message, ...args);
});

ipcMain.handle("pino:log", (_, message: string, args: unknown[]) => {
    Logger.log(message, ...args);
});

ipcMain.on('get-system-locale', (event) => {
    event.returnValue = app.getLocale();
});

ipcMain.handle('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
});

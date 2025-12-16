import { app, BrowserWindow, ipcMain } from 'electron';
import * as os from 'os';
import { AppConfigManager } from './Modules/App/Folder.js';
import { StepLauncherLogger } from './Modules/Logger/StepLauncherLogger.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)
const PUBLIC_DIR = () => path.join(__dirname,'../', 'launcher-renderer');

const Folder = new AppConfigManager();
const LogsOutput = path.join(Folder.getAppConfigPath(),"Temp");
const Logger = new StepLauncherLogger({
    logPath: LogsOutput,
    logFileName: 'main.log',
    level: 'debug',
    maxLogDays: 7,
    maxFileSize: 5,
    prettyPrint: true,
    colors: true,
});

Logger.info("Logger Inicializado");

let win: BrowserWindow | null;

function MainWindow() {
    const iconFile = process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    const iconPath = path.resolve(PUBLIC_DIR(), `./Static/Resources/${iconFile}`);
    win = new BrowserWindow({
        height: 600,
        width: 1200,
        minHeight: 600,
        minWidth: 1200,
        center:true,
        frame:false,
        backgroundColor: "#181C22",
        title: 'StepLauncher',
        icon: iconPath,
        show: false,
        webPreferences: {
            preload: path.resolve(__dirname,'./Preload.js'),
            backgroundThrottling: false,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(),'index.html'));
    win.once("ready-to-show", () => win!.show());
};

ipcMain.handle("stepLauncherLogger:trace", (_, message: string, args: unknown[]) => {
    Logger.trace(message, ...args);
});

ipcMain.handle("stepLauncherLogger:debug", (_, message: string, args: unknown[]) => {
    Logger.debug(message, ...args);
});

ipcMain.handle("stepLauncherLogger:info", (_, message: string, args: unknown[]) => {
    Logger.info(message, ...args);
});

ipcMain.handle("stepLauncherLogger:warn", (_, message: string, args: unknown[]) => {
    Logger.warn(message, ...args);
});

ipcMain.handle("stepLauncherLogger:error", (_, message: string, args: unknown[]) => {
    Logger.error(message, ...args);
});

ipcMain.handle("stepLauncherLogger:fatal", (_, message: string, args: unknown[]) => {
    Logger.fatal(message, ...args);
});

ipcMain.handle("stepLauncherLogger:log", (_, message: string, args: unknown[]) => {
    Logger.log(message, ...args);
});

ipcMain.on('get-system-locale', (event) => {
    event.returnValue = app.getLocale();
});

ipcMain.handle("stepLauncherLogger:getHistory", () => {
    return Logger.getMemoryHistory();
});

ipcMain.handle('get-system-ram', () => {
    return Math.floor(os.totalmem() / (1024 * 1024)); // MB
});

ipcMain.handle('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
});

app.whenReady().then(() => {
    MainWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            MainWindow()
        }
    })
})

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
})
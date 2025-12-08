import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)

function setupLinuxFlags() {
    if (process.platform === 'linux') {
        // Flags esenciales para Linux
        app.commandLine.appendSwitch('no-sandbox');
        app.commandLine.appendSwitch('disable-setuid-sandbox');
        app.disableHardwareAcceleration();

        // Optimizaciones de GPU para evitar errores de VSync
        app.commandLine.appendSwitch('disable-gpu-sandbox');
        app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
        app.commandLine.appendSwitch('use-gl', 'desktop');
        app.commandLine.appendSwitch('ignore-gpu-blacklist');
        app.commandLine.appendSwitch('enable-gpu-rasterization');
        
        // Solucionar problemas de VSync
        app.commandLine.appendSwitch('disable-frame-rate-limit');
        app.commandLine.appendSwitch('max-gum-fps', '60');
    }
}

setupLinuxFlags();

const PUBLIC_DIR = () => path.join(__dirname,'../bootstrap-renderer');
let win: BrowserWindow | null;
const iconFile = process.platform === 'win32' 
    ? 'icon.ico' 
    : 'icon.png';
const iconPath = path.resolve(PUBLIC_DIR(), `./Static/Resources/${iconFile}`);

function Bootstrap() {
    win = new BrowserWindow({
        height: 400,
        width: 300,
        center:true,
        frame:false,
        resizable:false,
        maximizable:false,
        fullscreenable:false,
        backgroundColor: "#28303bff",
        title: 'Bootstrap - StepLauncher',
        icon: iconPath,
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
};

ipcMain.on('get-system-locale', (event) => {
    event.returnValue = app.getLocale();
});

app.whenReady().then(()=>{
    Bootstrap();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        Bootstrap();
    }
});
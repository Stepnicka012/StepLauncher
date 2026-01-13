import { app, BrowserWindow, ipcMain, Tray, Menu, Notification, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { setupDownloadIPC } from "./Handlers/Downloader.js";
import { initializeMinecraftLauncher } from "./Handlers/Launch/LaunchIPC.js";
import { StepLauncherLogger } from "./Modules/Logger/StepLauncherLogger.js";
import { discordRPC } from './Modules/App/DiscordRPC.js';
import { createConfigManager } from "./Modules/App/ConfigManager.js";
import { setupConfigIPC } from "./Handlers/ConfigIPC.js";
import { FolderManager } from "./Utils/Folder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let win: BrowserWindow | null = null;
let canCloseWindow = true;
let tray: Tray | null = null;

const FolderStepLauncher = new FolderManager();
const logger = new StepLauncherLogger({
    logPath: resolve(FolderStepLauncher.getAppConfigPath(),"launcher", "logs"),
    level: "info",
    prettyPrint: true,
    colors: true
});

async function createMainWindow() {
    logger.info("Creando ventana principal");
    
    win = new BrowserWindow({
        width: 1200,
        height: 600,
        minWidth: 1000,
        minHeight: 600,
        backgroundColor: "#0b0f14",
        show: false,
        frame: false,
        title: "StepLauncher",
        icon: resolve(__dirname, "../launcher-renderer/Application/Resources", process.platform === "win32" ? "icon.ico" : process.platform === "darwin" ? "icon.icns" : "icon.png"),
        webPreferences: {
            preload: join(__dirname, "Preload.js"),
            contextIsolation: true,
            sandbox: false
        }
    });
    
    win.loadFile(resolve(__dirname, "../launcher-renderer/launcher.html"));
    await discordRPC.connect();

    win.once("ready-to-show", () => {
        win?.show();
        logger.info("Ventana mostrada");
        discordRPC.updatePresence({
            details: 'En el Menu de Inicio',
            state: 'Navegando por el menu de inicio',
            largeImageKey: 'cover',
            largeImageText: 'StepLauncher'
        })
    });
    
    win.on("close", (event) => {
        if (!canCloseWindow) {
            event.preventDefault();
            logger.warn("Cierre bloqueado");
            
            win?.webContents.send("window:close-blocked");
            return;
        }
        
        logger.info("Ventana cerrándose");
    });
    
    win.on("closed", () => {
        win = null;
    });
    
    setupWindowIPC();
}

function createTray() {
    try {
        const iconPath = resolve(__dirname, "../launcher-renderer/Application/Resources",
            process.platform === "win32" ? "icon.ico" : process.platform === "darwin" ? "icon.icns" : "icon.png"
        );

        tray = new Tray(iconPath as any);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Mostrar', click: () => win?.show() },
            { label: 'Ocultar', click: () => win?.hide() },
            { type: 'separator' },
            { label: 'Salir', click: () => app.quit() }
        ]);
        tray.setToolTip('StepLauncher');
        tray.setContextMenu(contextMenu);
    } catch (e) {
        logger.warn('No se pudo crear el tray', e);
    }
}

function setupWindowIPC() {
    ipcMain.on("window:minimize", () => {
        win?.minimize();
    });
    
    ipcMain.on("window:toggle-maximize", () => {
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    
    ipcMain.on("window:close", () => {
        win?.close();
    });
    
    ipcMain.handle("window:set-can-close", (_, value: boolean) => {
        canCloseWindow = value;
        return canCloseWindow;
    });
}

function setupFileDialogIPC() {
    ipcMain.handle('dialog:openBackgroundFile', async (event, options?: {
        type?: 'image' | 'video' | 'both'
    }) => {
        const type = options?.type || 'both';
        
        const filters: Electron.FileFilter[] = [];
        
        if (type === 'image' || type === 'both') {
            filters.push({
                name: 'Imágenes',
                extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
            });
        }
        
        if (type === 'video' || type === 'both') {
            filters.push({
                name: 'Videos',
                extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
            });
        }
        
        if (type === 'both') {
            filters.push({
                name: 'Todos los archivos multimedia',
                extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
            });
        }

        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters,
            title: 'Seleccionar archivo de fondo'
        });

        if (result.canceled) {
            return { canceled: true, filePath: null };
        }

        return { 
            canceled: false, 
            filePath: result.filePaths[0] || null 
        };
    });

    ipcMain.handle('dialog:openJavaExecutable', async () => {
        const isWindows = process.platform === 'win32';
        
        const filters: Electron.FileFilter[] = isWindows 
            ? [
                { name: 'Java Executable', extensions: ['exe'] },
                { name: 'Todos los archivos', extensions: ['*'] }
              ]
            : [
                { name: 'Todos los archivos', extensions: ['*'] }
              ];

        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters,
            title: 'Seleccionar ejecutable de Java'
        });

        if (result.canceled) {
            return { canceled: true, filePath: null };
        }

        return { 
            canceled: false, 
            filePath: result.filePaths[0] || null 
        };
    });

    ipcMain.handle('dialog:openFile', async (event, options?: {
        title?: string,
        filters?: Electron.FileFilter[],
        properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
    }) => {
        const result = await dialog.showOpenDialog({
            properties: options?.properties || ['openFile'],
            filters: options?.filters || [],
            title: options?.title || 'Seleccionar archivo'
        });

        if (result.canceled) {
            return { canceled: true, filePaths: [] };
        }

        return { 
            canceled: false, 
            filePaths: result.filePaths 
        };
    });
}

app.whenReady().then(() => {
    logger.info("StepLauncher iniciado");

    try {
        const settingsPath = FolderStepLauncher.getFilePath('launcher/settings.json');
        const launcherProfiles = FolderStepLauncher.getFilePath('launcher_profiles.json');
         const launcherProfilesManager = createConfigManager(launcherProfiles, logger, {
            defaultConfig: {
                profiles: {},
                launcherVersion: {
                    name: "StepLauncher",
                    version: "1.0.0",
                    format: 17,
                },
            }
        });
        const settingsManager = createConfigManager(settingsPath, logger, {
            defaultConfig: {
                schema: 1,
                author: 'NovaStepStudios',
                alias: 'StepnickaSantiago',
                launcher: {
                    autoUpdate: true,

                    closeOnLaunch: true,
                    showNotifications: true,
                    reopenOnExitMinecraft: true,
                    launchAfterInstall: false,

                    backgroundVideo: null,
                    background: null,
                    clickSound: false,
                    useVideo: false,
                    style:{
                        background:{
                            titlebar: '#111',
                            sidebar: '#0008',
                            colorDownload: 'aqua',
                            dialogBg: '#111'
                        },
                        filter:{
                            blur: '4px',
                            saturate: '1.5',   
                        }
                    }
                },
                minecraft: {
                    java: 'java',
                    speedMetrics: true,
                    debug: true,
                    minecraftRichPresence:true,
                    stepLauncherRichPresence: false,
                    memory: { 
                        min: '512M',
                        max: '2G'
                    },
                    window: { 
                        width: "854",
                        height: "480",
                        fullscreen: false
                    },
                    features: {},
                    JVM_ARGS: [],
                    MC_ARGS: {}
                }
            }
        });
        setupConfigIPC(settingsManager);
    } catch (e) {
        logger.warn('No se pudo inicializar settings config', e);
    }
    const launcherService = initializeMinecraftLauncher();

    setupDownloadIPC();
    createMainWindow();
    setupFileDialogIPC();
    createTray();

    app.on("before-quit", async () => {
        await launcherService.killAllInstances();
        await logger.destroy();
    });

});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

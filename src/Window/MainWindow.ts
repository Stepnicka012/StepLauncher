import { ipcMain, BrowserWindow } from 'electron';
import { MediaDownloader } from "../Core/Music/download.js";
import * as MinecraftHandler from '../Core/Minecraft/Handler/Minecraft-Download.js';
import { connectDiscordRPC, disconnectDiscordRPC, setDiscordRPCMode, getDiscordRPCStatus } from "../Core/DiscordRPC.js";
import { readMusicFolder, readMusicFolderSafe, generateReport, type MusicReaderConfig, type ProcessingResult } from '../Core/Music/localMusic.js';
import { searchYouTube } from '../Core/Music/search.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { ElectronPino } from '../Utils/Logger.js';
import { Configuration } from '../Core/Configuration.js';
import { FolderLauncher } from "../Core/Folder.js";
import type { FolderEvent } from "../Utils/Types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = () => path.resolve(__dirname,'../','../','public');

let win: BrowserWindow;
let logger: ElectronPino;

const STFolder = new FolderLauncher();
logger = new ElectronPino(STFolder.getLauncherPath(),"strict", true);
logger.info("Logger inicializado");
const config = new Configuration();

export function MainWindow() {
    win = new BrowserWindow({
        height: 600,
        minHeight: 600,
        width: 1000,
        minWidth: 900,
        title: 'StepLauncher',
        center: true,
        frame: false,
        backgroundColor: "#111",
        icon: path.resolve(PUBLIC_DIR(), 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname,'preload.js'),
            backgroundThrottling:false,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity:true,
            webgl:false,
            sandbox:false,
        },
    });

    win.setTitle('StepLauncher');
    win.loadFile(path.resolve(PUBLIC_DIR(), 'launcher.html'));
    connectDiscordRPC();
    setDiscordRPCMode("menu");

    win.on('maximize', () => win.webContents.send('window-state-changed', { maximized: true }));
    win.on('unmaximize', () => win.webContents.send('window-state-changed', { maximized: false }));

    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Tab') event.preventDefault();
    });

    // ------------------------------
    // IPC Windows Control
    // ------------------------------
    ipcMain.on('window-minimize', () => win.minimize());
    ipcMain.on('window-toggle-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
    ipcMain.on('window-close', () => win.close());

    // ------------------------------
    // IPC DiscordRPC
    // ------------------------------
    ipcMain.handle("DiscordRPC:connect", async () => { await connectDiscordRPC(); return getDiscordRPCStatus(); });
    ipcMain.handle("DiscordRPC:disconnect", async () => { await disconnectDiscordRPC(); return getDiscordRPCStatus(); });
    ipcMain.handle("DiscordRPC:setMode", async (_e, mode, version) => { await setDiscordRPCMode(mode, version); return getDiscordRPCStatus(); });
    ipcMain.handle("DiscordRPC:getStatus", () => getDiscordRPCStatus());

    // ------------------------------
    // IPC Logger
    // ------------------------------
    ipcMain.handle("Logger:info", (_e, msg, ctx) => logger.info(msg, ctx));
    ipcMain.handle("Logger:warn", (_e, msg, ctx) => logger.warn(msg, ctx));
    ipcMain.handle("Logger:error", (_e, msg, ctx) => logger.error(msg, ctx));
    ipcMain.handle("Logger:success", (_e, msg, ctx) => logger.success(msg, ctx));
    ipcMain.handle("Logger:critical", (_e, msg, ctx) => logger.critical(msg, ctx));
    ipcMain.handle("Logger:debug", (_e, msg, ctx) => logger.debug(msg, ctx));

    logger.info("MainWindow inicializada y lista para IPC");

    // ------------------------------
    // IPC Configuration
    // ------------------------------
    ipcMain.handle("Configuration:get", () => config.get());
    ipcMain.handle("Configuration:set", (_e, pathKey, value) => config.set(pathKey, value));
    ipcMain.handle("Configuration:exists", () => config.exists());
    ipcMain.handle("Configuration:save", () => config.save());
    ipcMain.handle("Configuration:getPath", (_e, pathKey, defaultValue) => config.getPath(pathKey, defaultValue));
    ipcMain.handle("Configuration:reset", () => {
        const defaults = config["defaultConfig"]();
        config["config"] = defaults;
        config.save();
        return defaults;
    });
    ipcMain.handle("Configuration:reload", () => {
        const newConfig = config["load"]();
        config["config"] = newConfig;
        return newConfig;
    });

    // ------------------------------
    // IPC FolderLauncher
    // ------------------------------
    ipcMain.handle("FolderLauncher:list", (_e, subFolder: string) => STFolder.list(subFolder));

    // Folder events
    const folderEvents: FolderEvent[] = ["clean:start", "clean:progress", "clean:done", "clean:skip"];
    for (const event of folderEvents) {
        STFolder.on(event, (data) => {
            win.webContents.send("FolderLauncher:event", event, data);
        });
    }

    logger.info("FolderLauncher y Configuration expuestos correctamente por IPC");

    // ------------------------------
    // IPC Music
    // ------------------------------
    
    ipcMain.handle("LocalMusic:scan", async (_e, config: MusicReaderConfig) => {
        try {
            logger.info(`Iniciando escaneo de música local : ${config}`);
            const result = await readMusicFolder(config);
            logger.success(`Escaneo completado: ${result.success.length} archivos procesados`);
            return { success: true, data: result };
        } catch (error) {
            logger.error(`Error en escaneo de música local : ${error}`);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Error desconocido' 
            };
        }
    });

    ipcMain.handle("LocalMusic:scanSafe", async (_e, config: MusicReaderConfig) => {
        try {
            logger.info(`Iniciando escaneo seguro de música local : ${config}`);
            const result = await readMusicFolderSafe(config);
            logger.success(`Escaneo seguro completado: ${result.success.length} archivos`);
            return { success: true, data: result };
        } catch (error) {
            logger.error(`Error en escaneo seguro de música local ${error}`);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Error desconocido' 
            };
        }
    });

    ipcMain.handle("LocalMusic:generateReport", (_e, result: ProcessingResult) => {
        return generateReport(result);
    });

    // Eventos de progreso (opcional)
    ipcMain.handle("LocalMusic:cancelScan", () => {
        // Implementar lógica de cancelación si es necesario
        logger.info("Solicitud de cancelación de escaneo recibida");
        return { success: true };
    });
    ipcMain.handle("YouTube:search", async (_e, query: string, limit = 10, offset = 0) => {
        try {
            const results = await searchYouTube(query, limit, offset);
            return { success: true, results };
        } catch (err) {
            logger.error("Error en YouTube:search", err || "Error Desconocido");
            return { success: false, error: (err as Error).message };
        }
    });

    ipcMain.handle("media:download", async (event, { url, options }) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Crear instancia automáticamente
                const downloader = new MediaDownloader(options || {});

                const forward = (channel: string, data: any) => {
                    event.sender.send(`media:event`, { channel, data });
                };

                downloader.on("start", data => forward("start", data));
                downloader.on("progress:video", data => forward("progress:video", data));
                downloader.on("progress:audio", data => forward("progress:audio", data));
                downloader.on("progress:stepComplete", data => forward("stepComplete", data));
                downloader.on("finish", data => forward("finish", data));
                downloader.on("error", err => forward("error", err));

                // Ejecutar la descarga
                const result = await downloader.download(url, options);

                // Resolver la promesa con el resultado final
                resolve(result);

                // Opcional: destruir después para evitar fugas
                downloader.removeAllListeners();

            } catch (err) {
                event.sender.send("media:event", {
                    channel: "error",
                    data: err!
                });
                reject(err);
            }
        });
    });
    
    // Iniciar descarga (solo devuelve estado)
    ipcMain.handle('minecraft-download:start', async (_event, { version, installJava }) => {
        MinecraftHandler.startMinecraftDownload(version, installJava); // no se devuelve la instancia
        return { success: true }; // objeto simple que sí se puede clonar
    });

    // PAUSE / RESUME / STOP
    ipcMain.on('minecraft-download:pause', () => MinecraftHandler.pauseDownload());
    ipcMain.on('minecraft-download:resume', () => MinecraftHandler.resumeDownload());
    ipcMain.on('minecraft-download:stop', () => MinecraftHandler.stopDownload());

    // EVENT LISTENERS
    ipcMain.on('minecraft-download:on', (_event, eventName: string | any) => {
        MinecraftHandler.onDownloadEvent(eventName, (...args: any[]) => {
            // enviar datos planos por IPC
            _event.sender.send(`minecraft-download:${eventName}`, ...args);
        });
    });

    // READ METHODS
    ipcMain.handle('minecraft-download:getDownloadedMB', () => MinecraftHandler.getDownloadedMB());
    ipcMain.handle('minecraft-download:getDownloadedGB', () => MinecraftHandler.getDownloadedGB());
    ipcMain.handle('minecraft-download:getPercentage', () => MinecraftHandler.getPercentage());
    ipcMain.handle('minecraft-download:getCurrentSpeed', () => MinecraftHandler.getCurrentSpeed());
    ipcMain.handle('minecraft-download:getETA', () => MinecraftHandler.getETA());
    ipcMain.handle('minecraft-download:isDownloading', () => MinecraftHandler.isDownloading());

}

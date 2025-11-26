import { MinecraftDownloader } from "../Components/Download.js";
import { FolderLauncher } from "../../Folder.js";

const STFolder = new FolderLauncher();
const Downloader = new MinecraftDownloader();

export const startMinecraftDownload = async (version: string, installJava = false) => {
    const root = STFolder.getRootPath();

    Downloader.StartDownload({
        version,
        concurry: 5,
        installJava,
        root,
        maxRetries: 25
    });

    return Downloader;
};

export const pauseDownload = () => Downloader.pause();
export const resumeDownload = () => Downloader.resume();
export const stopDownload = () => Downloader.stop();

export const onDownloadEvent = (event: keyof MinecraftDownloader, callback: Function | any) => {
    Downloader.on(event, callback);
};

export const getDownloadedMB = () => Downloader.getDownloadedMB();
export const getDownloadedGB = () => Downloader.getDownloadedGB();
export const getPercentage = () => Downloader.getPercentage();
export const getCurrentSpeed = () => Downloader.getCurrentSpeed();
export const getETA = () => Downloader.getETA();
export const isDownloading = () => Downloader.isCurrentlyDownloading();

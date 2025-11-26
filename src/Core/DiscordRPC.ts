import rpc from "discord-rpc";
import { LangManager } from "../Utils/Lang.js";
import { FolderLauncher } from "./Folder.js";
import { ElectronPino } from "../Utils/Logger.js";

const CLIENT_ID = "1438239391666405396";
rpc.register(CLIENT_ID);

const DiscordRPC = new rpc.Client({ transport: "ipc" });
const lang = new LangManager("es");
lang.loadLanguage("es");

const STFolder = new FolderLauncher();
const logger = new ElectronPino(STFolder.getLauncherPath(), "normal");

let isConnected = false;
let isConnecting = false;
let currentMode: "menu" | "game" | "music" | "updating" | "mods" | null = null;
let startedAppTime = Math.floor(Date.now() / 1000);

// ─────────────────────────────
// REINTENTOS
// ─────────────────────────────
const MAX_RETRIES = 5;
let retryCount = 0;

// ─────────────────────────────
// CONEXIÓN RPC
// ─────────────────────────────
export async function connectDiscordRPC(): Promise<void> {
    if (isConnected || isConnecting) {
        logger.warn("[DiscordRPC] Ya hay una conexión activa o en proceso");
        return;
    }

    if (retryCount >= MAX_RETRIES) {
        logger.error(`[DiscordRPC] Se alcanzó el límite de ${MAX_RETRIES} reintentos, no se intentará reconectar`);
        return;
    }

    isConnecting = true;
    logger.info("[DiscordRPC] Intentando conectar...");

    try {
        DiscordRPC.removeAllListeners();

        DiscordRPC.once("ready", async () => {
            isConnected = true;
            isConnecting = false;
            retryCount = 0; // reset al conectarse exitosamente
            logger.info("[DiscordRPC] Conectado correctamente a Discord");
            await setDiscordRPCMode("menu");
        });

        DiscordRPC.once("disconnected", () => {
            isConnected = false;
            isConnecting = false;
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                logger.warn(`[DiscordRPC] Desconectado inesperadamente, reintentando en 5s... (Intento ${retryCount}/${MAX_RETRIES})`);
                setTimeout(connectDiscordRPC, 5000);
            } else {
                logger.error(`[DiscordRPC] Se alcanzó el límite de ${MAX_RETRIES} reintentos, no se volverá a intentar`);
            }
        });

        await DiscordRPC.login({ clientId: CLIENT_ID });
    } catch (err: any) {
        isConnected = false;
        isConnecting = false;
        retryCount++;
        logger.error(`[DiscordRPC] Error al conectar: ${err.message || err} (Intento ${retryCount}/${MAX_RETRIES})`);
        if (retryCount < MAX_RETRIES) {
            setTimeout(connectDiscordRPC, 5000);
        } else {
            logger.error(`[DiscordRPC] Se alcanzó el límite de ${MAX_RETRIES} reintentos, no se volverá a intentar`);
        }
    }
}

// ─────────────────────────────
// ACTUALIZAR PRESENCIA
// ─────────────────────────────
export async function setDiscordRPCMode(
    mode: "menu" | "game" | "music" | "updating" | "mods",
    version?: string
): Promise<void> {
    if (!isConnected) {
        logger.warn("[DiscordRPC] No hay conexión activa para actualizar presencia");
        return;
    }

    try {
        currentMode = mode;

        const detailsTemplate = lang.get(`DiscordRPC.${capitalizeMode(mode)}`) || "Usando StepLauncher";
        const stateTemplate =
            lang.get(`DiscordRPC.States.${capitalizeMode(mode)}`) || getDefaultState(mode, version);
        const buttons = lang.get("DiscordRPC.Buttons") || [
            { label: "Ver Proyecto", url: "https://github.com/Stepnicka012/StepLauncher" },
            { label: "Descargar StepLauncher", url: "https://steplauncher.pages.dev" },
        ];

        const details = detailsTemplate.replace("${version}", version || "Desconocido");
        const state = stateTemplate.replace("${version}", version || "Desconocido");

        const activity: rpc.Presence = {
            details,
            state,
            startTimestamp: startedAppTime,
            largeImageKey: getImageKey(mode),
            largeImageText: "StepLauncher",
            smallImageKey: mode === "game" ? "play" : undefined,
            smallImageText: mode === "game" ? `Versión ${version || "?"}` : undefined,
            instance: false,
            buttons,
        };

        await DiscordRPC.setActivity(activity);
        logger.info(`[DiscordRPC] Presencia actualizada → ${details} | ${state}`);
    } catch (err: any) {
        logger.error(`[DiscordRPC] Error al actualizar presencia: ${err.message || err}`);
    }
}

// ─────────────────────────────
// DESCONECTAR
// ─────────────────────────────
export async function disconnectDiscordRPC(): Promise<void> {
    if (!isConnected && !isConnecting) {
        logger.warn("[DiscordRPC] No hay conexión activa que cerrar");
        return;
    }

    try {
        await DiscordRPC.clearActivity();
        await DiscordRPC.destroy();
        isConnected = false;
        isConnecting = false;
        currentMode = null;
        retryCount = 0;
        logger.info("[DiscordRPC] Desconectado correctamente");
    } catch (err: any) {
        logger.error(`[DiscordRPC] Error al desconectar: ${err.message || err}`);
    }
}

export function getDiscordRPCStatus() {
    return { connected: isConnected, connecting: isConnecting, currentMode };
}

// ─────────────────────────────
// HELPERS
// ─────────────────────────────
function capitalizeMode(mode: string) {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function getDefaultState(mode: string, version?: string) {
    switch (mode) {
        case "menu": return "Explorando StepLauncher";
        case "game": return `Minecraft ${version || "?"}`;
        case "music": return "Escuchando música 🎧";
        case "mods": return "Viendo mods";
        case "updating": return "Actualizando archivos...";
        default: return "Usando StepLauncher";
    }
}

function getImageKey(mode: string) {
    switch (mode) {
        case "menu": return "logo";
        case "game": return "play";
        case "music": return "music";
        case "mods": return "mods";
        case "updating": return "update";
        default: return "logo";
    }
}

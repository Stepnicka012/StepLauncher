import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path,{ basename, resolve } from "node:path";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { LibraryBuyer } from "./LibraryBuyer.js";

export interface LauncherEvents {
  'status': (message: string) => void;
  'progress': (data: { type: string; message: string }) => void;
  'phase-start': (phase: string) => void;
  'phase-end': (phase: string, time: number) => void;
  'speed': (data: { phase: string; time: number; [key: string]: any }) => void;
  'debug': (data: { type: string; [key: string]: any }) => void;
  'launch-start': (data: any) => void;
  'launch-complete': (data: any) => void;
  'launch-failed': (data: any) => void;
  'game-started': (data: any) => void;
  'game-exit': (data: any) => void;
  'game-error': (message: string) => void;
  'stdout': (output: string) => void;
  'stderr': (output: string) => void;
  'exit': (data: { code?: number; signal?: string }) => void;
  'error': (error: Error) => void;
}
export interface LauncherOptions {
  /** Carpeta raíz donde está instalado Minecraft (Root folder where Minecraft is installed) */
  gameRoot: string;
  
  /** Versión de Minecraft a lanzar (Minecraft version to launch) */
  version: string;
  
  /** Ruta del ejecutable de Java (Path to Java executable) */
  java?: string;

  /** Configuración de memoria para la JVM (JVM memory configuration) */
  memory?: {
    /** Memoria mínima (Minimum memory) */
    min?: string;
    /** Memoria máxima (Maximum memory) */
    max?: string;
  };
  
  /** Configuración de la ventana del juego (Game window configuration) */
  window?: {
    /** Ancho de la ventana (Window width) */
    width?: number;
    /** Alto de la ventana (Window height) */
    height?: number;
    /** Si debe iniciarse en pantalla completa (Whether to start in fullscreen) */
    fullscreen?: boolean;
  };
  
  /** Sobrescrituras de rutas y archivos del juego (Overrides for game paths and files) */
  override?: {
    /** Directorio donde se ejecuta el juego (Directory where the game runs) */
    gameDirectory?: string;
    /** Ruta del JAR de Minecraft (Minecraft JAR path) */
    minecraftJar?: string;
    /** Archivo JSON de versión personalizado (Custom version JSON file) */
    versionJson?: string;
    /** Carpeta de assets (Assets folder) */
    assetRoot?: string;
    /** Índice de assets (Assets index) */
    assetIndex?: string;
    /** Carpeta de librerías (Libraries folder) */
    libraryRoot?: string;
    /** Carpeta de nativos (Natives folder) */
    natives?: string;
    /** Carpeta base de esta versión (Base folder of this version) */
    directory?: string;
  };

  /** Configuración de proxy para la conexión a Internet (Proxy configuration for internet connection) */
  proxy?: {
    /** Host del proxy (Proxy host) */
    host: string;
    /** Puerto del proxy (Proxy port) */
    port: number;
    /** Usuario opcional (Optional username) */
    username?: string;
    /** Contraseña opcional (Optional password) */
    password?: string;
    /** Tipo de proxy (Proxy type) */
    type?: "socks4" | "socks5" | "http";
  };

  /** Información del usuario (User information) */
  user: User;

  /** Habilitación o deshabilitación de features opcionales (Enable or disable optional features) */
  features?: Record<string, boolean>;

  /** Nombre del launcher a mostrar en infos o interfaz (Launcher name to display in infos or UI) */
  launcherName?: string;
  /** Versión del launcher (Launcher version) */
  launcherVersion?: string;

  /** Forzar sandbox de Java (Enforce Java sandbox) */
  enforceSandbox?: boolean;
  /** Habilitar debug detallado (Enable detailed debug) */
  enableDebug?: boolean;
  /** Habilitar métricas de velocidad y fases (Enable speed and phase metrics) */
  enableSpeedMetrics?: boolean;
  
  /** Argumentos personalizados de la JVM (Custom JVM arguments) */
  JVM_ARGS?: string[];
  /** Argumentos personalizados del juego (Custom game arguments) */
  MC_ARGS?: Record<string, string | boolean | number>;
}

export interface User {
  access_token?: string;
  client_token?: string;
  uuid?: string;
  name?: string;
  user_profiles?: string;
  meta?: {
    online?: boolean;
    type?: string;
  };
};

export interface AssetIndex {
  id: string;
  sha1: string;
  size: number;
  totalSize: number;
  url: string;
}

export interface VersionManifest {
  id: string;
  mainClass: string;
  arguments?: {
    game: Argument[];
    jvm: Argument[];
  } | undefined;
  minecraftArguments?: string | undefined;
  libraries: Library[];
  inheritsFrom?: string | undefined;
  jar?: string | undefined;
  assets?: string | undefined;
  assetIndex?: AssetIndex | undefined;
  type?: string | undefined;
  minimumLauncherVersion?: number;
  releaseTime?: string;
  time?: string;
}

export interface Argument {
  rules?: Rule[];
  value: string | string[];
}

export interface Rule {
  action: "allow" | "disallow";
  os?: {
    name?: string;
    version?: string;
    arch?: string;
  };
  features?: Record<string, boolean>;
}

export interface Library {
  name: string;
  downloads: {
    artifact?: {
      path: string;
      url: string;
      sha1: string;
      size: number;
    };
    classifiers?: {
      [key: string]: {
        path: string;
        url: string;
        sha1: string;
        size: number;
      };
    };
  };
  rules?: Rule[];
  extract?: {
    exclude: string[];
  };
  natives?: {
    [key: string]: string;
  };
  checksums?: string[];
}

export interface LaunchResult {
  emitter: EventEmitter;
  pid?: number;
  kill: () => boolean;
  stats: {
    totalTime: number;
    phaseTimes: Record<string, number>;
    classpathCount: number;
    libraryCount: number;
  };
}

const OS_TYPES = { windows: "windows", linux: "linux", osx: "osx" } as const;

type OSType = typeof OS_TYPES[keyof typeof OS_TYPES];

class PerformanceTracker {
  private startTimes: Map<string, number> = new Map();
  private phaseTimes: Record<string, number> = {};

  start(phase: string): void {
    this.startTimes.set(phase, Date.now());
  }

  end(phase: string): number {
    const startTime = this.startTimes.get(phase);
    if (!startTime) return 0;

    const duration = Date.now() - startTime;
    this.phaseTimes[phase] = duration;
    this.startTimes.delete(phase);
    return duration;
  }

  getPhaseTimes(): Record<string, number> {
    return { ...this.phaseTimes };
  }
}

function getOS(): OSType {
  switch (process.platform) {
    case "win32": return OS_TYPES.windows;
    case "darwin": return OS_TYPES.osx;
    default: return OS_TYPES.linux;
  }
}

function satisfiesRule(rule: Rule, features?: Record<string, boolean>): boolean {
  if (!rule.os && !rule.features) return true;

  if (rule.os) {
    const currentOS = getOS();
    const osNameMap: Record<string, string> = {
      [OS_TYPES.windows]: "windows",
      [OS_TYPES.linux]: "linux",
      [OS_TYPES.osx]: "osx"
    };

    if (rule.os.name && rule.os.name !== osNameMap[currentOS]) {
      return rule.action === "disallow";
    }

    if (rule.os.arch) {
      const currentArch = process.arch;
      if (rule.os.arch !== currentArch) {
        return rule.action === "disallow";
      }
    }
  }

  if (rule.features) {
    for (const [feature, required] of Object.entries(rule.features)) {
      const hasFeature = features?.[feature] || false;
      if (required !== hasFeature) {
        return rule.action === "disallow";
      }
    }
  }

  return rule.action === "allow";
}

function satisfiesAllRules(rules?: Rule[], features?: Record<string, boolean>): boolean {
  if (!rules || rules.length === 0) return true;

  let allowed = true;
  for (const rule of rules) {
    if (!satisfiesRule(rule, features)) {
      if (rule.action === "allow") return false;
    } else {
      if (rule.action === "allow") allowed = true;
      else if (rule.action === "disallow") allowed = false;
    }
  }
  return allowed;
}

async function loadVersionManifest(root: string, version: string, override?: { versionJson?: string }): Promise<VersionManifest> {
  const versionPath = override?.versionJson || resolve(root, "versions", version, `${version}.json`);
  const raw = await fs.readFile(versionPath, "utf8");
  const manifest: VersionManifest = JSON.parse(raw);

  if (manifest.inheritsFrom) {
    const parentManifest = await loadVersionManifest(root, manifest.inheritsFrom, override);
    return mergeManifests(parentManifest, manifest);
  }

  return manifest;
}

function mergeManifests(parent: VersionManifest, child: VersionManifest): VersionManifest {
  const merged: VersionManifest = {
    ...parent,
    ...child,
    id: child.id,
    mainClass: child.mainClass || parent.mainClass,
    libraries: [...(parent.libraries || []), ...(child.libraries || [])],
    minecraftArguments: child.minecraftArguments || parent.minecraftArguments,
    assets: child.assets || parent.assets,
    assetIndex: child.assetIndex || parent.assetIndex,
    type: child.type || parent.type,
    minimumLauncherVersion: Math.max(parent.minimumLauncherVersion || 0, child.minimumLauncherVersion || 0)
  };

  if (parent.arguments || child.arguments) {
    const gameArgs: Argument[] = [
      ...(parent.arguments?.game || []),
      ...(child.arguments?.game || [])
    ];
    
    const jvmArgs: Argument[] = [
      ...(parent.arguments?.jvm || []),
      ...(child.arguments?.jvm || [])
    ];

    if (parent.minecraftArguments && !parent.arguments) {
      const legacyArgs = parent.minecraftArguments.split(' ').map(arg => ({ value: arg }));
      gameArgs.push(...legacyArgs);
    }
    if (child.minecraftArguments && !child.arguments) {
      const legacyArgs = child.minecraftArguments.split(' ').map(arg => ({ value: arg }));
      gameArgs.push(...legacyArgs);
    }

    merged.arguments = {
      game: gameArgs,
      jvm: jvmArgs
    };
  } else if (parent.minecraftArguments || child.minecraftArguments) {
    const legacyArgs = [
      ...(parent.minecraftArguments?.split(' ') || []),
      ...(child.minecraftArguments?.split(' ') || [])
    ].map(arg => ({ value: arg }));

    merged.arguments = {
      game: legacyArgs,
      jvm: []
    };
  }

  return merged;
}

async function handleCustomVersion(options: LauncherOptions, manifest: VersionManifest, emitter: EventEmitter): Promise<void> {
  const isForge = manifest.libraries?.some(lib => 
    lib.name.includes('net.minecraftforge:forge:') ||
    lib.name.includes('net.minecraftforge:fmlloader:')
  );
  
  const isFabric = manifest.libraries?.some(lib => 
    lib.name.includes('net.fabricmc:fabric-loader:')
  );
  
  const isCustom = isForge || isFabric || 
    manifest.mainClass?.includes('forge') ||
    manifest.id?.includes('forge');

  if (!isCustom) return;

  emitter.emit("debug", {
    type: "custom-version-detected",
    isForge,
    isFabric,
    mainClass: manifest.mainClass,
    version: manifest.id
  });

  const libraryBuyer = new LibraryBuyer({
    root: options.gameRoot,
    version: options.version,
    forceDownload: false,
    concurry: 10
  });

  libraryBuyer.on("LibraryMissing", (data: any) => {
    emitter.emit("progress", { 
      type: "library-missing", 
      message: `Falta: ${data.library}` 
    });
  });

  libraryBuyer.on("FileStart", (data: any) => {
    emitter.emit("progress", { 
      type: "downloading", 
      message: `Descargando: ${basename(data.filePath)}` 
    });
  });

  libraryBuyer.on("FileSuccess", (data: any) => {
    emitter.emit("progress", { 
      type: "downloaded", 
      message: `Listo: ${basename(data.filePath)}` 
    });
  });

  // Ejecutar descarga
  await libraryBuyer.ensureLibraries();
}

function getAssetsRoot(options: LauncherOptions, manifest: VersionManifest): string {
  if (options.override?.assetRoot) {
    return options.override.assetRoot;
  }
  
  const assetsId = manifest.assets || manifest.assetIndex?.id || options.version;
  const isLegacyAssets = assetsId.startsWith("pre-") || assetsId === "legacy" || assetsId === "virtual";

  if (isLegacyAssets) {
    return resolve(options.gameRoot, "resources");
  } else {
    return resolve(options.gameRoot, "assets");
  }
}

function getAssetsIndexName(options: LauncherOptions, manifest: VersionManifest): string {
  if (options.override?.assetIndex) {
    return options.override.assetIndex;
  }
  
  if (manifest.assetIndex?.id) {
    return manifest.assetIndex.id;
  }
  
  if (manifest.assets) {
    return manifest.assets;
  }
  
  return options.version;
}

function processJVMArgument(arg: string, options: LauncherOptions, nativesDir: string): string {
  const launcherName = options.launcherName || "Minecraft Launcher";
  const launcherVersion = options.launcherVersion || "1.0.0";
  const libraryRoot = options.override?.libraryRoot || resolve(options.gameRoot, "libraries");
  
  return arg
    .replace(/\$\{natives_directory\}/g, nativesDir)
    .replace(/\$\{classpath_separator\}/g, process.platform === "win32" ? ";" : ":")
    .replace(/\$\{launcher_name\}/g, launcherName)
    .replace(/\$\{launcher_version\}/g, launcherVersion)
    // .replace(/\$\{classpath\}/g, "::")
    .replace(/\$\{library_directory\}/g, libraryRoot)
    .replace(/\$\{game_directory\}/g, options.override?.gameDirectory || options.gameRoot);
}
function removeAllDuplicateArgs(args: string[]): string[] {
  const result: string[] = [];
  const seenArgs = new Set();
  
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    
    if (current?.startsWith('--')) {
      if (seenArgs.has(current)) {
        // Saltar este argumento y su valor (si tiene)
        if (i + 1 < args.length && !args[i + 1]?.startsWith('--')) {
          i++; // Saltar el valor también
        }
        continue;
      }
      seenArgs.add(current);
    }
    
    result.push(current || "");
  }
  
  return result;
}
function buildGameArgs(options: LauncherOptions, manifest: VersionManifest, emitter: EventEmitter): string[] {
  const gameArgs: string[] = [];
  
  const gameDirectory = options.override?.gameDirectory || resolve(options.gameRoot);
  const assetsRootPath = getAssetsRoot(options, manifest);
  const assetsIndexName = getAssetsIndexName(options, manifest);
  
  if (manifest.arguments?.game) {
    for (const arg of manifest.arguments.game) {
      if (typeof arg === "string") {
        const processed = processGameArgument(arg, options, manifest);
        if (isValidArgument(processed)) {
          gameArgs.push(processed);
        }
      } else if (arg.value && satisfiesAllRules(arg.rules, options.features)) {
        const values = Array.isArray(arg.value) ? arg.value : [arg.value];
        for (const value of values) {
          if (typeof value === "string") {
            const processed = processGameArgument(value, options, manifest);
            if (isValidArgument(processed)) {
              gameArgs.push(processed);
            }
          }
        }
      }
    }
  } else if (manifest.minecraftArguments) {
    const legacyArgs = manifest.minecraftArguments.split(" ");
    for (const arg of legacyArgs) {
      const processed = processGameArgument(arg, options, manifest);
      if (isValidArgument(processed)) {
        gameArgs.push(processed);
      }
    }
  }

  ensureArgumentWithValue(gameArgs, '--username', options.user.name || "Player");
  ensureArgumentWithValue(gameArgs, '--version', options.version);
  ensureArgumentWithValue(gameArgs, '--gameDir', gameDirectory);
  ensureArgumentWithValue(gameArgs, '--assetsDir', assetsRootPath);
  ensureArgumentWithValue(gameArgs, '--assetIndex', assetsIndexName);
  ensureArgumentWithValue(gameArgs, '--uuid', options.user.uuid || "00000000-0000-0000-0000-000000000000");
  ensureArgumentWithValue(gameArgs, '--accessToken', options.user.access_token || "0");
  ensureArgumentWithValue(gameArgs, '--userType', options.user.meta?.type || "mojang");
  
  const userPropertiesIndex = gameArgs.indexOf('--userProperties');
  if (userPropertiesIndex !== -1) {
    if (userPropertiesIndex < gameArgs.length - 1) {
      const nextArg = gameArgs[userPropertiesIndex + 1];
      if (!isArgumentName(nextArg!) && isValidUserProperties(nextArg!)) {
      } else {
        gameArgs[userPropertiesIndex + 1] = '{}';
      }
    } else {
      gameArgs.push('{}');
    }
  } else {
    gameArgs.push('--userProperties', '{}');
  }

  handleWindowArguments(gameArgs, options.window);
  handleCustomArguments(gameArgs, options.MC_ARGS);
  
  
  const cleanedArgs = cleanArguments(gameArgs);
  const finalArgs = removeAllDuplicateArgs(cleanedArgs);
  
  if (options.enableDebug) {
    emitter.emit("debug", {
      type: "game-args-debug",
      args: finalArgs,
      gameDirectory: gameDirectory,
      assetsRoot: assetsRootPath,
      assetsIndexName: assetsIndexName,
      originalGameRoot: options.gameRoot,
      overrideGameDirectory: options.override?.gameDirectory
    });
  }
  
  return finalArgs;
}

function isValidUserProperties(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function ensureArgumentWithValue(args: string[], argName: string, value: string): void {
  const index = args.indexOf(argName);
  if (index !== -1) {
    if (index < args.length - 1) {
      if (!isArgumentName(args[index + 1] || "")) {
        args[index + 1] = value;
      } else {
        args.splice(index + 1, 0, value);
      }
    } else {
      args.push(value);
    }
  } else {
    args.push(argName, value);
  }
}

function isValidArgument(arg: any): boolean {
  if (arg === null || arg === undefined) {
    return false;
  }
  
  const strArg = String(arg).trim();
  
  if (strArg === "") {
    return false;
  }
  
  if (strArg.includes('${') && strArg.replace(/\$\{[^}]+\}/g, '').trim() === '') {
    return true;
  }
  
  return true;
}

function handleWindowArguments(gameArgs: string[], window?: LauncherOptions['window']): void {
  if (!window) return;
  
  const hasWidth = isArgumentPresent(gameArgs, '--width');
  const hasHeight = isArgumentPresent(gameArgs, '--height');
  const hasFullscreen = gameArgs.includes('--fullscreen');
  
  if (!hasWidth && window.width) {
    gameArgs.push("--width", window.width.toString());
  }
  
  if (!hasHeight && window.height) {
    gameArgs.push("--height", window.height.toString());
  }
  
  if (window.fullscreen && !hasFullscreen) {
    gameArgs.push("--fullscreen");
  }
}

function handleCustomArguments(gameArgs: string[], MC_ARGS?: Record<string, any>): void {
  if (!MC_ARGS) return;
  
  for (const [key, value] of Object.entries(MC_ARGS)) {
    if (value === undefined || value === null || value === "") continue;
    
    const argName = key.startsWith("--") ? key : `--${key}`;
    
    if (isCustomArgumentExists(gameArgs, argName, value)) {
      continue;
    }
    
    addCustomArgument(gameArgs, argName, value);
  }
}

function isArgumentPresent(args: string[], argumentName: string): boolean {
  return args.includes(argumentName);
}

function isCustomArgumentExists(args: string[], argName: string, value: any): boolean {
  const index = args.indexOf(argName);
  if (index === -1) return false;
  
  if (typeof value === 'boolean') {
    return true;
  }
  
  if (index < args.length - 1) {
    return args[index + 1] === String(value);
  }
  
  return false;
}

function addCustomArgument(args: string[], argName: string, value: any): void {
  if (typeof value === "boolean") {
    if (value) {
      args.push(argName);
    }
  } else {
    args.push(argName, String(value));
  }
}

function cleanArguments(args: string[]): string[] {
  const cleaned: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (!isValidArgument(current)) continue;
    const currentStr = String(current);

    if (currentStr.trim().startsWith('{') || currentStr.trim().startsWith('[')) {
      cleaned.push(currentStr);
      continue;
    }
    
    if (isArgumentRequiresValue(currentStr)) {
      if (i < args.length - 1) {
        const next = args[i + 1];
        if (isValidArgument(next) && !isArgumentName(String(next))) {
          cleaned.push(currentStr, String(next));
          i++;
        } else {
          if (currentStr === '--userProperties') {
            cleaned.push(currentStr, '{}');
            i++;
          } else {
            cleaned.push(currentStr);
          }
        }
      } else {
        if (currentStr === '--userProperties') {
          cleaned.push(currentStr, '{}');
        } else {
          cleaned.push(currentStr);
        }
      }
    } else {
      cleaned.push(currentStr);
    }
  }
  
  return cleaned;
}

function isArgumentName(arg: string): boolean {
  return arg.startsWith('--') || arg.startsWith('-');
}

function isArgumentRequiresValue(argument: string): boolean {
  const valueRequiredArgs = [
    '--width', '--height', '--quickPlayPath', 
    '--quickPlaySingleplayer', '--quickPlayMultiplayer', 
    '--quickPlayRealms', '--assetsDir', '--assetIndex',
    '--username', '--uuid', '--accessToken', '--userProperties',
    '--userType', '--version', '--gameDir', '--assetsDir',
    '--assetIndex', '--clientId'
  ];
  
  return valueRequiredArgs.includes(argument);
}
function processGameArgument(arg: string, options: LauncherOptions, manifest: VersionManifest): string {
  const user = options.user;
  
  const assetsRootPath = getAssetsRoot(options, manifest);
  const assetsIndexName = getAssetsIndexName(options, manifest);
  const gameDirectory = options.override?.gameDirectory || resolve(options.gameRoot);
  
  const quickPlayPath = options.MC_ARGS?.quickPlayPath as string || "";
  const quickPlaySingleplayer = options.MC_ARGS?.quickPlaySingleplayer as string || "";
  const quickPlayMultiplayer = options.MC_ARGS?.quickPlayMultiplayer as string || "";
  const quickPlayRealms = options.MC_ARGS?.quickPlayRealms as string || "";
  
  if (arg.trim().startsWith('{') || arg.trim().startsWith('[')) {
    return arg;
  }
  
  return arg.replace(/\$\{([^}]+)\}/g, (key: string): string => {
    const trimmedKey = key.replace(/\$\{|\}/g, '').trim();
    
    
    switch (trimmedKey) {
      case "auth_player_name": return user.name || "Player";
      case "auth_uuid": return user.uuid || "00000000-0000-0000-0000-000000000000";
      case "auth_access_token": return user.access_token || "0";
      case "auth_xuid": return "0";
      case "user_type": return user.meta?.type || "mojang";
      case "version_name": return options.version;
      case "version_type": return manifest.type || "release";
      case "game_directory": return gameDirectory;
        
      case "assetsDir":
      case "game_assets_directory":
      case "assets_root":
        return assetsRootPath;
        
      case "assetsIndexName":
      case "assets_index_name":
      case "assetIndex":
        return assetsIndexName;
        
      case "clientid": return "0";
      case "resolution_width": return options.window?.width?.toString() || "854";
      case "resolution_height": return options.window?.height?.toString() || "480";
      case "quickPlayPath": return quickPlayPath;
      case "quickPlaySingleplayer": return quickPlaySingleplayer;
      case "quickPlayMultiplayer": return quickPlayMultiplayer;
      case "quickPlayRealms": return quickPlayRealms;
        
      default: 
        if (options.MC_ARGS && trimmedKey in options.MC_ARGS) {
          return String(options.MC_ARGS[trimmedKey]);
        }
        return "";
    }
  });
}

function getClientJarPath(root: string, version: string, manifest: VersionManifest, override?: { minecraftJar?: string; directory?: string }): string {
  if (override?.minecraftJar) {
    return override.minecraftJar;
  }
  
  function getBaseDir(): string {
    if (override?.directory) {
      return override.directory;
    }
    if (manifest.inheritsFrom) {
      return resolve(root, "versions", manifest.inheritsFrom);
    }
    return resolve(root, "versions", version);
  }
  
  const baseDir = getBaseDir();
  
  if (manifest.jar) { 
    return resolve(baseDir, `${manifest.jar}.jar`); 
  }
  if (manifest.inheritsFrom) { 
    return resolve(baseDir, `${manifest.inheritsFrom}.jar`); 
  }
  return resolve(baseDir, `${version}.jar`);
}

function getNativesDir(root: string, version: string, manifest: VersionManifest, override?: { natives?: string; directory?: string }): string {
  if (override?.natives) {
    return override.natives;
  }
  
  const versionDir = override?.directory || resolve(root, "versions", version);
  
  if (manifest.inheritsFrom) { 
    const parentDir = override?.directory || resolve(root, "versions", manifest.inheritsFrom);
    return resolve(parentDir, "natives"); 
  }
  return resolve(versionDir, "natives");
}

function libraryNameToPath(name: string): string {
  const parts = name.split(':');
  if (parts.length < 3) {
    throw new Error(`Invalid library name: ${name}`);
  }

  const groupId = parts[0];
  const artifactId = parts[1];
  const version = parts[2];
  const classifier = parts[3] || null;

  const groupPath = groupId?.replace(/\./g, '/');
  let fileName = `${artifactId}-${version}`;
  if (classifier) {
    fileName += `-${classifier}`;
  }
  fileName += '.jar';

  return `${groupPath}/${artifactId}/${version}/${fileName}`;
}

async function processLibraries(
  root: string, 
  version: string, 
  libraries: Library[], 
  manifest: VersionManifest, 
  override?: { libraryRoot?: string; natives?: string },
  options?: LauncherOptions
): Promise<{ classpath: string[]; nativesDir: string; libraryCount: number }> {
  const classpath: string[] = [];
  const processedPaths = new Set<string>();
  let libraryCount = 0;
  const nativesDir = getNativesDir(root, version, manifest, override);
  const libraryRoot = override?.libraryRoot || resolve(root, "libraries");
  
  const libraryConflicts = new Map();
  
  try {
    await fs.mkdir(nativesDir, { recursive: true });
  } catch (error) { }

  const os = getOS();
  const isLegacy = isLegacyVersion(manifest);

  if (options?.enableDebug) {
    window.ElectronPino.info(`Processing libraries for ${isLegacy ? 'legacy' : 'modern'} version: ${version}`);
  }

  for (const lib of libraries) {
    const isCriticalLWJGL = isLegacy && (
      lib.name.includes('org.lwjgl.lwjgl:lwjgl:') ||
      lib.name.includes('org.lwjgl.lwjgl:lwjgl_util:') ||
      lib.name.includes('org.lwjgl.lwjgl:lwjgl-platform:')
    );

    let shouldInclude = satisfiesAllRules(lib.rules, options?.features);
    
    if (isCriticalLWJGL && !shouldInclude) {
      if (options?.enableDebug) {
        window.ElectronPino.info(`🔄 FORCING critical LWJGL library (rules bypassed): ${lib.name}`);
      }
      shouldInclude = true;
    }

    if (!shouldInclude) {
      if (options?.enableDebug) {
        window.ElectronPino.info(`Skipping library due to rules: ${lib.name}`);
      }
      continue;
    }

    if (lib.name.includes('com.google.guava:guava:')) {
      const versionMatch = lib.name.match(/com\.google\.guava:guava:([\d.]+)/);
      if (versionMatch) {
        const currentVersion = versionMatch[1];
        
        // 1. Inicializar el set de registro (o usar 0.0 si no existe)
        if (!libraryConflicts.has('guava')) {
          libraryConflicts.set('guava', new Set());
        }
        
        const registeredVersions = libraryConflicts.get('guava');
        
        // Determinar la versión actualmente registrada
        const existingVersion = registeredVersions.size > 0 
          ? Array.from(registeredVersions)[0] as string
          : '0.0';
          
        // Convertimos a entero para comparación simple (ej: '17.0' -> 17)
        const currentMajor = parseInt(currentVersion?.split('.')[0] || '0');
        const existingMajor = parseInt(existingVersion.split('.')[0] || '0');

        // 2. Lógica de selección: Reemplazar si la actual es MAYOR
        if (currentMajor > existingMajor) {
          // Si encontramos una versión más moderna (ej: 17.0 después de 15.0), la registramos
          if (options?.enableDebug) {
             window.ElectronPino.info(`⬆️ UPGRADING Guava: ${existingVersion} -> ${currentVersion}. Priorizando para evitar errores de lanzamiento.`);
          }
          // Limpiamos el registro anterior y añadimos la nueva versión
          registeredVersions.clear(); 
          registeredVersions.add(currentVersion);
          
        } else if (currentMajor < existingMajor) {
           // Si la versión actual es antigua (ej: 15.0 después de 17.0), la saltamos
           if (options?.enableDebug) {
              window.ElectronPino.info(`🔄 SKIPPING older Guava: ${currentVersion} (Keeping ${existingVersion})`);
           }
           continue; 
           
        } else if (registeredVersions.size > 0 && currentMajor === existingMajor) {
           // Si es la misma versión y ya está registrada, la saltamos (evita duplicados exactos)
           if (options?.enableDebug) {
              window.ElectronPino.info(`🔄 SKIPPING duplicate Guava version: ${currentVersion}`);
           }
           continue; 
        }
        
        // Si llegamos a este punto y el Set sigue vacío (solo pasa en la primera iteración
        // si la versión es válida, ej: 15.0 cuando existingMajor es 0), la añadimos.
        if (registeredVersions.size === 0) {
            registeredVersions.add(currentVersion);
        }
      }
    }

    if (isLegacy) {
      let libPath: string | null = null;

      if (lib.natives && lib.downloads?.classifiers) {
        const nativeKey = lib.natives[os];
        if (nativeKey) {
          const nativeClassifier = nativeKey.replace("${arch}", process.arch === "x64" ? "64" : "32");
          const nativeArtifact = lib.downloads.classifiers[nativeClassifier];
          if (nativeArtifact) {
            libPath = resolve(libraryRoot, nativeArtifact.path);
            if (options?.enableDebug) {
              window.ElectronPino.info(`Using native classifier for ${lib.name}: ${nativeClassifier}`);
            }
          }
        }
      }
      
      if (!libPath && lib.downloads?.artifact) {
        libPath = resolve(libraryRoot, lib.downloads.artifact.path);
      }
      
      if (!libPath) {
        try {
          const relativePath = libraryNameToPath(lib.name);
          libPath = resolve(libraryRoot, relativePath);
        } catch (error) {
          if (options?.enableDebug) {
            window.ElectronPino.warn(`No se pudo generar ruta para librería: ${lib.name} - ${error}`);
          }
          continue;
        }
      }

      if (libPath && !processedPaths.has(libPath)) {
        try {
          await fs.access(libPath);
          classpath.push(libPath);
          processedPaths.add(libPath);
          libraryCount++;
          
          if (options?.enableDebug) {
            window.ElectronPino.info(`Added to classpath (legacy): ${libPath}`);
            
            if (lib.name.includes('lwjgl')) {
              window.ElectronPino.info(`>>> LWJGL Library Added: ${lib.name} -> ${libPath}`);
            }
          }
        } catch (error) {
          if (options?.enableDebug) {
            window.ElectronPino.warn(`Librería no encontrada (legacy): ${libPath}`);
          }
        }
      }
      continue;
    }

    if (lib.natives) {
      const nativeKey = lib.natives[os];
      if (nativeKey && lib.downloads?.classifiers) {
        const nativeClassifier = nativeKey.replace("${arch}", process.arch === "x64" ? "64" : "32");
        const nativeArtifact = lib.downloads.classifiers[nativeClassifier];
        if (nativeArtifact) {
          const nativePath = resolve(libraryRoot, nativeArtifact.path);
          try {
            await fs.access(nativePath);
            
            const fileName = path.basename(nativePath);
            const destPath = resolve(nativesDir, fileName);
            
            try {
              await fs.copyFile(nativePath, destPath);
              if (options?.enableDebug) {
                window.ElectronPino.info(`📦 Native library copied: ${fileName} -> ${nativesDir}`);
              }
            } catch (copyError) {
              if (options?.enableDebug) {
                window.ElectronPino.warn(`❌ Error copiando librería nativa: ${fileName} - ${copyError}`);
              }
            }
            
            libraryCount++;
            
            if (options?.enableDebug) {
              window.ElectronPino.info(`Native library processed (modern): ${nativePath}`);
            }
          } catch (error) {
            if (options?.enableDebug) {
              window.ElectronPino.warn(`Librería nativa no encontrada: ${nativePath}`);
            }
          }
        }
      }
      continue;
    }

    let libPath: string | null = null;

    if (lib.downloads?.artifact) {
      libPath = resolve(libraryRoot, lib.downloads.artifact.path);
    } else {
      try {
        const relativePath = libraryNameToPath(lib.name);
        libPath = resolve(libraryRoot, relativePath);
      } catch (error) {
        if (options?.enableDebug) {
          window.ElectronPino.warn(`No se pudo procesar librería: ${lib.name} - ${error}`);
        }
        continue;
      }
    }

    if (!processedPaths.has(libPath)) {
      try {
        await fs.access(libPath);
        classpath.push(libPath);
        processedPaths.add(libPath);
        libraryCount++;
        
        if (options?.enableDebug) {
          window.ElectronPino.info(`Added to classpath (modern): ${libPath}`);
        }
      } catch (error) {
        if (options?.enableDebug) {
          window.ElectronPino.warn(`Librería no encontrada: ${libPath}`);
        }
      }
    }
  }

  const guavaLibraries = classpath.filter(path => path.includes('guava'));
  if (guavaLibraries.length > 1 && options?.enableDebug) {
    window.ElectronPino.info(`⚠️  ADVERTENCIA: Aún hay ${guavaLibraries.length} versiones de Guava:`);
    guavaLibraries.forEach(lib => window.ElectronPino.info(`   - ${lib}`));

    const guava15 = classpath.find(path => path.includes('guava-15.0'));
    if (guava15) {
      const index = classpath.indexOf(guava15);
      classpath.splice(index, 1);
      libraryCount--;
      window.ElectronPino.info(`🗑️  ELIMINADO: ${guava15}`);
    }
  }

  if (options?.enableDebug) {
    try {
      const nativeFiles = await fs.readdir(nativesDir);
      window.ElectronPino.info(`📁 Archivos en directorio de nativas (${nativeFiles.length}):`);
      nativeFiles.forEach(file => window.ElectronPino.info(`   - ${file}`));
      
      const criticalNatives = ['lwjgl.dll', 'OpenAL32.dll', 'jinput-dx8_64.dll'];
      const missingNatives = criticalNatives.filter(native => !nativeFiles.includes(native));
      if (missingNatives.length > 0) {
        window.ElectronPino.info(`❌ FALTAN archivos nativos críticos: ${missingNatives.join(', ')}`);
      } else {
        window.ElectronPino.info(`✅ Todos los archivos nativos críticos presentes`);
      }
    } catch (error) {
      window.ElectronPino.warn(`❌ No se pudo leer directorio de nativas: ${nativesDir}`);
    }
  }

  if (options?.enableDebug) {
    window.ElectronPino.info(`Final classpath for ${version}:`);
    classpath.forEach((path, index) => {
      window.ElectronPino.info(`  [${index + 1}] ${path}`);
    });
    
    const lwjglLibraries = classpath.filter(path =>
      path.includes('lwjgl') || path.includes('LWJGL')
    );
    window.ElectronPino.info(`LWJGL libraries in classpath: ${lwjglLibraries.length}`);
    lwjglLibraries.forEach(lib => window.ElectronPino.info(`  - ${lib}`));
  }

  return { classpath, nativesDir, libraryCount };
}

function isLegacyVersion(manifest: VersionManifest): boolean {
  if (manifest.minecraftArguments) return true;
  if (!manifest.arguments) return true;
  if (manifest.id && (
      manifest.id.startsWith('1.12') ||
      manifest.id.startsWith('1.11') ||
      manifest.id.startsWith('1.10') ||
      manifest.id.startsWith('1.9') ||
      manifest.id.startsWith('1.8') ||
      manifest.id.startsWith('1.7')
  )) {
    return true;
  }
  
  return false;
}

function buildJVMArgs( 
  options: LauncherOptions, 
  manifest: VersionManifest, 
  classpath: string[], 
  nativesDir: string, 
  emitter: EventEmitter 
): string[] {
  const jvmArgs: string[] = [];
  
  const memory = options.memory;
  const jvmCustomArgs = options.JVM_ARGS || [];
  const libraryRoot = options.override?.libraryRoot || resolve(options.gameRoot, "libraries");
  const isLegacy = isLegacyVersion(manifest);

  if (memory?.min) jvmArgs.push(`-Xms${memory.min}`);
  if (memory?.max) jvmArgs.push(`-Xmx${memory.max}`);

  jvmArgs.push(`-Djava.library.path=${nativesDir}`);
  
  jvmArgs.push("-Dfml.ignoreInvalidMinecraftCertificates=true");
  jvmArgs.push("-Dfml.ignorePatchDiscrepancies=true");
  jvmArgs.push("-XX:+UseG1GC");
  jvmArgs.push("-XX:+UnlockExperimentalVMOptions");
  jvmArgs.push("-XX:G1NewSizePercent=20");
  jvmArgs.push("-XX:G1ReservePercent=20");
  jvmArgs.push("-XX:MaxGCPauseMillis=50");
  jvmArgs.push("-XX:G1HeapRegionSize=32M");
  jvmArgs.push("-Dorg.lwjgl.librarypath=" + nativesDir);

  jvmArgs.push(`-Dminecraft.client.jar=${getClientJarPath(options.gameRoot, options.version, manifest, options.override)}`);
  jvmArgs.push(`-DlibraryDirectory=${libraryRoot}`);

  if (options.proxy) {
    const { host, port, type } = options.proxy;
    if (type === 'socks4' || type === 'socks5') {
      jvmArgs.push(`-DsocksProxyHost=${host}`);
      jvmArgs.push(`-DsocksProxyPort=${port.toString()}`);
      if (options.proxy.username && options.proxy.password) {
        jvmArgs.push(`-DsocksProxyUser=${options.proxy.username}`);
        jvmArgs.push(`-Djdk.socks.auth.username=${options.proxy.username}`);
        jvmArgs.push(`-Djdk.socks.auth.password=${options.proxy.password}`);
      }
    } else {
      jvmArgs.push(`-Dhttp.proxyHost=${host}`);
      jvmArgs.push(`-Dhttp.proxyPort=${port.toString()}`);
      jvmArgs.push(`-Dhttps.proxyHost=${host}`);
      jvmArgs.push(`-Dhttps.proxyPort=${port.toString()}`);
      if (options.proxy.username && options.proxy.password) {
        jvmArgs.push(`-Dhttp.proxyUser=${options.proxy.username}`);
        jvmArgs.push(`-Dhttp.proxyPassword=${options.proxy.password}`);
      }
    }
  }

  if (manifest.arguments?.jvm) {
    for (const arg of manifest.arguments.jvm) {
      if (typeof arg === "string") {
        const processedArg = processJVMArgument(arg, options, nativesDir);
        if (processedArg && processedArg.trim() !== "") {
          jvmArgs.push(processedArg);
        }
      } else if (arg.value && satisfiesAllRules(arg.rules, options.features)) {
        const values = Array.isArray(arg.value) ? arg.value : [arg.value];
        for (const value of values) {
          const processedArg = processJVMArgument(value, options, nativesDir);
          if (processedArg && processedArg.trim() !== "") {
            jvmArgs.push(processedArg);
          }
        }
      }
    }
  }

  jvmArgs.push(...jvmCustomArgs);
  jvmArgs.push("-cp", classpath.join(process.platform === "win32" ? ";" : ":"));

  if (options.enableDebug) {
    emitter.emit("debug", {
      type: "jvm-args",
      args: jvmArgs,
      classpathCount: classpath.length,
      memory: memory,
      nativesDir: nativesDir,
      libraryRoot: libraryRoot,
      proxy: options.proxy,
      isLegacy: isLegacy
    });
  }  
  return jvmArgs;
}

async function verifyCriticalFiles(options: LauncherOptions, manifest: VersionManifest): Promise<void> {
  const criticalPaths = [
    options.override?.versionJson || resolve(options.gameRoot, "versions", options.version, `${options.version}.json`),
    getClientJarPath(options.gameRoot, options.version, manifest, options.override),
    options.override?.libraryRoot || resolve(options.gameRoot, "libraries")
  ];

  const assetsRootName = getAssetsRoot(options, manifest);
  const assetsRootPath = options.override?.assetRoot || resolve(options.gameRoot, assetsRootName);
  criticalPaths.push(assetsRootPath);

  const assetsDir = resolve(options.gameRoot, "assets");
  try {
    await fs.access(assetsDir);
  } catch (error) {
    await fs.mkdir(assetsDir, { recursive: true });
  }

  for (const path of criticalPaths) {
    try {
      await fs.access(path);
    } catch (error) {
      throw new Error(`Critical file not found: ${path}`);
    }
  }
}

function createProxyAgent(proxyConfig: LauncherOptions['proxy']): any {
  if (!proxyConfig) return null;

  const { host, port, type, username, password } = proxyConfig;
  const proxyUrl = `${type}://${host}:${port}`;
  
  let agent: any;
  
  if (type === 'socks4' || type === 'socks5') {
    const socksUrl = username && password 
      ? `${type}://${username}:${password}@${host}:${port}`
      : proxyUrl;
    agent = new SocksProxyAgent(socksUrl);
  } else {
    const httpUrl = username && password 
      ? `http://${username}:${password}@${host}:${port}`
      : proxyUrl;
    agent = new HttpsProxyAgent(httpUrl);
  }

  return agent;
}

export async function ArgumentsBuilder(options: LauncherOptions): Promise<LaunchResult> {
  const emitter = new EventEmitter();
  const tracker = new PerformanceTracker();
  const totalStartTime = Date.now();
  const root = resolve(options.gameRoot);

  const stats = {
    totalTime: 0,
    phaseTimes: {} as Record<string, number>,
    classpathCount: 0,
    libraryCount: 0
  };

  try {
    tracker.start("manifest-load");
    emitter.emit("status", "Loading version manifest...");
    emitter.emit("phase-start", "manifest-load");

    const manifest = await loadVersionManifest(root, options.version, options.override);
    await handleCustomVersion(options, manifest, emitter);
    const manifestTime = tracker.end("manifest-load");

    emitter.emit("phase-end", "manifest-load", manifestTime);
    emitter.emit("speed", { phase: "manifest-load", time: manifestTime });

    tracker.start("file-verification");
    emitter.emit("status", "Verifying files...");
    emitter.emit("phase-start", "file-verification");

    await verifyCriticalFiles(options, manifest);
    const verificationTime = tracker.end("file-verification");

    emitter.emit("phase-end", "file-verification", verificationTime);
    emitter.emit("speed", { phase: "file-verification", time: verificationTime });

    tracker.start("libraries-processing");
    emitter.emit("status", "Processing libraries...");
    emitter.emit("phase-start", "libraries-processing");

    const { classpath, nativesDir, libraryCount } = await processLibraries(
      root, 
      options.version, 
      manifest.libraries, 
      manifest, 
      options.override,
      options
    );
    
    const clientJar = getClientJarPath(root, options.version, manifest, options.override);
    try {
      await fs.access(clientJar);
      classpath.push(clientJar);
    } catch (error) {
      throw new Error(`Client JAR not found: ${clientJar}`);
    }

    const librariesTime = tracker.end("libraries-processing");
    stats.classpathCount = classpath.length;
    stats.libraryCount = libraryCount;

    emitter.emit("phase-end", "libraries-processing", librariesTime);
    emitter.emit("speed", {
      phase: "libraries-processing",
      time: librariesTime,
      classpathCount: classpath.length,
      libraryCount: libraryCount,
      isLegacy: isLegacyVersion(manifest)
    });
    
    if (options.enableDebug) {
      const assetsRoot = getAssetsRoot(options, manifest);
      const assetsIndexName = getAssetsIndexName(options, manifest);

      emitter.emit("debug", {
        type: "classpath",
        classpath: classpath,
        count: classpath.length,
        nativesDir: nativesDir,
        clientJar: clientJar,
        assetsRoot: assetsRoot,
        assetsIndexName: assetsIndexName,
        manifestAssets: manifest.assets,
        manifestAssetIndex: manifest.assetIndex,
        override: options.override,
        isLegacy: isLegacyVersion(manifest)
      });
    }

    tracker.start("args-building");
    emitter.emit("status", "Building arguments...");
    emitter.emit("phase-start", "args-building");

    const javaExec = options.java || "java";
    const jvmArgs = buildJVMArgs(options, manifest, classpath, nativesDir, emitter);
    const gameArgs = buildGameArgs(options, manifest, emitter);

    if (!manifest.mainClass) {
      throw new Error("mainClass does not exist in manifest");
    }

    const finalArgs = [...jvmArgs, manifest.mainClass, ...gameArgs];
    const argsTime = tracker.end("args-building");

    emitter.emit("phase-end", "args-building", argsTime);
    emitter.emit("speed", { phase: "args-building", time: argsTime });

    if (options.enableDebug) {
      emitter.emit("debug", {
        type: "final-command",
        javaExec,
        args: finalArgs,
        mainClass: manifest.mainClass,
        totalArgs: finalArgs.length,
        JVM_ARGS: options.JVM_ARGS,
        MC_ARGS: options.MC_ARGS,
        proxy: options.proxy,
        features: options.features,
        isLegacy: isLegacyVersion(manifest)
      });
    }

    tracker.start("game-launch");
    emitter.emit("status", "Starting Minecraft...");
    emitter.emit("phase-start", "game-launch");
    
    const gameDirectory = options.override?.gameDirectory || root;
    const proxyAgent = createProxyAgent(options.proxy);
    
    emitter.emit("launch-start", {
      javaExec,
      mainClass: manifest.mainClass,
      jvmArgsCount: jvmArgs.length,
      gameArgsCount: gameArgs.length,
      nativesDir: nativesDir,
      gameDirectory: gameDirectory,
      memory: options.memory,
      window: options.window,
      proxy: options.proxy,
      proxyAgent: !!proxyAgent,
      features: options.features,
      isLegacy: isLegacyVersion(manifest)
    });

    const env = { ...process.env };
    
    if (options.proxy) {
      const { host, port, type, username, password } = options.proxy;
      
      if (type === 'socks4' || type === 'socks5') {
        env.SOCKS_PROXY = `${host}:${port}`;
        if (username && password) {
          env.SOCKS_USERNAME = username;
          env.SOCKS_PASSWORD = password;
        }
      } else {
        env.HTTP_PROXY = `http://${host}:${port}`;
        env.HTTPS_PROXY = `http://${host}:${port}`;
        if (username && password) {
          env.HTTP_PROXY_AUTH = `${username}:${password}`;
        }
      }
    }

    const child = spawn(javaExec, finalArgs, {
      cwd: gameDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
      env: env
    });

    const launchTime = tracker.end("game-launch");
    emitter.emit("phase-end", "game-launch", launchTime);
    emitter.emit("speed", { phase: "game-launch", time: launchTime });
    stats.totalTime = Date.now() - totalStartTime;
    stats.phaseTimes = tracker.getPhaseTimes();

    emitter.emit("launch-complete", {
      pid: child.pid,
      totalTime: stats.totalTime,
      phaseTimes: stats.phaseTimes,
      classpathCount: stats.classpathCount,
      libraryCount: stats.libraryCount,
      proxy: options.proxy,
      isLegacy: isLegacyVersion(manifest)
    });

    child.stdout?.on("data", (d: Buffer) => {
      const output = d.toString();
      emitter.emit("stdout", output);

      if (output.includes("Loading")) {
        emitter.emit("progress", { type: "loading", message: output.trim() });
      } else if (output.includes("Preparing")) {
        emitter.emit("progress", { type: "preparing", message: output.trim() });
      }

      if (output.includes("Game crashed!")) {
        emitter.emit("error", new Error("Game crashed"));
      }
    });

    child.stderr?.on("data", (d: Buffer) => {
      const output = d.toString();

      if (!output.includes("Render Extensions") &&
          !output.includes("Datafixer") &&
          !output.includes("OpenGL") &&
          !output.includes("Failed to get system info")) {
        emitter.emit("stderr", output);
      }

      if (output.includes("ERROR") || output.includes("Exception")) {
        emitter.emit("game-error", output);
      }
    });

    child.on("close", (code, signal) => {
      emitter.emit("exit", {
        code: code ?? undefined,
        signal: signal ?? undefined
      });
      emitter.emit("game-exit", { code, signal, totalTime: stats.totalTime });
    });

    child.on("error", (error) => {
      emitter.emit("error", error);
      emitter.emit("game-error", error.message);
    });

    child.on("spawn", () => {
      emitter.emit("game-started", { pid: child.pid });
    });

    return {
      emitter,
      pid: child.pid!,
      kill: () => child.kill(),
      stats
    };

  } catch (error) {
    stats.totalTime = Date.now() - totalStartTime;
    emitter.emit("error", error);
    emitter.emit("launch-failed", { error, totalTime: stats.totalTime });
    throw error;
  }
}
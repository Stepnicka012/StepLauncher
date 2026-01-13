import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { basename, resolve } from "node:path";

import { LibraryBuyer } from "./LibraryBuyer.js";
import type { LauncherOptions, VersionManifest, Argument, Rule, Library, LaunchResult } from "./Types/Arguments.js";
import { OS_TYPES, archCache, osCache } from  "./Utils/Platform.js";

class PerformanceTracker {
    private startTimes = new Map<string, number>();
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

function satisfiesRule(rule: Rule, features?: Record<string, boolean>): boolean {
    if (!rule.os && !rule.features) return true;
    if (rule.os) {
        const osNameMap: Record<string, string> = {
            [OS_TYPES.windows]: "windows",
            [OS_TYPES.linux]: "linux",
            [OS_TYPES.osx]: "osx"
        };
        if (rule.os.name && rule.os.name !== osNameMap[osCache]) return rule.action === "disallow";
        if (rule.os.arch && rule.os.arch !== archCache) return rule.action === "disallow";
    }
    if (rule.features) {
        for (const [feature, required] of Object.entries(rule.features)) {
            if (required !== (features?.[feature] || false)) return rule.action === "disallow";
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

const manifestCache = new Map<string, VersionManifest>();
async function loadVersionManifest(root: string, version: string, override?: { versionJson?: string }): Promise<VersionManifest> {
    const versionPath = override?.versionJson || resolve(root, "versions", version, `${version}.json`);
    const cacheKey = versionPath;
    if (manifestCache.has(cacheKey)) return manifestCache.get(cacheKey)!;
    const raw = await fs.readFile(versionPath, "utf8");
    const manifest: VersionManifest = JSON.parse(raw);
    if (manifest.inheritsFrom) {
        const parentManifest = await loadVersionManifest(root, manifest.inheritsFrom, override);
        const merged = mergeManifests(parentManifest, manifest);
        manifestCache.set(cacheKey, merged);
        return merged;
    }
    manifestCache.set(cacheKey, manifest);
    return manifest;
}

function mergeManifests(parent: VersionManifest, child: VersionManifest): VersionManifest {
    const merged: VersionManifest = {
        ...parent,
        ...child,
        id: child.id,
        mainClass: child.mainClass || parent.mainClass!,
        libraries: [...(parent.libraries || []), ...(child.libraries || [])]!,
        minecraftArguments: child.minecraftArguments || parent.minecraftArguments!,
        assets: child.assets || parent.assets!,
        assetIndex: child.assetIndex || parent.assetIndex!,
        type: child.type || parent.type!,
        minimumLauncherVersion: Math.max(parent.minimumLauncherVersion || 0, child.minimumLauncherVersion || 0)
    };
    if (parent.arguments || child.arguments) {
        const gameArgs: Argument[] = [...(parent.arguments?.game || []), ...(child.arguments?.game || [])];
        const jvmArgs: Argument[] = [...(parent.arguments?.jvm || []), ...(child.arguments?.jvm || [])];
        if (parent.minecraftArguments && !parent.arguments) {
            gameArgs.push(...parent.minecraftArguments.split(' ').map(arg => ({ value: arg })));
        }
        if (child.minecraftArguments && !child.arguments) {
            gameArgs.push(...child.minecraftArguments.split(' ').map(arg => ({ value: arg })));
        }
        merged.arguments = { game: gameArgs, jvm: jvmArgs };
    } else if (parent.minecraftArguments || child.minecraftArguments) {
        const legacyArgs = [...(parent.minecraftArguments?.split(' ') || []), ...(child.minecraftArguments?.split(' ') || [])].map(arg => ({ value: arg }));
        merged.arguments = { game: legacyArgs, jvm: [] };
    }
    return merged;
}

async function handleCustomVersion(options: LauncherOptions, manifest: VersionManifest, emitter: EventEmitter): Promise<void> {
    const isForge = manifest.libraries?.some(lib => lib.name.includes('net.minecraftforge:forge:') || lib.name.includes('net.minecraftforge:fmlloader:'));
    const isFabric = manifest.libraries?.some(lib => lib.name.includes('net.fabricmc:fabric-loader:'));
    const isCustom = isForge || isFabric || manifest.mainClass?.includes('forge') || manifest.id?.includes('forge');
    if (!isCustom) return;
    emitter.emit("debug", { type: "custom-version-detected", isForge, isFabric, mainClass: manifest.mainClass, version: manifest.id });
    
    const libraryBuyer = new LibraryBuyer({ root: options.gameRoot, version: options.version, forceDownload: false, concurry: 10 });
    libraryBuyer.on("LibraryMissing", (data: any) => emitter.emit("progress", { type: "library-missing", message: `Falta: ${data.library}` }));
    libraryBuyer.on("FileStart", (data: any) => emitter.emit("progress", { type: "downloading", message: `Descargando: ${basename(data.filePath)}` }));
    libraryBuyer.on("FileSuccess", (data: any) => emitter.emit("progress", { type: "downloaded", message: `Listo: ${basename(data.filePath)}` }));
    await libraryBuyer.ensureLibraries();
}

function getAssetsRoot(options: LauncherOptions, manifest: VersionManifest): string {
    if (options.override?.assetRoot) return options.override.assetRoot;
    const assetsId = manifest.assets || manifest.assetIndex?.id || options.version;
    const isLegacyAssets = assetsId.startsWith("pre-") || assetsId === "legacy" || assetsId === "virtual";
    return resolve(options.gameRoot, isLegacyAssets ? "resources" : "assets");
}

function getAssetsIndexName(options: LauncherOptions, manifest: VersionManifest): string {
    return options.override?.assetIndex || manifest.assetIndex?.id || manifest.assets || options.version;
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
        .replace(/\$\{library_directory\}/g, libraryRoot)
        .replace(/\$\{game_directory\}/g, options.override?.gameDirectory || options.gameRoot);
}

function isArgumentName(arg: string): boolean {
    return arg.startsWith('--') || arg.startsWith('-');
}

function isArgumentRequiresValue(argument: string): boolean {
    const valueRequiredArgs = ['--width', '--height', '--quickPlayPath', '--quickPlaySingleplayer', '--quickPlayMultiplayer', '--quickPlayRealms', '--assetsDir', '--assetIndex', '--username', '--uuid', '--accessToken', '--userProperties', '--userType', '--version', '--gameDir', '--assetsDir', '--assetIndex', '--clientId'];
    return valueRequiredArgs.includes(argument);
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
                if (currentStr === '--userProperties') cleaned.push(currentStr, '{}');
                else cleaned.push(currentStr);
            }
        } else {
            cleaned.push(currentStr);
        }
    }
    return cleaned;
}

function removeAllDuplicateArgs(args: string[]): string[] {
    const result: string[] = [];
    const seenArgs = new Set();
    for (let i = 0; i < args.length; i++) {
        const current = args[i];
        if (current?.startsWith('--')) {
            if (seenArgs.has(current)) {
                if (i + 1 < args.length && !args[i + 1]?.startsWith('--')) i++;
                continue;
            }
            seenArgs.add(current);
        }
        result.push(current || "");
    }
    return result;
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
            if (!isArgumentName(args[index + 1] || "")) args[index + 1] = value;
            else args.splice(index + 1, 0, value);
        } else {
            args.push(value);
        }
    } else {
        args.push(argName, value);
    }
}

function isValidArgument(arg: any): boolean {
    if (arg == null) return false;
    const strArg = String(arg).trim();
    if (strArg === "") return false;
    if (strArg.includes('${') && strArg.replace(/\$\{[^}]+\}/g, '').trim() === '') return true;
    return true;
}

function isArgumentPresent(args: string[], argumentName: string): boolean {
    return args.includes(argumentName);
}

function handleWindowArguments(gameArgs: string[], window?: LauncherOptions['window']): void {
    if (!window) return;
    const hasWidth = isArgumentPresent(gameArgs, '--width');
    const hasHeight = isArgumentPresent(gameArgs, '--height');
    const hasFullscreen = gameArgs.includes('--fullscreen');
    if (!hasWidth && window.width) gameArgs.push("--width", window.width.toString());
    if (!hasHeight && window.height) gameArgs.push("--height", window.height.toString());
    if (window.fullscreen && !hasFullscreen) gameArgs.push("--fullscreen");
}

function isCustomArgumentExists(args: string[], argName: string, value: any): boolean {
    const index = args.indexOf(argName);
    if (index === -1) return false;
    if (typeof value === 'boolean') return true;
    if (index < args.length - 1) return args[index + 1] === String(value);
    return false;
}

function handleCustomArguments(gameArgs: string[], MC_ARGS?: Record<string, any>): void {
    if (!MC_ARGS) return;
    for (const [key, value] of Object.entries(MC_ARGS)) {
        if (value == null || value === "") continue;
        const argName = key.startsWith("--") ? key : `--${key}`;
        if (isCustomArgumentExists(gameArgs, argName, value)) continue;
        if (typeof value === "boolean") {
            if (value) gameArgs.push(argName);
        } else {
            gameArgs.push(argName, String(value));
        }
    }
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
                if (isValidArgument(processed)) gameArgs.push(processed);
            } else if (arg.value && satisfiesAllRules(arg.rules, options.features)) {
                const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                for (const value of values) {
                    if (typeof value === "string") {
                        const processed = processGameArgument(value, options, manifest);
                        if (isValidArgument(processed)) gameArgs.push(processed);
                    }
                }
            }
        }
    } else if (manifest.minecraftArguments) {
        const legacyArgs = manifest.minecraftArguments.split(" ");
        for (const arg of legacyArgs) {
            const processed = processGameArgument(arg, options, manifest);
            if (isValidArgument(processed)) gameArgs.push(processed);
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
            gameDirectory,
            assetsRoot: assetsRootPath,
            assetsIndexName,
            originalGameRoot: options.gameRoot,
            overrideGameDirectory: options.override?.gameDirectory
        });
    }
    
    return finalArgs;
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
    
    if (arg.trim().startsWith('{') || arg.trim().startsWith('[')) return arg;
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
            case "assets_root": return assetsRootPath;
            case "assetsIndexName":
            case "assets_index_name":
            case "assetIndex": return assetsIndexName;
            case "clientid": return "0";
            case "resolution_width": return options.window?.width?.toString() || "854";
            case "resolution_height": return options.window?.height?.toString() || "480";
            case "quickPlayPath": return quickPlayPath;
            case "quickPlaySingleplayer": return quickPlaySingleplayer;
            case "quickPlayMultiplayer": return quickPlayMultiplayer;
            case "quickPlayRealms": return quickPlayRealms;
        default:
            if (options.MC_ARGS && trimmedKey in options.MC_ARGS) return String(options.MC_ARGS[trimmedKey]);
            return "";
        }
    });
}

function isLegacyVersion(manifest: VersionManifest): boolean {
    if (manifest.minecraftArguments) return true;
    if (!manifest.arguments) return true;
    if (manifest.id && (manifest.id.startsWith('1.12') || manifest.id.startsWith('1.11') || manifest.id.startsWith('1.10') || manifest.id.startsWith('1.9') || manifest.id.startsWith('1.8') || manifest.id.startsWith('1.7'))) return true;
    return false;
}

function getClientJarPath(root: string, version: string, manifest: VersionManifest, override?: { minecraftJar?: string; directory?: string }): string {
    if (override?.minecraftJar) return override.minecraftJar;
    function getBaseDir(): string {
        if (override?.directory) return override.directory;
        if (manifest.inheritsFrom) return resolve(root, "versions", manifest.inheritsFrom);
        return resolve(root, "versions", version);
    }
    const baseDir = getBaseDir();
    if (manifest.jar) return resolve(baseDir, `${manifest.jar}.jar`);
    if (manifest.inheritsFrom) return resolve(baseDir, `${manifest.inheritsFrom}.jar`);
    return resolve(baseDir, `${version}.jar`);
}

function getNativesDir(root: string, version: string, manifest: VersionManifest, override?: { natives?: string; directory?: string; thisBaseRootNatives?: boolean }): string {
    if (override?.natives) return override.natives;
    if (override?.thisBaseRootNatives) return resolve(root, "natives", version);
    const versionDir = override?.directory || resolve(root, "versions", version);
    if (manifest.inheritsFrom) {
        const parentDir = override?.directory || resolve(root, "versions", manifest.inheritsFrom);
        return resolve(parentDir, "natives");
    }
    return resolve(versionDir, "natives");
}

function libraryNameToPath(name: string): string {
    const parts = name.split(':');
    if (parts.length < 3) throw new Error(`Invalid library name: ${name}`);
    const groupId = parts[0];
    const artifactId = parts[1];
    const version = parts[2];
    const classifier = parts[3] || null;
    const groupPath = groupId?.replace(/\./g, '/');
    let fileName = `${artifactId}-${version}`;
    if (classifier) fileName += `-${classifier}`;
    fileName += '.jar';
    return `${groupPath}/${artifactId}/${version}/${fileName}`;
}

async function processLibraries(
    root: string,
    version: string,
    libraries: Library[],
    manifest: VersionManifest,
    emitter: EventEmitter,
    override?: { libraryRoot?: string; natives?: string; thisBaseRootNatives?: boolean; directory?: string },
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
    } catch (error) {}
    
    const isLegacy = isLegacyVersion(manifest);
    if (options?.enableDebug) emitter.emit("debug",`Processing libraries for ${isLegacy ? 'legacy' : 'modern'} version: ${version}`);
    for (const lib of libraries) {
        const isCriticalLWJGL = isLegacy && (lib.name.includes('org.lwjgl.lwjgl:lwjgl:') || lib.name.includes('org.lwjgl.lwjgl:lwjgl_util:') || lib.name.includes('org.lwjgl.lwjgl:lwjgl-platform:'));
        let shouldInclude = satisfiesAllRules(lib.rules, options?.features);
        
        if (isCriticalLWJGL && !shouldInclude) {
            if (options?.enableDebug) emitter.emit("debug",`[ FORZANDO ] Biblioteca crítica LWJGL (reglas omitidas): ${lib.name}`);
            shouldInclude = true;
        }

        if (!shouldInclude) {
            if (options?.enableDebug) emitter.emit("debug",`[ Skipping ] Biblioteca debido a las reglas: ${lib.name}`);
            continue;
        }

        if (lib.name.includes('com.google.guava:guava:')) {
            const versionMatch = lib.name.match(/com\.google\.guava:guava:([\d.]+)/);
            if (versionMatch) {
                const currentVersion = versionMatch[1];
                if (!libraryConflicts.has('guava')) libraryConflicts.set('guava', new Set());
                const registeredVersions = libraryConflicts.get('guava');
                const existingVersion = registeredVersions.size > 0 ? (Array.from(registeredVersions)[0] as string) : '0.0';
                const currentMajor = parseInt(currentVersion?.split('.')[0] || '0');
                const existingMajor = parseInt(existingVersion.split('.')[0] || '0');
                if (currentMajor > existingMajor) {
                    if (options?.enableDebug) emitter.emit("debug",`[ UPGRADING ] Guava: ${existingVersion} -> ${currentVersion}. Priorizando para evitar errores de lanzamiento.`);
                    registeredVersions.clear();
                    registeredVersions.add(currentVersion);
                } else if (currentMajor < existingMajor) {
                    if (options?.enableDebug) emitter.emit("debug",`[ SKIPPING ] older Guava: ${currentVersion} (Keeping ${existingVersion})`);
                    continue;
                } else if (registeredVersions.size > 0 && currentMajor === existingMajor) {
                    if (options?.enableDebug) emitter.emit("debug",`[ SKIPPING ] duplicate Guava version: ${currentVersion}`);
                    continue;
                }
                if (registeredVersions.size === 0) registeredVersions.add(currentVersion);
            }
        }

        if (isLegacy) {
            let libPath: string | null = null;
            if (lib.natives && lib.downloads?.classifiers) {
                const nativeKey = lib.natives[osCache];
                if (nativeKey) {
                    const nativeClassifier = nativeKey.replace("${arch}", archCache === "x64" ? "64" : "32");
                    const nativeArtifact = lib.downloads.classifiers[nativeClassifier];
                    if (nativeArtifact) {
                        libPath = resolve(libraryRoot, nativeArtifact.path);
                        if (options?.enableDebug) emitter.emit("debug",`Using native classifier for ${lib.name}: ${nativeClassifier}`);
                    }
                }
            }
            if (!libPath && lib.downloads?.artifact) libPath = resolve(libraryRoot, lib.downloads.artifact.path);
            if (!libPath) {
                try {
                    const relativePath = libraryNameToPath(lib.name);
                    libPath = resolve(libraryRoot, relativePath);
                } catch (error) {
                    if (options?.enableDebug) emitter.emit("warn",`No se pudo generar ruta para librería: ${lib.name}`, error);
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
                        emitter.emit("debug",`Añadido a classpath (legacy): ${libPath}`);
                        if (lib.name.includes('lwjgl')) emitter.emit("debug",`[ LWJGL Nativo agregado ]: ${lib.name} -> ${libPath}`);
                    }
                } catch (error) {
                    if (options?.enableDebug) emitter.emit("warn",`Libreria no encontrada (legacy): ${libPath}`);
                }
            }
            continue;
        }

        if (lib.natives) {
            const nativeKey = lib.natives[osCache];
            if (nativeKey && lib.downloads?.classifiers) {
                const nativeClassifier = nativeKey.replace("${arch}", archCache === "x64" ? "64" : "32");
                const nativeArtifact = lib.downloads.classifiers[nativeClassifier];
                if (nativeArtifact) {
                    const nativePath = resolve(libraryRoot, nativeArtifact.path);
                    try {
                        await fs.access(nativePath);
                        const fileName = basename(nativePath);
                        const destPath = resolve(nativesDir, fileName);
                        try {
                            await fs.copyFile(nativePath, destPath);
                            if (options?.enableDebug) emitter.emit("debug",`Biblioteca nativa copiada: ${fileName} -> ${nativesDir}`);
                        } catch (copyError) {
                            if (options?.enableDebug) emitter.emit("warn",`Error copiando librería nativa: ${fileName}`, copyError);
                        }
                        libraryCount++;
                        if (options?.enableDebug) emitter.emit("debug",`Biblioteca nativa procesada: ${nativePath}`);
                    } catch (error) {
                        if (options?.enableDebug) emitter.emit("warn",`Libreria nativa no encontrada: ${nativePath}`);
                    }
                }
            }
            continue;
        }
        let libPath: string | null = null;

        if (lib.downloads?.artifact) libPath = resolve(libraryRoot, lib.downloads.artifact.path);
        else {
            try {
                const relativePath = libraryNameToPath(lib.name);
                libPath = resolve(libraryRoot, relativePath);
            } catch (error) {
                if (options?.enableDebug) emitter.emit("warn",`No se pudo procesar librería: ${lib.name}`, error);
                continue;
            }
        }
        if (!processedPaths.has(libPath)) {
            try {
                await fs.access(libPath);
                classpath.push(libPath);
                processedPaths.add(libPath);
                libraryCount++;
                if (options?.enableDebug) emitter.emit("debug",`Added to classpath: ${libPath}`);
            } catch (error) {
                if (options?.enableDebug) emitter.emit("warn",`Librería no encontrada: ${libPath}`);
            }
        }
    }

    const guavaLibraries = classpath.filter(path => path.includes('guava'));
    if (guavaLibraries.length > 1 && options?.enableDebug) {
        emitter.emit("debug", `[ ADVERTENCIA ]: Aun hay ${guavaLibraries.length} versiones de Guava:`);
        guavaLibraries.forEach(lib => emitter.emit("debug", `   - ${lib}`));
        const guava15 = classpath.find(path => path.includes('guava-15.0'));
        if (guava15) {
            const index = classpath.indexOf(guava15);
            classpath.splice(index, 1);
            libraryCount--;
            emitter.emit("debug", `[ ELIMINADO ] No se añadio al classpath : ${guava15}`);
        }
    }

    if (options?.enableDebug) {
        try {
            const nativeFiles = await fs.readdir(nativesDir);
            emitter.emit("debug", `Archivos en directorio de nativas (${nativeFiles.length}):`);
            nativeFiles.forEach(file => emitter.emit("debug", `   - ${file}`));

            let criticalNatives: string[] = [];
            switch (osCache) {
                case 'windows':
                    if (archCache === 'x64') criticalNatives = ['lwjgl.dll', 'OpenAL32.dll', 'jinput-dx8_64.dll'];
                    else criticalNatives = ['lwjgl.dll', 'OpenAL32.dll', 'jinput-dx8.dll'];
                    break;
                case 'linux':
                    if (archCache === 'x64') {
                        criticalNatives = ['liblwjgl.so', 'liblwjgl64.so', 'libopenal.so', 'libopenal64.so', 'libjinput-linux.so', 'libjinput-linux64.so'];
                    } else criticalNatives = ['liblwjgl.so', 'libopenal.so', 'libjinput-linux.so'];
                    break;
                case 'osx':
                    criticalNatives = ['liblwjgl.dylib', 'libopenal.dylib', 'libjinput-osx.dylib'];
                    break;
                default:
                criticalNatives = [];
            }
            
            const missingNatives = criticalNatives.filter(native => {
                if (osCache === 'linux') {
                    const baseName = native.replace('64', '');
                    const exists = nativeFiles.some(file => file === native || (file.includes(baseName) && file.endsWith('.so')));
                    return !exists;
                }
                return !nativeFiles.includes(native);
            });

            if (missingNatives.length > 0) {
                emitter.emit("debug", `[ ADVERTENCIA ]: Archivos nativos críticos faltantes para ${osCache} (${archCache}):`);
                emitter.emit("debug", ` Esperados: ${criticalNatives.filter(n => !n.includes('64') || archCache === 'x64').join(', ')}`);
                emitter.emit("debug", ` Encontrados: ${nativeFiles.join(', ')}`);
                
                const similarFiles = nativeFiles.filter(file => file.includes('lwjgl') || file.includes('openal') || file.includes('jinput'));
                if (similarFiles.length > 0) emitter.emit("debug", `Archivos similares encontrados: ${similarFiles.join(', ')}`);
            } else emitter.emit("debug", `Sistema ${osCache} (${archCache}): Nativos correctamente extraídos`);
        } catch (error) {
            emitter.emit("warn",`No se pudo leer directorio de nativas: ${nativesDir}`, error);
        }
    }
    
    if (options?.enableDebug) {
        emitter.emit("debug", `Final classpath for ${version}:`);
        classpath.forEach((path, index) => emitter.emit("debug", `  [${index + 1}] ${path}`));
        const lwjglLibraries = classpath.filter(path => path.includes('lwjgl') || path.includes('LWJGL'));
        emitter.emit("debug", `LWJGL libraries in classpath: ${lwjglLibraries.length}`);
        lwjglLibraries.forEach(lib => emitter.emit("debug", `  - ${lib}`));
    }
    
    return { classpath, nativesDir, libraryCount };
}

function buildJVMArgs(options: LauncherOptions, manifest: VersionManifest, classpath: string[], nativesDir: string, emitter: EventEmitter): string[] {
    const jvmArgs: string[] = [];
    const memory = options.memory;
    const jvmCustomArgs = options.JVM_ARGS || [];
    const libraryRoot = options.override?.libraryRoot || resolve(options.gameRoot, "libraries");
    const isLegacy = isLegacyVersion(manifest);
    const gameDirectory = options.override?.gameDirectory || resolve(options.gameRoot);
    
    if (isLegacy) {
        jvmArgs.push(`-Duser.home=${gameDirectory}`);
    }
    if (memory?.min) jvmArgs.push(`-Xms${memory.min}`);
    if (memory?.max) jvmArgs.push(`-Xmx${memory.max}`);
    
    jvmArgs.push(`-Djava.library.path=${nativesDir}`);
    jvmArgs.push(`-Dorg.lwjgl.librarypath=${nativesDir}`);
    jvmArgs.push("-Dfml.ignoreInvalidMinecraftCertificates=true");
    jvmArgs.push("-Dfml.ignorePatchDiscrepancies=true");
    jvmArgs.push("-XX:+UseG1GC");
    jvmArgs.push("-XX:+UnlockExperimentalVMOptions");
    jvmArgs.push("-XX:G1NewSizePercent=20");
    jvmArgs.push("-XX:G1ReservePercent=20");
    jvmArgs.push("-XX:MaxGCPauseMillis=50");
    jvmArgs.push("-XX:G1HeapRegionSize=32M");
    jvmArgs.push(`-Dorg.lwjgl.librarypath=${nativesDir}`);
    jvmArgs.push(`-Dminecraft.client.jar=${getClientJarPath(options.gameRoot, options.version, manifest, options.override)}`);
    jvmArgs.push(`-DlibraryDirectory=${libraryRoot}`);
    
    if (manifest.arguments?.jvm) {
        for (const arg of manifest.arguments.jvm) {
            if (typeof arg === "string") {
                const processedArg = processJVMArgument(arg, options, nativesDir);
                if (processedArg && processedArg.trim() !== "") jvmArgs.push(processedArg);
            } else if (arg.value && satisfiesAllRules(arg.rules, options.features)) {
                const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                for (const value of values) {
                    const processedArg = processJVMArgument(value, options, nativesDir);
                    if (processedArg && processedArg.trim() !== "") jvmArgs.push(processedArg);
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

export async function ArgumentsBuilder(options: LauncherOptions): Promise<LaunchResult> {
    const emitter = new EventEmitter();
    const tracker = new PerformanceTracker();
    const totalStartTime = Date.now();
    const root = resolve(options.gameRoot);
    const stats = { totalTime: 0, phaseTimes: {} as Record<string, number>, classpathCount: 0, libraryCount: 0 };
    
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
        
        const { classpath, nativesDir, libraryCount } = await processLibraries(root, options.version, manifest.libraries, manifest, emitter,options.override, options);
        const clientJar = getClientJarPath(root, options.version, manifest, options.override);
        try {
            await fs.access(clientJar);
            classpath.push(clientJar);
        } catch (error) {
            throw new Error(`Client JAR no encontrado: ${clientJar}`);
        }
        
        const librariesTime = tracker.end("libraries-processing");
        stats.classpathCount = classpath.length;
        stats.libraryCount = libraryCount;
        emitter.emit("phase-end", "libraries-processing", librariesTime);
        emitter.emit("speed", { phase: "libraries-processing", time: librariesTime, classpathCount: classpath.length, libraryCount: libraryCount, isLegacy: isLegacyVersion(manifest) });
        
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
        if (!manifest.mainClass) throw new Error("mainClass does not exist in manifest");
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
                features: options.features,
                isLegacy: isLegacyVersion(manifest)
            });
        }
        tracker.start("game-launch");
        
        emitter.emit("status", "Starting Minecraft...");
        emitter.emit("phase-start", "game-launch");
        const gameDirectory = options.override?.gameDirectory || root;
        
        emitter.emit("launch-start", {
            javaExec,
            mainClass: manifest.mainClass,
            jvmArgsCount: jvmArgs.length,
            gameArgsCount: gameArgs.length,
            nativesDir: nativesDir,
            gameDirectory: gameDirectory,
            memory: options.memory,
            window: options.window,
            features: options.features,
            isLegacy: isLegacyVersion(manifest)
        });
        
        const child = spawn(javaExec, finalArgs, { cwd: gameDirectory, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
        const launchTime = tracker.end("game-launch");
        
        emitter.emit("phase-end", "game-launch", launchTime);
        
        emitter.emit("speed", {
            phase: "game-launch",
            time: launchTime
        });
        
        stats.totalTime = Date.now() - totalStartTime;
        stats.phaseTimes = tracker.getPhaseTimes();
        
        emitter.emit("launch-complete", {
            pid: child.pid,
            totalTime: stats.totalTime,
            phaseTimes: stats.phaseTimes,
            classpathCount: stats.classpathCount,
            libraryCount: stats.libraryCount,
            isLegacy: isLegacyVersion(manifest)
        });
        
        child.stdout?.on("data", (d: Buffer) => {
            const output = d.toString();
            emitter.emit("stdout", output);
            if (output.includes("Loading")) emitter.emit("progress", { type: "loading", message: output.trim() });
            else if (output.includes("Preparing")) emitter.emit("progress", { type: "preparing", message: output.trim() });
            if (output.includes("Game crashed!")) emitter.emit("error", new Error("Game crashed"));
        });
        
        child.stderr?.on("data", (d: Buffer) => {
            const output = d.toString();
            if (!output.includes("Render Extensions") && !output.includes("Datafixer") && !output.includes("OpenGL") && !output.includes("Failed to get system info")) emitter.emit("stderr", output);
            if (output.includes("ERROR") || output.includes("Exception")) emitter.emit("game-error", output);
        });
        
        child.on("close", (code, signal) => {
            emitter.emit("exit", { code: code ?? undefined, signal: signal ?? undefined });
            emitter.emit("game-exit", { code, signal, totalTime: stats.totalTime });
        });
        
        child.on("error", (error) => {
            emitter.emit("error", error);
            emitter.emit("game-error", error.message);
        });
        
        child.on("spawn", () => {
            emitter.emit("game-started", { pid: child.pid });
        });
        
        return { emitter, pid: child.pid!, kill: () => child.kill(), stats };
    } catch (error) {
        stats.totalTime = Date.now() - totalStartTime;
        emitter.emit("error", error);
        emitter.emit("launch-failed", { error, totalTime: stats.totalTime });
        throw error;
    }
}
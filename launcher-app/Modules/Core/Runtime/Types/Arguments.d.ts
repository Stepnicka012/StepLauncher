import type { EventEmitter } from "node:events";
export interface LauncherOptions {
    gameRoot: string;
    version: string;
    java?: string;
    memory?: { min?: string; max?: string };
    window?: { width?: number; height?: number; fullscreen?: boolean };
    override?: {
        gameDirectory?: string;
        minecraftJar?: string;
        versionJson?: string;
        assetRoot?: string;
        assetIndex?: string;
        libraryRoot?: string;
        natives?: string;
        thisBaseRootNatives?: boolean;
        directory?: string;
    };
    user: User;
    features?: Record<string, boolean>;
    launcherName?: string;
    launcherVersion?: string;
    enforceSandbox?: boolean;
    enableDebug?: boolean;
    enableSpeedMetrics?: boolean;
    JVM_ARGS?: string[];
    MC_ARGS?: Record<string, string | boolean | number>;
}

export interface User {
    access_token?: string;
    client_token?: string;
    uuid?: string;
    name?: string;
    user_profiles?: string;
    meta?: { online?: boolean; type?: string };
}

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
    arguments?: { game: Argument[]; jvm: Argument[] };
    minecraftArguments?: string;
    libraries: Library[];
    inheritsFrom?: string;
    jar?: string;
    assets?: string;
    assetIndex?: AssetIndex;
    type?: string;
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
    os?: { name?: string; version?: string; arch?: string };
    features?: Record<string, boolean>;
}

export interface Library {
    name: string;
    downloads: {
        artifact?: { path: string; url: string; sha1: string; size: number };
        classifiers?: {
            [key: string]: { path: string; url: string; sha1: string; size: number };
        };
    };
    rules?: Rule[];
    extract?: { exclude: string[] };
    natives?: { [key: string]: string };
    checksums?: string[];
}

export interface LaunchResult {
    emitter: EventEmitter;
    pid?: number;
    kill: () => boolean;
    stats: { totalTime: number; phaseTimes: Record<string, number>; classpathCount: number; libraryCount: number };
}



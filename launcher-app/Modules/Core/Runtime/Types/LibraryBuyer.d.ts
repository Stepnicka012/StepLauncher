export interface LibraryManagerOptions {
    root: string;
    version: string;
    versionJsonPath?: string;
    forceDownload?: boolean;
    concurry?: number;
    maxRetries?: number;
}

export interface VersionJson {
    id: string;
    libraries: Library[];
    inheritsFrom?: string;
    downloads?: {
        client?: {
            url: string;
            sha1: string;
            size: number;
        };
    };
}

export interface Library {
    name: string;
    downloads?: {
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
    url?: string;
    serverreq?: boolean;
    clientreq?: boolean;
    checksums?: string[];
    rules?: any[];
    natives?: {
        [key: string]: string;
    };
}

export interface DownloadResult {
    success: boolean;
    filePath: string;
    size: number;
    error?: string;
}

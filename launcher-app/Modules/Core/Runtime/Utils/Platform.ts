export const archCache = process.arch;
export const OS_TYPES = { windows: "windows", linux: "linux", osx: "osx" } as const;
export type OSType = (typeof OS_TYPES)[keyof typeof OS_TYPES];

export const osCache: OSType = (() => {
    switch (process.platform) {
        case "win32": return OS_TYPES.windows;
        case "darwin": return OS_TYPES.osx;
        default: return OS_TYPES.linux;
    }
})();
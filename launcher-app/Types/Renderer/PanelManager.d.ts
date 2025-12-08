export type PanelDef = {
    name: string;
    url: string;
};

export type PanelsManagerOptions = {
    containerSelector?: string;
    executeScripts?: boolean;
    fetchInit?: RequestInit;
};

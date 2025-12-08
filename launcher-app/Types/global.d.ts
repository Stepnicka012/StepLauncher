import LangManager from '../Modules/App/LangManager.ts';

export interface ElectronAPI {
  controlWindow(action:string): string;
  openExternal(url:string): string;
}

export interface IElectronPinoAPI {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  getLogPath(): string;
  readLogs(): Promise<string>;
  clearLogs(): Promise<void>;
  setLevel(level: string): void;
  getLevel(): string;
}

export interface LangAPI {
    getText: (key: string, context?: any) => string;
    setLang: (lang: string) => void;
    getCurrentLang: () => string;
    getAvailableLangs: () => string[];
    reload: () => void;
    applyToDOM: () => void;
    onLangChanged: (callback: (lang: string) => void) => void;
    changeLanguage: (lang: string) => void;
}

declare global {
  interface Window {
    LangAPI: LangAPI | LangManager;
    ElectronPino: IElectronPinoAPI;
    ElectronAPI:  ElectronAPI;
  }
}
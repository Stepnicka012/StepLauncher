import LangManager from '../Modules/App/LangManager.ts';

export interface ElectronAPI {
  /** Controla las operaciones de la ventana (minimizar, maximizar, cerrar) */
  controlWindow(action: string): string;
  /** Abre una URL externa en el navegador por defecto */
  openExternal(url: string): void;
  /** Obtiene la memoria RAM total del sistema en MB */
  getTotalRAM(): Promise<number>;
}

export interface IStepLauncherLoggerAPI {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  getMemoryHistory(): Promise<string[]>;
  getLogPath(): string;
  readLogs(): Promise<string>;
  clearLogs(): Promise<void>;
  setLevel(level: string): void;
  getLevel(): string;
}

export interface LangAPI {
    /** Obtiene el texto traducido para una clave específica */
    getText: (key: string, context?: any) => string;
    /** Aplica las traducciones a los elementos del DOM */
    applyToDOM: () => void;
    /** Obsoleto - Use getText en su lugar */
    setLang?: (lang: string) => void;
    /** Obsoleto - Use getText en su lugar */
    getCurrentLang?: () => string;
    /** Obsoleto */
    getAvailableLangs?: () => string[];
    /** Obsoleto */
    reload?: () => void;
    /** Obsoleto */
    onLangChanged?: (callback: (lang: string) => void) => void;
    /** Obsoleto */
    changeLanguage?: (lang: string) => void;
    /** Obsoleto */
    reloadLang?: () => void;
}

declare global {
  interface Window {
    LangAPI: LangAPI;
    StepLauncherLogger: IStepLauncherLoggerAPI;
    ElectronAPI:  ElectronAPI;
  }
}
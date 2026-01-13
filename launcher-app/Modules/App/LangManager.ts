import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ipcRenderer } from 'electron';
import type { LangManagerData } from '../../Types/App/Config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = () => join(__dirname, '../../../launcher-renderer');

class LangManager {
	private static instance: LangManager;
	private langData: LangManagerData = {};
	private currentLang = 'en';
	private fallbackLang = 'en';
	private langPath: string;
	
	private constructor(langPath?: string) {
		this.langPath = langPath || resolve(PUBLIC_DIR(), './App/Locales');
		this.detectSystemLang();
		this.loadLang(this.currentLang);
	}
	
	public static init(langPath?: string): LangManager {
		if (!LangManager.instance) { LangManager.instance = new LangManager(langPath); }
		return LangManager.instance;
	}
	
	public static getInstance(): LangManager {
		if (!LangManager.instance) { throw new Error('LangManager no inicializado. Llama a init() primero.'); }
		return LangManager.instance;
	}
	
	private detectSystemLang(): void {
		let sysLang: string | undefined;
		
		try {
			if (typeof ipcRenderer !== 'undefined') { sysLang = ipcRenderer.sendSync('get-system-locale'); }
			if (!sysLang && typeof process !== 'undefined' && process.env) { sysLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES; }
			if (!sysLang && typeof navigator !== 'undefined') { sysLang = navigator.language || (navigator as any).userLanguage; }
			if (sysLang) { this.currentLang = sysLang.split(/[-_]/)[0] || this.fallbackLang; }
			else { this.currentLang = this.fallbackLang; }
		} catch { this.currentLang = this.fallbackLang; }
	}
	
	public setLang(lang: string): void {
		const normalizedLang = lang.split('-')[0];
		if (normalizedLang) {
			this.currentLang = normalizedLang;
			this.loadLang(normalizedLang);
			this.applyToDOM();
		}
	}
	
	public getCurrentLang(): string { return this.currentLang; }
	
	public loadLang(lang: string): void {
		const filePath = join(this.langPath, `${lang}.json`);
		try {
			if (!existsSync(filePath)) {
				if (lang !== this.fallbackLang) this.loadLang(this.fallbackLang);
				return;
			}
			const fileContent = readFileSync(filePath, 'utf-8');
			this.langData = JSON.parse(fileContent);
		} catch { if (lang !== this.fallbackLang) this.loadLang(this.fallbackLang); }
	}
	
	public getText(key: string): string {
		const keys = key.split('.');
		let value: any = this.langData;
		
		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) { value = value[k]; }
			else { return key; }
		}
		return typeof value === 'string' ? value : key;
	}
	
	public applyToDOM(root: Element = document.documentElement): void {
		if (typeof document === 'undefined') return;
		const elements = root.querySelectorAll('[data-lang]');
		elements.forEach(element => {
			const key = element.getAttribute('data-lang');
			if (!key) return;
			const text = this.getText(key);
			if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') { (element as HTMLInputElement).placeholder = text; }
			else {element.textContent = text; }
		});
	}
}

export function getLangText(key: string): string { return LangManager.getInstance().getText(key); }

if (typeof window !== 'undefined') {
	if ((window as any).process?.type === 'renderer') {
		const langManager = LangManager.init();
		const apply = () => langManager.applyToDOM();
		if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', apply); }
		else { apply(); }
	}
}

export default LangManager;

import type { LangData } from '../../Types/Renderer/News.js';

class LangManager {
    private langData: LangData = {};

    constructor() {
        this.setupMessageListener();
        window.iframeMessenger.success('News-LangManager listo - Esperando mensajes del padre');
    }

    private setupMessageListener(): void {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'LANG_DATA') {
                window.iframeMessenger.success('Recibiendo datos de idioma:', event.data);
                this.langData = event.data.data;
                this.applyToDOM();
            }
            
            if (event.data.type === 'CHANGE_LANG') {
                window.iframeMessenger.success('Cambiando idioma a:', event.data.lang);
            }
        });
    }

    private getText(key: string): string {
        return this.langData[key] || key;
    }

    private applyToDOM(): void {
        const elements = document.querySelectorAll('[data-lang]');
        window.iframeMessenger.success(`Aplicando idioma a ${elements.length} elementos`);
        
        elements.forEach(element => {
            const key = element.getAttribute('data-lang');
            if (!key) return;
            
            const text = this.getText(key);
            
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                (element as HTMLInputElement).placeholder = text;
            } else {
                element.textContent = text;
            }
        });

        // Guardar traducciones útiles como dataset para piezas dinámicas
        try {
            const hide = this.langData['HideNews'] || this.langData['hideNews'] || this.langData['Hide'] || null;
            const show = this.langData['ShowNews'] || this.langData['showNews'] || this.langData['Show'] || null;
            const label = document.getElementById('HiddenButtonLabel');
            if (label) {
                if (hide) (label as HTMLElement).dataset.hide = hide;
                if (show) (label as HTMLElement).dataset.show = show;
            }
        } catch (e) {
            window.iframeMessenger.error('Error almacenando datasets de idioma', e);
        }
    }
}

const langManager = new LangManager();
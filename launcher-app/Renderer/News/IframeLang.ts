type LangData = { [key: string]: string };

class LangManager {
    private langData: LangData = {};

    constructor() {
        this.setupMessageListener();
        window.iframeMessenger.success('🌐 Iframe LangManager listo - Esperando mensajes del padre');
    }

    private setupMessageListener(): void {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'LANG_DATA') {
                window.iframeMessenger.success('📦 Recibiendo datos de idioma:', event.data);
                this.langData = event.data.data;
                this.applyToDOM();
            }
            
            if (event.data.type === 'CHANGE_LANG') {
                window.iframeMessenger.success('🔄 Cambiando idioma a:', event.data.lang);
            }
        });
    }

    private getText(key: string): string {
        return this.langData[key] || key;
    }

    private applyToDOM(): void {
        const elements = document.querySelectorAll('[data-lang]');
        window.iframeMessenger.success(`🎯 Aplicando idioma a ${elements.length} elementos`);
        
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
    }
}

const langManager = new LangManager();
import type { LinkClickMessage, LangDataMessage, IframeMessage } from '../../Types/Renderer/Launcher.js';
import { LoaderScreen } from '../Global/Loader.js';

class IframeMessageHandler {
    private iframe: HTMLIFrameElement;

    constructor(iframeId: string = 'IframeNews') {
        const iframeEl = document.getElementById(iframeId) as HTMLIFrameElement;
        if (!iframeEl) throw new Error(`Iframe con id '${iframeId}' no encontrado`);
        this.iframe = iframeEl;

        this.setupMessageHandler();
    }

    public async init(): Promise<void> {
        await this.waitForIframeLoad();
        this.sendLangData();
    }

    private waitForIframeLoad(): Promise<void> {
        return new Promise((resolve) => {
            if (this.iframe.contentDocument?.readyState === 'complete') {
                resolve();
            } else {
                this.iframe.addEventListener('load', () => resolve(), { once: true });
            }
        });
    }

    private setupMessageHandler(): void {
        window.addEventListener('message', (event: MessageEvent<IframeMessage>) => {
            this.handleMessage(event.data);
        });
    }

    private handleMessage(message: IframeMessage): void {
        switch (message.type) {
            case 'LINK_CLICK': this.handleLinkClick(message as LinkClickMessage); break;
            case 'SUCCESS': this.handleSuccess(message); break;
            case 'ERROR': this.handleError(message); break;
            default:
                window.StepLauncherLogger.log('Mensaje desconocido del News-Iframe:', message);
        }
    }

    private handleLinkClick(message: LinkClickMessage): void {
        window.StepLauncherLogger.log('Enlace clickeado en News-Iframe:', message);
        window.ElectronAPI.openExternal(message.data.href);
    }

    private handleSuccess(message: any): void {
        window.StepLauncherLogger.info('Éxito desde iframe:', message);
    }

    private handleError(message: any): void {
        window.StepLauncherLogger.error('Error desde iframe:', message);
    }

    private sendLangData(): void {
        const langData = {
            filter_all: window.LangAPI.getText("NewsIframe.All"),
            filter_release: window.LangAPI.getText("NewsIframe.Releases"),
            filter_snapshots: window.LangAPI.getText("NewsIframe.Snapshots"),
            filter_steplauncher: window.LangAPI.getText("NewsIframe.StepLauncher"),
            LoadMore: window.LangAPI.getText("NewsIframe.LoadMore"),
            Reload: window.LangAPI.getText("NewsIframe.Reload"),
            HideNews: window.LangAPI.getText("NewsIframe.HideNews"),
            ShowNews: window.LangAPI.getText("NewsIframe.ShowNews")
        };

        const message: LangDataMessage = {
            type: 'LANG_DATA',
            data: langData,
            timestamp: Date.now()
        };

        this.iframe.contentWindow?.postMessage(message, '*');
        window.StepLauncherLogger.log('Datos de idioma enviados al News-Iframe:', langData);
    }

    public sendToIframe(message: any): void {
        this.iframe.contentWindow?.postMessage({
            ...message,
            timestamp: Date.now()
        }, '*');
    }
}

async function initializeApp(): Promise<void> {
    try {
        const iframeHandler = new IframeMessageHandler('IframeNews');
        await iframeHandler.init();

        // Si tienes más componentes, inicialízalos aquí
        // await anotherComponent.init();
        
        window.StepLauncherLogger.info('Aplicación inicializada');
        LoaderScreen.open();
    } catch (error) {
        window.StepLauncherLogger.fatal("ERROR en la carga de componentes:", error);
    }
}

initializeApp();

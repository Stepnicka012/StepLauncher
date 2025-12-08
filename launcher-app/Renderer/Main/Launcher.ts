import type { LinkClickMessage, LangDataMessage, IframeMessage } from '../../Types/Renderer/Launcher.js';
import '../Global/Global.js';
import './PanelsManager.js';

class IframeMessageHandler {
  private iframe: HTMLIFrameElement;

  constructor(iframeId: string = 'IframeNews') {
    this.iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    this.setupMessageHandler();
    this.setupIframeLoader();
  }

  private setupMessageHandler(): void {
    window.addEventListener('message', (event: MessageEvent<IframeMessage>) => {
      this.handleMessage(event.data);
    });
  }

  private handleMessage(message: IframeMessage): void {
    switch (message.type) {
      case 'LINK_CLICK':
        this.handleLinkClick(message as LinkClickMessage);
        break;
        
      case 'SUCCESS':
        this.handleSuccess(message);
        break;
        
      case 'ERROR':
        this.handleError(message);
        break;
        
      default:
        window.ElectronPino.log('📨 Mensaje desconocido del iframe:', message);
        break;
    }
  }

  private handleLinkClick(message: LinkClickMessage): void {
    window.ElectronPino.log('🔗 Enlace clickeado en iframe:', {
      href: message.data.href,
      text: message.data.text,
      iframeId: message.iframeId
    });
    
    window.ElectronAPI.openExternal(message.data.href);
  }

  private handleSuccess(message: any): void {
    window.ElectronPino.info('✅ Éxito desde iframe:', {
      message: message.data.message,
      details: message.data.details,
      iframeId: message.iframeId,
      timestamp: new Date(message.timestamp).toLocaleTimeString()
    });
  }

  private handleError(message: any): void {
    window.ElectronPino.error('❌ Error desde iframe:', {
      message: message.data.message,
      error: message.data.error,
      stack: message.data.stack,
      iframeId: message.iframeId,
      timestamp: new Date(message.timestamp).toLocaleTimeString()
    });
  }

  private setupIframeLoader(): void {
    if (!this.iframe) {
      window.ElectronPino.warn('⚠️ Iframe no encontrado:', this.iframe);
      return;
    }

    this.iframe.addEventListener('load', () => {
      this.sendLangData();
    });

    // También enviar datos si el iframe ya está cargado
    if (this.iframe.contentDocument?.readyState === 'complete') {
      this.sendLangData();
    }
  }

  private sendLangData(): void {
    const langData = {
      filter_all: window.LangAPI.getText("NewsIframe.All"),
      filter_release: window.LangAPI.getText("NewsIframe.Releases"),
      filter_snapshots: window.LangAPI.getText("NewsIframe.Snapshots"),
      filter_steplauncher: window.LangAPI.getText("NewsIframe.StepLauncher")
    };

    const message: LangDataMessage = {
      type: 'LANG_DATA',
      data: langData,
      timestamp: Date.now()
    };

    this.iframe.contentWindow?.postMessage(message, '*');
    window.ElectronPino.log('📤 Datos de idioma enviados al iframe:', langData);
  }

  // Método para enviar otros tipos de mensajes al iframe si es necesario
  public sendToIframe(message: any): void {
    this.iframe.contentWindow?.postMessage({
      ...message,
      timestamp: Date.now()
    }, '*');
  }
}

new IframeMessageHandler('IframeNews');

class IframeMessenger {
  private isInitialized = false;
  private readonly MESSAGE_TARGET_ORIGIN = '*';

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupLinkListener());
    } else {
      this.setupLinkListener();
    }
    
    this.isInitialized = true;
  }

  private sendMessage(type: string, data: any): void {
    const message = {
      type,
      data,
      timestamp: Date.now(),
      iframeId: (window.frameElement as HTMLIFrameElement)?.id || null
    };
    
    window.parent.postMessage(message, this.MESSAGE_TARGET_ORIGIN);
  }

  private sendLinkClick(link: HTMLAnchorElement): void {
    const linkData = {
      href: link.href,
      text: link.textContent?.trim() || ''
    };
    
    this.sendMessage('LINK_CLICK', linkData);
  }

  public success(message: string, details?: any): void {
    const successData = {
      message,
      details: details || null
    };
    
    this.sendMessage('SUCCESS', successData);
  }

  public error(message: string, errorDetails?: any): void {
    const errorData = {
      message,
      error: errorDetails || null,
      stack: errorDetails instanceof Error ? errorDetails.stack : null
    };
    
    this.sendMessage('ERROR', errorData);
  }

  private setupLinkListener(): void {
    document.addEventListener('click', (event) => {
      const element = event.target as Element;
      const link = element.closest('a');
      
      if (link && link.href) {
        event.preventDefault();
        this.sendLinkClick(link);
      }
    });
  }
}

declare global {
  interface Window {
    iframeMessenger: IframeMessenger;
  }
}

const iframeMessenger = new IframeMessenger();

if (typeof window !== 'undefined') {
  window.iframeMessenger = iframeMessenger;
}

export default iframeMessenger;
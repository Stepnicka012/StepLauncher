// Loader (corrección)
export const LoaderScreen = (() => {
    let isOpen: boolean = false;
    let isLoading: boolean = false;
    let loaderElement: HTMLElement | null = null;
    let topElement: HTMLElement | null = null;
    let bottomElement: HTMLElement | null = null;
    let textElement: HTMLElement | null = null;
    
    const initElements = (): boolean => {
        loaderElement = document.querySelector('.App-LoaderScreen-UI');
        topElement = document.querySelector('.App-LoaderScreen-Top');
        bottomElement = document.querySelector('.App-LoaderScreen-Bottom');
        textElement = document.querySelector('.App-LoaderScreen-Text');
        
        if (!loaderElement) {
            console.warn('LoaderScreen: Elemento .App-LoaderScreen-UI no encontrado');
            return false;
        }
        
        return true;
    };
    
    interface LoaderScreenMethods {
        init(): boolean;
        open(customText?: string | null): void;
        close(): void;
        setText(text: string): void;
        isOpen(): boolean;
        isLoading(): boolean;
        showFor(duration: number, text?: string | null): void;
        simulateLoad(duration?: number, onProgress?: ((progress: number) => void) | null): void;
    }
    
    const methods: LoaderScreenMethods = {
        init(): boolean {
            if (!initElements()) return false;
            // Aseguramos estado inicial cerrado
            this.close();
            return true;
        },
        
        open(customText: string | null = null): void {
            if (!loaderElement && !initElements()) return;
            
            if (customText && textElement) {
                textElement.textContent = customText;
            }
            
            // CORRECCIÓN: quitar el estado "cerrado" y poner el estado "open/complete"
            loaderElement!.classList.remove('App-LoadScreen');
            loaderElement!.classList.add('App-LoadComplete');
            
            if (topElement) {
                topElement.classList.remove('Close');
                topElement.classList.add('Open');
            }
            
            if (bottomElement) {
                bottomElement.classList.remove('Close');
                bottomElement.classList.add('Open');
            }
            
            isOpen = true;
            isLoading = true;
        },
        
        close(): void {
            if (!loaderElement && !initElements()) return;
            
            // volver al estado "cerrado"
            loaderElement!.classList.remove('App-LoadComplete');
            loaderElement!.classList.add('App-LoadScreen');
            
            if (topElement) {
                topElement.classList.remove('Open');
                topElement.classList.add('Close');
            }
            
            if (bottomElement) {
                bottomElement.classList.remove('Open');
                bottomElement.classList.add('Close');
            }
            
            isOpen = false;
            isLoading = false;
        },
        
        setText(text: string): void {
            if (!textElement && !initElements()) return;
            
            if (textElement) {
                textElement.textContent = text;
            }
        },

        isOpen(): boolean {
            return isOpen;
        },
        
        isLoading(): boolean {
            return isLoading;
        },
        
        showFor(duration: number, text: string | null = null): void {
            this.open(text);
            setTimeout(() => this.close(), duration);
        },
        
        simulateLoad(duration: number = 3000, onProgress: ((progress: number) => void) | null = null): void {
            this.open();
            isLoading = true;
            
            const startTime: number = Date.now();
            const interval: number = 50; // ms
            let elapsed: number = 0;
            
            const update = (): void => {
                elapsed = Date.now() - startTime;
                const progress: number = Math.min(100, Math.floor((elapsed / duration) * 100));
                
                if (onProgress && typeof onProgress === 'function') {
                    onProgress(progress);
                }
                
                if (elapsed < duration) {
                    setTimeout(update, interval);
                } else {
                    this.close();
                }
            };
            
            update();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => methods.init());
    } else {
        setTimeout(() => methods.init(), 0);
    }
    
    return methods;
})();

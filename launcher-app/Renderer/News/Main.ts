import type { MinecraftNewsItem } from '../../Types/Renderer/News.js';
import { NewsService, NewsFetchError } from './NewsService.js';
import { NewsRenderer } from './NewsRenderer.js';
import './IframeMessenger.js';
import './IframeLang.js';

class MinecraftNewsApp {
    private newsService: NewsService;
    private newsRenderer: NewsRenderer;
    private currentLimit: number;
    private currentOffset: number;
    private isLoadingMore: boolean = false;
    private allNews: MinecraftNewsItem[] = [];
    private currentFilter: string = 'all';
    private displayedNews: MinecraftNewsItem[] = [];
    private loadMoreButton: HTMLButtonElement | null;
    private panelNewsSelect: HTMLElement | null;

    constructor() {
        this.newsService = new NewsService();
        this.newsRenderer = new NewsRenderer();
        this.currentLimit = this.newsService.getDefaultLimit();
        this.loadMoreButton = document.getElementById('LoadMore') as HTMLButtonElement;
        this.panelNewsSelect = document.getElementById('SelectNews') as HTMLElement;
        this.currentOffset = 0;
    }

    async initialize(): Promise<void> {
        try {
            await this.loadInitialNews();
            this.setupFilterButtons();
            this.addLimitControls();
            
            window.iframeMessenger.success('Aplicación de noticias inicializada correctamente');
        } catch (error) {
            window.iframeMessenger.error('Error inicializando la aplicación', error);
            this.showErrorMessage('Error al cargar las noticias.');
        }
    }

    private async loadInitialNews(): Promise<void> {
        try {
            this.allNews = await this.newsService.fetchAllNews();

            this.displayedNews = this.allNews.slice(0, this.currentLimit);
            this.newsRenderer.renderNews(this.displayedNews, false);
            this.setupLoadMoreButton();

            window.iframeMessenger.success(
                `Noticias cargadas correctamente - ${this.allNews.length} items encontrados`
            );

        } catch (error) {
            let codeString: string | undefined;
            let statusString: string | undefined;
            let message: string;

            if (error instanceof NewsFetchError) {
                message = error.cause instanceof Error ? error.cause.message : error.message;

                codeString = error.name;

                if (error.status !== undefined) {
                    statusString = `HTTP ${error.status}`;
                } else if (error.cause instanceof Error) {
                    statusString = error.cause.message;
                }
            } else if (error instanceof Error) {
                message = error.message;
                codeString = error.message;
                statusString = undefined;
            } else {
                message = String(error);
                codeString = undefined;
                statusString = undefined;
            }

            window.iframeMessenger.error('Error real cargando noticias', {
                message,
                code: codeString,
                status: statusString
            });

            this.showErrorMessage(
                'No se pudieron cargar las noticias.',
                codeString,
                statusString
            );
        }


    }


    private setupFilterButtons(): void {
        try {
            this.newsRenderer.setupFilterButtons((filterType: string) => {
                this.applyFilter(filterType);
            });
            window.iframeMessenger.success('Botones de filtro configurados correctamente');
        } catch (error) {
            window.iframeMessenger.error('Error configurando botones de filtro', error);
        }
    }

    private applyFilter(filterType: string): void {
        try {
            this.currentFilter = filterType;
            this.currentOffset = 0;
            
            let filteredNews: MinecraftNewsItem[];
            
            if (filterType === 'all') {
                filteredNews = this.allNews;
            } else {
                filteredNews = this.allNews.filter(item => item.type === filterType);
            }

            this.displayedNews = filteredNews.slice(0, this.currentLimit + this.currentOffset);
            this.newsRenderer.renderNews(this.displayedNews, false);
            
            this.updateLoadMoreButtonForFilter(filteredNews.length);
            
            window.iframeMessenger.success(`Filtro aplicado: ${filterType}`, {
                filter: filterType,
                totalFiltered: filteredNews.length,
                displayed: this.displayedNews.length
            });
        } catch (error) {
            window.iframeMessenger.error(`Error aplicando filtro: ${filterType}`, error);
        }
    }

    private updateLoadMoreButtonForFilter(totalFiltered: number): void {
        try {
            if (this.currentFilter === 'all') {
                const totalNews = this.newsService.getTotalNewsCount();
                if (this.currentOffset + this.currentLimit < totalNews) {
                    this.newsRenderer.showLoadMoreButton();
                } else {
                    this.newsRenderer.hideLoadMoreButton();
                }
            } else {
                if (this.displayedNews.length < totalFiltered) {
                    this.newsRenderer.showLoadMoreButton();
                } else {
                    this.newsRenderer.hideLoadMoreButton();
                }
            }
        } catch (error) {
            window.iframeMessenger.error('Error actualizando botón de cargar más', error);
        }
    }

    private setupLoadMoreButton(): void {
        try {
            if (this.currentFilter === 'all') {
                const totalNews = this.newsService.getTotalNewsCount();
                if (this.currentOffset + this.currentLimit < totalNews) {
                    this.newsRenderer.setupLoadMoreButton(() => this.handleLoadMore());
                } else {
                    this.newsRenderer.hideLoadMoreButton();
                }
            } else {
                const filteredNews = this.allNews.filter(item => item.type === this.currentFilter);
                if (this.displayedNews.length < filteredNews.length) {
                    this.newsRenderer.setupLoadMoreButton(() => this.handleLoadMore());
                } else {
                    this.newsRenderer.hideLoadMoreButton();
                }
            }
        } catch (error) {
            window.iframeMessenger.error('Error configurando botón de cargar más', error);
        }
    }

    private async handleLoadMore(): Promise<void> {
        if (this.isLoadingMore) return;
        
        this.isLoadingMore = true;
        this.newsRenderer.setLoadMoreButtonLoading(true);

        try {
            this.currentOffset += this.currentLimit;
            
            let moreNews: MinecraftNewsItem[];
            
            if (this.currentFilter === 'all') {
                moreNews = this.allNews.slice(this.currentOffset, this.currentOffset + this.currentLimit);
            } else {
                const filteredNews = this.allNews.filter(item => item.type === this.currentFilter);
                moreNews = filteredNews.slice(this.currentOffset, this.currentOffset + this.currentLimit);
            }
            
            if (moreNews.length > 0) {
                this.newsRenderer.renderNews(moreNews, true);
                this.setupLoadMoreButton();
                
                window.iframeMessenger.success('Más noticias cargadas correctamente', {
                    count: moreNews.length,
                    offset: this.currentOffset,
                    filter: this.currentFilter
                });
            } else {
                this.newsRenderer.showNoMoreNewsMessage();
                window.iframeMessenger.success('No hay más noticias para cargar');
            }
        } catch (error) {
            window.iframeMessenger.error('Error cargando más noticias', error);
            this.currentOffset -= this.currentLimit;
        } finally {
            this.isLoadingMore = false;
            this.newsRenderer.setLoadMoreButtonLoading(false);
        }
    }

    private addLimitControls(): void {
        try {
            const reloadButton = document.getElementById('Reload') as HTMLButtonElement;
            if (reloadButton) {
                reloadButton.addEventListener('click', () => {
                    this.reloadNews();
                });
            }
            window.iframeMessenger.success('Controles de límite añadidos correctamente');
        } catch (error) {
            window.iframeMessenger.error('Error añadiendo controles de límite', error);
        }
    }

    private async reloadNews(): Promise<void> {
        try {
            this.currentOffset = 0;
            this.currentFilter = 'all';
            this.newsService.clearCache();
            this.newsRenderer.hideNoMoreNewsMessage();
            await this.loadInitialNews();
            
            window.iframeMessenger.success('Noticias recargadas correctamente');
        } catch (error) {
            window.iframeMessenger.error('Error recargando noticias', error);
            this.showErrorMessage('Error al recargar las noticias.');
        }
    }

    private showErrorMessage(message: string, code?: string, status?: string): void {
        try {
            const container = document.getElementById('News-Container');
            if (container) {
                container.innerHTML = `
                <div class="error-message">
                    <img src="../Static/Img/Mobs/creeper_forward.png" decoding="async" loading="eager"/>    
                    <p>${message}</p>
                    ${code ? `<span class="error-code">Error Code: ${code}</span>` : ''}
                    <hr />
                    ${status ? `<span class="error-status">Status: ${status}</span>` : ''}
                </div>`;
                this.loadMoreButton?.style.setProperty('display', 'none');
                this.panelNewsSelect?.style.setProperty('display','none');
            }
            window.iframeMessenger.error('Mostrando mensaje de error al usuario', { message, code, status });
        } catch (error) {
            window.iframeMessenger.error('Error mostrando mensaje de error', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new MinecraftNewsApp();
        app.initialize();
        window.iframeMessenger.success('Aplicación Minecraft News iniciada');
    } catch (error) {   
        window.iframeMessenger.error('Error crítico iniciando la aplicación', error);
    }
});
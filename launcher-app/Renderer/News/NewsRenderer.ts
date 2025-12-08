import type { MinecraftNewsItem } from '../../Types/Renderer/News.js';
import { VisibilityObserver } from './VisibilityObserver.js';

export class NewsRenderer {
    private container: HTMLElement;
    private changelogContainer: HTMLElement;
    private changelogMainContainer: HTMLElement;
    private visibilityObserver: VisibilityObserver;
    private loadMoreButton: HTMLButtonElement | null;
    private filterButtons: NodeListOf<HTMLButtonElement>;

    constructor(
        containerId: string = 'News-Container',
        changelogMainContainerClass: string = '.ChangelogContainer',
        changelogContainerId: string = 'Changelog-Container'
    ) {
        const container = document.getElementById(containerId)!;
        const changelogMainContainer = document.querySelector(changelogMainContainerClass) as HTMLElement;
        const changelogContainer = document.getElementById(changelogContainerId)!;
        
        this.container = container;
        this.changelogMainContainer = changelogMainContainer;
        this.changelogContainer = changelogContainer;
        this.visibilityObserver = new VisibilityObserver();
        this.loadMoreButton = document.getElementById('LoadMore') as HTMLButtonElement;
        this.filterButtons = document.querySelectorAll('.Panel-Item');
        
        // Inicializar contenedor de changelog como oculto
        this.hideChangelog();
    }

    renderNews(newsItems: MinecraftNewsItem[], append: boolean = false): void {
        if (!append) {
            this.container.innerHTML = '';
        }

        newsItems.forEach(item => {
            const newsCard = this.createNewsCard(item);
            this.container.appendChild(newsCard);
        });

        this.observeAllNewsCards();
    }

    private createNewsCard(newsItem: MinecraftNewsItem): HTMLElement {
        const card = document.createElement('div');
        card.className = 'News-Card unvisible';

        const imageUrl = `https://launchercontent.mojang.com${newsItem.image.url}`;
        const formattedDate = this.formatDate(newsItem.date);

        card.innerHTML = `
            <div class="news-card-image">
                <img src="${imageUrl}" alt="${newsItem.image.title}" loading="lazy">
            </div>
            <div class="news-card-content">
                <div class="news-card-header">
                    <span class="news-type ${newsItem.type.toLowerCase()}">${newsItem.type}</span>
                    <span class="news-version">${newsItem.version}</span>
                </div>
                <h3 class="news-title">${newsItem.title}</h3>
                <p class="news-date">${formattedDate}</p>
                <p class="news-short-text">${newsItem.shortText}...</p>
                <button class="changelog-btn" data-content-path="${newsItem.contentPath}">
                    Ver Changelog Completo
                </button>
            </div>
        `;

        const changelogBtn = card.querySelector('.changelog-btn') as HTMLButtonElement;
        if (changelogBtn) {
            changelogBtn.addEventListener('click', () => {
                this.loadChangelog(newsItem.contentPath, newsItem.title);
            });
        }

        return card;
    }

    async loadChangelog(contentPath: string, title: string): Promise<void> {
        try {
            this.showChangelogLoading();
            
            const changelogUrl = `https://launchercontent.mojang.com/v2/${contentPath}`;
            const response = await fetch(changelogUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const changelogData = await response.json();
            this.renderChangelog(changelogData, title);
            
        } catch (error) {
            window.iframeMessenger.success('Error loading changelog:', error);
            this.showChangelogError('Error al cargar el changelog');
        }
    }

    private showChangelogLoading(): void {
        this.container.classList.add('unvisible');
        this.changelogMainContainer.classList.remove('Unvisible');
        this.changelogContainer.innerHTML = `
            <div class="changelog-loading">
                <p>Cargando changelog...</p>
            </div>
        `;
        this.changelogMainContainer.style.display = 'block';
    }

    private renderChangelog(changelogData: any, title: string): void {
        this.changelogMainContainer.classList.remove('Unvisible');
        this.changelogContainer.innerHTML = '';
        
        const changelogModal = document.createElement('div');
        changelogModal.className = 'changelog-modal';
        const changelogContent = this.convertChangelogToHTML(changelogData);
        
        changelogModal.innerHTML = `
            <div class="changelog-header">
                <h2>${title}</h2>
                <button class="close-changelog-btn"><img src="../resources/Svg/close.svg"></button>
            </div>
            <div class="changelog-content">
                ${changelogContent}
            </div>
        `;
        
        this.changelogContainer.appendChild(changelogModal);
        this.changelogMainContainer.style.display = 'block';
        
        const closeBtn = changelogModal.querySelector('.close-changelog-btn') as HTMLButtonElement;
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideChangelog();
            });
        }
        
        // Cerrar al hacer clic fuera del modal
        this.changelogMainContainer.addEventListener('click', (e) => {
            if (e.target === this.changelogMainContainer) {
                this.hideChangelog();
            }
        });
    }

    private convertChangelogToHTML(changelogData: any): string {
        if (changelogData.body) {
            return changelogData.body;
        }
        if (typeof changelogData === 'string') {
            return changelogData;
        }
        if (changelogData.content) {
            return changelogData.content;
        }
        return `<pre>${JSON.stringify(changelogData, null, 2)}</pre>`;
    }

    private showChangelogError(message: string): void {
        this.changelogContainer.innerHTML = `
            <div class="changelog-error">
                <p>${message}</p>
                <button class="retry-changelog-btn">Reintentar</button>
            </div>
        `;
        this.changelogMainContainer.style.display = 'block';
    }

    hideChangelog(): void {
        this.container.classList.remove('unvisible');
        this.changelogMainContainer.classList.add('Unvisible');
        this.changelogMainContainer.style.display = 'none';
        this.changelogContainer.innerHTML = '';
    }

    setupFilterButtons(onFilter: (filterType: string) => void): void {
        this.filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filterType = button.dataset.filter || 'all';
                this.filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                onFilter(filterType);
            });
        });
    }

    private observeAllNewsCards(): void {
        const newsCards = Array.from(this.container.getElementsByClassName('News-Card'));
        this.visibilityObserver.observeElements(newsCards);
    }

    setupLoadMoreButton(onClick: () => void): void {
        if (!this.loadMoreButton) return;
        this.loadMoreButton.addEventListener('click', onClick);
        this.showLoadMoreButton();
    }

    showLoadMoreButton(): void {
        if (this.loadMoreButton) {
            this.loadMoreButton.style.display = 'flex';
            this.setLoadMoreButtonLoading(false);
        }
    }

    hideLoadMoreButton(): void {
        if (this.loadMoreButton) {
            this.loadMoreButton.style.display = 'none';
        }
    }

    setLoadMoreButtonLoading(loading: boolean): void {
        if (!this.loadMoreButton) return;

        const btnText = this.loadMoreButton.querySelector('.btn-text') as HTMLElement;
        const loadingSpinner = this.loadMoreButton.querySelector('.loading-spinner') as HTMLElement;

        if (loading) {
            this.loadMoreButton.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (loadingSpinner) loadingSpinner.style.display = 'inline';
        } else {
            this.loadMoreButton.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (loadingSpinner) loadingSpinner.style.display = 'none';
        }
    }

    showNoMoreNewsMessage(): void {
        this.hideLoadMoreButton();
        const messageContainer = document.getElementById('NoMoreNews-Message');
        if (messageContainer) {
            messageContainer.style.display = 'flex';
        }
    }

    hideNoMoreNewsMessage(): void {
        const messageContainer = document.getElementById('NoMoreNews-Message');
        if (messageContainer) {
            messageContainer.style.display = 'none';
        }
    }

    private formatDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    destroy(): void {
        this.visibilityObserver.disconnect();
        this.hideChangelog();
        if (this.loadMoreButton) {
            this.loadMoreButton.replaceWith(this.loadMoreButton.cloneNode(true));
        }
    }
}
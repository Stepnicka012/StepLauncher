import type { MinecraftNewsItem } from '../../Types/Renderer/News.js';
import { VisibilityObserver } from './VisibilityObserver.js';

export class NewsRenderer {
    private container: HTMLElement;
    private changelogContainer: HTMLElement;
    private changelogMainContainer: HTMLElement;
    private visibilityObserver: VisibilityObserver;
    private loadMoreButton: HTMLButtonElement | null;
    private filterButtons: NodeListOf<HTMLButtonElement>;
    private changelogCache = new Map<string, any>();
    private changelogAbortController: AbortController | null = null;
    private backdropClickHandler: (e: MouseEvent) => void;

    constructor(
        containerId: string = 'News-Container',
        changelogMainContainerClass: string = '.ChangelogContainer',
        changelogContainerId: string = 'Changelog-Container'
    ) {
        this.container = document.getElementById(containerId)!;
        this.changelogMainContainer = document.querySelector(changelogMainContainerClass) as HTMLElement;
        this.changelogContainer = document.getElementById(changelogContainerId) as HTMLElement;
        
        this.visibilityObserver = new VisibilityObserver();
        this.loadMoreButton = document.getElementById('LoadMore') as HTMLButtonElement;
        this.filterButtons = document.querySelectorAll('.Panel-Item');

        this.backdropClickHandler = (e: MouseEvent) => {
            if (e.target === this.changelogMainContainer) { this.hideChangelog(); }
        };

        this.hideChangelog();
    }

    renderNews(newsItems: MinecraftNewsItem[], append: boolean = false): void {
        if (!append) this.container.innerHTML = '';

        newsItems.forEach(item => {
            this.container.appendChild(this.createNewsCard(item));
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
                <img src="${imageUrl}" alt="${newsItem.image.title}" loading="lazy" decoding="async">
            </div>
            <div class="news-card-content">
                <div class="news-card-header">
                    <span class="news-type ${newsItem.type.toLowerCase()}">${newsItem.type}</span>
                    <span class="news-version">${newsItem.version}</span>
                </div>
                <h3 class="news-title">${newsItem.title}</h3>
                <p class="news-date">${formattedDate}</p>
                <p class="news-short-text">${newsItem.shortText}...</p>
                <button class="changelog-btn">Ver Changelog Completo</button>
            </div>
        `;

        card.querySelector('.changelog-btn')!.addEventListener('click', () =>
            this.loadChangelog(newsItem.contentPath, newsItem.title)
        );

        return card;
    }

    async loadChangelog(contentPath: string, title: string): Promise<void> {
        try {
            this.showChangelogLoading();

            if (this.changelogCache.has(contentPath)) {
                this.renderChangelog(
                    this.changelogCache.get(contentPath),
                    title
                );
                return;
            }

            this.changelogAbortController?.abort();
            this.changelogAbortController = new AbortController();

            const response = await fetch(
                `https://launchercontent.mojang.com/v2/${contentPath}`,
                {
                    signal: this.changelogAbortController.signal,
                    cache: 'force-cache'
                }
            );

            const data = await response.json();

            this.changelogCache.set(contentPath, data);
            this.renderChangelog(data, title);

        } catch (e) {
            if ((e as any).name !== 'AbortError') {
                this.showChangelogError('Error al cargar el changelog');
            }
        }
    }


    private showChangelogLoading(): void {
        this.container.classList.add('unvisible');
        this.changelogMainContainer.classList.remove('Unvisible');
        this.changelogMainContainer.style.display = 'block';

        this.changelogContainer.innerHTML = `
            <div class="changelog-loading">
                <p>Cargando changelog...</p>
            </div>
        `;
    }

    private renderChangelog(changelogData: any, title: string): void {
        this.changelogContainer.replaceChildren();
        this.changelogMainContainer.style.display = 'block';

        const modal = document.createElement('div');
        modal.className = 'changelog-modal';

        const imageUrl = changelogData.image?.url
            ? `https://launchercontent.mojang.com${changelogData.image.url}`
            : '../Static/Img/Icons/grass_block.png';

        modal.innerHTML = `
            <div class="changelog-header">
                <img src="${imageUrl}" loading="lazy" decoding="async">
                <h2>${title}</h2>
                <button class="close-changelog-btn" id="close-changelog-btn">
                    <img src="../Static/Resources/Svg/close.svg">
                </button>
            </div>
            <div class="changelog-content">
                ${this.convertChangelogToHTML(changelogData)}
            </div>
        `;

        modal.querySelector('.close-changelog-btn')!.addEventListener('click', () => this.hideChangelog());

        this.changelogContainer.appendChild(modal);
        this.changelogMainContainer.removeEventListener('click', this.backdropClickHandler);
        this.changelogMainContainer.addEventListener('click', this.backdropClickHandler);
    }

    private convertChangelogToHTML(changelogData: any): string {
        if (changelogData.body) return changelogData.body;
        if (typeof changelogData === 'string') return changelogData;
        if (changelogData.content) return changelogData.content;
        return `<p>Contenido no disponible</p>`;
    }

    private showChangelogError(message: string): void {
        this.changelogContainer.innerHTML = `
            <div class="changelog-error" id="ErrorMessage">
                <img src="../Static/Img/Mobs/chicken_forward.png" decoding="async" loading="eager"/>
                <p>${message}</p>
                <button class="retry-changelog-btn">Reintentar</button>
                <button class="close-changelog-btn" id="close-changelog-btn"> <img src="../Static/Resources/Svg/close.svg"> </button>
            </div>
        `;
        const exitButton = document.getElementById('ErrorMessage')!;
        exitButton.querySelector('.close-changelog-btn')!.addEventListener('click', () => this.hideChangelog());
        this.changelogMainContainer.style.display = 'block';
    }

    hideChangelog(): void {
        this.container.classList.remove('unvisible');
        this.changelogMainContainer.classList.add('Unvisible');
        this.changelogMainContainer.style.display = 'none';
        this.changelogAbortController?.abort();
        this.changelogAbortController = null;
        this.changelogContainer.textContent = '';
        this.changelogMainContainer.removeEventListener(
            'click',
            this.backdropClickHandler
        );
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
        this.loadMoreButton?.style.setProperty('display', 'none');
    }

    setLoadMoreButtonLoading(loading: boolean): void {
        if (!this.loadMoreButton) return;

        const btnText = this.loadMoreButton.querySelector('.btn-text') as HTMLElement;
        const spinner = this.loadMoreButton.querySelector('.loading-spinner') as HTMLElement;

        this.loadMoreButton.disabled = loading;
        if (btnText) btnText.style.display = loading ? 'none' : 'inline';
        if (spinner) spinner.style.display = loading ? 'inline' : 'none';
    }

    showNoMoreNewsMessage(): void {
        this.hideLoadMoreButton();
        document.getElementById('NoMoreNews-Message')?.style.setProperty('display', 'flex');
    }

    hideNoMoreNewsMessage(): void {
        document.getElementById('NoMoreNews-Message')?.style.setProperty('display', 'none');
    }

    private formatDate(dateString: string): string {
        return new Date(dateString).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    destroy(): void {
        this.visibilityObserver.disconnect();
        this.hideChangelog();
        this.loadMoreButton?.replaceWith(this.loadMoreButton.cloneNode(true));
    }
}

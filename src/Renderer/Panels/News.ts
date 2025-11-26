import type { NewsEntry, LoadStatus, ChangelogData } from "../../Utils/Types.js";
const NEWS_URL = 'https://launchercontent.mojang.com/v2/javaPatchNotes.json';
const NEWS_LIMIT = 10;

let allNews: NewsEntry[] = [];
let currentIndex = 0;
let currentFilter: 'release' | 'snapshot' | string = 'release';
let newsObserver: IntersectionObserver | null = null;
let loadStatus: LoadStatus = 'pending';

let translations: Record<string, string> | null = null;

function t(key: string): string {
    if (!translations) return key;
    return translations[key] ?? key;
}

function applyTranslationsToDOM() {
    if (!translations) return;
    document.querySelectorAll("[data-lang]").forEach(el => {
        const key = el.getAttribute("data-lang");
        if (key) el.textContent = translations![key] ?? key;
    });
}

export function checkMinecraftNewsStatus() {
    return {
        status: loadStatus,
        success: loadStatus === 'success',
        failed: loadStatus === 'error',
    };
}

function dispatchNewsLoadEvent(): void {
    document.dispatchEvent(
        new CustomEvent('minecraftNewsLoaded', { detail: { status: loadStatus } })
    );
}

function mostrarChangelog(url: string): void {
    const container = document.querySelector('.Changelog-Container') as HTMLElement | null;
    const exitButton = document.getElementById('ExitChangelogButton') as HTMLButtonElement | null;
    const newsSection = document.querySelector('.News') as HTMLElement | null;
    const controllerNews = document.querySelector('.ControllerNews') as HTMLElement | null;
    let imgObserver: IntersectionObserver | null = null;

    function cerrarChangelog(): void {
        if (!container) return;
        container.classList.remove('ChangelogVisible');
        if (exitButton) exitButton.classList.remove('activeChangelog');
        if (newsSection) newsSection.classList.remove('unvisible');
        if (controllerNews) controllerNews.classList.remove('unvisible');
        setTimeout(() => {
            if (imgObserver) {
                container.querySelectorAll('img').forEach(img => imgObserver?.unobserve(img));
            }
            container.querySelectorAll('.changelog-item').forEach(el => el.remove());
            container.classList.remove('closeChangelog');
        }, 1000);
    }

    function mostrarBotonSalir(): void {
        if (!exitButton || !container) return;
        exitButton.classList.add('activeChangelog');
        container.classList.add('ChangelogVisible');
        
        if (newsSection) newsSection.classList.add('unvisible');
        if (controllerNews) controllerNews.classList.add('unvisible');

        if (!exitButton.dataset.listener) {
            exitButton.addEventListener('click', cerrarChangelog);
            exitButton.dataset.listener = 'true';
        }
    }

    function initImgObserver(): void {
        imgObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target as HTMLImageElement;
                        img.src = img.dataset.src ?? '';
                        img.classList.remove('lazy');
                        observer.unobserve(img);
                    }
                });
            },
            { threshold: 0.1 }
        );
    }

    async function cargarChangelog(): Promise<void> {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error cargando el JSON');
            const data: ChangelogData = await res.json();
            if (!container) return;

            container.querySelectorAll('.changelog-item').forEach(el => el.remove());

            const changelogItem = document.createElement('div');
            changelogItem.className = 'changelog-item';
            changelogItem.style.position = 'relative';

            if (data.image?.url) {
                const heroDiv = document.createElement('div');
                heroDiv.className = 'hero';
                const img = document.createElement('img');
                img.dataset.src = `https://launchercontent.mojang.com${data.image.url}`;
                img.alt = data.image.title || data.title;
                img.classList.add('lazy');
                heroDiv.appendChild(img);
                changelogItem.appendChild(heroDiv);
            }

            const descDiv = document.createElement('div');
            descDiv.className = 'description';

            const titleEl = document.createElement('div');
            titleEl.id = 'Tittle';
            titleEl.textContent = `${data.title}`;
            descDiv.appendChild(titleEl);

            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'body-content';
            bodyDiv.innerHTML = data.body;
            descDiv.appendChild(bodyDiv);

            bodyDiv.querySelectorAll('a').forEach((a) => {
                if (a.href) {
                    a.setAttribute('data-url', a.href);
                    a.addEventListener('click', (ev) => ev.preventDefault());
                }
            });

            changelogItem.appendChild(descDiv);
            container.appendChild(changelogItem);

            if (!imgObserver) initImgObserver();
            changelogItem.querySelectorAll('img.lazy').forEach(img => imgObserver?.observe(img));

            if (typeof (window as any).Prism !== "undefined") {
                (window as any).Prism.highlightAllUnder(bodyDiv);
            } else if (typeof (window as any).hljs !== "undefined") {
                (window as any).hljs.highlightAll();
            }

            mostrarBotonSalir();
        } catch (err) {
            if (container)
                container.innerHTML = `<p>${t(
                    'News.ErrorChangelog'
                )}: ${(err as Error).message}</p>`;
        }
    }

    cargarChangelog();
}

async function loadMinecraftNews(): Promise<void> {
    const container = document.querySelector('.News') as HTMLElement | null;
    const loadMoreBtn = document.querySelector('#LoadMore') as HTMLButtonElement | null;
    if (!container) return;

    try {
        if (allNews.length === 0) {
            const response = await fetch(NEWS_URL);
            if (!response.ok) throw new Error(`Error ${response.status}`);
            const data = await response.json();
            allNews = data.entries || [];
            initNewsObserver();
        }

        const filteredNews = currentFilter
            ? allNews.filter(entry => entry.type === currentFilter)
            : allNews;

        const nextNews = filteredNews.slice(currentIndex, currentIndex + NEWS_LIMIT);
        nextNews.forEach(entry => renderNewsItem(container, entry));

        currentIndex += nextNews.length;

        if (loadMoreBtn) {
            loadMoreBtn.style.display = currentIndex >= filteredNews.length ? 'none' : 'block';
        }

        loadStatus = 'success';
        dispatchNewsLoadEvent();
    } catch (err) {
        loadStatus = 'error';
        dispatchNewsLoadEvent();
        if (container)
            container.innerHTML = `<p>${t( 'News.ConnectionError' )}</p>`;
    }
}

function renderNewsItem(container: HTMLElement, entry: NewsEntry): void {
    const newsItem = document.createElement('div');
    newsItem.classList.add('news-item', 'unvisible');

    const hero = document.createElement('div');
    hero.classList.add('hero');
    const img = document.createElement('img');
    img.src = `https://launchercontent.mojang.com${entry.image.url}`;
    img.alt = entry.image.title || entry.title;
    img.loading = 'lazy';
    hero.appendChild(img);

    const description = document.createElement('div');
    description.classList.add('description');

    const title = document.createElement('p');
    title.id = 'Tittle';
    const versionLabel = entry.type === 'snapshot' ? t('News.Snapshot') : t('News.Release');
    title.textContent = `${versionLabel} ${entry.version}`;

    const shortText = document.createElement('p');
    shortText.id = 'ShortText';
    shortText.textContent =
        (entry.shortText?.trim() || t('News.NoDescription')) + '...';

    const button = document.createElement('button');
    button.id = 'ChangelogButton';
    button.textContent = t('News.ViewChangelog');
    button.addEventListener('click', () => {
        const changelogUrl = `https://launchercontent.mojang.com/v2/${entry.contentPath}`;
        const containerCHG = document.querySelector('.Changelog-Container') as HTMLElement;
        containerCHG.classList.add('ChangelogVisible');
        mostrarChangelog(changelogUrl);
    });

    description.append(title, shortText, button);
    newsItem.append(hero, description);
    container.appendChild(newsItem);

    newsObserver?.observe(newsItem);
}

function initNewsObserver(): void {
    newsObserver = new IntersectionObserver(
        entries => {
            for (const entry of entries) {
                (entry.target as HTMLElement).classList.toggle('unvisible', !entry.isIntersecting);
            }
        },
        { threshold: 0.001 }
    );
}

function setNewsFilter(type: string): void {
    const container = document.querySelector('.News') as HTMLElement | null;
    if (!container) return;
    currentFilter = type;
    currentIndex = 0;
    container.innerHTML = '';
    loadMinecraftNews();
}

document.addEventListener('DOMContentLoaded', () => {
    loadMinecraftNews();

    const loadMoreBtn = document.querySelector('#LoadMore') as HTMLButtonElement | null;
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMinecraftNews);

    const releasesBtn = document.querySelector('#Releases') as HTMLButtonElement | null;
    const snapshotsBtn = document.querySelector('#Snapshots') as HTMLButtonElement | null;
    if (releasesBtn) releasesBtn.addEventListener('click', () => setNewsFilter('release'));
    if (snapshotsBtn) snapshotsBtn.addEventListener('click', () => setNewsFilter('snapshot'));

    const reloadBtn = document.getElementById('Reload') as HTMLButtonElement | null;
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            const container = document.querySelector('.News') as HTMLElement | null;
            if (!container) return;
            container.innerHTML = '';
            currentIndex = 0;
            loadMinecraftNews();
        });
    }
    
    applyTranslationsToDOM();
});
window.addEventListener("message", (event) => {
    if (!event.data || !event.data.type) return;

    if (event.data.type === "applyTranslations") {
        translations = event.data.translations as { [key: string]: string } | null;

        if (!translations) return;

        setTimeout(() => {
            applyTranslationsToDOM();

            // --------------------------
            // Manejo del botón HidenNews
            // --------------------------
            const hideBtn = document.getElementById('HidenNews') as HTMLButtonElement | null;
            const hideText = hideBtn?.querySelector("p") as HTMLElement | null;
            const newsContainer = document.querySelector('.News') as HTMLElement | null;

            if (hideBtn && hideText && newsContainer) {
                // Limpiar listeners antiguos
                hideBtn.replaceWith(hideBtn.cloneNode(true));
                const newHideBtn = document.getElementById('HidenNews') as HTMLButtonElement;
                const newHideText = newHideBtn.querySelector("p") as HTMLElement;

                // Texto inicial según estado actual
                newHideText.textContent = newsContainer.classList.contains('unvisible')
                    ? translations!["Iframe.Noticias.Mostrar"] ?? "Mostrar"
                    : translations!["Iframe.Noticias.Ocultar"] ?? "Ocultar";

                newHideBtn.addEventListener('click', () => {
                    newsContainer.classList.toggle('unvisible');
                    newHideText.textContent = newsContainer.classList.contains('unvisible')
                        ? translations!["Iframe.Noticias.Mostrar"] ?? "Mostrar"
                        : translations!["Iframe.Noticias.Ocultar"] ?? "Ocultar";
                });
            }

            // --------------------------
            // Renderizado de noticias
            // --------------------------
            const container = document.querySelector('.News') as HTMLElement | null;
            if (!container) return;

            container.innerHTML = '';
            currentIndex = 0;

            const filteredNews = currentFilter
                ? allNews.filter(entry => entry.type === currentFilter)
                : allNews;

            const nextNews = filteredNews.slice(currentIndex, currentIndex + NEWS_LIMIT);
            nextNews.forEach(entry => renderNewsItem(container, entry));

            currentIndex += nextNews.length;
        }, 500);
    }
});

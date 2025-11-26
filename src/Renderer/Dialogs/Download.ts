// downloadPanel.ts
export async function initDialogDownload(): Promise<void> {
    const container = document.querySelector<HTMLDivElement>('.VanillaDownload');
    if (!container) {
        window.ElectronPino.error('No se encontró el contenedor VanillaDownload');
        return;
    }

    const versionContainer = container.querySelector<HTMLDivElement>('.SelectVersion');
    if (!versionContainer) {
        window.ElectronPino.error('No se encontró el contenedor de versiones');
        return;
    }

    const downloadButton = document.querySelector<HTMLDivElement>('.DownloadButtonDialog');
    if (!downloadButton) {
        window.ElectronPino.error('No se encontró el botón de descarga');
        return;
    }

    const modeDivs: Record<string, HTMLDivElement> = {
        Releases: container.querySelector<HTMLDivElement>('#Releases')!,
        Snapshot: container.querySelector<HTMLDivElement>('#Snapshot')!,
        Beta: container.querySelector<HTMLDivElement>('#Beta')!,
        Alpha: container.querySelector<HTMLDivElement>('#Alpha')!
    };

    let allVersions: any[] = [];

    const typeMap: Record<string, string> = {
        Releases: 'release',
        Snapshot: 'snapshot',
        Beta: 'old_beta',
        Alpha: 'old_alpha'
    };

    const fetchAllVersions = async (): Promise<void> => {
        if (allVersions.length > 0) return;
        try {
            const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            allVersions = data.versions;
            window.ElectronPino.info(`Se cargaron ${allVersions.length} versiones de Mojang`);
        } catch (err) {
            window.ElectronPino.error('Error al obtener versiones: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const renderVersions = (modeId: string) => {
        versionContainer.innerHTML = '';

        const loader = document.createElement('img');
        loader.src = './assets/gif/loading.gif';
        loader.alt = 'Cargando...';
        versionContainer.appendChild(loader);

        setTimeout(() => {
            versionContainer.innerHTML = '';

            const targetType = typeMap[modeId];
            const filtered = allVersions
                .filter(v => v.type === targetType)
                .sort((a, b) => new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime());

            filtered.forEach(v => {
                const div = document.createElement('div');
                div.textContent = v.id;

                div.addEventListener('click', () => {
                    versionContainer.querySelectorAll<HTMLDivElement>('div').forEach(d => d.classList.remove('SelectActiveDiv'));
                    div.classList.add('SelectActiveDiv');

                    downloadButton.classList.add('downloadButtonIsActive');
                });

                versionContainer.appendChild(div);
            });

            window.ElectronPino.info(`Se mostraron ${filtered.length} versiones para "${modeId}"`);
        }, 50);
    };

    const handleModeClick = async (modeId: string) => {
        Object.entries(modeDivs).forEach(([key, div]) => {
            const check = div.querySelector<HTMLDivElement>('.Check');
            if (!check) return;
            check.classList.toggle('Selected', key === modeId);
        });

        await fetchAllVersions();
        renderVersions(modeId);

        downloadButton.classList.remove('downloadButtonIsActive');
    };

    Object.entries(modeDivs).forEach(([id, div]) => {
        div.addEventListener('click', () => handleModeClick(id));
    });

    const defaultMode = Object.entries(modeDivs).find(([_, div]) => div.querySelector('.Check.Selected'));
    if (defaultMode) handleModeClick(defaultMode[0]);

    downloadButton.addEventListener('click', () => {
        const contentScroll = document.querySelector<HTMLDivElement>('.Container_Content');
        const scrollButton = document.getElementById('scrollToggle');

        if (contentScroll && scrollButton) {
            contentScroll.scrollTo({ top: contentScroll.scrollHeight, behavior: 'smooth' });
            scrollButton.classList.add('active');
        }

        const toHide = document.querySelectorAll<HTMLDivElement>( '.SelectMode, .DownloadButtonDialog, .DownloadSectionDialog' );
        toHide.forEach(el => el.classList.add('Unvisible'));

        const activeDownload = document.querySelector<HTMLDivElement>('.ActiveDownload');
        if (activeDownload) activeDownload.classList.remove('Unvisible');
    });
}

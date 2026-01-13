import type { MCVersion, MCVersionType} from '../../Types/Render/Version';

export async function initLoadVersion() {
    const dialogDownload = document.getElementById('DownloadDialog')!,
        switches = dialogDownload.querySelectorAll<HTMLInputElement>('.switch input[type="checkbox"]'),
        versionsContainer = dialogDownload.querySelector<HTMLDivElement>(".Versions")!,
        installButton = dialogDownload.querySelector<HTMLDivElement>(".Button-Download")!,
        selectedText = dialogDownload.querySelector<HTMLParagraphElement>(".Selected-Version")!,
        searchInput = dialogDownload.querySelector<HTMLInputElement>("#SearchVersion")!;

    if (switches.length === 0) return;

    let allVersions: MCVersion[] = [];
    let selectedVersion: { id: string; type: MCVersionType } | null = null;

    try {
        const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
        const json = await res.json();
        allVersions = json.versions;
    } catch {
        console.error("❌ Error cargando las versiones de Minecraft");
        return;
    }

    function updateFooter() {
        selectedText.textContent = selectedVersion
            ? `Version seleccionada: ${selectedVersion.id}`
            : `Version seleccionada: Ninguna`;
    }

    function renderVersions() {
        versionsContainer.innerHTML = "";

        const enabledTypes = new Set<MCVersionType>();
        switches.forEach(sw => {
            if (sw.checked && sw.dataset.type) enabledTypes.add(sw.dataset.type as MCVersionType);
        });

        const filterText = searchInput.value.toLowerCase();

        for (const version of allVersions) {
            if (!enabledTypes.has(version.type)) continue;
            if (!version.id.toLowerCase().includes(filterText)) continue;

            const div = document.createElement("div");
            div.className = `Version ${version.type}`;
            div.textContent = version.id;
            div.dataset.id = version.id;
            div.dataset.type = version.type;

            if (selectedVersion?.id === version.id) div.classList.add("selected");

            versionsContainer.appendChild(div);
        }
    }

    versionsContainer.addEventListener("click", e => {
        const target = (e.target as HTMLElement).closest<HTMLDivElement>(".Version");
        if (!target) return;

        versionsContainer.querySelectorAll(".Version.selected")
            .forEach(v => v.classList.remove("selected"));

        target.classList.add("selected");

        selectedVersion = {
            id: target.dataset.id!,
            type: target.dataset.type as MCVersionType
        };

        updateFooter();
    });

    installButton.addEventListener("click", () => {
        if (!selectedVersion) return;
        console.log(`Instalar ${selectedVersion.id} (${selectedVersion.type})`);
    });

    switches.forEach(sw =>
        sw.addEventListener("change", () => {
            if (
                selectedVersion &&
                !Array.from(switches).some(
                    s => s.checked && s.dataset.type === selectedVersion!.type
                )
            ) {
                selectedVersion = null;
                updateFooter();
            }
            renderVersions();
        })
    );

    searchInput.addEventListener("input", () => renderVersions());

    updateFooter();
    renderVersions();
}
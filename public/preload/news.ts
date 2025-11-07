export function initWebview() {
    window.addEventListener("message", (event) => {
        if (!event.data) return;

        if (event.data.type === "applyTranslations") {
            const { translations, visualAssets } = event.data;

            document.querySelectorAll("[data-lang]").forEach(el => {
                const key = el.getAttribute("data-lang");
                if (key && translations[key]) el.textContent = translations[key];
            });

            if (visualAssets) {
                const setImage = (id: string, src?: string) => {
                    const el = document.querySelector(`#${id}`);
                    if (el instanceof HTMLImageElement && src) el.src = src;
                };

                setImage("snapshotsImg", visualAssets.Snapshots);
                setImage("releasesImg", visualAssets.Releases);
                setImage("steplauncherImg", visualAssets.StepLauncher);
            }
        }
    });

    window.top?.postMessage({ type: "webview-ready" }, "*");
}

initWebview();

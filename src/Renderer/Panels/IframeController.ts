export function setupIframeLoader( iframe: HTMLIFrameElement, indicator?: HTMLElement | null, loader?: HTMLElement | null ) {
    if (!indicator || !loader) return;

    const startLoading = (): void => {
        const text = window.LangAPI.getParamFromScript("Iframe.loading");
        indicator.innerText = text;
        loader.classList.add("active");
        indicator.classList.add("active");
    };

    const stopLoading = (): void => {
        indicator.innerText = "";
        loader.classList.remove("active");
        indicator.classList.remove("active");
    };

    iframe.addEventListener("loadstart", startLoading as any);
    iframe.addEventListener("load", stopLoading);
    iframe.addEventListener("error", stopLoading);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === "attributes" && mutation.attributeName === "src") {
                startLoading();
            }
        }
    });
    observer.observe(iframe, { attributes: true });
}
export function setupIframeTranslations(iframe: HTMLIFrameElement) {
    const LangAPI = window.LangAPI;

    const sendTranslations = () => {
        if (!iframe?.contentWindow) return;

        const translations = {
            "Connection.State-0": LangAPI.translate("Connection.State-0"),
            "Connection.State-1": LangAPI.translate("Connection.State-1"),
            "Connection.State-2": LangAPI.translate("Connection.State-2"),
            "Connection.State-3": LangAPI.translate("Connection.State-3"),
            "Connection.State-4": LangAPI.translate("Connection.State-4"),

            "Iframe.Noticias.Ocultar": LangAPI.translate("Iframe.Noticias.Ocultar"),
            "Iframe.Noticias.Mostrar": LangAPI.translate("Iframe.Noticias.Mostrar"),
            "Iframe.Noticias.CargarMas": LangAPI.translate("Iframe.Noticias.CargarMas"),
            "Iframe.Noticias.Panel.Releases": LangAPI.translate("Iframe.Noticias.Panel.Releases"),
            "Iframe.Noticias.Panel.Snapshots": LangAPI.translate("Iframe.Noticias.Panel.Snapshots"),
            "Iframe.Noticias.Panel.StepLauncher": LangAPI.translate("Iframe.Noticias.Panel.StepLauncher"),
            "Iframe.Noticias.Panel.Salir": LangAPI.translate("Iframe.Noticias.Panel.Salir"),
            "Iframe.Noticias.Recargar": LangAPI.translate("Iframe.Noticias.Recargar"),
            "News.ViewChangelog": LangAPI.translate("News.ViewChangelog"),
            "News.NoDescription": LangAPI.translate("News.NoDescription"),
            "News.Release": LangAPI.translate("News.Release"),
            "News.Snapshot": LangAPI.translate("News.Snapshot"),
            "News.ConnectionError": LangAPI.translate("News.ConnectionError"),
            "News.ErrorChangelog": LangAPI.translate("News.ErrorChangelog"),
            "News.ExitChangelog": LangAPI.translate("News.ExitChangelog")
        };

        const visualAssets = {
            Snapshots: LangAPI.getParamFromScript("News.Images.Snapshots"),
            Releases: LangAPI.getParamFromScript("News.Images.Releases"),
            StepLauncher: LangAPI.getParamFromScript("News.Images.StepLauncher")
        };

        iframe.contentWindow.postMessage(
            { type: "applyTranslations", translations, visualAssets },
            "*"
        );
    };

    window.addEventListener("message", (event) => {
        if (event.data?.type === "iframe-ready" && event.source === iframe.contentWindow) {
            window.ElectronPino.info(`[TRANSLATION] Enviando traducciones a ${iframe.src}`);
            sendTranslations();
        }
    });

    // Reenviar si se cambia el idioma
    window.addEventListener("lang-changed", sendTranslations);
}
export function initAllIframes() {
    const iframes = document.querySelectorAll("iframe") as NodeListOf<HTMLIFrameElement>;

    iframes.forEach((iframe) => {
        const container = iframe.closest(".IframeContainer, .Iframe-Music, div");

        const indicator = container?.querySelector(".IframeIndicator") as HTMLElement | null;
        const loader = container?.querySelector(".IframeLoader") as HTMLElement | null;

        if (iframe.src.includes("news.html")) {
            setupIframeLoader(iframe, indicator, loader);
            setupIframeTranslations(iframe);
        } else {
            setupIframeLoader(iframe, indicator, loader);
        }

        // Comunicación global
        window.addEventListener("message", (event: MessageEvent) => {
            if (event.data?.type === "iframe-ready") {
                window.ElectronPino.info(`[SUCCESS] Iframe ${iframe.src} listo`);
                window.ElectronPino.info("[ Panel - News ] Inicializado Correctamente");
            }
            if (event.data?.type === "open-external" && event.data.url) {
                window.ElectronAPI.openExternal(event.data.url);
            }
        });
    });
}

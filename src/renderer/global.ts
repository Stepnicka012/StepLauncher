import { checkMinecraftNewsStatus } from "./news.js";
import type { LoadStatus, WebviewTagWithContentWindow } from "../utils/types.js";
checkMinecraftNewsStatus();

document.addEventListener("minecraftNewsLoaded", (e: any) => {
    window.ElectronPino.info("Estado de carga:", e.detail.status);
});

document.addEventListener("DOMContentLoaded", () => {
    const minBtn = document.getElementById('minBtn') as HTMLButtonElement | null;
    const maxBtn = document.getElementById('maxBtn') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement | null;
    const maxIcon = document.getElementById('maxIcon') as HTMLImageElement | null;
    const loaderProgram = document.querySelector(".LoaderProgram") as HTMLElement | null;
    const bar = loaderProgram?.querySelector(".Bar") as HTMLElement | null;
    const text = loaderProgram?.querySelector(".Bottom .Text") as HTMLElement | null;
    if (!loaderProgram || !bar || !text) return;

    const loadingSteps = [
        { text: "Cargando noticias de Minecraft...", duration: 500 },
        { text: "Procesando datos...", duration: 2500 },
        { text: "Preparando interfaz...", duration: 500 }
    ];

    let progress = 0;
    const maxProgress = 95;
    const totalSteps = loadingSteps.length;

    function animateProgress(to: number, duration: number) {
        const start = progress;
        const diff = to - start;
        const startTime = performance.now();

        function step(time: number) {
            const elapsed = time - startTime;
            const t = Math.min(elapsed / duration, 1);
            progress = start + diff * t;
            bar!.style.width = `${progress}%`;
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function runLoaderSteps(index: number = 0) {
        if (index >= totalSteps) {
            animateProgress(100, 500);
            text!.textContent = "Inicializando StepLauncher...";
            setTimeout(() => {
                loaderProgram!.classList.add("loadComplete");
                initApp();
            }, 500);
            return;
        }

        const step = loadingSteps[index];
        text!.textContent = step!.text;
        const targetProgress = maxProgress * ((index + 1) / totalSteps);
        animateProgress(targetProgress, step!.duration);

        setTimeout(() => {
            runLoaderSteps(index + 1);
        }, step!.duration);
    }

    document.addEventListener("minecraftNewsLoaded", (e: CustomEvent<{status: LoadStatus}>) => {
        animateProgress(100, 500);
        text.textContent = e.detail.status === "success"
            ? "Noticias cargadas correctamente."
            : "Error al cargar noticias.";

        setTimeout(() => {
            loaderProgram.classList.add("loadComplete");
            initApp();
        }, 1500);
    });

    function initApp() {
        window.ElectronPino.success("[ StepLauncher ] Carga Completada de UI/UX y subModulos");
    }

    if (!minBtn || !maxBtn || !closeBtn || !maxIcon) {
        window.ElectronPino.error("[ GLOBAL - ERROR ] - No se encontraron los elementos de control de ventana");
        return;
    }

    minBtn.addEventListener('click', () => window.ElectronAPI.minimize());
    maxBtn.addEventListener('click', () => window.ElectronAPI.toggleMaximize());
    closeBtn.addEventListener('click', () => window.ElectronAPI.close());

    window.ElectronAPI.onWindowStateChange((state) => {
        maxIcon.src = state.maximized
            ? './assets/svg/window/window-2.svg'
            : './assets/svg/window/window-1.svg';
    });

    window.LangAPI.apply();

    const webview = document.querySelector('webview') as WebviewTagWithContentWindow | null;
    const indicator = document.querySelector('.WebViewIndicator') as HTMLElement | null;
    const loader = document.querySelector('.WebviewLoader') as HTMLElement | null;

    if (!webview || !indicator || !loader) {
        window.ElectronPino.warn("[ GLOBAL - WARNING ] - Elementos del WebView no encontrados");
        return;
    }

    const loadstart = (): void => {
        const textIndicator = window.LangAPI.getParamFromScript("Webview.loading");
        indicator.innerText = textIndicator;
        loader.style.display = 'inline-block';
    };

    const loadstop = (): void => {
        indicator.innerText = '';
        loader.style.display = 'none';
    };

    webview.addEventListener('did-start-loading', loadstart);
    webview.addEventListener('did-stop-loading', loadstop);
    function sendTranslationsToWebview() {
        if (!webview?.contentWindow) return;

        const LangAPI = window.LangAPI;
        const translations = {
            "Connection.State-1": LangAPI.translate("Connection.State-1"),
            "Connection.State-2": LangAPI.translate("Connection.State-2"),
            "Connection.State-3": LangAPI.translate("Connection.State-3"),
            "Connection.State-4": LangAPI.translate("Connection.State-4"),

            "Webview.Noticias.Ocultar": LangAPI.translate("Webview.Noticias.Ocultar"),
            "Webview.Noticias.Mostrar": LangAPI.translate("Webview.Noticias.Mostrar"),
            "Webview.Noticias.CargarMas": LangAPI.translate("Webview.Noticias.CargarMas"),
            "Webview.Noticias.Panel.Releases": LangAPI.translate("Webview.Noticias.Panel.Releases"),
            "Webview.Noticias.Panel.Snapshots": LangAPI.translate("Webview.Noticias.Panel.Snapshots"),
            "Webview.Noticias.Panel.StepLauncher": LangAPI.translate("Webview.Noticias.Panel.StepLauncher"),
            "Webview.Noticias.Panel.Salir": LangAPI.translate("Webview.Noticias.Panel.Salir"),
            "Webview.Noticias.Recargar": LangAPI.translate("Webview.Noticias.Recargar"),

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

        webview.contentWindow.postMessage({ type: "applyTranslations", translations, visualAssets }, "*");
    }

    webview.addEventListener("dom-ready", ()=>{
        sendTranslationsToWebview();
    });

    window.addEventListener("lang-changed", sendTranslationsToWebview);

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "webview-ready") { 
            window.ElectronPino.info("[ GLOBAL - SUCCESSFULL ] - Webview listo para recibir traducciones");
        }
        if (event.data.type === "open-external" && event.data.url) {
            window.ElectronAPI.openExternal(event.data.url);
        }
    });
    runLoaderSteps();
});

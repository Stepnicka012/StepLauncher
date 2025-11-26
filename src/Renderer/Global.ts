import { setupIframeLoader, initAllIframes } from "./Panels/IframeController.js";
import { initDialogDownload } from "./Dialogs/Download.js"
import { Notification } from "./Utils/Notification.js";
import { InitWelcome } from "./Panels/Welcome.js";
import { initSettings } from "./Panels/Settings.js";
import { initMusic } from "./Panels/Music.js";
import PanelsManager from "./PanelsManager.js";

document.addEventListener("DOMContentLoaded", () => {
    const minBtn = document.getElementById('minBtn') as HTMLButtonElement | null;
    const maxBtn = document.getElementById('maxBtn') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement | null;
    const maxIcon = document.getElementById('maxIcon') as HTMLImageElement | null;
    const loaderProgram = document.querySelector(".LoaderProgram") as HTMLElement | null;
    const bar = loaderProgram?.querySelector(".Bar") as HTMLElement | null;
    const text = loaderProgram?.querySelector(".Bottom .Text") as HTMLElement | null;

    const iframes = document.querySelectorAll("iframe") as NodeListOf<HTMLIFrameElement>;
    iframes.forEach(iframe => {
        const id = iframe.id.replace("Iframe-", "");
        const indicator = document.querySelector(`.${id}Indicator`) as HTMLElement | null;
        const loader = document.querySelector(`.${id}Loader`) as HTMLElement | null;
        if (indicator && loader) setupIframeLoader(iframe, indicator, loader);
    });

    if (!loaderProgram || !bar || !text) return;

    const loadingSteps = [
        { text: "Cargando interfaz del StepLauncher...", duration: 800 },
        { text: "Cargando paneles...", duration: 1800 },
        { text: "Inicializando UI...", duration: 700 }
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
            if (bar) bar.style.width = `${progress}%`;
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function runLoaderSteps(index: number = 0) {
        if (index >= totalSteps) {
            animateProgress(100, 500);
            if (text) text.textContent = "Inicializando StepLauncher...";
            setTimeout(async () => {
                loaderProgram!.classList.add("loadComplete");
                await initApp();
            }, 600);
            return;
        }

        const step = loadingSteps[index];
        if (text) text.textContent = step!.text;
        const targetProgress = maxProgress * ((index + 1) / totalSteps);
        animateProgress(targetProgress, step!.duration);

        setTimeout(() => runLoaderSteps(index + 1), step!.duration);
    }

    async function initApp() {
        try {
            const manager = new PanelsManager({ containerSelector: ".PanelsContainer-HTML" });

            const panels = [
                { name: "welcome", url: "./html/welcome.html" },
                { name: "settings", url: "./html/settings.html" },
                { name: "music", url: "./html/music.html" },
            ];

            await manager.injectPanelsFromUrls(panels);

            (window as any).Panels = manager;

            function setupPanelTriggers() {
                const openers = document.querySelectorAll("[data-OpenPanel]");
                const closers = document.querySelectorAll("[data-ClosePanel]");

                openers.forEach(btn => {
                    const panelName = btn.getAttribute("data-OpenPanel");
                    btn.addEventListener("click", () => {
                        if (!panelName) return;
                        (window as any).Panels.showPanel(panelName);
                    });
                });

                closers.forEach(btn => {
                    const panelName = btn.getAttribute("data-ClosePanel");
                    btn.addEventListener("click", () => {
                        if (!panelName) return;
                        (window as any).Panels.hidePanel(panelName);
                    });
                });
            }
            await initDialogDownload();
            await initSettings();
            await initMusic();
            await setupPanelTriggers();
            await InitWelcome();
            Notification.new({
                type:"success",
                duration: 1500,
                message: "Hola mundo"
            })
            const isFirstTime = window.Configuration.getPath<boolean>("Launcher.isFirstTimeUser");
            if (await isFirstTime) {
                manager.showPanel("welcome",true);
                manager.setActivePanel("welcome");
                // window.Configuration.set("Launcher.isFirstTimeUser", false);
            }

            window.ElectronPino.success("[ PanelsManager ] Paneles cargados correctamente.");
        
        } catch (err) {
            window.ElectronPino.error("[ PanelsManager ] Error al cargar paneles:", err!);
        }

        setTimeout(()=>{
            window.LangAPI.apply();
            initAllIframes();
        },500)

        window.ElectronPino.success("[ StepLauncher ] Carga Completada de UI/UX y subMódulos");
    }

    if (!minBtn || !maxBtn || !closeBtn || !maxIcon) {
        window.ElectronPino.error("[ GLOBAL - ERROR ] - No se encontraron los elementos de control de ventana");
        return;
    }

    minBtn.addEventListener('click', () => window.ElectronAPI.minimize());
    maxBtn.addEventListener('click', () => window.ElectronAPI.toggleMaximize());
    closeBtn.addEventListener('click', () => window.ElectronAPI.close());

    window.ElectronAPI.onWindowStateChange((state) => {
        if (maxIcon) {
            maxIcon.src = state.maximized
                ? './assets/icons/svg/window/window-2.svg'
                : './assets/icons/svg/window/window-1.svg';
        }
    });

    window.LangAPI.apply();
    initAllIframes();
    runLoaderSteps();
});

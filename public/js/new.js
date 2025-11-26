const el = {
    selectNewBtn: document.getElementById("SelectNew"),
    selectNewsBt: document.getElementById("SelectNews-Bt"),
    selectNewMenu: document.querySelector(".SelectNew-Menu"),
    wifiIcon: document.getElementById("wifi-icon"),
    wifiText: document.getElementById("wifi-text"),
    loadMoreBtn: document.getElementById("LoadMore")
};

// === Estado interno ===
let translations = null;
let translationsReady = false;
let lastConnectionState = null;
let lastCheckTime = 0;
let isChecking = false;
let lastUserInteraction = Date.now();

// Constantes
const MIN_CHECK_INTERVAL = 15000;  // 15s
const MAX_IDLE_TIME = 120000;      // 2min

// Funciones de UI
function toggleNewsButtons(visible) {
    [el.selectNewsBt, el.loadMoreBtn].forEach(btn => btn?.classList.toggle("hidden", !visible));
}

function togglePanel() {
    if (!el.selectNewMenu) return;
    const isActive = el.selectNewMenu.classList.contains("active");
    el.selectNewMenu.classList.toggle("active", !isActive);
    el.selectNewMenu.classList.toggle("desactive", isActive);
    el.selectNewsBt?.classList.toggle("active", !isActive);
}

// Listeners de panel
el.selectNewMenu?.classList.add("desactive");

el.selectNewBtn?.addEventListener("click", e => {
    e.stopPropagation();
    togglePanel();
});

document.addEventListener("click", e => {
    if (!el.selectNewMenu?.contains(e.target) && e.target !== el.selectNewBtn) {
        el.selectNewMenu?.classList.remove("active");
        el.selectNewMenu?.classList.add("desactive");
        el.selectNewsBt?.classList.remove("active");
    }
});

el.selectNewMenu?.querySelector(".ButtonExit")?.addEventListener("click", () => {
    el.selectNewMenu?.classList.remove("active");
    el.selectNewMenu?.classList.add("desactive");
});

// Traducciones
window.addEventListener("message", event => {
    if (event.data?.type === "applyTranslations") {
        translations = event.data.translations;
        if (!translations) return;
        translationsReady = true;
        applyTranslationsToDOM();
    }
});

function applyTranslationsToDOM() {
    if (!translations) return;
    document.querySelectorAll("[data-lang]").forEach(elm => {
        const key = elm.getAttribute("data-lang");
        if (key && translations[key]) elm.textContent = translations[key];
    });
}

// Estado de conexión
function updateConnection(status) {
    if (!translationsReady) return;
    const { wifiIcon, wifiText } = el;

    const state = {
        0: ["../assets/Icons/Svg/Wifi/Wifi_Problem.png", "Connection.State-0", "Sin conexión"],
        1: ["../assets/Icons/Svg/Wifi/Wifi_None.png", "Connection.State-1", "Conexión muy baja"],
        2: ["../assets/Icons/Svg/Wifi/Wifi_Low.png", "Connection.State-2", "Conexión baja"],
        3: ["../assets/Icons/Svg/Wifi/Wifi_Medium.png", "Connection.State-3", "Conexión media"],
        4: ["../assets/Icons/Svg/Wifi/Wifi_High.png", "Connection.State-4", "Conexión estable"]
    };

    const [src, key, fallback] = state[status] ?? state[3];
    wifiIcon.src = src;
    wifiText.textContent = translations[key] ?? fallback;
}

// Comprobación de conexión
async function testConnectionInternal() {
    const url = `https://launchercontent.mojang.com/v2/javaPatchNotes.json?${Date.now()}`;
    const start = performance.now();
    try {
        const response = await fetch(url, { method: "HEAD", cache: "no-store" });
        const duration = performance.now() - start;
        if (!response.ok) throw new Error("Respuesta no válida");
        if (duration > 3000) return 1;
        if (duration > 1200) return 2;
        return 3;
    } catch {
        return 0;
    }
}

async function smartCheckConnection(force = false) {
    const now = Date.now();
    if (isChecking || (!force && now - lastCheckTime < MIN_CHECK_INTERVAL)) return;

    isChecking = true;
    try {
        const prev = lastConnectionState;
        const newState = await testConnectionInternal();

        if (newState !== prev) {
            updateConnection(newState);
            toggleNewsButtons(newState !== 0);
        }

        lastConnectionState = newState;
        lastCheckTime = now;
    } finally {
        isChecking = false;
    }
}

// Manejo de conexión nativa
window.addEventListener("online", () => smartCheckConnection(true));
window.addEventListener("offline", () => {
    lastConnectionState = 0;
    updateConnection(0);
    toggleNewsButtons(false);
});

// Sistema de actividad
["mousemove", "keydown", "click"].forEach(evt =>
    document.addEventListener(evt, () => (lastUserInteraction = Date.now()))
);

// Intervalo de comprobación inteligente
setInterval(() => {
    const now = Date.now();
    const idleTime = now - lastUserInteraction;

    if (idleTime > MAX_IDLE_TIME) {
        if (now - lastCheckTime > MAX_IDLE_TIME * 1.5) smartCheckConnection(true);
    } else {
        smartCheckConnection(false);
    }
}, 20000);

// Inicialización del iframe
function initIframe() {
    window.addEventListener("message", event => {
        if (event.data?.type !== "applyTranslations") return;

        const { translations, visualAssets } = event.data;
        if (translations) applyTranslationsToDOM(translations);

        if (visualAssets) {
            const setImage = (id, src) => {
                const img = document.getElementById(id);
                if (img instanceof HTMLImageElement && src) img.src = src;
            };
            setImage("snapshotsImg", visualAssets.Snapshots);
            setImage("releasesImg", visualAssets.Releases);
            setImage("steplauncherImg", visualAssets.StepLauncher);
        }
    });

    window.addEventListener("DOMContentLoaded", () => {
        setTimeout(()=>{
            window.parent.postMessage({ type: "iframe-ready" }, "*");
        },500);
    });
}

initIframe();
smartCheckConnection(true);

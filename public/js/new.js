const elements = {
    selectNewBtn: document.getElementById("SelectNew"),
    selectNewsBt: document.getElementById("SelectNews-Bt"),
    selectNewMenu: document.querySelector(".SelectNew-Menu"),
    wifiIcon: document.getElementById("wifi-icon"),
    wifiText: document.getElementById("wifi-text"),
    loadMoreBtn: document.getElementById("LoadMore")
};

let useNewPanel = false;

function toggleNewsButtons(visible) {
    [elements.selectNewsBt, elements.loadMoreBtn].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle("hidden", !visible);
    });
}

function togglePanel() {
    if (!elements.selectNewMenu) return;
    const isActive = elements.selectNewMenu.classList.contains("active");
    elements.selectNewMenu.classList.toggle("active", !isActive);
    elements.selectNewMenu.classList.toggle("desactive", isActive);
    elements.selectNewsBt?.classList.toggle("active", !isActive);
}

elements.selectNewMenu?.classList.add("desactive");

elements.selectNewBtn?.addEventListener("click", e => {
    e.stopPropagation();
    togglePanel();
});

document.addEventListener("click", e => {
    if (!elements.selectNewMenu?.contains(e.target) && e.target !== elements.selectNewBtn) {
        elements.selectNewMenu?.classList.remove("active");
        elements.selectNewMenu?.classList.add("desactive");
        elements.selectNewsBt?.classList.remove("active");
    }
});

elements.selectNewMenu?.querySelector(".ButtonExit")?.addEventListener("click", () => {
    elements.selectNewMenu?.classList.remove("active");
    elements.selectNewMenu?.classList.add("desactive");
});

// ---- Traducciones ----
let translations = null;
let translationsReady = false;

window.addEventListener("message", event => {
    if (!event.data?.type) return;
    if (event.data.type === "applyTranslations") {
        translations = event.data.translations;
        if (!translations) return;
        translationsReady = true;
        applyTranslationsToDOM();
    }
});

function applyTranslationsToDOM() {
    if (!translations) return;
    document.querySelectorAll("[data-lang]").forEach(el => {
        const key = el.getAttribute("data-lang");
        if (key && translations[key]) el.textContent = translations[key];
    });
}

window.parent.postMessage({ type: "webview-ready" }, "*");

// ---- Estado de conexión ----
function updateConnection(status) {
    if (!translationsReady) return;
    const { wifiIcon, wifiText } = elements;
    switch (status) {
        case 0:
            wifiIcon.src = "../assets/svg/wifi/wifi_noConnection.svg";
            wifiText.textContent = translations["Connection.State-4"] ?? "Sin conexión";
            break;
        case 1:
            wifiIcon.src = "../assets/svg/wifi/wifi_1_bar.svg";
            wifiText.textContent = translations["Connection.State-3"] ?? "Conexión baja";
            break;
        case 2:
            wifiIcon.src = "../assets/svg/wifi/wifi_2_bar.svg";
            wifiText.textContent = translations["Connection.State-2"] ?? "Conexión media";
            break;
        case 3:
        default:
            wifiIcon.src = "../assets/svg/wifi/wifi_3_bar.svg";
            wifiText.textContent = translations["Connection.State-1"] ?? "Conexión estable";
            break;
    }
}

// ---- Comprobación de conexión inteligente ----
let lastConnectionState = null;
let lastCheckTime = 0;
let isChecking = false;
const MIN_CHECK_INTERVAL = 30000;
const MAX_IDLE_TIME = 180000;

async function smartCheckConnection(force = false) {
    const now = Date.now();
    if (isChecking || (!force && now - lastCheckTime < MIN_CHECK_INTERVAL)) return;
    isChecking = true;
    try {
        const prevState = lastConnectionState;
        const newState = await testConnectionInternal();
        if (newState !== prevState) {
            updateConnection(newState);
            toggleNewsButtons(newState !== 0);
        }
        lastConnectionState = newState;
        lastCheckTime = now;
    } finally { isChecking = false; }
}

async function testConnectionInternal() {
    const url = "https://launchercontent.mojang.com/v2/javaPatchNotes.json?" + Date.now();
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

window.addEventListener("online", () => smartCheckConnection(true));
window.addEventListener("offline", () => {
    lastConnectionState = 0;
    updateConnection(0);
    toggleNewsButtons(false);
});

setInterval(() => {
    const now = Date.now();
    if (now - lastCheckTime > MAX_IDLE_TIME) smartCheckConnection(true);
    else smartCheckConnection(false);
}, 10000);

smartCheckConnection(true);
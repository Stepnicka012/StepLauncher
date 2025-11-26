import type { PanelDef, PanelsManagerOptions } from "../Utils/Types.js";

export default class PanelsManager {
  private container: HTMLElement;
  private cache = new Map<string, string>(); // url -> html
  private panels = new Map<string, HTMLElement>(); // name -> element
  private opts: Required<PanelsManagerOptions>;
  private activePanel: string | null = null; // nombre del panel activo

  constructor(opts?: PanelsManagerOptions) {
    this.opts = {
      containerSelector: opts?.containerSelector ?? ".PanelsContainer-HTML",
      executeScripts: opts?.executeScripts ?? true,
      fetchInit: opts?.fetchInit ?? {},
    };

    const el = document.querySelector<HTMLElement>(this.opts.containerSelector);
    if (!el)
      throw new Error(
        `PanelsManager: no se encontró el contenedor "${this.opts.containerSelector}"`
      );
    this.container = el;

    // Estado inicial
    this.container.classList.add("unvisible");
  }

  /** Inyecta varios paneles haciendo fetch de sus URLs (en paralelo) */
  async injectPanelsFromUrls(defs: PanelDef[]): Promise<void> {
    await Promise.all(defs.map((d) => this.loadAndInjectPanel(d.name, d.url)));
    this.updateVisibility();
  }

  /** Carga e inyecta un panel individual */
  async loadAndInjectPanel(name: string, url: string): Promise<HTMLElement> {
    if (this.panels.has(name)) {
      const existing = this.panels.get(name)!;
      const html = await this.fetchHtml(url);
      existing.innerHTML = html;
      if (this.opts.executeScripts) this.runScriptsIn(existing);
      return existing;
    }

    const html = await this.fetchHtml(url);
    const panelEl = document.createElement("div");
    panelEl.className = `PanelsContainer-HTML-${name}`;
    panelEl.dataset.panelName = name;
    panelEl.innerHTML = html;
    this.container.appendChild(panelEl);

    if (this.opts.executeScripts) this.runScriptsIn(panelEl);
    this.panels.set(name, panelEl);
    return panelEl;
  }

  /** Establece el panel activo (visibilidad interna, sin data-panel) */
  setActivePanel(name: string | null): void {
    this.activePanel = name;
    this.updateVisibility();
  }

  /** Elimina un panel inyectado (y limpia cache si se quiere) */
  destroyPanel(name: string, removeCache = false): void {
    const el = this.panels.get(name);
    if (!el) return;

    this.safeRemove(el);
    this.panels.delete(name);

    if (removeCache) {
      for (const [u, html] of this.cache.entries()) {
        if (html === el.innerHTML) this.cache.delete(u);
      }
    }

    // si el panel activo fue eliminado, desactivar
    if (this.activePanel === name) {
      this.activePanel = null;
      this.updateVisibility();
    }
  }

  /** Limpia todo */
  destroyAll(): void {
    for (const el of this.panels.values()) this.safeRemove(el);
    this.panels.clear();
    this.cache.clear();
    this.activePanel = null;
    this.updateVisibility();
  }

  showPanel(name: string, instant = false): void {
    const el = this.panels.get(name);
    if (!el) {
        window.ElectronPino.warn(`PanelsManager: panel "${name}" no encontrado`);
        return;
    }

    const loader = document.querySelector(".LoaderProgram") as HTMLElement | null;
    const mainContainer = document.querySelector(".PanelsContainer") as HTMLElement | null;
    const sidebar = document.querySelector(".Sidebar") as HTMLElement | null;
    const content = document.querySelector(".Content") as HTMLElement | null;

    // Cerrar diálogos
    mainContainer?.querySelectorAll("dialog").forEach(dialog => {
        try { if ((dialog as HTMLDialogElement).open) (dialog as HTMLDialogElement).close(); dialog.removeAttribute("open"); }
        catch { dialog.removeAttribute("open"); }
    });

    if (instant) {
        // --- Mostrar directamente sin animaciones ---
        sidebar?.classList.add("Sidebar-HiddenToPanel");
        content?.classList.add("unvisible");
        this.container.classList.add("visible");
        this.container.classList.remove("unvisible");
        mainContainer?.classList.add("visible");
        mainContainer?.classList.remove("unvisible");

        this.panels.forEach(p => p.classList.add("unvisible"));
        el.classList.remove("unvisible");
        el.classList.add("visible");
        this.activePanel = name;

        // Loader aparece inmediatamente
        loader?.classList.remove("close");
        loader?.classList.add("open");
    } else {
        // --- flujo normal con animaciones ---
        loader?.classList.remove("open");
        loader?.classList.add("close");

        setTimeout(() => {
            sidebar?.classList.add("Sidebar-HiddenToPanel");
            content?.classList.add("unvisible");
            this.container.classList.add("visible");
            this.container.classList.remove("unvisible");
            mainContainer?.classList.add("visible");
            mainContainer?.classList.remove("unvisible");

            this.panels.forEach((panel) => panel.classList.add("unvisible"));
            el.classList.remove("unvisible");
            el.classList.add("visible");
            this.activePanel = name;

            setTimeout(() => {
                loader?.classList.remove("close");
                loader?.classList.add("open");
            }, 150);
        }, 1000);
    }
  }

  hidePanel(name: string): void {
    const el = this.panels.get(name);
    if (!el) {
      window.ElectronPino.warn(`PanelsManager: panel "${name}" no encontrado`);
      return;
    }

    const loader = document.querySelector(".LoaderProgram") as HTMLElement | null;
    const mainContainer = document.querySelector(".PanelsContainer") as HTMLElement | null;
    const sidebar = document.querySelector(".Sidebar") as HTMLElement | null;
    const content = document.querySelector(".Content") as HTMLElement | null;

    // --- 🧩 Cerrar loader (tapa todo antes de ocultar el panel) ---
    loader?.classList.remove("open");
    loader?.classList.add("close");

    setTimeout(() => {
      // Ahora que está tapado, ocultamos el panel
      el.classList.add("unvisible");
      el.classList.remove("visible");
      this.container.classList.add("unvisible");
      this.container.classList.remove("visible");
      mainContainer?.classList.add("unvisible");
      mainContainer?.classList.remove("visible");

      // Mostrar Sidebar y Content
      sidebar?.classList.remove("Sidebar-HiddenToPanel");
      content?.classList.remove("unvisible");

      if (this.activePanel === name) this.activePanel = null;

      // 🔥 Volver a abrir el loader (mostrar pantalla normal)
      setTimeout(() => {
        loader?.classList.remove("close");
        loader?.classList.add("open");
      }, 150);
    }, 1000);
  }

  /* ---------------------------
     Internals
     --------------------------- */

  private async fetchHtml(url: string): Promise<string> {
    if (this.cache.has(url)) return this.cache.get(url)!;

    const res = await fetch(url, this.opts.fetchInit);
    if (!res.ok)
      throw new Error(
        `PanelsManager: fallo fetch ${url} -> ${res.status} ${res.statusText}`
      );
    const text = await res.text();
    const trimmed = text.trim();
    this.cache.set(url, trimmed);
    return trimmed;
  }

  private runScriptsIn(root: HTMLElement) {
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const script = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes))
        script.setAttribute(attr.name, attr.value);

      if (oldScript.src) {
        script.src = oldScript.src;
        if (oldScript.getAttribute("async") !== null) script.async = true;
        if (oldScript.getAttribute("defer") !== null) script.defer = true;
      } else {
        script.textContent = oldScript.textContent;
      }
      oldScript.parentNode?.replaceChild(script, oldScript);
    }
  }

  private updateVisibility() {
    const active = this.activePanel;

    for (const [name, el] of this.panels.entries()) {
      const shouldShow = active === name;
      el.classList.toggle("visible", shouldShow);
      el.classList.toggle("unvisible", !shouldShow);
    }

    const hasActive = !!active;
    this.container.classList.toggle("visible", hasActive);
    this.container.classList.toggle("unvisible", !hasActive);
  }

  private safeRemove(el: HTMLElement) {
    try {
      el.remove();
    } catch (e) {
      window.ElectronPino.error("PanelsManager: error removiendo panel", e!);
    }
  }
}

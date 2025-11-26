export function initSettings(): void {
  const hotbarItems = document.querySelectorAll<HTMLElement>(".Hotbar-Item[data-panel]");
  const panels = document.querySelectorAll<HTMLElement>(".Panels-Container > div");
  window.ElectronPino.info("[ Panel - Settings ] Inicializado Correctamente");
  if (hotbarItems.length && panels.length) {
    hotbarItems[0]!.classList.add("active");

    const firstPanelSelector = `.${hotbarItems[0]!.dataset.panel}`;
    const firstPanel = document.querySelector<HTMLElement>(firstPanelSelector);
    if (firstPanel) firstPanel.classList.add("active");
  }

  hotbarItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetPanel = item.dataset.panel;
      if (!targetPanel) return;

      panels.forEach(panel => panel.classList.remove("active"));

      const panelToShow = document.querySelector<HTMLElement>(`.${targetPanel}`);
      if (panelToShow) panelToShow.classList.add("active");
      
      hotbarItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

export function InitWelcome() {
    const content = document.querySelector<HTMLElement>('.Welcome-Content');
    const sections = content?.querySelectorAll<HTMLElement>('section');
    const prevBtn = document.querySelector<HTMLElement>('.Welcome-HotbarButton:first-child');
    const nextBtn = document.querySelector<HTMLElement>('.Welcome-HotbarButton:last-child');
    window.ElectronPino.info("[ Panel - Welcome ] Inicializado Correctamente");
    if (!content) throw new Error("No se encontró .Welcome-Content");
    if (!sections || sections.length === 0) throw new Error("No se encontraron sections");
    if (!prevBtn) throw new Error("No se encontró el botón de 'volver'");
    if (!nextBtn) throw new Error("No se encontró el botón de 'siguiente'");
    let currentIndex = 0;
    sections.forEach(sec => {
        sec.style.flexShrink = '0';
        sec.style.transition = 'transform .5s ease-in-out';
    });
    function updateSections() {
        const sectionWidth = sections![0]!.offsetWidth;
        const gap = parseInt(getComputedStyle(content!).gap) || 0;
        const totalShift = (sectionWidth + gap) * currentIndex;
        sections!.forEach((sec) => {
            sec.style.transform = `translateX(${-totalShift}px)`;
        });
        prevBtn!.classList.toggle('Unvisible', currentIndex === 0);
        nextBtn!.classList.toggle('Unvisible', currentIndex === sections!.length - 1);
    }
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSections();
        }
    });
    nextBtn.addEventListener('click', () => {
        if (currentIndex < sections.length - 1) {
            currentIndex++;
            updateSections();
        }
    });
    updateSections();
}

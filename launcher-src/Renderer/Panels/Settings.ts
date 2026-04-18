import { SettingsScroller } from './Utils/SettingsScroller.js';
import { WindowResizeControl } from '../Components/UI/WindowsResize.js';
import { addGrabScroll } from '../Components/GrabSystem.js';
import { CanvasSelect, type CanvasSelectConfig } from '../Components/UI/Select.js';
import { createColorPicker } from '../Components/UI/ColorSelector.js';
import { createAnglePicker } from '../Components/UI/AngleSelector.js';

interface Destroyable {
    destroy(): void;
    pause?(): void;
    resume?(): void;
}

let components = new Set<Destroyable>();

const DEFAULT_SELECT_CONFIG: CanvasSelectConfig = {
    width: 280,
    height: 38,
    borderRadius: 6,
    fontFamily: 'Inter',
    fontSize: 12
};

const SELECT_DEFINITIONS = [
    {
        id: 'LauncherTypography',
        panelId: 'personalization',
        options: [
            { value: 'lexend', label: 'Lexend' },
            { value: 'comforta', label: 'Comforta' },
            { value: 'instrumentsans', label: 'InstrumentSans' },
            { value: 'inter', label: 'Inter' },
            { value: 'system', label: 'Tipografia del sistema' }
        ],
        onChange: (val: string) => console.log(`Typography Config: ${val}`)
    },
    {
        id: 'gpuPreference',
        panelId: 'minecraft',
        options: [
            { value: 'auto', label: 'Automatico (Recomendado)' },
            { value: 'dgpu', label: 'GPU dedicada (Mejor rendimiento)' },
            { value: 'igpu', label: 'GPU integrada (Ahorro de energia)' }
        ],
        onChange: (val: string) => console.log(`GPU Config: ${val}`)
    },
    {
        id: 'gcPreset',
        panelId: 'minecraft',
        options: [
            { value: 'auto', label: 'Automatico (Recomendado)' },
            { value: 'g1gc_basic', label: 'G1GC Basico (Estable)' },
            { value: 'g1gc_optimized', label: 'G1GC Optimizado (Menos lag)' },
            { value: 'zgc', label: 'ZGC (Ultra bajo lag, PCs potentes)' },
            { value: 'shenandoah', label: 'Shenandoah (Baja latencia)' }
        ],
        onChange: (val: string) => console.log(`GC Config: ${val}`)
    }
] as const;

const COLOR_PICKERS = [
    { id: 'ColorTitlebar', panelId: 'personalization', initialColor: '#1f2937', name: 'Titlebar Color' },
    { id: 'ColorMenuButtons', panelId: 'personalization', initialColor: '#111827', name: 'Menu Buttons Color' },
    { id: 'ColorPanels', panelId: 'personalization', initialColor: '#0f172a', name: 'Panels Color' },
    { id: 'ColorHotbar', panelId: 'personalization', initialColor: '#0b1120', name: 'Hotbar Color' },
    { id: 'ColorNotifications', panelId: 'personalization', initialColor: '#1d4ed8', name: 'Notifications Color' },
    { id: 'GradientPanelsStart', panelId: 'personalization', initialColor: '#0f172a', name: 'Gradient Panels Start' },
    { id: 'GradientPanelsEnd', panelId: 'personalization', initialColor: '#1e293b', name: 'Gradient Panels End' },
    { id: 'GradientTitlebarStart', panelId: 'personalization', initialColor: '#1e293b', name: 'Gradient Titlebar Start' },
    { id: 'GradientTitlebarEnd', panelId: 'personalization', initialColor: '#334155', name: 'Gradient Titlebar End' },
    { id: 'GradientHotbarStart', panelId: 'personalization', initialColor: '#172554', name: 'Gradient Hotbar Start' },
    { id: 'GradientHotbarEnd', panelId: 'personalization', initialColor: '#1d4ed8', name: 'Gradient Hotbar End' }
] as const;

const ANGLE_PICKERS = [
    { id: 'GradientAnglePanels', panelId: 'personalization', initialAngle: 135, name: 'Gradient Panels Angle' },
    { id: 'GradientAngleTitlebar', panelId: 'personalization', initialAngle: 90, name: 'Gradient Titlebar Angle' },
    { id: 'GradientAngleHotbar', panelId: 'personalization', initialAngle: 135, name: 'Gradient Hotbar Angle' }
] as const;

export function InitSettings(element: any, loader: any, api: any): void {
    const scroller = new SettingsScroller();
    components.add(scroller);

    const resizeControl = new WindowResizeControl("WindowsControlResize");
    components.add(resizeControl);

    for (const def of SELECT_DEFINITIONS) {
        const container = document.getElementById(def.id);
        if (!container) continue;

        const select = new CanvasSelect(container, DEFAULT_SELECT_CONFIG);
        select.setOptions(def.options as any);
        select.addEventListener('change', (e: any) => def.onChange(e.detail.value));

        scroller.registerCanvas(def.panelId, select);
        components.add(select);
    }

    for (const def of COLOR_PICKERS) {
        const container = document.getElementById(def.id);
        if (!container) continue;

        const picker = createColorPicker({
            container,
            initialColor: def.initialColor,
            onChange: (value) => console.log(`${def.name}: ${value.hex}`)
        }) as Destroyable;

        scroller.registerCanvas(def.panelId, picker);
        components.add(picker);
    }

    for (const def of ANGLE_PICKERS) {
        const container = document.getElementById(def.id);
        if (!container) continue;

        const picker = createAnglePicker({
            container,
            initialAngle: def.initialAngle,
            onChange: (value) => console.log(`${def.name}: ${value}`)
        }) as Destroyable;

        scroller.registerCanvas(def.panelId, picker);
        components.add(picker);
    }

    addGrabScroll('.Content_Section', {
        axis: 'y',
        threshold: 6,
        invert: false,
        speed: 1.2,
        dragClass: 'scrolling-active',
        autoCursor: false,
    });
}

export function destroy(): void {
    for (const component of components) {
        component.destroy();
    }
    components.clear();
}

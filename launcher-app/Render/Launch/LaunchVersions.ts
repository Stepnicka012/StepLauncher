import type { LaunchVersionsOptions } from "../../Types/Render/Launch";

const DEFAULT_OPTIONS: Required<LaunchVersionsOptions> = {
    dialogId: 'LaunchDialog',
    selectSelector: '.Launch-Selector-Version select',
    emptyText: 'No hay versiones instaladas'
};

export async function initLaunchVersions(options: LaunchVersionsOptions = {}): Promise<{ getSelectedVersion: () => string | null }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const dialog = document.getElementById(opts.dialogId);
    if (!(dialog instanceof HTMLDialogElement)) {
        throw new Error(`Dialog '${opts.dialogId}' no encontrado`);
    }

    const select = dialog.querySelector(opts.selectSelector);
    if (!(select instanceof HTMLSelectElement)) {
        throw new Error('Select de versiones no encontrado');
    }

    const setState = (text: string) => {
        select.innerHTML = '';
        const option = document.createElement('option');
        option.textContent = text;
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
    };

    setState('Cargando versiones...');

    try {
        const versions = await window.ElectronAPI.getVersions();

        if (!Array.isArray(versions) || versions.length === 0) {
            setState(opts.emptyText);
        } else {
            select.innerHTML = '';
            versions
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
                .forEach((version, i) => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    if (i === 0) option.selected = true;
                    select.appendChild(option);
                });
        }
    } catch {
        setState('Error cargando versiones');
    }

    return {
        getSelectedVersion: () => select.value || null
    };
}

export async function refreshLaunchVersions(options: LaunchVersionsOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const dialog = document.getElementById(opts.dialogId);
    if (!(dialog instanceof HTMLDialogElement)) return;

    const select = dialog.querySelector(opts.selectSelector);
    if (!(select instanceof HTMLSelectElement)) return;

    const setState = (text: string) => {
        select.innerHTML = '';
        const option = document.createElement('option');
        option.textContent = text;
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
    };

    setState('Cargando versiones...');

    try {
        const versions = await window.ElectronAPI.getVersions();

        if (!Array.isArray(versions) || versions.length === 0) {
            setState(opts.emptyText);
        } else {
            select.innerHTML = '';
            versions
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
                .forEach((version, i) => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    if (i === 0) option.selected = true;
                    select.appendChild(option);
                });
        }
    } catch {
        setState('Error cargando versiones');
    }
}

export async function initLaunchButton(dialogId = DEFAULT_OPTIONS.dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!(dialog instanceof HTMLDialogElement)) return;

    const launchBtn = dialog.querySelector<HTMLButtonElement>('.Launch-Button');
    const select = dialog.querySelector<HTMLSelectElement>('.Launch-Selector-Version select');
    const title = dialog.querySelector<HTMLElement>('.Dialog-Title h2');
    if (!launchBtn || !select) return;

    let launching = false;

    const setStatus = (text: string) => {
        if (title) title.textContent = text;
    };

    const onPreparing = (data: any) => {
        setStatus(`Preparando ${data.version}...`);
    };

    const onLaunched = (data: any) => {
        setStatus(`Minecraft iniciado (PID: ${data.pid})`);
        launching = false;
        launchBtn.disabled = false;
        launchBtn.textContent = '¡Ejecutar Minecraft!';
    };

    const onError = (data: any) => {
        setStatus(`Error: ${data?.error ?? 'Desconocido'}`);
        launching = false;
        launchBtn.disabled = false;
        launchBtn.textContent = '¡Ejecutar Minecraft!';
    };

    launchBtn.addEventListener('click', async () => {
        if (launching) return;
        const version = select.value;
        if (!version) {
            alert('Selecciona una versión para iniciar');
            return;
        }

        launching = true;
        launchBtn.disabled = true;
        launchBtn.textContent = 'Iniciando...';
        setStatus(`Iniciando ${version}...`);

        try {
            try { window.minecraftLaunch.onPreparing(onPreparing); } catch {}
            try { window.minecraftLaunch.onLaunched(onLaunched); } catch {}
            try { window.minecraftLaunch.onError(onError); } catch {}

            const res = await window.minecraftLaunch.launch(version, {});
            if (!res || !res.success) {
                throw new Error(res?.error ?? 'Fallo al iniciar');
            }

        } catch (err: any) {
            onError({ error: err?.message ?? String(err) });
        }
    });
}

const sidebar = document.querySelector<HTMLDivElement>(".Sidebar")!,
    buttons = document.querySelectorAll<HTMLButtonElement>(".TitleBar button")!,
    toggle = document.querySelector<HTMLButtonElement>(".Sidebar-Button-MainApp")!,
    btnInstall = document.getElementById("BTN_INSTALL")! as HTMLButtonElement | null;

if (!sidebar || !toggle || buttons.length < 3) {
	throw new Error("Titlebar UI elements missing");
}

if (!(window as any).TitlebarAPI) {
	(window as any).TitlebarAPI = {
		setCanClose: (value: boolean) => window.titlebar?.setCanClose?.(value),
		minimize: () => window.titlebar?.minimize?.(),
		toggleMaximize: () => window.titlebar?.toggleMaximize?.(),
		close: () => window.titlebar?.close?.(),
		setIcon: (state: "default" | "busy" | "locked") => {
			const closeImg = document.querySelector<HTMLImageElement>(".TitleBar button:nth-child(3) img");
			if (!closeImg) return;
			if (state === "locked") closeImg.src = "./Static/Svg/global/lock.svg";
			else if (state === "busy") closeImg.src = "./Static/Svg/global/loader.svg";
			else closeImg.src = "./Static/Svg/global/x.svg";
			document.body.dataset.titlebarIcon = state;
		}
	} as any;
}

buttons[0]!.addEventListener("click", () => {
	window.TitlebarAPI.minimize();
});

buttons[1]!.addEventListener("click", () => {
	window.TitlebarAPI.toggleMaximize();
});

buttons[2]!.addEventListener("click", () => {
	window.TitlebarAPI.close();
});

window.titlebar.onWindowState(({ maximized, fullscreen }) => {
	document.body.classList.toggle("maximized", maximized);
	document.body.classList.toggle("fullscreen", fullscreen);
});

toggle.addEventListener("click", () => {
	sidebar.classList.toggle("collapsed");
	sidebar.classList.toggle("expanded");
});

btnInstall?.addEventListener("click", async () => {
	const selectedText =
		document.querySelector(".Selected-Version")
			?.textContent?.split(":")[1]
			?.trim() ?? "Desconocida";

	const overlay = document.getElementById("DIALOG_VERIFYING_DATA");
	const searchVersion = document.querySelectorAll<HTMLElement>("#DIALOG_SEARCH_VERSION");
	const downloadActive = document.getElementById("DIALOG_DOWNLOAD_ACTIVE");

	const textOverlayVersion = document.getElementById("TEXT-LOADING-INFO-VERSION");
	const textFinalVersion = document.getElementById("SELECTED_VERSION");

	if (
		!overlay ||
		!downloadActive ||
		!textOverlayVersion ||
		!textFinalVersion
	) return;

	await window.TitlebarAPI.setCanClose(false);
	window.TitlebarAPI.setIcon("locked");

	textOverlayVersion.textContent = `Verificando Versión - ${selectedText}`;
	textFinalVersion.textContent = `Minecraft - ${selectedText}`;

	overlay.classList.replace("Hidden", "Show");

	setTimeout(() => {
		searchVersion.forEach(el =>
			el.classList.replace("Show", "Hidden")
		);

		overlay.classList.replace("Show", "Hidden");
		downloadActive.classList.replace("Hidden", "Show");
	}, 1900);
});

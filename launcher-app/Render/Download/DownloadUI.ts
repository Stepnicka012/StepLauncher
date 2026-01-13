import type { DownloadProgress } from "../../Types/App/Preload";
import type { UIElements, VersionData } from "../../Types/Render/Download";

export class DownloadUI {
	private elements: UIElements;
	private selectedVersion: string | null = null;
	private isDownloading = false;
	private isPaused = false;
	private versions: VersionData[] = [];
	private filteredVersions: VersionData[] = [];
	private enabledTypes = new Set<string>(["release"]);
	private unsubscribeDownloadEvents: (() => void) | null = null;
	
	private completedStages = new Set<string>();
	
	constructor() {
		this.elements = this.getElements();
		this.init();
	}
	
	private getElements(): UIElements {
		const get = <T extends Element>(selector: string): T => {
			const el = document.querySelector<T>(selector);
			if (!el) throw new Error(`Element not found: ${selector}`);
			return el;
		};
		
		const getAll = <T extends Element>(selector: string): NodeListOf<T> => {
			return document.querySelectorAll<T>(selector);
		};
		
		return {
			dialog: get<HTMLDialogElement>("#DownloadDialog"),
			dialogClose: get<HTMLButtonElement>(".Dialog-Close"),
			
			searchVersionSections: getAll("#DIALOG_SEARCH_VERSION"),
			downloadActiveSection: get<HTMLDivElement>("#DIALOG_DOWNLOAD_ACTIVE"),
			verifyingOverlay: get<HTMLDivElement>("#DIALOG_VERIFYING_DATA"),
			
			selectedVersionText: get<HTMLParagraphElement>(".Selected-Version"),
			overlayVersionText: get<HTMLHeadingElement>("#TEXT-LOADING-INFO-VERSION"),
			finalVersionText: get<HTMLHeadingElement>("#SELECTED_VERSION"),
			
			btnInstall: get<HTMLDivElement>("#BTN_INSTALL"),
			btnCancel: get<HTMLButtonElement>("#CANCEL_INSTALLATION"),
			btnControl: get<HTMLButtonElement>("#CONTROL_INSTALLATION"),
			
			searchInput: get<HTMLInputElement>("#SearchVersion"),
			versionsContainer: get<HTMLDivElement>(".Versions"),
			typeCheckboxes: getAll<HTMLInputElement>('input[type="checkbox"][data-type]'),
			
			stepsContainer: get<HTMLDivElement>(".Steps-Download"),
			progressText: get<HTMLParagraphElement>(".Progress_Text_Porcentaje"),
			
			steps: {
				client: get<HTMLDivElement>('[data-stepdownload="Version"]'),
				natives: get<HTMLDivElement>('[data-stepdownload="Natives"]'),
				libraries: get<HTMLDivElement>('[data-stepdownload="Libraries"]'),
				assets: get<HTMLDivElement>('[data-stepdownload="Assets"]'),
				runtime: get<HTMLDivElement>('[data-stepdownload="Runtime"]')
			}
		};
	}
	
	private async init(): Promise<void> {
		await this.loadVersions();
		this.setupEventListeners();
		this.renderVersions();
	}
	
	private setupEventListeners(): void {
		this.elements.dialogClose.addEventListener("click", () => {
			if (!this.isDownloading) {
				this.elements.dialog.close();
			}
		});
		
		this.elements.btnInstall.addEventListener("click", () => {
			this.handleInstallClick();
		});
		
		this.elements.btnCancel.addEventListener("click", () => {
			this.handleCancelClick();
		});
		
		this.elements.btnControl.addEventListener("click", () => {
			this.handleControlClick();
		});
		
		this.elements.searchInput.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			this.filterVersions(query);
		});
		
		this.elements.typeCheckboxes.forEach(checkbox => {
			checkbox.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const type = target.dataset.type;
				if (!type) return;
				
				if (target.checked) {
					this.enabledTypes.add(type);
				} else {
					this.enabledTypes.delete(type);
				}
				
				this.filterVersions(this.elements.searchInput.value.toLowerCase());
			});
		});
	}
	
	private async loadVersions(): Promise<void> {
		try {
			const response = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
			const data = await response.json();
			this.versions = data.versions;
			this.filteredVersions = this.versions.filter(v => this.enabledTypes.has(v.type));
		} catch (error) {
			window.StepLauncherLogger.error("Error loading versions:", error);
		}
	}
	
	private filterVersions(query: string): void {
		this.filteredVersions = this.versions.filter(v => {
			const matchesType = this.enabledTypes.has(v.type);
			const matchesQuery = query === "" || v.id.toLowerCase().includes(query);
			return matchesType && matchesQuery;
		});
		this.renderVersions();
	}
	
	private renderVersions(): void {
		this.elements.versionsContainer.innerHTML = "";
		
		this.filteredVersions.forEach(version => {
			const versionEl = document.createElement("div");
			versionEl.className = "Version-Item";
			versionEl.textContent = version.id;
			versionEl.dataset.version = version.id;
			versionEl.dataset.type = version.type;
			
			versionEl.addEventListener("click", () => {
				this.selectVersion(version.id);
			});
			
			this.elements.versionsContainer.appendChild(versionEl);
		});
	}
	
	private selectVersion(version: string): void {
		this.selectedVersion = version;
		this.elements.selectedVersionText.textContent = `Version seleccionada : ${version}`;

		const el = document.querySelector(`[data-version="${version}"]`);
		const type = el?.getAttribute('data-type') ?? 'release';
		(this as any).selectedVersionType = type;
		
		document.querySelectorAll(".Version-Item").forEach(el => {
			el.classList.remove("selected");
		});
		
		const selectedEl = document.querySelector(`[data-version="${version}"]`);
		selectedEl?.classList.add("selected");
	}
	
	private async handleInstallClick(): Promise<void> {
		if (!this.selectedVersion) {
			const domSelected = this.elements.versionsContainer.querySelector('.Version-Item.selected') as HTMLElement | null;
			if (domSelected && domSelected.dataset && domSelected.dataset.version) {
				this.selectedVersion = domSelected.dataset.version;
			} else {
				const text = this.elements.selectedVersionText.textContent || '';
				const m = text.match(/:\s*(\S+)/);
				if (m && m[1]) this.selectedVersion = m[1];
			}
		}
		if (!this.selectedVersion) {
			alert("Por favor selecciona una versión");
			return;
		}
		
		if (this.isDownloading) return;
		
		this.elements.overlayVersionText.textContent = `Verificando Version - ${this.selectedVersion}`;
		this.elements.finalVersionText.textContent = `Minecraft - ${this.selectedVersion}`;
		
		this.elements.verifyingOverlay.classList.replace("Hidden", "Show");
		
		setTimeout(async () => {
			this.elements.searchVersionSections.forEach(el => {
				el.classList.replace("Show", "Hidden");
			});
			this.elements.verifyingOverlay.classList.replace("Show", "Hidden");
			this.elements.downloadActiveSection.classList.replace("Hidden", "Show");

			try {
				const progressImg = this.elements.downloadActiveSection.querySelector<HTMLImageElement>('.Steps-Progress .Image-Container img');
				const type = (this as any).selectedVersionType ?? 'release';
				if (progressImg) {
					if (type !== 'release') progressImg.src = './Static/Img/Blocks/Dirt.png';
					else progressImg.src = './Static/Img/Blocks/Grass.png';
				}
			} catch (e) {
				console.warn('No se pudo actualizar imagen de progreso', e);
			}

			await this.startDownload();
		}, 1900);
	}
	
	private async startDownload(): Promise<void> {
		if (!this.selectedVersion) return;
		
		this.isDownloading = true;
		this.isPaused = false;
		this.elements.btnControl.textContent = "Pausar";
		
		this.resetSteps();
		
		this.unsubscribeDownloadEvents = window.minecraftDownloaders.onDownloadEvent((event: any) => {
			this.handleDownloadEvent(event);
		});
		
		const result = await window.minecraftDownloaders.startDownload({
			version: this.selectedVersion,
			concurrency: {
				assets: 20,
				libraries: 16,
				natives: 16,
				runtime: 8
			},
			maxRetries: 5,
			decodeJson: true,
			forceInstallAssets: false
		});
		
		if (!result.success) {
			alert(`Error al iniciar descarga: ${result.error}`);
			this.isDownloading = false;
		}
	}
	
	private handleDownloadEvent(event: any): void {
		switch (event.type) {
			case "Start":
				window.StepLauncherLogger.log("Descarga iniciada");
				Object.values(this.elements.steps).forEach(step => {
					step.classList.add("active");
				});

				try {
					window.TitlebarAPI.setCanClose(false);
					window.TitlebarAPI.setIcon("locked");
				} catch (e) {
					window.StepLauncherLogger.warn('TitlebarAPI not available to lock window', e);
				}
				break;
				
			case "Progress":
				this.updateProgress(event.progress);
				break;
				
			case "StageCompleted":
				this.markStageCompleted(event.stage);
				break;
				
			case "Done":
				this.handleDownloadComplete();
				try {
					window.TitlebarAPI.setCanClose(true);
					window.TitlebarAPI.setIcon("default");
				} catch (e) {
					window.StepLauncherLogger.warn('TitlebarAPI not available to unlock window', e);
				}
				break;
				
			case "Error":
				this.handleDownloadError(event.error);
				try {
					window.TitlebarAPI.setCanClose(true);
					window.TitlebarAPI.setIcon("default");
				} catch (e) {
					window.StepLauncherLogger.warn('TitlebarAPI not available to unlock window', e);
				}
				break;
				
			case "Stopped":
				this.handleDownloadStopped();
				try {
					window.TitlebarAPI.setCanClose(true);
					window.TitlebarAPI.setIcon("default");
				} catch (e) {
					window.StepLauncherLogger.warn('TitlebarAPI not available to unlock window', e);
				}
				break;
				
			case "Paused":
				this.isPaused = true;
				this.elements.btnControl.textContent = "Reanudar";
				break;
				
			case "Resumed":
				this.isPaused = false;
				this.elements.btnControl.textContent = "Pausar";
				break;
		}
	}
	
	private updateProgress(progress: DownloadProgress): void {
		const stages: Array<keyof DownloadProgress['stageProgress']> = ['client', 'assets', 'libraries', 'natives', 'runtime'];
		let sum = 0;
		let count = 0;
		for (const s of stages) {
			const val = progress.stageProgress?.[s];
			if (typeof val === 'number' && isFinite(val)) {
				sum += Math.max(0, Math.min(val, 100));
				count++;
			}
		}
		let globalPercentage = 0;
		if (count > 0) {
			globalPercentage = sum / count;
		} else if (progress.totalBytes > 0) {
			globalPercentage = Math.min((progress.downloadedBytes / progress.totalBytes) * 100, 100);
		} else {
			globalPercentage = 0;
		}
		
		this.elements.progressText.textContent = `${Math.min(globalPercentage, 100).toFixed(2)}%`;
		document.documentElement.style.setProperty('--progress-download-bg', `${Math.min(globalPercentage, 100)}%`);
		
		this.updateStageProgressWithValidation("client", progress.stageProgress.client);
		this.updateStageProgressWithValidation("assets", progress.stageProgress.assets);
		this.updateStageProgressWithValidation("libraries", progress.stageProgress.libraries);
		this.updateStageProgressWithValidation("natives", progress.stageProgress.natives);
		this.updateStageProgressWithValidation("runtime", progress.stageProgress.runtime);
	}
	
	private updateStageProgressWithValidation(stage: keyof typeof this.elements.steps, rawPercentage: number): void {
		const stepEl = this.elements.steps[stage];
		const progressLabel = stepEl.querySelector<HTMLLabelElement>("#PROGRESS");
		
		if (!progressLabel) return;
		
		let displayPercentage = rawPercentage;
		
		if (this.completedStages.has(stage)) {
			displayPercentage = 100;
		}

		else if (isNaN(rawPercentage) || !isFinite(rawPercentage) || rawPercentage < 0) {
			if (stepEl.classList.contains("active")) {
				displayPercentage = 0;
			} else {
				displayPercentage = 0;
			}
		}
		else {
			displayPercentage = Math.min(rawPercentage, 100);
		}
		
		if (!isNaN(displayPercentage) && isFinite(displayPercentage) && displayPercentage >= 0) {
			progressLabel.textContent = `${displayPercentage.toFixed(2)}%`;
			
			if (displayPercentage >= 100 && stepEl.classList.contains("active")) {
				stepEl.classList.remove("active");
				stepEl.classList.add("completed");
				this.completedStages.add(stage);
			}
		}
	}
	
	private markStageCompleted(stage: string): void {
		const stageMap: Record<string, keyof typeof this.elements.steps> = {
			"client": "client",
			"assets": "assets",
			"libraries": "libraries",
			"natives": "natives",
			"runtime": "runtime"
		};
		
		const stepKey = stageMap[stage];
		if (stepKey) {
			const stepEl = this.elements.steps[stepKey];
			stepEl.classList.remove("active");
			stepEl.classList.add("completed");
			
			this.completedStages.add(stepKey);
			
			const progressLabel = stepEl.querySelector<HTMLLabelElement>("#PROGRESS");
			if (progressLabel) {
				progressLabel.textContent = "100.00%";
			}
		}
	}
	
	private handleDownloadComplete(): void {
		this.isDownloading = false;
		this.isPaused = false;
		
		Object.values(this.elements.steps).forEach(step => {
			step.classList.remove("active");
			step.classList.add("completed");
			const progressLabel = step.querySelector<HTMLLabelElement>("#PROGRESS");
			if (progressLabel) {
				progressLabel.textContent = "100.00%";
			}
		});
		
		this.completedStages.clear();
		
		this.elements.progressText.textContent = "100.00%";
		
		document.documentElement.style.setProperty('--progress-download-bg', '100%');
		
		setTimeout(() => {
			this.resetUI();
			try {
				import('../Launch/LaunchVersions.js').then(mod => {
					if (mod?.refreshLaunchVersions) mod.refreshLaunchVersions();
				});
			} catch (e) {
				console.warn('No se pudo refrescar LaunchVersions', e);
			}
		}, 2000);
		
		if (this.unsubscribeDownloadEvents) {
			this.unsubscribeDownloadEvents();
			this.unsubscribeDownloadEvents = null;
		}
	}
	
	private handleDownloadError(error: string): void {
		alert(`Error en la descarga: ${error}`);
		this.isDownloading = false;
		this.isPaused = false;
		this.resetUI();
		
		this.completedStages.clear();
		
		if (this.unsubscribeDownloadEvents) {
			this.unsubscribeDownloadEvents();
			this.unsubscribeDownloadEvents = null;
		}
	}
	
	private handleDownloadStopped(): void {
		this.isDownloading = false;
		this.isPaused = false;
		this.resetUI();
		
		// Limpiar el set de etapas completadas
		this.completedStages.clear();
		
		if (this.unsubscribeDownloadEvents) {
			this.unsubscribeDownloadEvents();
			this.unsubscribeDownloadEvents = null;
		}
	}
	
	private async handleCancelClick(): Promise<void> {
		if (!this.isDownloading) return;
		
		const confirm = window.confirm("¿Estás seguro de que quieres cancelar la descarga?");
		if (!confirm) return;
		
		await window.minecraftDownloaders.stopDownload();
	}
	
	private async handleControlClick(): Promise<void> {
		if (!this.isDownloading) return;
		
		if (this.isPaused) {
			await window.minecraftDownloaders.resumeDownload();
		} else {
			await window.minecraftDownloaders.pauseDownload();
		}
	}
	
	private resetSteps(): void {
		Object.values(this.elements.steps).forEach(step => {
			step.classList.remove("active", "completed");
			const progressLabel = step.querySelector<HTMLLabelElement>("#PROGRESS");
			if (progressLabel) {
				progressLabel.textContent = "00.00%";
			}
		});
		
		this.completedStages.clear();
		
		this.elements.progressText.textContent = "00.00%";
		document.documentElement.style.setProperty('--progress-download-bg', '0%');
	}
	
	private resetUI(): void {
		this.elements.downloadActiveSection.classList.replace("Show", "Hidden");
		this.elements.searchVersionSections.forEach(el => {
			el.classList.replace("Hidden", "Show");
		});
		
		this.resetSteps();
		this.selectedVersion = null;
		this.elements.selectedVersionText.textContent = "Version seleccionada : Ninguna";
	}
	
	public open(): void {
		this.elements.dialog.showModal();
		this.elements.dialog.classList.remove("HIDDEN_DIALOG");
	}
	
	public close(): void {
		if (!this.isDownloading) {
			this.elements.dialog.close();
			this.elements.dialog.classList.add("HIDDEN_DIALOG");
		}
	}
}

let downloadUIInstance: DownloadUI | null = null;

export function initDownloadUI(): DownloadUI {
	if (!downloadUIInstance) {
		downloadUIInstance = new DownloadUI();
	}
	return downloadUIInstance;
}

export function getDownloadUI(): DownloadUI | null {
	return downloadUIInstance;
}
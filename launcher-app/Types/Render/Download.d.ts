export interface UIElements {
	dialog: HTMLDialogElement;
	dialogClose: HTMLButtonElement;
	
	searchVersionSections: NodeListOf<Element>;
	downloadActiveSection: HTMLDivElement;
	verifyingOverlay: HTMLDivElement;
	
	selectedVersionText: HTMLParagraphElement;
	overlayVersionText: HTMLHeadingElement;
	finalVersionText: HTMLHeadingElement;
	
	btnInstall: HTMLDivElement;
	btnCancel: HTMLButtonElement;
	btnControl: HTMLButtonElement;
	
	searchInput: HTMLInputElement;
	versionsContainer: HTMLDivElement;
	typeCheckboxes: NodeListOf<HTMLInputElement>;
	
	stepsContainer: HTMLDivElement;
	progressText: HTMLParagraphElement;
	
	steps: {
		client: HTMLDivElement;
		natives: HTMLDivElement;
		libraries: HTMLDivElement;
		assets: HTMLDivElement;
		runtime: HTMLDivElement;
	};
}

export interface VersionData {
	id: string;
	type: string;
	url: string;
	releaseTime: string;
}

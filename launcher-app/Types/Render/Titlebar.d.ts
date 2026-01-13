export type TitlebarIconState = "default" | "busy" | "locked";

declare global {
	interface TitlebarRemote {
		minimize(): void;
		toggleMaximize(): void;
		close(): void;
		setCanClose(value: boolean): void;
		onWindowState(callback: (state: { maximized: boolean; fullscreen: boolean }) => void): void;
	}

	interface TitlebarAPIClass {
		setCanClose(value: boolean): void;
		minimize(): void;
		toggleMaximize(): void;
		close(): void;
		setIcon(state: TitlebarIconState): void;
	}

	interface Window {
		titlebar: TitlebarRemote;
		TitlebarAPI: TitlebarAPIClass;
	}
}

export {};

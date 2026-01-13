
export interface DownloadManagerOptions {
	version: string;
	concurrency?: {
		assets?: number;
		libraries?: number;
		natives?: number;
		runtime?: number;
	};
	maxRetries?: number;
	decodeJson?: boolean;
	forceInstallAssets?: boolean;
}

export interface DownloadProgress {
	stage: "downloading" | "done";
	totalBytes: number;
	downloadedBytes: number;
	percentage: number;
	speed: number;
	eta: number;
	stageProgress: {
		client: number;
		assets: number;
		libraries: number;
		natives: number;
		runtime: number;
	};
}

export interface DownloadStats {
	client: { total: number; downloaded: number; done: boolean };
	assets: { total: number; downloaded: number; done: boolean };
	libraries: { total: number; downloaded: number; done: boolean };
	natives: { total: number; downloaded: number; done: boolean };
	runtime: { total: number; downloaded: number; done: boolean };
}

export interface DownloadEvent {
	type: "Start" | "Progress" | "StageCompleted" | "Done" | "Error" | "Stopped" | "Paused" | "Resumed";
	progress?: DownloadProgress;
	stage?: string;
	error?: string;
}
export type DownloadEventCallback = (event: DownloadEvent) => void;

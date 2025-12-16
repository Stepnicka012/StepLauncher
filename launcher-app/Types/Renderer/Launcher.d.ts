export interface IframeMessage {
  type: string;
  data: any;
  timestamp: number;
  iframeId?: string | null;
}

export interface LinkClickMessage extends IframeMessage {
  type: 'LINK_CLICK';
  data: {
    href: string;
    text: string;
  };
}

export interface SuccessMessage extends IframeMessage {
  type: 'SUCCESS';
  data: {
    message: string;
    details?: any;
  };
}

export interface ErrorMessage extends IframeMessage {
  type: 'ERROR';
  data: {
    message: string;
    error?: any;
    stack?: string;
  };
}

export interface LangDataMessage {
  type: 'LANG_DATA';
  data: {
    filter_all: string;
    filter_release: string;
    filter_snapshots: string;
    filter_steplauncher: string;
  };
  timestamp: number;
}

export interface IframeMessengerOptions {
  messageTargetOrigin?: string;
}
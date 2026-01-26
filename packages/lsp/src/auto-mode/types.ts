// LSP server state
export type LspServerState =
  | "idle" // idle
  | "detecting" // detecting
  | "needs-install" // needs installation
  | "needs-start" // needs start
  | "waiting-confirm" // waiting for user confirmation (semi-auto)
  | "installing" // installing
  | "starting" // starting
  | "running" // running
  | "error" // error state
  | "stopping"; // stopping

// 状态事件
export interface LspStateChangeEvent {
  serverId: string;
  previousState: LspServerState;
  currentState: LspServerState;
  timestamp: number;
  error?: Error;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
}

// Language detection result
export interface DetectedLanguage {
  languageId: string; // "typescript", "python", etc.
  serverId: string; // LSP server id
  confidence: number; // 0-1
  matchedFiles: string[];
  suggestedAction: "install" | "start" | "none";
}

// User confirmation request (for semi-auto)
export interface ConfirmationRequest {
  serverId: string;
  languageId: string;
  action: "install" | "start";
  message: string;
}

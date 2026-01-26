// LSP服务器状态
export type LspServerState =
  | "idle" // 未运行
  | "detecting" // 检测中
  | "needs-install" // 需要安装
  | "needs-start" // 需要启动
  | "waiting-confirm" // 等待用户确认 (semi-auto)
  | "installing" // 安装中
  | "starting" // 启动中
  | "running" // 运行中
  | "error" // 错误状态
  | "stopping"; // 停止中

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

// 语言检测结果
export interface DetectedLanguage {
  languageId: string; // "typescript", "python", etc.
  serverId: string; // LSP server id
  confidence: number; // 0-1
  matchedFiles: string[];
  suggestedAction: "install" | "start" | "none";
}

// 用户确认请求 (for semi-auto)
export interface ConfirmationRequest {
  serverId: string;
  languageId: string;
  action: "install" | "start";
  message: string;
}

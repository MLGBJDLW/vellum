/**
 * TUI Hooks
 *
 * React hooks for the Vellum CLI terminal UI.
 */

export {
  type AgentMessage,
  type CurrentTool,
  type HookStatus,
  type UseAgentLoopReturn,
  useAgentLoop,
} from "./useAgentLoop.js";
export {
  ANSI,
  bufferUtils,
  type UseAlternateBufferOptions,
  type UseAlternateBufferReturn,
  useAlternateBuffer,
} from "./useAlternateBuffer.js";
export {
  type BacktrackState,
  type Branch,
  type HistorySnapshot,
  type UseBacktrackOptions,
  type UseBacktrackReturn,
  useBacktrack,
} from "./useBacktrack.js";
export {
  type CopyModeState,
  type UseCopyModeReturn,
  useCopyMode,
} from "./useCopyMode.js";
export {
  type NotificationOptions,
  type NotificationPriority,
  type NotificationType,
  type UseDesktopNotificationOptions,
  type UseDesktopNotificationReturn,
  useDesktopNotification,
} from "./useDesktopNotification.js";
export {
  createStandardHotkeys,
  formatHotkey,
  generateHotkeyHelp,
  type HotkeyDefinition,
  type HotkeyScope,
  type StandardHotkeyHandlers,
  type UseHotkeysOptions,
  type UseHotkeysReturn,
  useHotkeys,
} from "./useHotkeys.js";
export {
  type UseInputHistoryOptions,
  type UseInputHistoryReturn,
  useInputHistory,
} from "./useInputHistory.js";
// Mode shortcuts hook (T046)
export {
  type UseModeShortcutsOptions,
  type UseModeShortcutsReturn,
  useModeShortcuts,
} from "./useModeShortcuts.js";
export {
  type PendingPermission,
  type UsePermissionHandlerReturn,
  usePermissionHandler,
} from "./usePermissionHandler.js";
export {
  type AnnouncementPriority,
  formatForScreenReader,
  isScreenReaderEnabled,
  type UseScreenReaderOptions,
  type UseScreenReaderReturn,
  useScreenReader,
} from "./useScreenReader.js";
export {
  type ToolApprovalViewModel,
  type UseToolApprovalControllerOptions,
  useToolApprovalController,
} from "./useToolApprovalController.js";
export {
  type KeyModifiers,
  type UseVimReturn,
  useVim,
  type VimAction,
  type VimEditAction,
  type VimMode,
  type VimModeAction,
  type VimMotionAction,
} from "./useVim.js";

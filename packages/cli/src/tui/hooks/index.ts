/**
 * TUI Hooks
 *
 * React hooks for the Vellum CLI terminal UI.
 */

export {
  type AgentMessage,
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
// Animated scrollbar hook (ported from Gemini CLI)
export {
  type AnimatedScrollbarConfig,
  type UseAnimatedScrollbarReturn,
  useAnimatedScrollbar,
} from "./useAnimatedScrollbar.js";
export {
  type BacktrackState,
  type Branch,
  type HistorySnapshot,
  type UseBacktrackOptions,
  type UseBacktrackReturn,
  useBacktrack,
} from "./useBacktrack.js";
// Bracketed paste hook
export {
  type UseBracketedPasteOptions,
  useBracketedPaste,
} from "./useBracketedPaste.js";
// Collapsible state management hook
export {
  clearAllCollapsibleStates,
  clearCollapsibleState,
  type UseCollapsibleOptions,
  type UseCollapsibleReturn,
  useCollapsible,
} from "./useCollapsible.js";
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
// File change statistics hook (aggregates diff metadata)
export {
  type FileChangeStats,
  useFileChangeStats,
} from "./useFileChangeStats.js";
export {
  type UseFileSuggestionsOptions,
  type UseFileSuggestionsResult,
  useFileSuggestions,
} from "./useFileSuggestions.js";
// Flicker detection hook (ported from Gemini CLI)
export {
  calculateSafeContainerHeight,
  type FlickerDetectorResult,
  isContentOverflowing,
  type UseFlickerDetectorOptions,
  useFlickerDetector,
} from "./useFlickerDetector.js";
export {
  type GitStatus,
  useGitStatus,
} from "./useGitStatus.js";
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
// Input highlighting hook for syntax highlighting in input fields
export {
  type UseInputHighlightOptions,
  type UseInputHighlightReturn,
  useInputHighlight,
  useMultilineHighlight,
} from "./useInputHighlight.js";
export {
  type UseInputHistoryOptions,
  type UseInputHistoryReturn,
  useInputHistory,
} from "./useInputHistory.js";
// Keyboard scroll hook for scroll navigation
export {
  formatScrollShortcuts,
  getScrollShortcutsNoVim,
  type KeyboardScrollShortcut,
  type UseKeyboardScrollOptions,
  type UseKeyboardScrollReturn,
  useKeyboardScroll,
} from "./useKeyboardScroll.js";
// Line buffer hook for pre-wrapped message lines (scroll optimization)
export {
  type LineBufferEntry,
  type LineBufferState,
  type UseLineBufferOptions,
  useLineBuffer,
  wrapLine,
  wrapText,
} from "./useLineBuffer.js";
// @ Mention autocomplete hooks (Phase: TUI Context Mentions)
export {
  type MentionAutocompleteState,
  type UseMentionAutocompleteOptions,
  type UseMentionAutocompleteResult,
  useMentionAutocomplete,
} from "./useMentionAutocomplete.js";
// Mode controller hook for adaptive rendering (T003)
export {
  type ModeControllerConfig,
  type ModeControllerState,
  type ModeReason,
  type RenderMode,
  type UseModeControllerInput,
  useModeController,
} from "./useModeController.js";
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
// Persistence hooks
export {
  type PersistenceStatus,
  type UsePersistenceOptions,
  type UsePersistenceReturn,
  usePersistence,
} from "./usePersistence.js";
export {
  PERSISTENCE_SHORTCUTS,
  type UsePersistenceShortcutsOptions,
  type UsePersistenceShortcutsReturn,
  usePersistenceShortcuts,
} from "./usePersistenceShortcuts.js";
// Provider status hook (circuit breaker states)
export {
  type CircuitState,
  type ProviderStatusEntry,
  type UseProviderStatusOptions,
  type UseProviderStatusReturn,
  useProviderStatus,
} from "./useProviderStatus.js";
export {
  type AnnouncementPriority,
  formatForScreenReader,
  isScreenReaderEnabled,
  type UseScreenReaderOptions,
  type UseScreenReaderReturn,
  useScreenReader,
} from "./useScreenReader.js";
// Scroll controller hook for follow/manual scroll modes
export {
  getScrollPercentage,
  isAtBottom,
  isAtTop,
  isScrollable,
  type ScrollMode,
  type UseScrollControllerOptions,
  useScrollController,
  type ViewportScrollActions,
  type ViewportScrollState,
} from "./useScrollController.js";
// Scroll event batcher hook for jitter prevention
export {
  type BatchStrategy,
  type ScrollEventBatcherConfig,
  type UseScrollEventBatcherReturn,
  useScrollEventBatcher,
} from "./useScrollEventBatcher.js";
// Smooth scroll animation hook
export {
  type EasingFunction,
  easings,
  type SmoothScrollConfig,
  type UseSmoothScrollReturn,
  useSmoothScroll,
} from "./useSmoothScroll.js";
// Snapshot-based checkpoint hook
export {
  type RestoreResult,
  type UseSnapshotsResult,
  useSnapshots,
} from "./useSnapshots.js";
// State and ref hook for stable callbacks (Gemini CLI pattern)
export { useStateAndRef } from "./useStateAndRef.js";
// Terminal size hook (responsive layouts)
export {
  type TerminalSize,
  type UseTerminalSizeOptions,
  useIsNarrowWidth,
  useTerminalDimensions,
} from "./useTerminalSize.js";
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
// Workspace and Git status hooks (Header Bar)
export {
  useWorkspace,
  type WorkspaceInfo,
} from "./useWorkspace.js";

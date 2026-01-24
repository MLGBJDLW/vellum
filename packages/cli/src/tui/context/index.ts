/**
 * TUI Context
 *
 * React contexts for state management in the Vellum TUI.
 *
 * @module tui/context
 */

// Animation context (global animation loop for spinners, etc.)
export {
  AnimationContext,
  type AnimationContextValue,
  AnimationProvider,
  type AnimationProviderProps,
  type AnimationState,
  useAnimation,
  useAnimationFrame,
} from "./AnimationContext.js";

// Application state context
export {
  type AppAction,
  AppContext,
  type AppContextValue,
  type AppMode,
  AppProvider,
  type AppProviderProps,
  type AppState,
  type FocusedArea,
  initialState,
  type ResetAction,
  type SetErrorAction,
  type SetFocusedAreaAction,
  type SetLoadingAction,
  type SetModeAction,
  type SetVimModeAction,
  type ToggleVimModeAction,
  useApp,
} from "./AppContext.js";

// Bracketed paste context
export {
  BracketedPasteProvider,
  type PasteHandler,
  useBracketedPasteContext,
  useIsPasting,
  usePasteHandler,
} from "./BracketedPasteContext.js";

// LSP Context
export {
  type LspContextState,
  LspProvider,
  type LspProviderProps,
  useLsp,
  useLspOptional,
} from "./LspContext.js";

// T047: MCP Context
export {
  type McpContextState,
  McpProvider,
  type McpProviderProps,
  useMcp,
  useMcpHub,
} from "./McpContext.js";
// Messages state context
export {
  type AddMessageAction,
  type AppendToMessageAction,
  type ClearMessagesAction,
  initialState as messagesInitialState,
  type Message,
  type MessageRole,
  type MessagesAction,
  MessagesContext,
  type MessagesContextValue,
  MessagesProvider,
  type MessagesProviderProps,
  type MessagesState,
  type SetStreamingAction,
  type ToolCallInfo,
  type ToolCallStatus,
  type UpdateMessageAction,
  useMessages,
} from "./MessagesContext.js";
// Overflow tracking context (ported from Gemini CLI)
export {
  OverflowContext,
  type OverflowContextValue,
  OverflowProvider,
  type OverflowProviderProps,
  type OverflowState,
  useOverflow,
  useOverflowOptional,
} from "./OverflowContext.js";
// Resilience context (rate limiting, retry feedback)
export {
  type ResilienceContextState,
  ResilienceProvider,
  type ResilienceProviderProps,
  type ResilienceStatus,
  useIsResilienceActive,
  useResilience,
  useResilienceOptional,
  useResilienceStatus,
} from "./ResilienceContext.js";
// Root provider composition
export { RootProvider, type RootProviderProps } from "./RootProvider.js";
// Scroll state context (ported from Gemini CLI)
export {
  // Types
  type ScrollActions,
  // Contexts
  ScrollActionsContext,
  ScrollContext,
  type ScrollContextValue,
  // Provider
  ScrollProvider,
  type ScrollProviderProps,
  type ScrollState,
  ScrollStateContext,
  // Hooks
  useScroll,
  useScrollActions,
  useScrollActionsOptional,
  useScrollOptional,
  useScrollState,
  useScrollStateOptional,
} from "./ScrollContext.js";

// Tools state context
export {
  type AddExecutionAction,
  type ApproveAllAction,
  type ApproveExecutionAction,
  type ClearExecutionsAction,
  initialState as toolsInitialState,
  type RejectExecutionAction,
  type ToolExecution,
  type ToolExecutionStatus,
  type ToolsAction,
  ToolsContext,
  type ToolsContextValue,
  ToolsProvider,
  type ToolsProviderProps,
  type ToolsState,
  type UpdateExecutionAction,
  useTools,
} from "./ToolsContext.js";

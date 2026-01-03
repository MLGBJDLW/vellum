/**
 * TUI Context
 *
 * React contexts for state management in the Vellum TUI.
 *
 * @module tui/context
 */

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
  type UpdateMessageAction,
  useMessages,
} from "./MessagesContext.js";

// Root provider composition
export { RootProvider, type RootProviderProps } from "./RootProvider.js";
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

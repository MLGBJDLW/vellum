/**
 * TUI Adapters
 *
 * Adapters for integrating external systems with the Vellum TUI.
 *
 * @module tui/adapters
 */

// Agent Adapter - AgentLoop ↔ Context integration
export {
  type AdapterDispatchers,
  type AgentAdapter,
  createAgentAdapter,
  type UseAgentAdapterOptions,
  type UseAgentAdapterReturn,
  useAgentAdapter,
} from "./agent-adapter.js";

// Message Adapter - Session ↔ UI message conversion
export {
  createUIMessage,
  getSessionToolIds,
  sessionHasToolCalls,
  sessionHasToolResults,
  toSessionMessage,
  toSessionMessages,
  toUIMessage,
  toUIMessages,
} from "./message-adapter.js";

// Session Adapter - Session persistence
export {
  createMemorySessionStorage,
  createSessionAdapter,
  type SessionAdapter,
  type SessionStorage,
  type UseSessionAdapterOptions,
  type UseSessionAdapterReturn,
  useSessionAdapter,
} from "./session-adapter.js";

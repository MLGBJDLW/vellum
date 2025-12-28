// ============================================
// Vellum Events - Barrel Export
// ============================================

export {
  defineEvent,
  EventBus,
  type EventBusOptions,
  type EventDefinition,
  TimeoutError,
} from "./bus.js";

export {
  // Credential events (T034)
  credentialNotFound,
  credentialResolved,
  credentialRotated,
  credentialStored,
  type EventPayload,
  Events,
  errorEvent,
  messageCreated,
  messageUpdated,
  sessionEnd,
  sessionStart,
  streamEnd,
  streamToken,
  toolEnd,
  toolStart,
  toolStateChange,
  // Agent loop events (T029)
  agentStateChange,
  agentText,
  agentThinking,
  agentToolStart,
  agentToolEnd,
  agentTerminated,
  agentShutdownComplete,
} from "./definitions.js";

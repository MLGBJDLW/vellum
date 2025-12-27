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
} from "./definitions.js";

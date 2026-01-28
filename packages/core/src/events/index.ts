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
  agentShutdownComplete,
  // Agent loop events (T029)
  agentStateChange,
  agentTerminated,
  agentText,
  agentThinking,
  agentToolEnd,
  agentToolStart,
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
  // Tool timeout warning event
  toolTimeoutWarning,
} from "./definitions.js";

// =============================================================================
// Tool Event Bus Singleton
// =============================================================================

import { EventBus } from "./bus.js";

let globalToolEventBus: EventBus | null = null;

/**
 * Get or create the global tool event bus.
 *
 * This event bus is used for tool-related events like timeout warnings.
 * It's separate from ResilienceEventBus to maintain separation of concerns.
 *
 * @param options - Configuration options (only used on first call)
 * @returns Global EventBus instance for tool events
 */
export function getToolEventBus(options?: { debug?: boolean }): EventBus {
  if (!globalToolEventBus) {
    globalToolEventBus = new EventBus({ debug: options?.debug ?? false });
  }
  return globalToolEventBus;
}

/**
 * Reset the global tool event bus (for testing).
 */
export function resetToolEventBus(): void {
  globalToolEventBus = null;
}

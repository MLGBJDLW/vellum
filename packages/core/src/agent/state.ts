// ============================================
// Agent State Machine
// ============================================

import { z } from "zod";
import type { VellumError } from "../errors/index.js";

/**
 * Agent state enumeration.
 *
 * Represents all possible states of the agent loop:
 * - idle: Waiting for user input
 * - streaming: Receiving LLM response stream
 * - tool_executing: Running a tool
 * - wait_permission: Awaiting user authorization for tool
 * - wait_input: Awaiting user input/response
 * - paused: Temporarily paused by user
 * - recovering: Recovering from error state
 * - retry: Retrying after transient failure
 * - terminated: Gracefully terminated by user
 * - shutdown: System shutdown in progress
 */
export const AgentStateSchema = z.enum([
  "idle",
  "streaming",
  "tool_executing",
  "wait_permission",
  "wait_input",
  "paused",
  "recovering",
  "retry",
  "terminated",
  "shutdown",
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * All valid agent states as a readonly array.
 */
export const AGENT_STATES = AgentStateSchema.options;

/**
 * Context information for the current agent state.
 */
export interface StateContext {
  /** Unique session identifier */
  sessionId: string;
  /** Current message identifier */
  messageId: string;
  /** Number of retry attempts made */
  attempt: number;
  /** Last error encountered, if any */
  lastError?: VellumError;
  /** Timestamp when state was entered */
  enteredAt?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * State transition event emitted on state changes.
 */
export interface StateTransitionEvent {
  /** Previous state */
  from: AgentState;
  /** New state */
  to: AgentState;
  /** Current context */
  context: StateContext;
  /** Timestamp of transition */
  timestamp: number;
}

/**
 * Valid state transitions map.
 *
 * Maps each state to the set of states it can transition to.
 * Enforces the state machine invariants.
 */
export const VALID_TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  idle: ["streaming", "shutdown"],
  streaming: [
    "tool_executing",
    "wait_permission",
    "wait_input",
    "paused",
    "recovering",
    "retry",
    "terminated",
    "shutdown",
    "idle",
  ],
  // T058: Added "idle" transition for agentic loop auto-continuation
  tool_executing: [
    "streaming",
    "wait_permission",
    "recovering",
    "retry",
    "terminated",
    "shutdown",
    "idle",
  ],
  wait_permission: ["tool_executing", "streaming", "paused", "terminated", "shutdown", "idle"],
  wait_input: ["streaming", "paused", "terminated", "shutdown", "idle"],
  paused: [
    "streaming",
    "tool_executing",
    "wait_permission",
    "wait_input",
    "terminated",
    "shutdown",
    "idle",
  ],
  recovering: ["streaming", "retry", "terminated", "shutdown", "idle"],
  retry: ["streaming", "recovering", "terminated", "shutdown", "idle"],
  terminated: ["idle", "shutdown"],
  shutdown: [],
} as const;

/**
 * Checks if a state transition is valid according to the state machine.
 *
 * @param from - Current state
 * @param to - Target state
 * @returns true if transition is valid
 */
export function isValidTransition(from: AgentState, to: AgentState): boolean {
  const validTargets = VALID_TRANSITIONS[from];
  return validTargets.includes(to);
}

/**
 * Creates an initial state context.
 *
 * @param sessionId - Session identifier
 * @returns Fresh StateContext
 */
export function createStateContext(sessionId: string): StateContext {
  return {
    sessionId,
    messageId: "",
    attempt: 0,
    enteredAt: Date.now(),
  };
}

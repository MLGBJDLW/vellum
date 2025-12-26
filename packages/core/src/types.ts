import type { AgentConfig, Message, Tool } from "@vellum/shared";

export interface AgentOptions extends AgentConfig {
  tools?: Tool[];
  onMessage?: (message: Message) => void;
  onToolCall?: (toolName: string, params: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Legacy loop event type.
 *
 * @deprecated Use the EventBus pattern with typed events instead:
 * - `message:created` / `message:updated` for message events
 * - `tool:start` / `tool:end` for tool events
 * - `error` for error events
 * - `session:end` for completion events
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * const handler = (event: LoopEvent) => {
 *   if (event.type === "tool_call") { ... }
 * };
 *
 * // New way
 * import { Events, createEventBus } from "@vellum/core";
 *
 * const bus = createEventBus();
 * bus.on(Events.toolStart, ({ callId, name, input }) => { ... });
 * bus.on(Events.toolEnd, ({ callId, result, durationMs }) => { ... });
 * ```
 *
 * @see Events.toolStart - When a tool begins execution
 * @see Events.toolEnd - When a tool completes
 * @see Events.messageCreated - When a message is created
 * @see Events.errorEvent - When an error occurs
 */
export type LoopEvent =
  | { type: "message"; message: Message }
  | { type: "tool_call"; tool: string; params: unknown }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "error"; error: Error }
  | { type: "complete" };

// =============================================================================
// T118: Backward Compatibility Type Aliases
// =============================================================================

/**
 * @deprecated Use `Events.toolStart` event payload type
 */
export type ToolCallEvent = Extract<LoopEvent, { type: "tool_call" }>;

/**
 * @deprecated Use `Events.toolEnd` event payload type
 */
export type ToolResultEvent = Extract<LoopEvent, { type: "tool_result" }>;

/**
 * @deprecated Use `Events.messageCreated` event payload type
 */
export type MessageEvent = Extract<LoopEvent, { type: "message" }>;

/**
 * @deprecated Use `Events.errorEvent` event payload type
 */
export type ErrorEvent = Extract<LoopEvent, { type: "error" }>;

/**
 * @deprecated Use `Events.sessionEnd` event payload type
 */
export type CompleteEvent = Extract<LoopEvent, { type: "complete" }>;

// ============================================
// LLM Stream Namespace
// ============================================

/**
 * LLM streaming utilities for agent loop integration.
 *
 * Wraps provider streaming with:
 * - MAX_OUTPUT_TOKENS enforcement
 * - Abort signal integration
 * - Tool call repair (case mismatch handling)
 * - Unified event emission
 *
 * @module @vellum/core/session/llm
 */

import type {
  CompletionMessage,
  CompletionParams,
  StreamEvent,
  ToolDefinition,
  ProviderType,
  LLMProvider,
} from "@vellum/provider";
import { ProviderRegistry } from "@vellum/provider";
import { ErrorCode } from "@vellum/shared";
import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum output tokens for streaming completions.
 * Enforced across all providers.
 */
export const MAX_OUTPUT_TOKENS = 32768;

/**
 * Default timeout for stream inactivity (30 seconds)
 */
export const DEFAULT_STREAM_TIMEOUT_MS = 30000;

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for LLM.stream()
 */
export const StreamConfigSchema = z.object({
  /** Provider type to use */
  providerType: z.string(),
  /** Model identifier */
  model: z.string(),
  /** Conversation messages */
  messages: z.array(z.custom<CompletionMessage>()),
  /** Available tools */
  tools: z.array(z.custom<ToolDefinition>()).optional(),
  /** System prompt */
  system: z.string().optional(),
  /** Sampling temperature */
  temperature: z.number().min(0).max(2).optional(),
  /** Maximum tokens to generate (capped at MAX_OUTPUT_TOKENS) */
  maxTokens: z.number().positive().optional(),
  /** Enable extended thinking */
  thinking: z
    .object({
      enabled: z.boolean(),
      budgetTokens: z.number().positive().optional(),
    })
    .optional(),
  /** Abort signal for cancellation */
  abortSignal: z.custom<AbortSignal>().optional(),
  /** Stream timeout in milliseconds */
  timeoutMs: z.number().positive().optional(),
});

export type StreamConfig = z.infer<typeof StreamConfigSchema>;

/**
 * Tool call repair result
 */
export interface ToolCallRepairResult {
  /** Whether the repair was successful */
  repaired: boolean;
  /** Repaired tool name (if different) */
  toolName: string;
  /** Repaired input (if modified) */
  input: Record<string, unknown>;
}

/**
 * Extended stream event with repair tracking
 */
export type LLMStreamEvent = StreamEvent & {
  /** Whether this event was repaired */
  repaired?: boolean;
};

// =============================================================================
// Tool Call Repair
// =============================================================================

/**
 * Attempts to repair a failed tool call by handling common issues:
 * - Case mismatch in tool names
 * - Invalid tool fallback
 *
 * @param toolName - The original tool name from the LLM
 * @param input - The original input parameters
 * @param availableTools - Map of available tools (lowercase name -> original name)
 * @returns Repair result with corrected values or invalid fallback
 *
 * @example
 * ```typescript
 * const tools = new Map([['readfile', 'ReadFile']]);
 * const result = repairToolCall('readFile', { path: '/foo' }, tools);
 * // { repaired: true, toolName: 'ReadFile', input: { path: '/foo' } }
 * ```
 */
export function repairToolCall(
  toolName: string,
  input: Record<string, unknown>,
  availableTools: Map<string, string>
): ToolCallRepairResult {
  const lowerName = toolName.toLowerCase();

  // Try case-insensitive match
  const matchedName = availableTools.get(lowerName);
  if (matchedName && matchedName !== toolName) {
    return {
      repaired: true,
      toolName: matchedName,
      input,
    };
  }

  // If exact match exists, no repair needed
  if (matchedName === toolName) {
    return {
      repaired: false,
      toolName,
      input,
    };
  }

  // Unknown tool - return as invalid with error context
  return {
    repaired: true,
    toolName: "invalid",
    input: {
      tool: toolName,
      error: `Unknown tool: ${toolName}`,
    },
  };
}

/**
 * Builds a case-insensitive tool lookup map
 *
 * @param tools - Array of tool definitions
 * @returns Map of lowercase name to original name
 */
export function buildToolLookup(tools: ToolDefinition[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const tool of tools) {
    lookup.set(tool.name.toLowerCase(), tool.name);
  }
  return lookup;
}

// =============================================================================
// LLM Namespace
// =============================================================================

/**
 * LLM streaming namespace for agent loop integration.
 *
 * @example
 * ```typescript
 * const events = LLM.stream({
 *   providerType: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   abortSignal: controller.signal,
 * });
 *
 * for await (const event of events) {
 *   if (event.type === 'text') {
 *     process.stdout.write(event.text);
 *   }
 * }
 * ```
 */
export namespace LLM {
  /**
   * Provider registry for resolving providers
   */
  let registry: ProviderRegistry | undefined;

  /**
   * Initialize the LLM namespace with a provider registry
   *
   * @param providerRegistry - Registry for resolving providers
   */
  export function initialize(providerRegistry: ProviderRegistry): void {
    registry = providerRegistry;
  }

  /**
   * Get the current provider registry
   */
  export function getRegistry(): ProviderRegistry | undefined {
    return registry;
  }

  /**
   * Stream a completion from an LLM provider.
   *
   * Yields StreamEvent objects as they arrive from the provider.
   * Handles:
   * - MAX_OUTPUT_TOKENS enforcement
   * - Abort signal integration
   * - Tool call repair for case mismatches
   *
   * @param config - Stream configuration
   * @yields StreamEvent objects
   * @throws Error if provider is not found or not initialized
   *
   * @example
   * ```typescript
   * for await (const event of LLM.stream(config)) {
   *   switch (event.type) {
   *     case 'text':
   *       onText(event.text);
   *       break;
   *     case 'toolCall':
   *       await executeTool(event.name, event.input);
   *       break;
   *     case 'done':
   *       console.log('Complete:', event.stopReason);
   *       break;
   *   }
   * }
   * ```
   */
  export async function* stream(config: StreamConfig): AsyncGenerator<LLMStreamEvent, void, undefined> {
    // Validate config
    const validated = StreamConfigSchema.parse(config);

    // Enforce MAX_OUTPUT_TOKENS
    const maxTokens = Math.min(validated.maxTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);

    // Resolve provider
    if (!registry) {
      throw new Error("LLM namespace not initialized. Call LLM.initialize() first.");
    }

    const provider = await registry.get({ type: validated.providerType as ProviderType });
    // Cast to LLMProvider - all providers implement both interfaces
    const llmProvider = provider as unknown as LLMProvider;
    if (!llmProvider.isInitialized()) {
      throw new Error(`Provider ${validated.providerType} is not initialized`);
    }

    // Build tool lookup for repair
    const toolLookup = validated.tools ? buildToolLookup(validated.tools) : new Map<string, string>();

    // Build completion params
    const completionParams: CompletionParams = {
      model: validated.model,
      messages: buildMessages(validated.messages, validated.system),
      temperature: validated.temperature,
      maxTokens,
      tools: validated.tools,
      thinking: validated.thinking,
    };

    // Create abort-aware stream
    const abortSignal = validated.abortSignal;

    try {
      // Get the raw stream from provider
      const providerStream = llmProvider.stream(completionParams);

      for await (const event of providerStream) {
        // Check for abort
        if (abortSignal?.aborted) {
          const abortEvent: LLMStreamEvent = {
            type: "done",
            stopReason: "end_turn",
          };
          yield abortEvent;
          return;
        }

        // Handle tool call repair
        if (event.type === "toolCall") {
          const repair = repairToolCall(event.name, event.input, toolLookup);
          if (repair.repaired) {
            yield {
              ...event,
              name: repair.toolName,
              input: repair.input,
              repaired: true,
            };
            continue;
          }
        }

        yield event as LLMStreamEvent;
      }
    } catch (error) {
      // Handle abort errors gracefully
      if (error instanceof Error && error.name === "AbortError") {
        const abortEvent: LLMStreamEvent = {
          type: "done",
          stopReason: "end_turn",
        };
        yield abortEvent;
        return;
      }

      // Emit error event
      const errorEvent: LLMStreamEvent = {
        type: "error",
        code: ErrorCode.API_ERROR.toString(),
        message: error instanceof Error ? error.message : "Unknown streaming error",
        retryable: true,
      };
      yield errorEvent;
    }
  }

  /**
   * Build messages array with optional system prompt
   */
  function buildMessages(messages: CompletionMessage[], system?: string): CompletionMessage[] {
    if (!system) {
      return messages;
    }

    // Prepend system message
    return [{ role: "system", content: system }, ...messages];
  }
}

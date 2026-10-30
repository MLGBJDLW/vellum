// ============================================
// LLM Stream Namespace
// ============================================

/**
 * LLM streaming utilities for agent loop integration.
 *
 * Wraps provider streaming with:
 * - Model-specific output budget enforcement
 * - Abort signal integration
 * - Tool call repair (case mismatch handling)
 * - Unified event emission
 *
 * @module @vellum/core/session/llm
 */

import {
  type CompletionMessage,
  type CompletionParams,
  classifyProviderError,
  getModelInfo,
  type LLMProvider,
  type ProviderRegistry,
  type ProviderType,
  type ReasoningEffort,
  reasoningEffortSchema,
  type StreamEvent,
  type ToolDefinition,
} from "@vellum/provider";
import { z } from "zod";
import { CONFIG_DEFAULTS } from "../config/defaults.js";
import { prepareToolNames } from "./tool-names.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default output budget for streaming completions. Explicit budgets can use
 * the full advertised model output limit.
 */
export const MAX_OUTPUT_TOKENS = 32768;

/**
 * Default timeout for stream inactivity (30 seconds)
 */
export const DEFAULT_STREAM_TIMEOUT_MS = CONFIG_DEFAULTS.timeouts.llmStream;

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
  /** Maximum tokens to generate (capped at the model's advertised limit) */
  maxTokens: z.number().positive().optional(),
  /** Enable extended thinking */
  thinking: z
    .object({
      enabled: z.boolean(),
      budgetTokens: z.number().positive().optional(),
      reasoningEffort: reasoningEffortSchema.optional(),
    })
    .optional(),
  /** Abort signal for cancellation */
  abortSignal: z.custom<AbortSignal>().optional(),
  /** Stream timeout in milliseconds */
  timeoutMs: z.number().positive().optional(),
  /** Provider-specific extra body fields (OpenAI-compatible APIs) */
  extraBody: z.record(z.string(), z.unknown()).optional(),
});

export type StreamConfig = z.infer<typeof StreamConfigSchema>;

// =============================================================================
// Thinking Capability Resolution
// =============================================================================

function resolveThinkingConfig(
  thinking: StreamConfig["thinking"] | undefined,
  providerType: string,
  model: string
): CompletionParams["thinking"] | undefined {
  if (!thinking?.enabled) {
    return undefined;
  }

  const modelInfo = getModelInfo(providerType, model);
  if (!modelInfo.supportsReasoning) {
    if (process.env.VELLUM_DEBUG) {
      console.debug(
        `[LLM] Thinking disabled: model ${model} (${providerType}) does not support reasoning.`
      );
    }
    return undefined;
  }

  const supportedEfforts = modelInfo.reasoningEfforts ?? [];
  const requestedEffort = thinking.reasoningEffort;
  const fallbackEffort = modelInfo.defaultReasoningEffort ?? supportedEfforts[0];
  const allowedEfforts =
    supportedEfforts.length > 0 ? supportedEfforts : fallbackEffort ? [fallbackEffort] : [];

  let resolvedEffort: ReasoningEffort | undefined;
  if (requestedEffort && allowedEfforts.includes(requestedEffort)) {
    resolvedEffort = requestedEffort;
  } else if (fallbackEffort && allowedEfforts.includes(fallbackEffort)) {
    resolvedEffort = fallbackEffort;
  }

  if (requestedEffort && !allowedEfforts.includes(requestedEffort)) {
    if (process.env.VELLUM_DEBUG) {
      console.debug(
        `[LLM] Reasoning effort '${requestedEffort}' not supported by ${model}; omitting effort.`
      );
    }
  }

  if (resolvedEffort === "none") {
    return undefined;
  }

  const result: { enabled: true; budgetTokens?: number; reasoningEffort?: ReasoningEffort } = {
    enabled: true,
  };

  if (thinking.budgetTokens !== undefined) {
    result.budgetTokens = thinking.budgetTokens;
  }

  if (resolvedEffort) {
    result.reasoningEffort = resolvedEffort;
  }

  return result;
}

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

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, "");
}

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

  const normalizedName = normalizeToolName(toolName);
  if (normalizedName !== lowerName) {
    for (const originalName of availableTools.values()) {
      if (normalizeToolName(originalName) === normalizedName) {
        return {
          repaired: true,
          toolName: originalName,
          input,
        };
      }
    }
  }

  // Unknown tool - return with special marker prefix for detection
  return {
    repaired: false,
    toolName: `__unknown_${toolName}__`,
    input: {
      originalTool: toolName,
      error: `Unknown tool requested by LLM: ${toolName}`,
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
  export async function* stream(
    config: StreamConfig
  ): AsyncGenerator<LLMStreamEvent, void, undefined> {
    // Validate config
    const validated = StreamConfigSchema.parse(config);

    // Honor explicit generation budgets up to the selected model's actual limit.
    // Use the advertised output window unless the caller requests a smaller budget.
    const modelInfo = getModelInfo(validated.providerType, validated.model);
    const requestedMaxTokens =
      validated.maxTokens ?? modelInfo.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
    const maxTokens = modelInfo.maxOutputTokens
      ? Math.min(requestedMaxTokens, modelInfo.maxOutputTokens)
      : requestedMaxTokens;

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
    const toolLookup = validated.tools
      ? buildToolLookup(validated.tools)
      : new Map<string, string>();

    const resolvedThinking = resolveThinkingConfig(
      validated.thinking,
      validated.providerType,
      validated.model
    );

    const wire = prepareToolNames(
      validated.tools,
      buildMessages(validated.messages, validated.system),
      validated.extraBody
    );

    // Build completion params
    const completionParams: CompletionParams = {
      model: validated.model,
      messages: wire.messages,
      temperature: validated.temperature,
      maxTokens,
      // Unknown metadata must not silently disable tools explicitly requested by the agent.
      tools: modelInfo.supportsTools !== false ? wire.tools : undefined,
      thinking: resolvedThinking,
      extraBody: wire.extraBody,
      abortSignal: validated.abortSignal,
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
          const restoredName = wire.restore(event.name);
          const repair = repairToolCall(restoredName, event.input, toolLookup);
          if (repair.repaired || restoredName !== event.name) {
            yield {
              ...event,
              name: repair.toolName,
              input: repair.input,
              repaired: true,
            };
            continue;
          }
        }

        if (event.type === "tool_call_start") {
          yield { ...event, name: wire.restore(event.name) };
          continue;
        }

        if (event.type === "toolCallDelta" && event.name !== undefined) {
          yield { ...event, name: wire.restore(event.name) };
          continue;
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

      // Preserve the provider's classification so invalid schemas and credentials
      // are not retried as transient API failures.
      const classification = classifyProviderError(error);
      const errorEvent: LLMStreamEvent = {
        type: "error",
        code: classification.code.toString(),
        message: error instanceof Error ? error.message : "Unknown streaming error",
        retryable: classification.retryable,
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

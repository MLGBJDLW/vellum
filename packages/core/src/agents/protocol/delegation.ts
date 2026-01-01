// ============================================
// Delegation Target Discriminated Union Schema
// ============================================
// REQ-013: Type-safe delegation targets using discriminated unions (Gemini CLI pattern)

import { z } from "zod";
import { type ExtendedModeConfig, ExtendedModeConfigSchema } from "../../agent/modes.js";

// ============================================
// Target Interfaces (Discriminated by 'kind')
// ============================================

/**
 * Builtin agent target for delegation.
 *
 * References a predefined agent by its slug (e.g., 'coder', 'qa', 'writer').
 * These agents are registered in the system's agent registry.
 *
 * @example
 * ```typescript
 * const target: BuiltinTarget = {
 *   kind: 'builtin',
 *   slug: 'coder',
 * };
 * ```
 */
export interface BuiltinTarget {
  /** Discriminator field */
  kind: "builtin";
  /** Agent slug like 'coder', 'qa', 'writer' */
  slug: string;
}

/**
 * Custom mode target for delegation.
 *
 * Defines an ad-hoc agent with a custom mode configuration.
 * Useful for specialized tasks that don't fit predefined agent roles.
 *
 * @example
 * ```typescript
 * const target: CustomTarget = {
 *   kind: 'custom',
 *   slug: 'specialized-analyzer',
 *   modeConfig: {
 *     name: 'code',
 *     description: 'Specialized code analyzer',
 *     tools: { edit: false, bash: 'readonly' },
 *     prompt: 'You analyze code for specific patterns...',
 *     level: AgentLevel.worker,
 *   },
 * };
 * ```
 */
export interface CustomTarget {
  /** Discriminator field */
  kind: "custom";
  /** Unique slug for this custom agent */
  slug: string;
  /** Full mode configuration for the custom agent */
  modeConfig: ExtendedModeConfig;
}

/**
 * MCP (Model Context Protocol) server target for delegation.
 *
 * Delegates to an external MCP server tool. This enables integration
 * with external services and tools through the MCP protocol.
 *
 * @example
 * ```typescript
 * const target: McpTarget = {
 *   kind: 'mcp',
 *   serverId: 'github-server',
 *   toolName: 'create_pull_request',
 *   params: { title: 'Feature update', base: 'main' },
 * };
 * ```
 */
export interface McpTarget {
  /** Discriminator field */
  kind: "mcp";
  /** MCP server identifier */
  serverId: string;
  /** Name of the tool to invoke on the MCP server */
  toolName: string;
  /** Optional parameters to pass to the MCP tool */
  params?: Record<string, unknown>;
}

/**
 * Delegation target discriminated union.
 *
 * Represents all possible delegation targets in the multi-agent system.
 * The `kind` field acts as the discriminator for type narrowing.
 *
 * @example
 * ```typescript
 * function processTarget(target: DelegationTarget) {
 *   switch (target.kind) {
 *     case 'builtin':
 *       console.log(`Delegating to builtin agent: ${target.slug}`);
 *       break;
 *     case 'custom':
 *       console.log(`Delegating to custom agent: ${target.slug}`);
 *       break;
 *     case 'mcp':
 *       console.log(`Delegating to MCP: ${target.serverId}/${target.toolName}`);
 *       break;
 *   }
 * }
 * ```
 */
export type DelegationTarget = BuiltinTarget | CustomTarget | McpTarget;

// ============================================
// Zod Schemas
// ============================================

/**
 * Zod schema for BuiltinTarget validation.
 *
 * Validates builtin agent targets with `kind: 'builtin'`.
 */
export const BuiltinTargetSchema = z.object({
  kind: z.literal("builtin"),
  slug: z.string().min(1, "Agent slug cannot be empty"),
});

/**
 * Zod schema for CustomTarget validation.
 *
 * Validates custom mode targets with `kind: 'custom'`.
 */
export const CustomTargetSchema = z.object({
  kind: z.literal("custom"),
  slug: z.string().min(1, "Custom agent slug cannot be empty"),
  modeConfig: ExtendedModeConfigSchema,
});

/**
 * Zod schema for McpTarget validation.
 *
 * Validates MCP server targets with `kind: 'mcp'`.
 */
export const McpTargetSchema = z.object({
  kind: z.literal("mcp"),
  serverId: z.string().min(1, "Server ID cannot be empty"),
  toolName: z.string().min(1, "Tool name cannot be empty"),
  params: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for DelegationTarget discriminated union.
 *
 * Uses Zod's discriminatedUnion to parse based on the `kind` field.
 * This provides optimal parsing performance and type narrowing.
 *
 * @example
 * ```typescript
 * const result = DelegationTargetSchema.safeParse({
 *   kind: 'builtin',
 *   slug: 'coder',
 * });
 *
 * if (result.success) {
 *   // result.data is typed as DelegationTarget
 *   if (result.data.kind === 'builtin') {
 *     // TypeScript narrows to BuiltinTarget
 *     console.log(result.data.slug);
 *   }
 * }
 * ```
 */
export const DelegationTargetSchema = z.discriminatedUnion("kind", [
  BuiltinTargetSchema,
  CustomTargetSchema,
  McpTargetSchema,
]);

// ============================================
// Type Inference Helpers
// ============================================

/**
 * Inferred type from BuiltinTargetSchema.
 */
export type BuiltinTargetInferred = z.infer<typeof BuiltinTargetSchema>;

/**
 * Inferred type from CustomTargetSchema.
 */
export type CustomTargetInferred = z.infer<typeof CustomTargetSchema>;

/**
 * Inferred type from McpTargetSchema.
 */
export type McpTargetInferred = z.infer<typeof McpTargetSchema>;

/**
 * Inferred type from DelegationTargetSchema.
 */
export type DelegationTargetInferred = z.infer<typeof DelegationTargetSchema>;

// ============================================
// Type Guards
// ============================================

/**
 * Type guard for BuiltinTarget.
 */
export function isBuiltinTarget(target: DelegationTarget): target is BuiltinTarget {
  return target.kind === "builtin";
}

/**
 * Type guard for CustomTarget.
 */
export function isCustomTarget(target: DelegationTarget): target is CustomTarget {
  return target.kind === "custom";
}

/**
 * Type guard for McpTarget.
 */
export function isMcpTarget(target: DelegationTarget): target is McpTarget {
  return target.kind === "mcp";
}

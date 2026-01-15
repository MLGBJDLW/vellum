// ============================================
// UnifiedToolContainer - Single Source of Truth for Tool Management
// ============================================

import type { ToolDefinition as ProviderToolDefinition } from "@vellum/provider";
import { z } from "zod";

import { ALL_BUILTIN_TOOLS } from "../builtin/index.js";
import type { Tool, ToolKind } from "../types/tool.js";
import type { PermissionChecker, ToolExecutorConfig } from "./executor.js";
import { ToolExecutor } from "./executor.js";
import type { LoadToolsResult } from "./loader.js";
import { loadCustomTools } from "./loader.js";
import type { GetDefinitionsFilter, LLMToolDefinition } from "./registry.js";

// =============================================================================
// ToolContainerConfig Interface
// =============================================================================

/**
 * Configuration options for UnifiedToolContainer.
 */
export interface ToolContainerConfig {
  /**
   * Optional permission checker for tool execution.
   * Passed to the internal ToolExecutor.
   */
  permissionChecker?: PermissionChecker;

  /**
   * Current working directory for tool execution context.
   */
  cwd?: string;

  /**
   * Additional ToolExecutor configuration options.
   */
  executorConfig?: Omit<ToolExecutorConfig, "permissionChecker">;
}

// =============================================================================
// UnifiedToolContainer Class
// =============================================================================

/**
 * UnifiedToolContainer - Single source of truth for tool management.
 *
 * Bridges three previously disconnected systems:
 * - ToolRegistry (storage) - Internal Map for tool lookup
 * - ToolExecutor (execution) - Handles tool invocation with permissions
 * - ToolDefinition[] (LLM definitions) - Provides definitions for LLM context
 *
 * This class ensures that when a tool is registered, it is available
 * for both lookup and execution, eliminating the wiring gap between
 * AgentLoop.config.tools and the actual tool implementation.
 *
 * @example
 * ```typescript
 * const container = new UnifiedToolContainer({
 *   permissionChecker: myPermissionChecker,
 *   cwd: process.cwd(),
 * });
 *
 * // Register all builtin tools
 * container.registerBuiltins();
 *
 * // Register custom tools
 * container.registerTool(myCustomTool);
 *
 * // Get definitions for LLM
 * const definitions = container.getDefinitions();
 *
 * // Get executor for AgentLoop
 * const executor = container.getExecutor();
 * ```
 */
export class UnifiedToolContainer {
  /** Internal tool storage (lowercase name -> tool) */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  private readonly tools = new Map<string, Tool<z.ZodType, any>>();

  /** Original case-preserved names for display */
  private readonly originalNames = new Map<string, string>();

  /** Internal ToolExecutor for execution */
  private readonly executor: ToolExecutor;

  /** Current working directory */
  private readonly cwd: string;

  /**
   * Create a new UnifiedToolContainer.
   *
   * @param config - Optional configuration options
   */
  constructor(config: ToolContainerConfig = {}) {
    this.cwd = config.cwd ?? process.cwd();

    // Create internal executor with merged config
    this.executor = new ToolExecutor({
      ...config.executorConfig,
      permissionChecker: config.permissionChecker,
    });
  }

  // ===========================================================================
  // Tool Registration
  // ===========================================================================

  /**
   * Register a tool with the container.
   *
   * Adds the tool to both internal storage AND the ToolExecutor,
   * ensuring unified access for lookup and execution.
   *
   * @param tool - Tool to register
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  registerTool(tool: Tool<z.ZodType, any>): void {
    const name = tool.definition.name;
    const normalizedName = name.toLowerCase();

    // Add to internal Map for lookup
    this.tools.set(normalizedName, tool);
    this.originalNames.set(normalizedName, name);

    // Also register with ToolExecutor for execution
    this.executor.registerTool(tool);
  }

  /**
   * Register all builtin tools with the container.
   *
   * Iterates through ALL_BUILTIN_TOOLS and registers each one,
   * making all standard tools available for both lookup and execution.
   *
   * @returns Number of tools registered
   *
   * @example
   * ```typescript
   * const container = new UnifiedToolContainer();
   * const count = container.registerBuiltins();
   * console.log(`Registered ${count} builtin tools`);
   * ```
   */
  registerBuiltins(): number {
    for (const tool of ALL_BUILTIN_TOOLS) {
      this.registerTool(tool);
    }
    return ALL_BUILTIN_TOOLS.length;
  }

  /**
   * Register multiple tools at once.
   *
   * @param tools - Array of tools to register
   * @returns Number of tools registered
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  registerTools(tools: Tool<z.ZodType, any>[]): number {
    for (const tool of tools) {
      this.registerTool(tool);
    }
    return tools.length;
  }

  // ===========================================================================
  // Tool Lookup
  // ===========================================================================

  /**
   * Get a tool by name (case-insensitive).
   *
   * @param name - Tool name to look up
   * @returns Tool if found, undefined otherwise
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  get(name: string): Tool<z.ZodType, any> | undefined {
    return this.tools.get(name.toLowerCase());
  }

  /**
   * Check if a tool is registered.
   *
   * @param name - Tool name to check (case-insensitive)
   * @returns true if tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name.toLowerCase());
  }

  /**
   * List all registered tools.
   *
   * @returns Array of all registered tools
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  list(): Tool<z.ZodType, any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools filtered by kind.
   *
   * @param kind - Tool kind to filter by
   * @returns Array of tools matching the specified kind
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listByKind(kind: ToolKind): Tool<z.ZodType, any>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.definition.kind === kind);
  }

  /**
   * Get the original (case-preserved) name for a tool.
   *
   * @param name - Tool name (case-insensitive)
   * @returns Original cased name, or input if not found
   */
  getOriginalName(name: string): string {
    return this.originalNames.get(name.toLowerCase()) ?? name;
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  // ===========================================================================
  // LLM Definitions
  // ===========================================================================

  /**
   * Get tool definitions for LLM context.
   *
   * Converts registered tools to LLM-compatible format with:
   * - name: Tool identifier
   * - description: Human-readable description
   * - parameters: JSON Schema from Zod schema
   * - kind: Tool category
   *
   * @param filter - Optional filter options
   * @returns Array of LLM-compatible tool definitions
   *
   * @example
   * ```typescript
   * // Get all definitions
   * const allDefs = container.getDefinitions();
   *
   * // Get only read tools
   * const readDefs = container.getDefinitions({ kinds: ["read"] });
   *
   * // Get all including disabled
   * const allWithDisabled = container.getDefinitions({ enabledOnly: false });
   * ```
   */
  getDefinitions(filter?: GetDefinitionsFilter): LLMToolDefinition[] {
    const enabledOnly = filter?.enabledOnly ?? true;
    const kinds = filter?.kinds;

    const definitions: LLMToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      // Filter by enabled status
      if (enabledOnly && tool.definition.enabled === false) {
        continue;
      }

      // Filter by kind
      if (kinds && !kinds.includes(tool.definition.kind)) {
        continue;
      }

      // Convert Zod schema to JSON Schema using Zod v4 native function
      const jsonSchema = z.toJSONSchema(tool.definition.parameters, {
        target: "draft-2020-12",
        unrepresentable: "any",
      });

      definitions.push({
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: jsonSchema as Record<string, unknown>,
        kind: tool.definition.kind,
      });
    }

    return definitions;
  }

  /**
   * Get tool definitions in provider-compatible format for AgentLoop.
   *
   * Returns definitions with `inputSchema` (instead of `parameters`)
   * matching the `ToolDefinition` type from `@vellum/provider`.
   *
   * @param filter - Optional filter options
   * @returns Array of provider-compatible tool definitions
   *
   * @example
   * ```typescript
   * // Pass to AgentLoop
   * const agentLoop = new AgentLoop({
   *   tools: container.getProviderToolDefinitions(),
   *   toolExecutor: container.getExecutor(),
   * });
   * ```
   */
  getProviderToolDefinitions(filter?: GetDefinitionsFilter): ProviderToolDefinition[] {
    const enabledOnly = filter?.enabledOnly ?? true;
    const kinds = filter?.kinds;

    const definitions: ProviderToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      // Filter by enabled status
      if (enabledOnly && tool.definition.enabled === false) {
        continue;
      }

      // Filter by kind
      if (kinds && !kinds.includes(tool.definition.kind)) {
        continue;
      }

      // Convert Zod schema to JSON Schema using Zod v4 native function
      const jsonSchema = z.toJSONSchema(tool.definition.parameters, {
        target: "draft-2020-12",
        unrepresentable: "any",
      });

      definitions.push({
        name: tool.definition.name,
        description: tool.definition.description,
        inputSchema: jsonSchema as Record<string, unknown>,
      });
    }

    return definitions;
  }

  // ===========================================================================
  // Dynamic Loading
  // ===========================================================================

  /**
   * Load custom tools from specified directories.
   *
   * Scans directories for tool files matching the pattern (default: "**\/*.tool.ts"),
   * validates each export, and registers valid tools with the container.
   *
   * @param directories - Array of directory paths to scan for tool files
   * @param pattern - Optional glob pattern for matching tool files (default: "**\/*.tool.ts")
   * @returns Result containing count of loaded tools and any errors
   *
   * @example
   * ```typescript
   * const result = await container.loadFromDirectories([
   *   "~/.config/vellum/tools",
   *   "./project-tools",
   * ]);
   * console.log(`Loaded ${result.loaded} tools`);
   * for (const error of result.errors) {
   *   console.warn(`Failed: ${error.filePath}: ${error.message}`);
   * }
   * ```
   */
  async loadFromDirectories(
    directories: string[],
    pattern?: string
  ): Promise<{ loaded: number; errors: LoadToolsResult["errors"] }> {
    const result = await loadCustomTools({ directories, pattern });

    // Register all successfully loaded tools
    for (const tool of result.tools) {
      this.registerTool(tool);
    }

    return {
      loaded: result.tools.length,
      errors: result.errors,
    };
  }

  // ===========================================================================
  // Executor Access
  // ===========================================================================

  /**
   * Get the internal ToolExecutor for AgentLoop.
   *
   * The returned executor has all registered tools available
   * and can be used directly for tool execution.
   *
   * @returns The internal ToolExecutor instance
   *
   * @example
   * ```typescript
   * const executor = container.getExecutor();
   * const result = await executor.execute("read_file", { path: "./file.txt" }, context);
   * ```
   */
  getExecutor(): ToolExecutor {
    return this.executor;
  }

  /**
   * Get the current working directory.
   *
   * @returns The cwd configured for this container
   */
  getCwd(): string {
    return this.cwd;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new UnifiedToolContainer with optional configuration.
 *
 * Convenience factory function for creating containers.
 *
 * @param config - Optional configuration options
 * @returns New UnifiedToolContainer instance
 *
 * @example
 * ```typescript
 * // Create with defaults
 * const container = createToolContainer();
 *
 * // Create with configuration
 * const container = createToolContainer({
 *   permissionChecker: myChecker,
 *   cwd: "/project",
 * });
 * ```
 */
export function createToolContainer(config?: ToolContainerConfig): UnifiedToolContainer {
  return new UnifiedToolContainer(config);
}

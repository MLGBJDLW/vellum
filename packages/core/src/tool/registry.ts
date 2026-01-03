// ============================================
// Tool Registry - T005, T006, T007
// ============================================

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Tool, ToolKind } from "../types/tool.js";

// =============================================================================
// MCP Tool Integration (T044)
// =============================================================================

/**
 * MCP tool definition from McpHub.
 * This is the structure returned by MCP servers.
 */
export interface McpToolDefinition {
  /** Tool name as provided by MCP server */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;
}

// =============================================================================
// T007: ToolDefinition for LLM Context
// =============================================================================

/**
 * Tool definition in LLM-compatible format.
 *
 * Contains the tool's name, description, and parameter schema
 * as JSON Schema (compatible with Anthropic/OpenAI tool formats).
 */
export interface LLMToolDefinition {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description for LLM context */
  description: string;
  /** JSON Schema for input parameters (from Zod schema) */
  parameters: Record<string, unknown>;
  /** Category of tool (read, write, shell, etc.) */
  kind: ToolKind;
}

// =============================================================================
// T005: ToolRegistry Interface
// =============================================================================

/**
 * Registry for managing tool registration and lookup.
 *
 * Provides:
 * - Case-insensitive tool lookup
 * - Filtering by tool kind
 * - LLM-compatible tool definitions
 */
export interface ToolRegistry {
  /**
   * Register a tool with the registry.
   *
   * @param tool - Tool to register
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  register(tool: Tool<z.ZodType, any>): void;

  /**
   * Get a tool by name (case-insensitive).
   *
   * @param name - Tool name to look up
   * @returns Tool if found, undefined otherwise
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  get(name: string): Tool<z.ZodType, any> | undefined;

  /**
   * List all registered tools.
   *
   * @returns Array of all registered tools
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  list(): Tool<z.ZodType, any>[];

  /**
   * List tools filtered by kind.
   *
   * @param kind - Tool kind to filter by
   * @returns Array of tools matching the specified kind
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listByKind(kind: ToolKind): Tool<z.ZodType, any>[];

  /**
   * Check if a tool is registered.
   *
   * @param name - Tool name to check (case-insensitive)
   * @returns true if tool is registered
   */
  has(name: string): boolean;

  /**
   * Get tool definitions for LLM context.
   *
   * Returns an array of tool definitions in a format compatible
   * with Anthropic/OpenAI tool APIs.
   *
   * @param filter - Optional filter options
   * @returns Array of LLM-compatible tool definitions
   */
  getDefinitions(filter?: GetDefinitionsFilter): LLMToolDefinition[];

  /**
   * Get the original (case-preserved) name for a tool.
   *
   * @param name - Tool name (case-insensitive)
   * @returns Original cased name, or input if not found
   */
  getOriginalName(name: string): string;

  /**
   * Get the count of registered tools.
   */
  readonly size: number;

  // ===========================================================================
  // T044: MCP Tool Registration
  // ===========================================================================

  /**
   * Register an MCP tool from an external MCP server.
   *
   * Creates a tool wrapper with the name format `mcp:<serverKey>/<toolName>`.
   * The serverKey is the short unique identifier assigned by McpHub.
   *
   * @param serverKey - Short unique server identifier (e.g., 'c1a2b3')
   * @param tool - MCP tool definition from the server
   * @param executor - Function to execute the tool via McpHub
   *
   * @example
   * ```typescript
   * registry.registerMcpTool('c1a2b3', {
   *   name: 'readFile',
   *   description: 'Read a file from the filesystem',
   *   inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
   * }, async (params) => {
   *   return await mcpHub.callTool('myServer', 'readFile', params);
   * });
   * // Registers as: mcp:c1a2b3/readFile
   * ```
   */
  registerMcpTool(
    serverKey: string,
    tool: McpToolDefinition,
    executor: (params: Record<string, unknown>) => Promise<unknown>
  ): void;

  /**
   * Unregister all MCP tools from a specific server.
   *
   * @param serverKey - Short unique server identifier
   * @returns Number of tools unregistered
   */
  unregisterMcpTools(serverKey: string): number;

  /**
   * List all MCP tools registered from a specific server.
   *
   * @param serverKey - Short unique server identifier
   * @returns Array of tools from the specified server
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listMcpTools(serverKey?: string): Tool<z.ZodType, any>[];
}

/**
 * Filter options for getDefinitions.
 */
export interface GetDefinitionsFilter {
  /** Only include tools of these kinds */
  kinds?: ToolKind[];
  /** Only include enabled tools (default: true) */
  enabledOnly?: boolean;
}

// =============================================================================
// T005, T006, T007: ToolRegistry Implementation
// =============================================================================

/**
 * Default implementation of the ToolRegistry.
 *
 * Features:
 * - Case-insensitive tool lookup
 * - Original case preservation for display
 * - Filtering by tool kind
 * - LLM-compatible definition export
 *
 * @example
 * ```typescript
 * const registry = createToolRegistry();
 *
 * // Register tools
 * registry.register(readFileTool);
 * registry.register(writeFileTool);
 *
 * // Case-insensitive lookup
 * const tool = registry.get("READ_FILE"); // Returns readFileTool
 *
 * // Filter by kind
 * const readTools = registry.listByKind("read");
 *
 * // Get definitions for LLM
 * const definitions = registry.getDefinitions();
 * ```
 */
class ToolRegistryImpl implements ToolRegistry {
  /** Tool registry (lowercase name -> tool) */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  private readonly tools = new Map<string, Tool<z.ZodType, any>>();

  /** Original case-preserved names for display */
  private readonly originalNames = new Map<string, string>();

  /**
   * Register a tool with the registry.
   *
   * Tools are stored with case-insensitive names for lookup,
   * but original casing is preserved for display purposes.
   *
   * @param tool - Tool to register
   * @throws Error if tool with same name already exists
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  register(tool: Tool<z.ZodType, any>): void {
    const name = tool.definition.name;
    const normalizedName = name.toLowerCase();

    if (this.tools.has(normalizedName)) {
      // Overwrite silently - allows re-registration for dynamic tools
      // If strict behavior is needed, uncomment the throw below
      // throw new Error(`Tool already registered: ${name}`);
    }

    this.tools.set(normalizedName, tool);
    this.originalNames.set(normalizedName, name);
  }

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
   * List all registered tools.
   *
   * @returns Array of all registered tools
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  list(): Tool<z.ZodType, any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools filtered by kind (T006).
   *
   * @param kind - Tool kind to filter by
   * @returns Array of tools matching the specified kind
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listByKind(kind: ToolKind): Tool<z.ZodType, any>[] {
    return Array.from(this.tools.values()).filter((tool) => tool.definition.kind === kind);
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
   * Get tool definitions for LLM context (T007).
   *
   * Converts registered tools to LLM-compatible format with:
   * - name: Tool identifier
   * - description: Human-readable description
   * - parameters: JSON Schema from Zod schema
   *
   * @param filter - Optional filter options
   * @returns Array of LLM-compatible tool definitions
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

      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(tool.definition.parameters, {
        target: "openApi3",
        $refStrategy: "none",
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
  // T044: MCP Tool Registration Implementation
  // ===========================================================================

  /**
   * Register an MCP tool from an external MCP server.
   *
   * Creates a tool wrapper with the name format `mcp:<serverKey>/<toolName>`.
   */
  registerMcpTool(
    serverKey: string,
    tool: McpToolDefinition,
    executor: (params: Record<string, unknown>) => Promise<unknown>
  ): void {
    // Create the namespaced tool name
    const toolName = `mcp:${serverKey}/${tool.name}`;
    const normalizedName = toolName.toLowerCase();

    // Create a dynamic Zod schema from JSON Schema
    // For MCP tools, we accept any object as input and validate on the server side
    const inputSchema = z.record(z.string(), z.unknown());

    // Create a Tool wrapper for the MCP tool
    // biome-ignore lint/suspicious/noExplicitAny: MCP tools have dynamic schemas
    const mcpTool: Tool<z.ZodType, any> = {
      definition: {
        name: toolName,
        description: tool.description ?? `MCP tool: ${tool.name}`,
        kind: "mcp",
        parameters: inputSchema,
        enabled: true,
      },
      execute: async (params, _context) => {
        try {
          const result = await executor(params as unknown as Record<string, unknown>);
          return { success: true as const, output: result };
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };

    this.tools.set(normalizedName, mcpTool);
    this.originalNames.set(normalizedName, toolName);
  }

  /**
   * Unregister all MCP tools from a specific server.
   */
  unregisterMcpTools(serverKey: string): number {
    const prefix = `mcp:${serverKey}/`.toLowerCase();
    let count = 0;

    for (const [name] of this.tools) {
      if (name.startsWith(prefix)) {
        this.tools.delete(name);
        this.originalNames.delete(name);
        count++;
      }
    }

    return count;
  }

  /**
   * List all MCP tools registered from a specific server.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listMcpTools(serverKey?: string): Tool<z.ZodType, any>[] {
    const prefix = serverKey ? `mcp:${serverKey}/`.toLowerCase() : "mcp:";

    return Array.from(this.tools.entries())
      .filter(([name]) => name.startsWith(prefix))
      .map(([, tool]) => tool);
  }
}

// =============================================================================
// T005: Factory Function
// =============================================================================

/**
 * Create a new ToolRegistry instance.
 *
 * Factory function that creates an empty tool registry
 * ready for tool registration.
 *
 * @returns A new ToolRegistry instance
 *
 * @example
 * ```typescript
 * const registry = createToolRegistry();
 *
 * registry.register(readFileTool);
 * registry.register(writeFileTool);
 *
 * // Case-insensitive lookup
 * const tool = registry.get("READ_FILE");
 *
 * // Filter by kind
 * const writeTools = registry.listByKind("write");
 * ```
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistryImpl();
}

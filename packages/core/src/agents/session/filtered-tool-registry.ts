// ============================================
// Filtered Tool Registry
// ============================================
// REQ-025: Tool filtering based on agent level
// REQ-037: Anti-recursion - Block delegation tools for workers

import type { z } from "zod";
import { AgentLevel } from "../../agent/level.js";
import type { ToolGroupEntry } from "../../agent/restrictions.js";
import type { GetDefinitionsFilter, LLMToolDefinition, ToolRegistry } from "../../tool/registry.js";
import type { Tool, ToolKind } from "../../types/tool.js";

// ============================================
// Constants
// ============================================

/**
 * Tools that Level 2 workers are blocked from using.
 *
 * These tools enable agent spawning/delegation, which violates
 * the anti-recursion protocol (REQ-037):
 * - delegate_task: Spawns a new subagent
 * - new_task: Creates a new task (implicit delegation)
 *
 * @example
 * ```typescript
 * if (WORKER_BLOCKED_TOOLS.includes(toolName)) {
 *   throw new Error('Workers cannot use delegation tools');
 * }
 * ```
 */
export const WORKER_BLOCKED_TOOLS = ["delegate_task", "new_task"] as const;

// ============================================
// FilteredToolRegistry Interface
// ============================================

/**
 * A filtered view of a ToolRegistry based on agent level and tool groups.
 *
 * Provides O(1) tool lookup while enforcing:
 * - Level-based tool restrictions (REQ-037)
 * - Tool group filtering (REQ-025)
 *
 * @example
 * ```typescript
 * const baseRegistry = createToolRegistry();
 * const filteredRegistry = createFilteredToolRegistry(
 *   baseRegistry,
 *   AgentLevel.worker,
 *   [{ group: 'filesystem', enabled: true }]
 * );
 *
 * // Check if tool is allowed
 * if (filteredRegistry.isAllowed('read_file')) {
 *   const tool = filteredRegistry.get('read_file');
 * }
 *
 * // Get list of blocked tools
 * const blocked = filteredRegistry.getBlocked();
 * ```
 */
export interface FilteredToolRegistry {
  /**
   * Get a tool by name if it's allowed for this agent level.
   *
   * @param name - Tool name (case-insensitive)
   * @returns Tool if found and allowed, undefined otherwise
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  get(name: string): Tool<z.ZodType, any> | undefined;

  /**
   * List all tools allowed for this agent level.
   *
   * @returns Array of allowed tools
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  list(): Tool<z.ZodType, any>[];

  /**
   * Check if a tool is allowed for this agent level.
   *
   * @param name - Tool name to check (case-insensitive)
   * @returns true if tool is allowed
   */
  isAllowed(name: string): boolean;

  /**
   * Get the list of blocked tool names for this agent level.
   *
   * @returns Array of blocked tool names
   */
  getBlocked(): string[];

  /**
   * Check if a tool exists (regardless of whether it's allowed).
   *
   * @param name - Tool name to check (case-insensitive)
   * @returns true if tool exists in base registry
   */
  has(name: string): boolean;

  /**
   * Get tool definitions for LLM context (filtered).
   *
   * @param filter - Optional filter options
   * @returns Array of LLM-compatible tool definitions for allowed tools
   */
  getDefinitions(filter?: GetDefinitionsFilter): LLMToolDefinition[];

  /**
   * Get the count of allowed tools.
   */
  readonly size: number;

  /**
   * Get the agent level this registry is filtered for.
   */
  readonly agentLevel: AgentLevel;
}

// ============================================
// FilteredToolRegistry Implementation
// ============================================

/**
 * Internal implementation of FilteredToolRegistry.
 *
 * Uses a Map for O(1) lookup of blocked tools.
 */
class FilteredToolRegistryImpl implements FilteredToolRegistry {
  private readonly baseRegistry: ToolRegistry;
  private readonly blockedToolsMap: Map<string, boolean>;
  private readonly _agentLevel: AgentLevel;

  constructor(baseRegistry: ToolRegistry, agentLevel: AgentLevel, toolGroups?: ToolGroupEntry[]) {
    this.baseRegistry = baseRegistry;
    this._agentLevel = agentLevel;
    this.blockedToolsMap = new Map();

    // Build blocked tools set for O(1) lookup
    this.buildBlockedToolsMap(agentLevel, toolGroups);
  }

  /**
   * Build the blocked tools map based on agent level and tool groups.
   */
  private buildBlockedToolsMap(agentLevel: AgentLevel, toolGroups?: ToolGroupEntry[]): void {
    // Level 2 workers are blocked from delegation tools (REQ-037)
    if (agentLevel === AgentLevel.worker) {
      for (const tool of WORKER_BLOCKED_TOOLS) {
        this.blockedToolsMap.set(tool.toLowerCase(), true);
      }
    }

    // Process tool group restrictions
    if (toolGroups) {
      this.processToolGroups(toolGroups);
    }
  }

  /**
   * Process tool group configurations to build blocked tools map.
   */
  private processToolGroups(toolGroups: ToolGroupEntry[]): void {
    for (const groupEntry of toolGroups) {
      if (!groupEntry.enabled) {
        // If group is disabled, block all tools in that group
        // We need to find tools by their kind/group
        const toolsInGroup = this.getToolsByGroup(groupEntry.group);
        for (const tool of toolsInGroup) {
          this.blockedToolsMap.set(tool.definition.name.toLowerCase(), true);
        }
      } else if (groupEntry.tools) {
        // Group is enabled but only specific tools are allowed
        // Block all other tools in the group
        const allowedTools = new Set(groupEntry.tools.map((t) => t.toLowerCase()));
        const toolsInGroup = this.getToolsByGroup(groupEntry.group);
        for (const tool of toolsInGroup) {
          if (!allowedTools.has(tool.definition.name.toLowerCase())) {
            this.blockedToolsMap.set(tool.definition.name.toLowerCase(), true);
          }
        }
      }
    }
  }

  /**
   * Get tools belonging to a specific group (by kind).
   */
  private getToolsByGroup(
    group: string
    // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  ): Tool<z.ZodType, any>[] {
    // Map group name to ToolKind
    const kind = group as ToolKind;
    return this.baseRegistry.listByKind(kind);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  get(name: string): Tool<z.ZodType, any> | undefined {
    if (!this.isAllowed(name)) {
      return undefined;
    }
    return this.baseRegistry.get(name);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  list(): Tool<z.ZodType, any>[] {
    return this.baseRegistry.list().filter((tool) => this.isAllowed(tool.definition.name));
  }

  isAllowed(name: string): boolean {
    const normalizedName = name.toLowerCase();
    // O(1) lookup
    return !this.blockedToolsMap.has(normalizedName);
  }

  getBlocked(): string[] {
    return Array.from(this.blockedToolsMap.keys());
  }

  has(name: string): boolean {
    return this.baseRegistry.has(name);
  }

  getDefinitions(filter?: GetDefinitionsFilter): LLMToolDefinition[] {
    // Get all definitions from base registry
    const allDefinitions = this.baseRegistry.getDefinitions(filter);

    // Filter out blocked tools
    return allDefinitions.filter((def) => this.isAllowed(def.name));
  }

  get size(): number {
    return this.list().length;
  }

  get agentLevel(): AgentLevel {
    return this._agentLevel;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a filtered tool registry based on agent level and tool groups.
 *
 * The filtered registry enforces:
 * - Level 2 workers are blocked from delegation tools (REQ-037)
 * - Tool groups can enable/disable entire categories of tools
 * - Specific tools within enabled groups can be restricted
 *
 * @param baseRegistry - The base tool registry to filter
 * @param agentLevel - The agent level to filter for
 * @param toolGroups - Optional tool group configurations
 * @returns A filtered tool registry
 *
 * @example
 * ```typescript
 * // Create filtered registry for a worker agent
 * const registry = createFilteredToolRegistry(
 *   baseRegistry,
 *   AgentLevel.worker,
 *   [
 *     { group: 'filesystem', enabled: true },
 *     { group: 'shell', enabled: false },
 *     { group: 'network', enabled: true, tools: ['fetch'] },
 *   ]
 * );
 *
 * // Worker cannot use delegation tools
 * console.log(registry.isAllowed('delegate_task')); // false
 *
 * // Worker cannot use shell tools
 * console.log(registry.isAllowed('execute')); // false
 *
 * // Worker can only use 'fetch' from network group
 * console.log(registry.isAllowed('fetch')); // true
 * console.log(registry.isAllowed('request')); // false
 * ```
 */
export function createFilteredToolRegistry(
  baseRegistry: ToolRegistry,
  agentLevel: AgentLevel,
  toolGroups?: ToolGroupEntry[]
): FilteredToolRegistry {
  return new FilteredToolRegistryImpl(baseRegistry, agentLevel, toolGroups);
}

// ============================================
// Mode Registry for Multi-Agent Orchestration
// ============================================

import type { ResolvedAgent } from "../agents/custom/resolver.js";
import { type AgentLevel, canSpawn as canSpawnLevel } from "./level.js";
import type { ExtendedModeConfig } from "./modes.js";

/**
 * Prefix used to identify custom agent slugs in unified queries.
 */
export const CUSTOM_AGENT_PREFIX = "custom:";

/**
 * Registry for managing agent modes.
 *
 * Provides centralized storage and retrieval of ExtendedModeConfig instances,
 * with support for hierarchy-aware spawning rules and task-based mode matching.
 *
 * @example
 * ```typescript
 * const registry = createModeRegistry();
 *
 * registry.register({
 *   name: "code",
 *   description: "Main orchestrator",
 *   tools: { edit: true, bash: true },
 *   prompt: "You are an orchestrator...",
 *   level: AgentLevel.orchestrator,
 *   canSpawnAgents: ["spec-worker", "impl-worker"],
 * });
 *
 * const mode = registry.get("code");
 * const workers = registry.getByLevel(AgentLevel.worker);
 * ```
 */
export interface ModeRegistry {
  /**
   * Register a mode configuration.
   *
   * @param mode - The extended mode configuration to register
   * @throws Error if a mode with the same name (slug) is already registered
   *
   * @example
   * ```typescript
   * registry.register({
   *   name: "code",
   *   description: "Coder mode",
   *   tools: { edit: true, bash: true },
   *   prompt: "...",
   *   level: AgentLevel.worker,
   * });
   * ```
   */
  register(mode: ExtendedModeConfig): void;

  /**
   * Get a mode configuration by its slug (name).
   *
   * @param slug - The mode identifier (name field)
   * @returns The mode configuration if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const mode = registry.get("code");
   * if (mode) {
   *   console.log(mode.description);
   * }
   * ```
   */
  get(slug: string): ExtendedModeConfig | undefined;

  /**
   * Get all modes at a specific hierarchy level.
   *
   * @param level - The agent level to filter by
   * @returns Array of modes at the specified level
   *
   * @example
   * ```typescript
   * const workers = registry.getByLevel(AgentLevel.worker);
   * console.log(`Found ${workers.length} worker modes`);
   * ```
   */
  getByLevel(level: AgentLevel): ExtendedModeConfig[];

  /**
   * Check if a mode can spawn another mode.
   *
   * Uses both the hierarchy level rules from level.ts and the
   * canSpawnAgents array from the source mode configuration.
   *
   * @param fromSlug - The slug of the spawning mode
   * @param toSlug - The slug of the mode to be spawned
   * @returns true if spawning is allowed, false otherwise
   *
   * @example
   * ```typescript
   * if (registry.canSpawn("orchestrator", "worker-impl")) {
   *   // Spawn the worker
   * }
   * ```
   */
  canSpawn(fromSlug: string, toSlug: string): boolean;

  /**
   * Find the best matching mode for a task at a given level.
   *
   * Matches the task description against mode roleDefinition and
   * customInstructions (prompt) to find the most suitable mode.
   *
   * @param task - The task description to match against
   * @param level - The agent level to search within
   * @returns The best matching mode, or undefined if no match found
   *
   * @example
   * ```typescript
   * const mode = registry.findBestMatch(
   *   "implement the authentication module",
   *   AgentLevel.worker
   * );
   * ```
   */
  findBestMatch(task: string, level: AgentLevel): ExtendedModeConfig | undefined;

  /**
   * List all registered modes.
   *
   * @returns Array of all registered mode configurations
   *
   * @example
   * ```typescript
   * const allModes = registry.list();
   * console.log(`Registry contains ${allModes.length} modes`);
   * ```
   */
  list(): ExtendedModeConfig[];

  // ============================================
  // Custom Agent Integration (T028)
  // ============================================

  /**
   * Register a custom agent in the mode registry.
   *
   * Custom agents are stored separately from modes but can be queried
   * through the registry. Use "custom:" prefix when referencing in canSpawn.
   *
   * @param agent - The resolved custom agent definition
   * @returns The slug used to reference the agent (with "custom:" prefix)
   *
   * @example
   * ```typescript
   * const slug = registry.registerCustomAgent(resolvedAgent);
   * // slug = "custom:my-agent"
   * const agent = registry.getCustomAgent("my-agent");
   * ```
   */
  registerCustomAgent(agent: ResolvedAgent): string;

  /**
   * Get a custom agent by its slug (without "custom:" prefix).
   *
   * @param slug - The custom agent slug (without prefix)
   * @returns The resolved agent if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const agent = registry.getCustomAgent("my-agent");
   * if (agent) {
   *   console.log(agent.systemPrompt);
   * }
   * ```
   */
  getCustomAgent(slug: string): ResolvedAgent | undefined;

  /**
   * List all registered custom agents.
   *
   * @returns Array of resolved custom agent definitions
   *
   * @example
   * ```typescript
   * const customAgents = registry.listCustomAgents();
   * console.log(`Found ${customAgents.length} custom agents`);
   * ```
   */
  listCustomAgents(): ResolvedAgent[];

  /**
   * Check if a slug refers to a custom agent.
   *
   * @param slug - The slug to check (with or without "custom:" prefix)
   * @returns true if the slug is a custom agent, false otherwise
   */
  isCustomAgent(slug: string): boolean;

  /**
   * Get mode or custom agent by unified slug.
   *
   * Supports both builtin modes and custom agents. Custom agents
   * should be referenced with "custom:" prefix for unambiguous lookup.
   *
   * @param slug - Mode name or "custom:agent-slug"
   * @returns The mode config, resolved agent, or undefined
   *
   * @example
   * ```typescript
   * const mode = registry.getMode("code"); // ExtendedModeConfig
   * const agent = registry.getMode("custom:my-agent"); // ResolvedAgent
   * ```
   */
  getMode(slug: string): ExtendedModeConfig | ResolvedAgent | undefined;
}

/**
 * Internal implementation of ModeRegistry.
 */
class ModeRegistryImpl implements ModeRegistry {
  /** Map of slug -> mode for O(1) lookup */
  private readonly modes = new Map<string, ExtendedModeConfig>();

  /** Index by level for efficient getByLevel queries */
  private readonly byLevel = new Map<AgentLevel, ExtendedModeConfig[]>();

  /** Map of slug -> custom agent for O(1) lookup (T028) */
  private readonly customAgents = new Map<string, ResolvedAgent>();

  register(mode: ExtendedModeConfig): void {
    const slug = mode.name;

    if (this.modes.has(slug)) {
      throw new Error(`Mode "${slug}" is already registered`);
    }

    // Store in main map
    this.modes.set(slug, mode);

    // Update level index
    const levelModes = this.byLevel.get(mode.level) ?? [];
    levelModes.push(mode);
    this.byLevel.set(mode.level, levelModes);
  }

  get(slug: string): ExtendedModeConfig | undefined {
    return this.modes.get(slug);
  }

  getByLevel(level: AgentLevel): ExtendedModeConfig[] {
    return this.byLevel.get(level) ?? [];
  }

  canSpawn(fromSlug: string, toSlug: string): boolean {
    // Handle custom agent spawning
    const isFromCustom = fromSlug.startsWith(CUSTOM_AGENT_PREFIX);
    const isToCustom = toSlug.startsWith(CUSTOM_AGENT_PREFIX);

    // Get source mode/agent
    let fromLevel: AgentLevel;
    let canSpawnList: string[];

    if (isFromCustom) {
      const fromAgent = this.customAgents.get(fromSlug.slice(CUSTOM_AGENT_PREFIX.length));
      if (!fromAgent) return false;
      fromLevel = fromAgent.level ?? (2 as AgentLevel); // Default to worker
      canSpawnList = fromAgent.coordination?.canSpawnAgents ?? [];
    } else {
      const fromMode = this.modes.get(fromSlug);
      if (!fromMode) return false;
      fromLevel = fromMode.level;
      canSpawnList = fromMode.canSpawnAgents ?? [];
    }

    // Get target mode/agent
    let toLevel: AgentLevel;

    if (isToCustom) {
      const toAgent = this.customAgents.get(toSlug.slice(CUSTOM_AGENT_PREFIX.length));
      if (!toAgent) return false;
      toLevel = toAgent.level ?? (2 as AgentLevel); // Default to worker
    } else {
      const toMode = this.modes.get(toSlug);
      if (!toMode) return false;
      toLevel = toMode.level;
    }

    // Check hierarchy level rules (orchestrator->workflow, workflow->worker)
    if (!canSpawnLevel(fromLevel, toLevel)) {
      return false;
    }

    // Check if target is in the allowed spawn list
    return canSpawnList.includes(toSlug);
  }

  findBestMatch(task: string, level: AgentLevel): ExtendedModeConfig | undefined {
    const candidates = this.getByLevel(level);

    if (candidates.length === 0) {
      return undefined;
    }

    // Normalize task for matching
    const normalizedTask = task.toLowerCase();

    let bestMode: ExtendedModeConfig | undefined;
    let bestScore = 0;

    for (const mode of candidates) {
      const score = this.computeMatchScore(normalizedTask, mode);
      if (score > bestScore) {
        bestScore = score;
        bestMode = mode;
      }
    }

    return bestMode;
  }

  list(): ExtendedModeConfig[] {
    return Array.from(this.modes.values());
  }

  // ============================================
  // Custom Agent Integration (T028)
  // ============================================

  registerCustomAgent(agent: ResolvedAgent): string {
    const slug = agent.slug;

    if (this.customAgents.has(slug)) {
      throw new Error(`Custom agent "${slug}" is already registered`);
    }

    this.customAgents.set(slug, agent);

    return `${CUSTOM_AGENT_PREFIX}${slug}`;
  }

  getCustomAgent(slug: string): ResolvedAgent | undefined {
    // Strip prefix if present
    const normalizedSlug = slug.startsWith(CUSTOM_AGENT_PREFIX)
      ? slug.slice(CUSTOM_AGENT_PREFIX.length)
      : slug;
    return this.customAgents.get(normalizedSlug);
  }

  listCustomAgents(): ResolvedAgent[] {
    return Array.from(this.customAgents.values());
  }

  isCustomAgent(slug: string): boolean {
    if (slug.startsWith(CUSTOM_AGENT_PREFIX)) {
      return this.customAgents.has(slug.slice(CUSTOM_AGENT_PREFIX.length));
    }
    return this.customAgents.has(slug);
  }

  getMode(slug: string): ExtendedModeConfig | ResolvedAgent | undefined {
    // Check for custom agent prefix first
    if (slug.startsWith(CUSTOM_AGENT_PREFIX)) {
      return this.customAgents.get(slug.slice(CUSTOM_AGENT_PREFIX.length));
    }

    // Try builtin mode first
    const mode = this.modes.get(slug);
    if (mode) return mode;

    // Fall back to custom agent (for convenience)
    return this.customAgents.get(slug);
  }

  /**
   * Compute a match score between a task and a mode configuration.
   *
   * Scoring is based on keyword matches in:
   * - Mode description (weight: 1)
   * - Mode prompt (weight: 2) - contains roleDefinition/customInstructions
   * - Mode name (weight: 3) - exact match bonus
   *
   * @param normalizedTask - Lowercase task description
   * @param mode - Mode to score against
   * @returns Numeric score (higher = better match)
   */
  private computeMatchScore(normalizedTask: string, mode: ExtendedModeConfig): number {
    let score = 0;

    // Extract keywords from task (3+ character words)
    const taskKeywords = normalizedTask.split(/\s+/).filter((word) => word.length >= 3);

    // Check mode name for exact match
    if (normalizedTask.includes(mode.name.toLowerCase())) {
      score += 3;
    }

    // Check description for keyword matches
    const normalizedDescription = mode.description.toLowerCase();
    for (const keyword of taskKeywords) {
      if (normalizedDescription.includes(keyword)) {
        score += 1;
      }
    }

    // Check prompt for keyword matches (roleDefinition/customInstructions)
    const normalizedPrompt = mode.prompt.toLowerCase();
    for (const keyword of taskKeywords) {
      if (normalizedPrompt.includes(keyword)) {
        score += 2;
      }
    }

    return score;
  }
}

/**
 * Creates a new ModeRegistry instance.
 *
 * Factory function for creating mode registries. Each call returns
 * a fresh, empty registry.
 *
 * @returns A new ModeRegistry instance
 *
 * @example
 * ```typescript
 * const registry = createModeRegistry();
 *
 * // Register modes
 * registry.register(orchestratorMode);
 * registry.register(workerMode);
 *
 * // Use the registry
 * if (registry.canSpawn("orchestrator", "worker")) {
 *   const workerConfig = registry.get("worker");
 *   // ...
 * }
 * ```
 */
export function createModeRegistry(): ModeRegistry {
  return new ModeRegistryImpl();
}

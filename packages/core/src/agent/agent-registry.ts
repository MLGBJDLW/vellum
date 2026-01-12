import { type AgentConfig, BUILT_IN_AGENTS } from "./agent-config.js";

/**
 * Error thrown when attempting to register an agent with a duplicate name.
 *
 * This error is thrown by {@link AgentRegistry.register} when attempting
 * to register an agent whose name already exists in the registry.
 *
 * @example
 * ```typescript
 * import { AgentRegistry, DuplicateAgentError } from './agent-registry.js';
 *
 * const registry = AgentRegistry.getInstance();
 * try {
 *   registry.register({ name: "vibe-agent", level: 2, canSpawnAgents: false });
 * } catch (error) {
 *   if (error instanceof DuplicateAgentError) {
 *     console.log("Agent already exists:", error.message);
 *   }
 * }
 * ```
 */
export class DuplicateAgentError extends Error {
  constructor(agentName: string) {
    super(`Agent "${agentName}" is already registered`);
    this.name = "DuplicateAgentError";
  }
}

/**
 * Singleton registry for managing agent configurations.
 *
 * The registry provides centralized access to agent configs and ensures
 * unique agent names across the system. Built-in agents (vibe-agent,
 * plan-agent, spec-orchestrator) are automatically registered on first access.
 *
 * ## Usage
 *
 * The registry is accessed via the singleton pattern. All built-in agents
 * are available immediately after calling `getInstance()`.
 *
 * @example
 * ```typescript
 * // Basic usage - get an agent config
 * const registry = AgentRegistry.getInstance();
 * const agent = registry.get("vibe-agent");
 * if (agent) {
 *   console.log(agent.level);           // 2
 *   console.log(agent.canSpawnAgents);  // false
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Register a custom agent
 * const registry = AgentRegistry.getInstance();
 * registry.register({
 *   name: "custom-worker",
 *   level: 2,
 *   canSpawnAgents: false,
 *   description: "Custom task executor",
 * });
 * ```
 *
 * @example
 * ```typescript
 * // List all registered agents
 * const registry = AgentRegistry.getInstance();
 * for (const agent of registry.list()) {
 *   console.log(`${agent.name}: level ${agent.level}`);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use with CodingModeConfig.agentName
 * import { VIBE_MODE } from './coding-modes.js';
 *
 * const registry = AgentRegistry.getInstance();
 * const agent = registry.get(VIBE_MODE.agentName);
 * const level = agent?.level; // 2
 * ```
 */
export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private readonly agents: Map<string, AgentConfig> = new Map();
  private initialized = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of the registry.
   *
   * On first call, automatically registers all built-in agents
   * (vibe-agent, plan-agent, spec-orchestrator).
   *
   * @returns The singleton AgentRegistry instance
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * console.log(registry.has("vibe-agent")); // true
   * ```
   */
  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
      AgentRegistry.instance.initializeBuiltIns();
    }
    return AgentRegistry.instance;
  }

  /**
   * Register a new agent configuration.
   *
   * @param agent - The agent configuration to register
   * @throws {DuplicateAgentError} If an agent with the same name already exists
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * registry.register({
   *   name: "my-agent",
   *   level: 2,
   *   canSpawnAgents: false,
   *   description: "My custom agent",
   * });
   * ```
   */
  public register(agent: AgentConfig): void {
    if (this.agents.has(agent.name)) {
      throw new DuplicateAgentError(agent.name);
    }
    this.agents.set(agent.name, agent);
  }

  /**
   * Get an agent configuration by name.
   *
   * @param name - The unique agent name
   * @returns The agent config, or undefined if not found
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * const agent = registry.get("plan-agent");
   * if (agent) {
   *   console.log(agent.level); // 1
   * }
   * ```
   */
  public get(name: string): AgentConfig | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agent configurations.
   *
   * @returns Array of all registered AgentConfig objects
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * const agents = registry.list();
   * console.log(agents.length); // At least 3 (built-in agents)
   * ```
   */
  public list(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Reset the registry, clearing all agents.
   *
   * Primarily for testing purposes. After reset, the registry is empty
   * and built-in agents must be re-added via `reinitialize()`.
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * registry.reset();
   * console.log(registry.has("vibe-agent")); // false
   * registry.reinitialize();
   * console.log(registry.has("vibe-agent")); // true
   * ```
   */
  public reset(): void {
    this.agents.clear();
    this.initialized = false;
  }

  /**
   * Re-initialize built-in agents after a reset.
   *
   * Call this after `reset()` if you want built-in agents back.
   * Has no effect if already initialized.
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * registry.reset();
   * registry.reinitialize();
   * console.log(registry.has("vibe-agent")); // true
   * ```
   */
  public reinitialize(): void {
    if (!this.initialized) {
      this.initializeBuiltIns();
    }
  }

  private initializeBuiltIns(): void {
    for (const agent of Object.values(BUILT_IN_AGENTS)) {
      this.agents.set(agent.name, agent);
    }
    this.initialized = true;
  }

  /**
   * Check if an agent is registered.
   *
   * @param name - The agent name to check
   * @returns `true` if the agent exists, `false` otherwise
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * console.log(registry.has("vibe-agent"));     // true
   * console.log(registry.has("nonexistent"));    // false
   * ```
   */
  public has(name: string): boolean {
    return this.agents.has(name);
  }
}

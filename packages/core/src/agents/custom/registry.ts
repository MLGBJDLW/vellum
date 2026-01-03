// ============================================
// Custom Agent Registry (T015)
// ============================================
// Centralized registry for custom agent definitions.
// T032: Register spec agents in builtin registration
// @see REQ-025

import { EventEmitter } from "node:events";

import type { Logger } from "../../logger/logger.js";
import { registerSpecAgents } from "../spec/index.js";
import type { AgentDiscovery, DiscoveredAgent } from "./discovery.js";
import type { CustomAgentDefinition } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Events emitted by CustomAgentRegistry.
 */
export interface RegistryEvents {
  /** Emitted when an agent is registered */
  "agent:registered": [agent: CustomAgentDefinition];
  /** Emitted when an agent is updated */
  "agent:updated": [agent: CustomAgentDefinition];
  /** Emitted when an agent is unregistered */
  "agent:unregistered": [slug: string];
}

/**
 * Options for CustomAgentRegistry.
 */
export interface RegistryOptions {
  /** Logger instance */
  logger?: Logger;
}

/**
 * Internal agent entry with metadata.
 */
interface RegistryEntry {
  /** The agent definition */
  definition: CustomAgentDefinition;
  /** Registration priority (higher = more priority) */
  priority: number;
  /** Registration timestamp */
  registeredAt: Date;
}

// ============================================
// CustomAgentRegistry Class
// ============================================

/**
 * Centralized registry for custom agent definitions.
 *
 * Features:
 * - CRUD operations (register, get, getAll, unregister)
 * - Event-driven updates from AgentDiscovery
 * - Priority-based duplicate handling
 * - Thread-safe concurrent updates
 *
 * T042: Plugin agents are registered at runtime by PluginManager.
 * Priority order: builtin (lowest) < plugin < user < project (highest)
 *
 * @example
 * ```typescript
 * const registry = new CustomAgentRegistry();
 *
 * // Manual registration
 * registry.register({
 *   slug: "my-agent",
 *   name: "My Agent",
 * });
 *
 * // Subscribe to discovery events
 * registry.subscribeToDiscovery(discovery);
 *
 * // Retrieve agent
 * const agent = registry.get("my-agent");
 *
 * // List all agents
 * const allAgents = registry.getAll();
 *
 * // Unregister
 * registry.unregister("my-agent");
 * ```
 */
export class CustomAgentRegistry extends EventEmitter<RegistryEvents> {
  private readonly agents: Map<string, RegistryEntry> = new Map();
  private readonly options: RegistryOptions;
  private discoverySubscription: AgentDiscovery | null = null;

  // Bound event handlers for proper cleanup
  private readonly boundOnAgentAdded: (agent: DiscoveredAgent) => void;
  private readonly boundOnAgentChanged: (agent: DiscoveredAgent) => void;
  private readonly boundOnAgentRemoved: (slug: string) => void;

  /**
   * Creates a new CustomAgentRegistry instance.
   *
   * @param options - Registry configuration options
   */
  constructor(options: RegistryOptions = {}) {
    super();
    this.options = options;

    // Bind event handlers once for consistent references
    this.boundOnAgentAdded = this.handleAgentAdded.bind(this);
    this.boundOnAgentChanged = this.handleAgentChanged.bind(this);
    this.boundOnAgentRemoved = this.handleAgentRemoved.bind(this);
  }

  /**
   * Gets the current agent count.
   */
  get count(): number {
    return this.agents.size;
  }

  /**
   * Registers a custom agent definition.
   *
   * If an agent with the same slug already exists, it will be replaced
   * only if the new registration has higher or equal priority.
   *
   * @param agent - The agent definition to register
   * @param priority - Registration priority (default: 0)
   */
  register(agent: CustomAgentDefinition, priority = 0): void {
    const existing = this.agents.get(agent.slug);

    // Skip if existing agent has higher priority
    if (existing && existing.priority > priority) {
      this.options.logger?.debug(
        `Skipping registration of "${agent.slug}": existing agent has higher priority`
      );
      return;
    }

    const entry: RegistryEntry = {
      definition: agent,
      priority,
      registeredAt: new Date(),
    };

    const isUpdate = existing !== undefined;
    this.agents.set(agent.slug, entry);

    this.options.logger?.debug(`${isUpdate ? "Updated" : "Registered"} agent: ${agent.slug}`);

    if (isUpdate) {
      this.emit("agent:updated", agent);
    } else {
      this.emit("agent:registered", agent);
    }
  }

  /**
   * Retrieves an agent by slug.
   *
   * @param slug - The agent slug to look up
   * @returns The agent definition or undefined if not found
   */
  get(slug: string): CustomAgentDefinition | undefined {
    return this.agents.get(slug)?.definition;
  }

  /**
   * Returns all registered agent definitions.
   *
   * @returns Array of all agent definitions
   */
  getAll(): CustomAgentDefinition[] {
    return Array.from(this.agents.values()).map((entry) => entry.definition);
  }

  /**
   * Unregisters an agent by slug.
   *
   * @param slug - The agent slug to unregister
   * @returns True if agent was removed, false if not found
   */
  unregister(slug: string): boolean {
    const existed = this.agents.delete(slug);

    if (existed) {
      this.options.logger?.debug(`Unregistered agent: ${slug}`);
      this.emit("agent:unregistered", slug);
    }

    return existed;
  }

  /**
   * Checks if an agent is registered.
   *
   * @param slug - The agent slug to check
   * @returns True if agent exists
   */
  has(slug: string): boolean {
    return this.agents.has(slug);
  }

  /**
   * Clears all registered agents.
   */
  clear(): void {
    const slugs = Array.from(this.agents.keys());
    this.agents.clear();

    for (const slug of slugs) {
      this.emit("agent:unregistered", slug);
    }

    this.options.logger?.debug("Registry cleared");
  }

  /**
   * Subscribes to AgentDiscovery events for automatic updates.
   *
   * This enables the registry to automatically reflect changes
   * discovered by the AgentDiscovery system.
   *
   * @param discovery - The AgentDiscovery instance to subscribe to
   */
  subscribeToDiscovery(discovery: AgentDiscovery): void {
    // Unsubscribe from previous discovery if any
    this.unsubscribeFromDiscovery();

    this.discoverySubscription = discovery;

    // Subscribe to discovery events
    discovery.on("agent:added", this.boundOnAgentAdded);
    discovery.on("agent:changed", this.boundOnAgentChanged);
    discovery.on("agent:removed", this.boundOnAgentRemoved);

    this.options.logger?.debug("Subscribed to AgentDiscovery events");
  }

  /**
   * Unsubscribes from AgentDiscovery events.
   */
  unsubscribeFromDiscovery(): void {
    if (!this.discoverySubscription) {
      return;
    }

    this.discoverySubscription.off("agent:added", this.boundOnAgentAdded);
    this.discoverySubscription.off("agent:changed", this.boundOnAgentChanged);
    this.discoverySubscription.off("agent:removed", this.boundOnAgentRemoved);

    this.discoverySubscription = null;
    this.options.logger?.debug("Unsubscribed from AgentDiscovery events");
  }

  /**
   * Populates the registry from an AgentDiscovery instance.
   *
   * @param discovery - The AgentDiscovery instance to populate from
   */
  populateFromDiscovery(discovery: AgentDiscovery): void {
    const discoveredAgents = discovery.getAll();

    for (const [, discovered] of discoveredAgents) {
      this.register(discovered.definition, discovered.source);
    }

    this.options.logger?.debug(
      `Populated registry with ${discoveredAgents.size} agents from discovery`
    );
  }

  /**
   * Gets all agents matching a filter predicate.
   *
   * @param predicate - Filter function
   * @returns Array of matching agent definitions
   */
  filter(predicate: (agent: CustomAgentDefinition) => boolean): CustomAgentDefinition[] {
    return this.getAll().filter(predicate);
  }

  /**
   * Finds agents by tag.
   *
   * @param tag - The tag to search for
   * @returns Array of agents with the specified tag
   */
  findByTag(tag: string): CustomAgentDefinition[] {
    return this.filter((agent) => agent.tags?.includes(tag) ?? false);
  }

  /**
   * Finds agents by mode.
   *
   * @param mode - The mode to search for
   * @returns Array of agents with the specified mode
   */
  findByMode(mode: string): CustomAgentDefinition[] {
    return this.filter((agent) => agent.mode === mode);
  }

  // ============================================
  // Private Event Handlers
  // ============================================

  /**
   * Handles agent:added events from discovery.
   */
  private handleAgentAdded(agent: DiscoveredAgent): void {
    this.register(agent.definition, agent.source);
  }

  /**
   * Handles agent:changed events from discovery.
   */
  private handleAgentChanged(agent: DiscoveredAgent): void {
    this.register(agent.definition, agent.source);
  }

  /**
   * Handles agent:removed events from discovery.
   */
  private handleAgentRemoved(slug: string): void {
    this.unregister(slug);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new CustomAgentRegistry instance.
 *
 * @param options - Registry configuration options
 * @returns A new CustomAgentRegistry instance
 */
export function createAgentRegistry(options?: RegistryOptions): CustomAgentRegistry {
  return new CustomAgentRegistry(options);
}

// ============================================
// Builtin Agent Registration (T032)
// ============================================

/**
 * Registers all builtin agents with the registry.
 *
 * Includes spec workflow agents (spec-researcher, spec-requirements,
 * spec-architect, spec-tasks, spec-validator).
 *
 * @param registry - The CustomAgentRegistry to register agents with
 *
 * @example
 * ```typescript
 * const registry = createAgentRegistry();
 * registerBuiltinAgents(registry);
 *
 * // All builtin agents are now discoverable
 * const specResearcher = registry.get('spec-researcher');
 * ```
 */
export function registerBuiltinAgents(registry: CustomAgentRegistry): void {
  // Register spec workflow agents (T032)
  registerSpecAgents(registry);
}

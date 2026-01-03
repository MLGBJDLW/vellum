// ============================================
// Inheritance Resolver (T010)
// ============================================
// Resolves agent inheritance chains and merges configurations.
// @see REQ-023, REQ-024

import { Err, Ok, type Result } from "../../types/result.js";
import type { CustomAgentDefinition } from "./types.js";

// ============================================
// Constants
// ============================================

/**
 * Maximum inheritance depth allowed.
 * Prevents infinite loops and overly complex hierarchies.
 */
export const MAX_INHERITANCE_DEPTH = 10;

// ============================================
// Types
// ============================================

/**
 * Registry interface for looking up agent definitions.
 * Can be a Map or any object with a get method.
 */
export interface AgentRegistry {
  get(slug: string): CustomAgentDefinition | undefined;
  has(slug: string): boolean;
}

/**
 * Resolved agent with fully merged configuration.
 */
export interface ResolvedAgent extends CustomAgentDefinition {
  /** Full inheritance chain from root to this agent */
  inheritanceChain: string[];
  /** Whether this is an original or resolved definition */
  isResolved: true;
}

/**
 * Error details for resolution failures.
 */
export interface ResolutionError {
  /** Error type */
  type: "CIRCULAR_INHERITANCE" | "NOT_FOUND" | "MAX_DEPTH_EXCEEDED";
  /** Human-readable message */
  message: string;
  /** Agent slug that caused the error */
  agentSlug: string;
  /** Inheritance chain at point of failure */
  chain: string[];
}

/**
 * Result type for resolution operations.
 */
export type ResolveResult = Result<ResolvedAgent, ResolutionError>;

// ============================================
// InheritanceResolver Class
// ============================================

/**
 * Resolves agent inheritance chains and merges configurations.
 *
 * Features:
 * - Resolves `extends` chains (agent slug references)
 * - Detects circular inheritance
 * - Enforces maximum depth limit (10 levels)
 * - Deep-merges configs (arrays concatenate, objects merge)
 *
 * @example
 * ```typescript
 * const registry = new Map<string, CustomAgentDefinition>();
 * registry.set("base-agent", { slug: "base-agent", name: "Base", mode: "code" });
 * registry.set("child-agent", {
 *   slug: "child-agent",
 *   name: "Child",
 *   extends: "base-agent",
 *   settings: { temperature: 0.5 },
 * });
 *
 * const resolver = new InheritanceResolver();
 * const result = await resolver.resolve(registry.get("child-agent")!, registry);
 *
 * if (result.ok) {
 *   console.log(result.value.mode); // "code" (inherited from base)
 *   console.log(result.value.settings?.temperature); // 0.5 (from child)
 * }
 * ```
 */
export class InheritanceResolver {
  /**
   * Resolves an agent's inheritance chain and merges all configurations.
   *
   * @param agent - The agent definition to resolve
   * @param registry - Registry to look up parent agents
   * @returns Result containing resolved agent or error details
   */
  async resolve(agent: CustomAgentDefinition, registry: AgentRegistry): Promise<ResolveResult> {
    return this.resolveSync(agent, registry);
  }

  /**
   * Synchronous version of resolve.
   */
  resolveSync(agent: CustomAgentDefinition, registry: AgentRegistry): ResolveResult {
    const chain: string[] = [];
    const visited = new Set<string>();

    return this.resolveChain(agent, registry, chain, visited, 0);
  }

  /**
   * Recursively resolves the inheritance chain.
   */
  private resolveChain(
    agent: CustomAgentDefinition,
    registry: AgentRegistry,
    chain: string[],
    visited: Set<string>,
    depth: number
  ): ResolveResult {
    // Check max depth
    if (depth > MAX_INHERITANCE_DEPTH) {
      return Err({
        type: "MAX_DEPTH_EXCEEDED",
        message: `Inheritance depth exceeds maximum of ${MAX_INHERITANCE_DEPTH}`,
        agentSlug: agent.slug,
        chain: [...chain, agent.slug],
      });
    }

    // Check for circular reference
    if (visited.has(agent.slug)) {
      const circularChain = [...chain, agent.slug];
      return Err({
        type: "CIRCULAR_INHERITANCE",
        message: `Circular inheritance detected: ${circularChain.join(" → ")}`,
        agentSlug: agent.slug,
        chain: circularChain,
      });
    }

    // Mark as visited
    visited.add(agent.slug);
    chain.push(agent.slug);

    // If no extends, this is the root - return as-is
    if (!agent.extends) {
      const resolved: ResolvedAgent = {
        ...agent,
        inheritanceChain: [...chain],
        isResolved: true,
      };
      return Ok(resolved);
    }

    // Look up parent agent
    const parentSlug = agent.extends;
    const parentAgent = registry.get(parentSlug);

    if (!parentAgent) {
      return Err({
        type: "NOT_FOUND",
        message: `Parent agent not found: "${parentSlug}"`,
        agentSlug: agent.slug,
        chain: [...chain],
      });
    }

    // Recursively resolve parent
    const parentResult = this.resolveChain(parentAgent, registry, chain, visited, depth + 1);

    if (!parentResult.ok) {
      return parentResult;
    }

    // Merge parent with child (child overrides parent)
    const merged = this.deepMerge(parentResult.value, agent);

    const resolved: ResolvedAgent = {
      ...merged,
      // Ensure child's identity is preserved
      slug: agent.slug,
      name: agent.name,
      extends: agent.extends,
      inheritanceChain: [...chain],
      isResolved: true,
    };

    return Ok(resolved);
  }

  /**
   * Deep merges two agent definitions.
   * Child values override parent values.
   * Arrays are concatenated (child after parent).
   * Objects are recursively merged.
   */
  private deepMerge<T extends CustomAgentDefinition>(
    parent: T,
    child: Partial<CustomAgentDefinition>
  ): T {
    const result = { ...parent } as T;

    for (const key of Object.keys(child) as Array<keyof CustomAgentDefinition>) {
      const parentValue = parent[key];
      const childValue = child[key];

      // Skip undefined child values
      if (childValue === undefined) {
        continue;
      }

      // Handle arrays - concatenate
      if (Array.isArray(childValue)) {
        if (Array.isArray(parentValue)) {
          // Concatenate arrays, child values come after parent
          (result as Record<string, unknown>)[key] = [...parentValue, ...childValue];
        } else {
          (result as Record<string, unknown>)[key] = childValue;
        }
        continue;
      }

      // Handle objects - recursive merge
      if (childValue !== null && typeof childValue === "object" && !Array.isArray(childValue)) {
        if (
          parentValue !== null &&
          typeof parentValue === "object" &&
          !Array.isArray(parentValue)
        ) {
          (result as Record<string, unknown>)[key] = this.deepMergeObjects(
            parentValue as Record<string, unknown>,
            childValue as Record<string, unknown>
          );
        } else {
          (result as Record<string, unknown>)[key] = childValue;
        }
        continue;
      }

      // Primitive values - child overrides parent
      (result as Record<string, unknown>)[key] = childValue;
    }

    return result;
  }

  /**
   * Deep merges two plain objects.
   */
  private deepMergeObjects(
    parent: Record<string, unknown>,
    child: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...parent };

    for (const key of Object.keys(child)) {
      const parentValue = parent[key];
      const childValue = child[key];

      if (childValue === undefined) {
        continue;
      }

      // Handle arrays
      if (Array.isArray(childValue)) {
        if (Array.isArray(parentValue)) {
          result[key] = [...parentValue, ...childValue];
        } else {
          result[key] = childValue;
        }
        continue;
      }

      // Handle nested objects
      if (childValue !== null && typeof childValue === "object" && !Array.isArray(childValue)) {
        if (
          parentValue !== null &&
          typeof parentValue === "object" &&
          !Array.isArray(parentValue)
        ) {
          result[key] = this.deepMergeObjects(
            parentValue as Record<string, unknown>,
            childValue as Record<string, unknown>
          );
        } else {
          result[key] = childValue;
        }
        continue;
      }

      // Primitives
      result[key] = childValue;
    }

    return result;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new InheritanceResolver instance.
 */
export function createInheritanceResolver(): InheritanceResolver {
  return new InheritanceResolver();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Validates that an inheritance chain has no cycles.
 *
 * @param chain - Array of agent slugs in inheritance order
 * @returns True if no cycles detected
 */
export function hasNoCycles(chain: string[]): boolean {
  const seen = new Set<string>();
  for (const slug of chain) {
    if (seen.has(slug)) {
      return false;
    }
    seen.add(slug);
  }
  return true;
}

/**
 * Gets the depth of an inheritance chain.
 *
 * @param agent - Agent to check
 * @param registry - Registry to look up parents
 * @returns Depth of inheritance (0 = no parent)
 */
export function getInheritanceDepth(agent: CustomAgentDefinition, registry: AgentRegistry): number {
  let depth = 0;
  let current: CustomAgentDefinition | undefined = agent;
  const visited = new Set<string>();

  while (current?.extends && depth < MAX_INHERITANCE_DEPTH) {
    if (visited.has(current.slug)) {
      break; // Circular reference
    }
    visited.add(current.slug);
    current = registry.get(current.extends);
    depth++;
  }

  return depth;
}

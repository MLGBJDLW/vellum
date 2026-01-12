// ============================================
// Task Router for Multi-Agent Orchestration
// ============================================
// T033: Add routing rules for spec-* agents

import { BUILT_IN_AGENTS } from "../../agent/agent-config.js";
import type { AgentLevel } from "../../agent/level.js";
import type { ModeRegistry } from "../../agent/mode-registry.js";

// ============================================
// Helper: Get agent level from mode slug
// ============================================

/**
 * Get the agent level for a mode slug by looking up the corresponding agent.
 * Returns worker level (2) as default if not found.
 */
function getAgentLevelForMode(modeSlug: string): AgentLevel {
  const modeToAgent: Record<string, keyof typeof BUILT_IN_AGENTS> = {
    code: "vibe-agent",
    plan: "plan-agent",
  };

  const agentName = modeToAgent[modeSlug];
  if (agentName && agentName in BUILT_IN_AGENTS) {
    return BUILT_IN_AGENTS[agentName].level;
  }

  return 2 as AgentLevel;
}

/**
 * Represents a candidate agent for handling a task.
 *
 * @example
 * ```typescript
 * const candidate: RouteCandidate = {
 *   agentSlug: "code-worker",
 *   confidence: 0.85,
 *   reason: "Matched pattern: /implement|code|build/i",
 * };
 * ```
 */
export interface RouteCandidate {
  /** The slug identifier of the candidate agent */
  agentSlug: string;
  /** Confidence score between 0 and 1 (higher = more confident) */
  confidence: number;
  /** Human-readable reason for this candidate selection */
  reason: string;
}

/**
 * Result of routing a task to an agent.
 *
 * @example
 * ```typescript
 * const result: RouteResult = {
 *   selectedAgent: "code-worker",
 *   confidence: 0.92,
 *   alternatives: [{ agentSlug: "qa-worker", confidence: 0.65, reason: "..." }],
 *   routedAt: new Date(),
 * };
 * ```
 */
export interface RouteResult {
  /** The slug of the selected agent to handle the task */
  selectedAgent: string;
  /** Confidence score of the selection (0-1) */
  confidence: number;
  /** Alternative candidates that could handle the task */
  alternatives: RouteCandidate[];
  /** Timestamp when routing decision was made */
  routedAt: Date;
}

/**
 * A rule for routing tasks to specific agents.
 *
 * Rules are checked in priority order (higher priority first).
 *
 * @example
 * ```typescript
 * const rule: RoutingRule = {
 *   pattern: /implement|code|build/i,
 *   agentSlug: "code-worker",
 *   priority: 100,
 * };
 * ```
 */
export interface RoutingRule {
  /** Pattern to match against task description (RegExp or string) */
  pattern: RegExp | string;
  /** Agent slug to route matching tasks to */
  agentSlug: string;
  /** Priority for rule evaluation (higher = checked first) */
  priority: number;
}

/**
 * Router for determining which agent should handle a task.
 *
 * Uses a combination of explicit routing rules and mode registry
 * matching to find the best agent for a given task.
 *
 * @example
 * ```typescript
 * const router = createTaskRouter(modeRegistry);
 *
 * // Add custom routing rules
 * router.addRule({
 *   pattern: /test|spec|qa/i,
 *   agentSlug: "qa-worker",
 *   priority: 100,
 * });
 *
 * // Route a task
 * const result = router.route("implement user authentication", AgentLevel.worker);
 * console.log(`Selected: ${result.selectedAgent} (${result.confidence})`);
 * ```
 */
export interface TaskRouter {
  /**
   * Route a task to the most appropriate agent.
   *
   * Uses rules first (in priority order), then falls back to
   * ModeRegistry.findBestMatch() if no rules match.
   *
   * @param task - The task description to route
   * @param level - The agent hierarchy level to search within
   * @returns RouteResult with selected agent and alternatives
   *
   * @example
   * ```typescript
   * const result = router.route("implement login feature", AgentLevel.worker);
   * if (result.confidence > 0.8) {
   *   // High confidence - proceed automatically
   * } else {
   *   // Low confidence - maybe ask user to confirm
   * }
   * ```
   */
  route(task: string, level: AgentLevel): RouteResult;

  /**
   * Get all candidate agents for a task, sorted by confidence.
   *
   * Useful for presenting options to users or for debugging routing decisions.
   *
   * @param task - The task description to match
   * @param level - The agent hierarchy level to search within
   * @returns Array of candidates sorted by confidence (highest first)
   *
   * @example
   * ```typescript
   * const candidates = router.getCandidates("write unit tests", AgentLevel.worker);
   * for (const c of candidates) {
   *   console.log(`${c.agentSlug}: ${c.confidence} - ${c.reason}`);
   * }
   * ```
   */
  getCandidates(task: string, level: AgentLevel): RouteCandidate[];

  /**
   * Add a routing rule.
   *
   * Rules are evaluated in priority order (highest first) before
   * falling back to mode registry matching.
   *
   * @param rule - The routing rule to add
   *
   * @example
   * ```typescript
   * router.addRule({
   *   pattern: /security|vuln|cve/i,
   *   agentSlug: "security-worker",
   *   priority: 200,  // High priority
   * });
   * ```
   */
  addRule(rule: RoutingRule): void;

  /**
   * Remove a routing rule by its pattern.
   *
   * @param pattern - The pattern of the rule to remove
   * @returns true if a rule was removed, false if not found
   *
   * @example
   * ```typescript
   * const removed = router.removeRule(/security|vuln|cve/i);
   * console.log(removed ? "Rule removed" : "Rule not found");
   * ```
   */
  removeRule(pattern: RegExp | string): boolean;
}

/**
 * Internal implementation of TaskRouter.
 */
class TaskRouterImpl implements TaskRouter {
  /** Routing rules sorted by priority (descending) */
  private rules: RoutingRule[] = [];

  constructor(private readonly modeRegistry: ModeRegistry) {}

  route(task: string, level: AgentLevel): RouteResult {
    const candidates = this.getCandidates(task, level);

    // If no candidates found, return a default result with zero confidence
    if (candidates.length === 0) {
      return {
        selectedAgent: "",
        confidence: 0,
        alternatives: [],
        routedAt: new Date(),
      };
    }

    // Select the best candidate (first one, highest confidence)
    const [first, ...alternatives] = candidates;
    // We know first exists because we checked length > 0 above
    const best = first as RouteCandidate;

    return {
      selectedAgent: best.agentSlug,
      confidence: best.confidence,
      alternatives,
      routedAt: new Date(),
    };
  }

  getCandidates(task: string, level: AgentLevel): RouteCandidate[] {
    const candidates: RouteCandidate[] = [];
    const normalizedTask = task.toLowerCase();

    // First, check explicit routing rules (sorted by priority)
    for (const rule of this.rules) {
      const match = this.matchRule(normalizedTask, rule);
      if (match) {
        // Verify the agent exists and is at the correct level
        const mode = this.modeRegistry.get(rule.agentSlug);
        const modeLevel = getAgentLevelForMode(rule.agentSlug);
        if (mode && modeLevel === level) {
          candidates.push({
            agentSlug: rule.agentSlug,
            confidence: this.computeRuleConfidence(normalizedTask, rule),
            reason: `Matched rule: ${this.patternToString(rule.pattern)}`,
          });
        }
      }
    }

    // Then, get candidates from mode registry
    const modesAtLevel = this.modeRegistry.getByLevel(level);
    for (const mode of modesAtLevel) {
      // Skip if already added by a rule
      if (candidates.some((c) => c.agentSlug === mode.name)) {
        continue;
      }

      const score = this.computeModeMatchScore(normalizedTask, mode);
      if (score > 0) {
        candidates.push({
          agentSlug: mode.name,
          confidence: this.normalizeScore(score, modesAtLevel.length),
          reason: `Mode registry match: ${mode.description}`,
        });
      }
    }

    // Sort by confidence (descending)
    candidates.sort((a, b) => b.confidence - a.confidence);

    return candidates;
  }

  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    // Re-sort rules by priority (descending)
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(pattern: RegExp | string): boolean {
    const patternStr = this.patternToString(pattern);
    const initialLength = this.rules.length;

    this.rules = this.rules.filter((rule) => this.patternToString(rule.pattern) !== patternStr);

    return this.rules.length < initialLength;
  }

  /**
   * Check if a task matches a routing rule pattern.
   */
  private matchRule(normalizedTask: string, rule: RoutingRule): boolean {
    if (typeof rule.pattern === "string") {
      return normalizedTask.includes(rule.pattern.toLowerCase());
    }
    return rule.pattern.test(normalizedTask);
  }

  /**
   * Compute confidence for a rule match.
   *
   * Higher priority rules get higher base confidence.
   * Better pattern matches (more specific) get higher confidence.
   */
  private computeRuleConfidence(normalizedTask: string, rule: RoutingRule): number {
    // Base confidence from priority (normalized to 0.5-1.0 range)
    const priorityFactor = Math.min(rule.priority / 200, 1) * 0.3 + 0.5;

    // Match quality factor based on how much of the task the pattern matches
    let matchQuality = 0.5;

    if (typeof rule.pattern === "string") {
      // String patterns: confidence based on pattern length relative to task
      const patternLen = rule.pattern.length;
      const taskLen = normalizedTask.length;
      matchQuality = Math.min(patternLen / taskLen, 1) * 0.5 + 0.5;
    } else {
      // RegExp patterns: use match length
      const match = normalizedTask.match(rule.pattern);
      if (match?.[0]) {
        matchQuality = Math.min(match[0].length / normalizedTask.length, 1) * 0.5 + 0.5;
      }
    }

    // Combine factors (weighted average)
    return Math.min(priorityFactor * 0.6 + matchQuality * 0.4, 1);
  }

  /**
   * Compute match score between task and mode.
   *
   * Similar to ModeRegistry's internal scoring but exposed for candidate ranking.
   */
  private computeModeMatchScore(
    normalizedTask: string,
    mode: { name: string; description: string; prompt: string }
  ): number {
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

  /**
   * Normalize a raw score to a 0-1 confidence value.
   *
   * Uses a logarithmic scale to prevent very high scores from
   * dominating and to provide meaningful differentiation.
   */
  private normalizeScore(score: number, numCandidates: number): number {
    if (score <= 0) return 0;

    // Use logarithmic normalization
    // Max theoretical score depends on task length, but typically caps around 20-30
    const maxExpectedScore = 15;
    const normalized = Math.min(score / maxExpectedScore, 1);

    // Apply a slight penalty if there are many candidates (less certain choice)
    const candidatePenalty = numCandidates > 1 ? 1 - 0.05 * Math.min(numCandidates - 1, 4) : 1;

    return Math.min(normalized * candidatePenalty, 1);
  }

  /**
   * Convert a pattern to a string representation for comparison.
   */
  private patternToString(pattern: RegExp | string): string {
    if (typeof pattern === "string") {
      return pattern;
    }
    return pattern.toString();
  }
}

/**
 * Creates a new TaskRouter instance.
 *
 * Factory function for creating task routers that integrate with
 * the mode registry for agent selection.
 *
 * @param modeRegistry - The mode registry to use for agent lookup
 * @returns A new TaskRouter instance
 *
 * @example
 * ```typescript
 * const registry = createModeRegistry();
 * // ... register modes ...
 *
 * const router = createTaskRouter(registry);
 *
 * // Add routing rules
 * router.addRule({
 *   pattern: /implement|create|build/i,
 *   agentSlug: "impl-worker",
 *   priority: 100,
 * });
 *
 * // Route tasks
 * const result = router.route("implement user login", AgentLevel.worker);
 * console.log(`Routing to: ${result.selectedAgent}`);
 * ```
 */
export function createTaskRouter(modeRegistry: ModeRegistry): TaskRouter {
  return new TaskRouterImpl(modeRegistry);
}

// ============================================
// Spec Agent Routing Rules (T033)
// ============================================

/**
 * Routing rules for spec workflow agents.
 *
 * These rules map task descriptions to specialized spec agents:
 * - spec-researcher: Project analysis and context gathering
 * - spec-requirements: EARS requirements definition
 * - spec-architect: Architecture and design decisions
 * - spec-tasks: Task breakdown and planning
 * - spec-validator: Specification validation
 */
export const SPEC_ROUTING_RULES: readonly RoutingRule[] = [
  {
    pattern: /spec[-\s]?research|project\s+analysis|gather\s+context|codebase\s+analysis/i,
    agentSlug: "spec-researcher",
    priority: 150,
  },
  {
    pattern: /spec[-\s]?requirements?|ears\s+requirements?|define\s+requirements?/i,
    agentSlug: "spec-requirements",
    priority: 150,
  },
  {
    pattern: /spec[-\s]?architect|architecture\s+design|design\s+decision|adr/i,
    agentSlug: "spec-architect",
    priority: 150,
  },
  {
    pattern: /spec[-\s]?tasks?|task\s+breakdown|create\s+tasks|plan\s+tasks/i,
    agentSlug: "spec-tasks",
    priority: 150,
  },
  {
    pattern: /spec[-\s]?validat|validate\s+spec|verify\s+spec|check\s+spec/i,
    agentSlug: "spec-validator",
    priority: 150,
  },
] as const;

/**
 * Register spec agent routing rules with a TaskRouter.
 *
 * Adds rules that enable the router to correctly route spawn requests
 * for spec-researcher, spec-requirements, spec-architect, spec-tasks,
 * and spec-validator agents.
 *
 * @param router - The TaskRouter to register rules with
 *
 * @example
 * ```typescript
 * const router = createTaskRouter(modeRegistry);
 * registerSpecAgentRoutes(router);
 *
 * // Now the router can route spec agent tasks
 * const result = router.route("research the codebase", AgentLevel.worker);
 * // result.selectedAgent === "spec-researcher"
 * ```
 */
export function registerSpecAgentRoutes(router: TaskRouter): void {
  for (const rule of SPEC_ROUTING_RULES) {
    router.addRule(rule);
  }
}

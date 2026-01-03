// ============================================
// Agent Router (T016)
// ============================================
// Routes user input to appropriate custom agents.
// @see REQ-008, REQ-009

import type { Logger } from "../../logger/logger.js";
import type { CustomAgentRegistry } from "./registry.js";
import type { CustomAgentDefinition, TriggerPattern } from "./types.js";

// ============================================
// Constants
// ============================================

/**
 * Routing weight values type.
 */
export interface RoutingWeights {
  /** Weight for file pattern matches (default: 40%) */
  FILE_PATTERNS: number;
  /** Weight for keyword matches (default: 35%) */
  KEYWORDS: number;
  /** Weight for directory matches (default: 25%) */
  DIRECTORIES: number;
}

/** Default routing weight configuration */
export const ROUTING_WEIGHTS: RoutingWeights = {
  FILE_PATTERNS: 0.4,
  KEYWORDS: 0.35,
  DIRECTORIES: 0.25,
};

/** Minimum score threshold for routing match */
export const MIN_ROUTING_SCORE = 0.1;

/** Pattern for explicit @slug invocation */
const EXPLICIT_INVOCATION_PATTERN = /^@([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])\b/i;

// ============================================
// Types
// ============================================

/**
 * Context for routing decisions.
 */
export interface RoutingContext {
  /** User message/input */
  message: string;
  /** Currently active file path */
  activeFile?: string;
  /** Current working directory */
  workingDir?: string;
  /** Project files for pattern matching */
  projectFiles?: string[];
}

/**
 * A candidate agent with routing score.
 */
export interface ScoredCandidate {
  /** The agent definition */
  agent: CustomAgentDefinition;
  /** Total routing score (0-1) */
  score: number;
  /** Breakdown of score components */
  scoreBreakdown: ScoreBreakdown;
  /** Whether this was an explicit @slug match */
  explicit: boolean;
}

/**
 * Breakdown of routing score components.
 */
export interface ScoreBreakdown {
  /** Score from file pattern matches */
  filePatterns: number;
  /** Score from keyword matches */
  keywords: number;
  /** Score from directory matches */
  directories: number;
  /** Bonus from agent priority */
  priorityBonus: number;
}

/**
 * Result of routing operation.
 */
export interface RoutingResult {
  /** The best matching agent (if any) */
  agent?: CustomAgentDefinition;
  /** All candidates ranked by score */
  candidates: ScoredCandidate[];
  /** Whether this was an explicit @slug invocation */
  explicit: boolean;
  /** The slug extracted from explicit invocation (if any) */
  explicitSlug?: string;
}

/**
 * Options for AgentRouter.
 */
export interface RouterOptions {
  /** Logger instance */
  logger?: Logger;
  /** Minimum score for routing (default: 0.1) */
  minScore?: number;
  /** Custom routing weights */
  weights?: Partial<RoutingWeights>;
}

// ============================================
// Compiled Pattern Cache
// ============================================

/**
 * Cache for compiled regex patterns.
 */
class PatternCache {
  private readonly cache: Map<string, RegExp> = new Map();

  /**
   * Gets or compiles a regex pattern.
   */
  getRegex(pattern: string, flags = "i"): RegExp | null {
    const key = `${pattern}:${flags}`;
    let regex = this.cache.get(key);

    if (!regex) {
      try {
        regex = new RegExp(pattern, flags);
        this.cache.set(key, regex);
      } catch {
        return null;
      }
    }

    return regex;
  }

  /**
   * Gets or compiles a glob pattern as regex.
   */
  getGlobRegex(glob: string): RegExp | null {
    const key = `glob:${glob}`;
    let regex = this.cache.get(key);

    if (!regex) {
      try {
        const regexPattern = globToRegex(glob);
        regex = new RegExp(regexPattern, "i");
        this.cache.set(key, regex);
      } catch {
        return null;
      }
    }

    return regex;
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Converts a glob pattern to a regex pattern.
 */
function globToRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*\*/g, "{{GLOBSTAR}}") // Placeholder for **
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/\?/g, ".") // ? matches single char
    .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches anything
}

// ============================================
// AgentRouter Class
// ============================================

/**
 * Routes user input to appropriate custom agents.
 *
 * Features:
 * - Explicit @slug invocation handling
 * - Weighted implicit routing (files: 40%, keywords: 35%, dirs: 25%)
 * - Deterministic score calculation
 * - Efficient pattern matching with caching
 * - Fallback to base modes
 *
 * @example
 * ```typescript
 * const router = new AgentRouter(registry);
 *
 * // Explicit invocation
 * const result1 = router.route({
 *   message: "@test-writer write tests for User class",
 * });
 * // result1.explicit === true
 * // result1.agent?.slug === "test-writer"
 *
 * // Implicit routing
 * const result2 = router.route({
 *   message: "write tests",
 *   activeFile: "src/User.test.ts",
 * });
 * // Matches based on file patterns and keywords
 * ```
 */
export class AgentRouter {
  private readonly registry: CustomAgentRegistry;
  private readonly options: Required<Pick<RouterOptions, "minScore">> & RouterOptions;
  private readonly weights: typeof ROUTING_WEIGHTS;
  private readonly patternCache: PatternCache = new PatternCache();

  /**
   * Creates a new AgentRouter instance.
   *
   * @param registry - The agent registry to route from
   * @param options - Router configuration options
   */
  constructor(registry: CustomAgentRegistry, options: RouterOptions = {}) {
    this.registry = registry;
    this.options = {
      minScore: options.minScore ?? MIN_ROUTING_SCORE,
      ...options,
    };
    this.weights = {
      ...ROUTING_WEIGHTS,
      ...options.weights,
    };
  }

  /**
   * Routes user input to an appropriate agent.
   *
   * @param context - The routing context
   * @returns Routing result with matched agent and candidates
   */
  route(context: RoutingContext): RoutingResult {
    // Check for explicit @slug invocation first
    const explicitMatch = this.extractExplicitSlug(context.message);

    if (explicitMatch) {
      const agent = this.registry.get(explicitMatch);

      if (agent) {
        const candidate: ScoredCandidate = {
          agent,
          score: 1.0,
          scoreBreakdown: {
            filePatterns: 0,
            keywords: 0,
            directories: 0,
            priorityBonus: 0,
          },
          explicit: true,
        };

        this.options.logger?.debug(`Explicit routing to agent: ${explicitMatch}`);

        return {
          agent,
          candidates: [candidate],
          explicit: true,
          explicitSlug: explicitMatch,
        };
      }

      // Explicit slug not found - return empty result with slug info
      this.options.logger?.debug(`Explicit agent not found: ${explicitMatch}`);

      return {
        candidates: [],
        explicit: true,
        explicitSlug: explicitMatch,
      };
    }

    // Implicit routing based on context
    const candidates = this.calculateCandidates(context);

    // Sort by score (descending)
    candidates.sort((a, b) => b.score - a.score);

    // Filter by minimum score
    const validCandidates = candidates.filter((c) => c.score >= this.options.minScore);

    this.options.logger?.debug(`Implicit routing found ${validCandidates.length} candidates`);

    return {
      agent: validCandidates[0]?.agent,
      candidates: validCandidates,
      explicit: false,
    };
  }

  /**
   * Gets candidates for a specific file pattern.
   *
   * @param filePattern - The file pattern to match
   * @returns Array of agents that match the pattern
   */
  getCandidatesForFile(filePattern: string): CustomAgentDefinition[] {
    const agents = this.registry.getAll();

    return agents.filter((agent) => {
      const triggers = agent.whenToUse?.triggers ?? [];
      const fileTriggers = triggers.filter((t) => t.type === "file");

      for (const trigger of fileTriggers) {
        const regex = this.patternCache.getGlobRegex(trigger.pattern);
        if (regex?.test(filePattern)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Gets candidates for a specific keyword.
   *
   * @param keyword - The keyword to match
   * @returns Array of agents that match the keyword
   */
  getCandidatesForKeyword(keyword: string): CustomAgentDefinition[] {
    const agents = this.registry.getAll();
    const normalizedKeyword = keyword.toLowerCase();

    return agents.filter((agent) => {
      const triggers = agent.whenToUse?.triggers ?? [];
      const keywordTriggers = triggers.filter((t) => t.type === "keyword");

      for (const trigger of keywordTriggers) {
        const regex = this.patternCache.getRegex(trigger.pattern, "i");
        if (regex?.test(normalizedKeyword)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Clears the pattern cache.
   */
  clearCache(): void {
    this.patternCache.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Extracts explicit @slug from message.
   */
  private extractExplicitSlug(message: string): string | null {
    const match = message.match(EXPLICIT_INVOCATION_PATTERN);
    return match?.[1]?.toLowerCase() ?? null;
  }

  /**
   * Calculates scored candidates for implicit routing.
   */
  private calculateCandidates(context: RoutingContext): ScoredCandidate[] {
    const agents = this.registry.getAll();
    const candidates: ScoredCandidate[] = [];

    for (const agent of agents) {
      // Skip hidden agents from implicit routing
      if (agent.hidden) {
        continue;
      }

      const scoreBreakdown = this.calculateScoreBreakdown(agent, context);
      const totalScore = this.calculateTotalScore(scoreBreakdown);

      if (totalScore > 0) {
        candidates.push({
          agent,
          score: totalScore,
          scoreBreakdown,
          explicit: false,
        });
      }
    }

    return candidates;
  }

  /**
   * Calculates score breakdown for an agent.
   */
  private calculateScoreBreakdown(
    agent: CustomAgentDefinition,
    context: RoutingContext
  ): ScoreBreakdown {
    const triggers = agent.whenToUse?.triggers ?? [];

    return {
      filePatterns: this.calculateFilePatternScore(
        triggers.filter((t) => t.type === "file"),
        context
      ),
      keywords: this.calculateKeywordScore(
        triggers.filter((t) => t.type === "keyword" || t.type === "regex"),
        context
      ),
      directories: this.calculateDirectoryScore(agent, context),
      priorityBonus: this.calculatePriorityBonus(agent),
    };
  }

  /**
   * Calculates total weighted score from breakdown.
   */
  private calculateTotalScore(breakdown: ScoreBreakdown): number {
    const weightedScore =
      breakdown.filePatterns * this.weights.FILE_PATTERNS +
      breakdown.keywords * this.weights.KEYWORDS +
      breakdown.directories * this.weights.DIRECTORIES +
      breakdown.priorityBonus;

    // Clamp to 0-1 range
    return Math.min(1, Math.max(0, weightedScore));
  }

  /**
   * Calculates file pattern score (0-1).
   */
  private calculateFilePatternScore(triggers: TriggerPattern[], context: RoutingContext): number {
    if (triggers.length === 0) {
      return 0;
    }

    const activeFile = context.activeFile;
    if (!activeFile) {
      return 0;
    }

    let maxScore = 0;

    for (const trigger of triggers) {
      const regex = this.patternCache.getGlobRegex(trigger.pattern);
      if (regex?.test(activeFile)) {
        // Exact match gets full score, partial gets less
        maxScore = Math.max(maxScore, 1.0);
      }
    }

    return maxScore;
  }

  /**
   * Calculates keyword score (0-1).
   */
  private calculateKeywordScore(triggers: TriggerPattern[], context: RoutingContext): number {
    if (triggers.length === 0) {
      return 0;
    }

    const message = context.message.toLowerCase();
    let matchCount = 0;
    const totalTriggers = triggers.length;

    for (const trigger of triggers) {
      const regex = this.patternCache.getRegex(trigger.pattern, "i");
      if (regex?.test(message)) {
        matchCount++;
      }
    }

    // Score based on ratio of matched triggers
    return totalTriggers > 0 ? matchCount / totalTriggers : 0;
  }

  /**
   * Calculates directory score (0-1).
   */
  private calculateDirectoryScore(agent: CustomAgentDefinition, context: RoutingContext): number {
    if (!context.workingDir || !context.activeFile) {
      return 0;
    }

    // Check if agent has directory-specific triggers via file patterns
    const triggers = agent.whenToUse?.triggers ?? [];
    const fileTriggers = triggers.filter((t) => t.type === "file");

    for (const trigger of fileTriggers) {
      // Check if pattern starts with a directory component
      if (trigger.pattern.includes("/") && !trigger.pattern.startsWith("**/")) {
        const regex = this.patternCache.getGlobRegex(trigger.pattern);
        if (regex?.test(context.activeFile)) {
          return 1.0;
        }
      }
    }

    return 0;
  }

  /**
   * Calculates priority bonus (0-0.1).
   */
  private calculatePriorityBonus(agent: CustomAgentDefinition): number {
    const priority = agent.whenToUse?.priority ?? 0;
    // Normalize priority to 0-0.1 range (priority 100 = 0.1 bonus)
    return Math.min(0.1, Math.max(0, priority / 1000));
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new AgentRouter instance.
 *
 * @param registry - The agent registry to route from
 * @param options - Router configuration options
 * @returns A new AgentRouter instance
 */
export function createAgentRouter(
  registry: CustomAgentRegistry,
  options?: RouterOptions
): AgentRouter {
  return new AgentRouter(registry, options);
}

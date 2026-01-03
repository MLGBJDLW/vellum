// ============================================
// Skill Matcher
// ============================================
// Implements skill trigger matching and scoring.
// Determines which skills to activate based on context.
// @see REQ-004

import type { SkillTrigger } from "@vellum/shared";
import picomatch from "picomatch";

import type { SkillMatch, SkillScan } from "./types.js";
import { TRIGGER_TYPE_MULTIPLIERS } from "./types.js";

// ============================================
// Match Context Interface (T019)
// ============================================

/**
 * Context information for skill trigger matching.
 * Provides all the data needed to evaluate trigger patterns.
 */
export interface MatchContext {
  /** User's request text */
  request: string;
  /** Context file paths */
  files: string[];
  /** Slash command if any (e.g., "/test", "/lint") */
  command?: string;
  /** Key-value project context (e.g., { language: "typescript", framework: "react" }) */
  projectContext?: Record<string, string>;
}

// ============================================
// Skill Matcher Class (T021, T022)
// ============================================

/**
 * Matches skills against context using trigger patterns.
 *
 * Trigger Types and Multipliers:
 * - command (100): Exact slash command match
 * - keyword (10): Regex pattern on request text
 * - file_pattern (5): Glob match on context files
 * - context (3): Key:value match on project context
 * - always (1): Always active
 *
 * Final Score = skill.priority × trigger_type_multiplier
 *
 * @example
 * ```typescript
 * const matcher = new SkillMatcher();
 *
 * const context: MatchContext = {
 *   request: "write tests for authentication",
 *   files: ["src/auth/login.ts"],
 *   command: undefined,
 *   projectContext: { framework: "react" }
 * };
 *
 * const matches = matcher.matchAll(skills, context);
 * // Returns skills sorted by score (highest first)
 * ```
 */
export class SkillMatcher {
  /**
   * Match all skills against context and return sorted matches.
   *
   * @param skills - Array of scanned skills to match
   * @param context - Current context for matching
   * @returns Array of matches sorted by score (descending)
   */
  matchAll(skills: SkillScan[], context: MatchContext): SkillMatch[] {
    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      const match = this.matchSkill(skill, context);
      if (match) {
        matches.push(match);
      }
    }

    // Sort by score descending (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Match a single skill against context.
   *
   * @param skill - Skill to match
   * @param context - Current context
   * @returns Match result or null if no trigger matched
   */
  matchSkill(skill: SkillScan, context: MatchContext): SkillMatch | null {
    let bestScore = 0;
    let bestTrigger: SkillTrigger | null = null;

    for (const trigger of skill.triggers) {
      const triggerScore = this.evaluateTrigger(trigger, context);

      if (triggerScore > 0) {
        // Calculate final score: skill priority × trigger multiplier
        const finalScore = skill.priority * triggerScore;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestTrigger = trigger;
        }
      }
    }

    if (bestTrigger === null) {
      return null;
    }

    return {
      skill: { scan: skill },
      score: bestScore,
      matchedTrigger: bestTrigger,
    };
  }

  /**
   * Evaluate a trigger against context.
   *
   * @param trigger - Trigger to evaluate
   * @param context - Current context
   * @returns Trigger type multiplier if matched, 0 if not matched
   */
  evaluateTrigger(trigger: SkillTrigger, context: MatchContext): number {
    const multiplier = TRIGGER_TYPE_MULTIPLIERS[trigger.type];

    switch (trigger.type) {
      case "always":
        return multiplier;

      case "command":
        if (this.matchCommand(trigger.pattern, context.command)) {
          return multiplier;
        }
        break;

      case "keyword":
        if (this.matchKeyword(trigger.pattern, context.request)) {
          return multiplier;
        }
        break;

      case "file_pattern":
        if (this.matchFilePattern(trigger.pattern, context.files)) {
          return multiplier;
        }
        break;

      case "context":
        if (this.matchContext(trigger.pattern, context.projectContext)) {
          return multiplier;
        }
        break;
    }

    return 0;
  }

  // ============================================
  // Pattern Matchers (T022)
  // ============================================

  /**
   * Match command trigger against slash command.
   * Performs exact match (case-insensitive, strips leading slash).
   *
   * @param pattern - Command pattern (e.g., "test" or "/test")
   * @param command - Current command from context
   * @returns True if matched
   */
  private matchCommand(pattern: string | undefined, command: string | undefined): boolean {
    if (!pattern || !command) {
      return false;
    }

    // Normalize: strip leading slashes and lowercase
    const normalizedPattern = pattern.replace(/^\/+/, "").toLowerCase();
    const normalizedCommand = command.replace(/^\/+/, "").toLowerCase();

    return normalizedPattern === normalizedCommand;
  }

  /**
   * Match keyword trigger against request text.
   * Uses regex pattern matching (case-insensitive).
   *
   * @param pattern - Regex pattern (e.g., "test|pytest|jest")
   * @param request - User's request text
   * @returns True if pattern matches
   */
  private matchKeyword(pattern: string | undefined, request: string): boolean {
    if (!pattern || !request) {
      return false;
    }

    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(request);
    } catch {
      // Invalid regex - treat as literal string match
      return request.toLowerCase().includes(pattern.toLowerCase());
    }
  }

  /**
   * Match file pattern trigger against context files.
   * Uses picomatch glob matching.
   *
   * @param pattern - Glob pattern (e.g., "**\/*.test.ts")
   * @param files - Array of file paths
   * @returns True if any file matches the pattern
   */
  private matchFilePattern(pattern: string | undefined, files: string[]): boolean {
    if (!pattern || files.length === 0) {
      return false;
    }

    try {
      const isMatch = picomatch(pattern, {
        dot: true,
        nocase: true,
      });

      return files.some((file) => {
        // Normalize path separators to forward slashes
        const normalizedFile = file.replace(/\\/g, "/");
        return isMatch(normalizedFile);
      });
    } catch {
      // Invalid glob pattern
      return false;
    }
  }

  /**
   * Match context trigger against project context.
   * Pattern format: "key:value" where value can be a regex.
   *
   * @param pattern - Context pattern (e.g., "framework:react" or "language:type.*")
   * @param projectContext - Key-value project context
   * @returns True if pattern matches
   */
  private matchContext(
    pattern: string | undefined,
    projectContext: Record<string, string> | undefined
  ): boolean {
    if (!pattern || !projectContext) {
      return false;
    }

    // Parse pattern: "key:value"
    const colonIndex = pattern.indexOf(":");
    if (colonIndex === -1) {
      // No colon - just check if key exists
      return pattern in projectContext;
    }

    const key = pattern.slice(0, colonIndex).trim();
    const valuePattern = pattern.slice(colonIndex + 1).trim();

    if (!(key in projectContext)) {
      return false;
    }

    const actualValue = projectContext[key];

    if (actualValue === undefined) {
      return false;
    }

    try {
      // Try as regex
      const regex = new RegExp(`^${valuePattern}$`, "i");
      return regex.test(actualValue);
    } catch {
      // Fall back to exact match (case-insensitive)
      return actualValue.toLowerCase() === valuePattern.toLowerCase();
    }
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Default skill matcher instance.
 */
export const skillMatcher = new SkillMatcher();

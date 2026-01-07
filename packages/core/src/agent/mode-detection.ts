// ============================================
// Mode Detection - Keyword Analysis & Complexity
// ============================================
// T028: ModeDetector class with keyword analysis
// T029: ComplexityAnalyzer class
// ============================================

import { z } from "zod";
import type { CodingMode } from "./coding-modes.js";

// ============================================
// Detection Result Types
// ============================================

/**
 * Result from mode detection analysis.
 *
 * Contains the suggested mode, confidence score, matched keywords,
 * and human-readable reasoning for the suggestion.
 *
 * @example
 * ```typescript
 * const result: DetectionResult = {
 *   suggestedMode: 'vibe',
 *   confidence: 0.85,
 *   keywords: ['quick', 'fix'],
 *   reasoning: 'Keywords suggest a quick fix task',
 * };
 * ```
 */
export interface DetectionResult {
  /** The suggested coding mode based on analysis */
  suggestedMode: CodingMode;
  /** Confidence score between 0 and 1 */
  confidence: number;
  /** Keywords that matched in the input */
  keywords: string[];
  /** Human-readable explanation for the suggestion */
  reasoning: string;
}

/**
 * Zod schema for DetectionResult validation.
 */
export const DetectionResultSchema = z.object({
  suggestedMode: z.enum(["vibe", "plan", "spec"]),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
  reasoning: z.string(),
});

// ============================================
// Complexity Types
// ============================================

/**
 * Complexity level classification.
 */
export type ComplexityLevel = "low" | "medium" | "high";

/**
 * Result from complexity analysis.
 *
 * @example
 * ```typescript
 * const result: ComplexityResult = {
 *   level: 'medium',
 *   score: 0.55,
 *   factors: ['multi-file', 'feature-request'],
 *   reasoning: 'Task involves multiple files and a new feature',
 * };
 * ```
 */
export interface ComplexityResult {
  /** Complexity classification */
  level: ComplexityLevel;
  /** Numeric score between 0 and 1 */
  score: number;
  /** Factors that contributed to the score */
  factors: string[];
  /** Human-readable explanation */
  reasoning: string;
}

/**
 * Zod schema for ComplexityResult validation.
 */
export const ComplexityResultSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
  reasoning: z.string(),
});

// ============================================
// Keyword Definitions
// ============================================

/**
 * Keywords associated with vibe mode (quick, autonomous tasks).
 */
const VIBE_KEYWORDS = [
  "quick",
  "fast",
  "just do it",
  "fix this",
  "hack",
  "tweak",
  "small",
  "simple",
  "minor",
  "typo",
  "rename",
  "update",
  "change",
  "adjust",
  "hurry",
  "asap",
  "immediately",
] as const;

/**
 * Keywords associated with plan mode (analysis and structured execution).
 */
const PLAN_KEYWORDS = [
  "explain",
  "how",
  "design",
  "architecture",
  "think",
  "analyze",
  "understand",
  "investigate",
  "explore",
  "review",
  "evaluate",
  "assess",
  "plan",
  "approach",
  "strategy",
  "implement",
  "add feature",
  "build",
  "create",
] as const;

/**
 * Keywords associated with spec mode (comprehensive, production-quality work).
 */
const SPEC_KEYWORDS = [
  "feature",
  "full",
  "proper",
  "production",
  "complete",
  "comprehensive",
  "thorough",
  "requirements",
  "specification",
  "spec",
  "detailed",
  "robust",
  "scalable",
  "enterprise",
  "architecture",
  "system",
  "refactor entire",
  "overhaul",
  "rewrite",
] as const;

/**
 * Keywords that indicate high complexity.
 */
const HIGH_COMPLEXITY_KEYWORDS = [
  "refactor",
  "architecture",
  "entire",
  "all",
  "every",
  "whole",
  "complete",
  "system",
  "overhaul",
  "rewrite",
  "migrate",
  "cross-package",
  "monorepo",
] as const;

/**
 * Keywords that indicate medium complexity.
 */
const MEDIUM_COMPLEXITY_KEYWORDS = [
  "feature",
  "implement",
  "add",
  "create",
  "build",
  "integrate",
  "connect",
  "multiple",
  "several",
  "few",
] as const;

/**
 * Patterns that indicate file counts in input.
 */
const FILE_COUNT_PATTERNS = [
  /(\d+)\s*files?/i,
  /files?:\s*(\d+)/i,
  /(\d+)\s*(?:components?|modules?|classes?)/i,
] as const;

// ============================================
// ModeDetector Class (T028)
// ============================================

/**
 * Configuration options for ModeDetector.
 */
export interface ModeDetectorConfig {
  /** Minimum confidence threshold for suggestions (0-1) */
  confidenceThreshold?: number;
  /** Default mode when confidence is below threshold */
  defaultMode?: CodingMode;
  /** Whether to consider complexity in mode suggestion */
  useComplexityAnalysis?: boolean;
}

/**
 * Detects appropriate coding mode based on user input analysis.
 *
 * Uses keyword matching and complexity analysis to suggest the most
 * appropriate mode for a given task.
 *
 * @example
 * ```typescript
 * const detector = new ModeDetector();
 *
 * // Quick fix → vibe mode
 * const result1 = detector.analyze("quick fix for the typo");
 * console.log(result1.suggestedMode); // 'vibe'
 *
 * // Feature request → plan mode
 * const result2 = detector.analyze("implement a new authentication feature");
 * console.log(result2.suggestedMode); // 'plan'
 *
 * // System design → spec mode
 * const result3 = detector.analyze("design a complete payment system architecture");
 * console.log(result3.suggestedMode); // 'spec'
 * ```
 */
export class ModeDetector {
  private readonly config: Required<ModeDetectorConfig>;
  private readonly complexityAnalyzer: ComplexityAnalyzer;

  /**
   * Create a new ModeDetector.
   *
   * @param config - Optional configuration options
   */
  constructor(config: ModeDetectorConfig = {}) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      defaultMode: config.defaultMode ?? "vibe",
      useComplexityAnalysis: config.useComplexityAnalysis ?? true,
    };
    this.complexityAnalyzer = new ComplexityAnalyzer();
  }

  /**
   * Analyze user input and suggest an appropriate coding mode.
   *
   * @param input - The user's input text to analyze
   * @returns Detection result with suggested mode and confidence
   */
  analyze(input: string): DetectionResult {
    const normalizedInput = input.toLowerCase();

    // Count keyword matches for each mode
    const vibeMatches = this.findKeywordMatches(normalizedInput, VIBE_KEYWORDS);
    const planMatches = this.findKeywordMatches(normalizedInput, PLAN_KEYWORDS);
    const specMatches = this.findKeywordMatches(normalizedInput, SPEC_KEYWORDS);

    // Get complexity analysis if enabled
    let complexityBoost = 0;
    let complexityFactors: string[] = [];

    if (this.config.useComplexityAnalysis) {
      const complexity = this.complexityAnalyzer.analyze(input);
      if (complexity.level === "high") {
        complexityBoost = 0.3;
        complexityFactors = complexity.factors;
      } else if (complexity.level === "medium") {
        complexityBoost = 0.1;
        complexityFactors = complexity.factors;
      }
    }

    // Calculate scores
    const vibeScore = this.calculateScore(vibeMatches.length, normalizedInput.length);
    const planScore = this.calculateScore(planMatches.length, normalizedInput.length);
    const specScore =
      this.calculateScore(specMatches.length, normalizedInput.length) + complexityBoost;

    // Determine winner
    const scores: Array<{ mode: CodingMode; score: number; keywords: string[] }> = [
      { mode: "vibe", score: vibeScore, keywords: vibeMatches },
      { mode: "plan", score: planScore, keywords: planMatches },
      { mode: "spec", score: specScore, keywords: [...specMatches, ...complexityFactors] },
    ];

    scores.sort((a, b) => b.score - a.score);
    // scores array always has exactly 3 elements (vibe, plan, spec)
    const winner = scores[0] ?? {
      mode: this.config.defaultMode as CodingMode,
      score: 0,
      keywords: [],
    };
    const secondPlace = scores[1] ?? {
      mode: this.config.defaultMode as CodingMode,
      score: 0,
      keywords: [],
    };

    // Calculate confidence based on margin over second place
    const margin = winner.score - secondPlace.score;
    const confidence = Math.min(1, winner.score + margin * 0.5);

    // Apply confidence threshold
    if (confidence < this.config.confidenceThreshold) {
      return {
        suggestedMode: this.config.defaultMode,
        confidence,
        keywords: winner.keywords,
        reasoning: `Low confidence (${(confidence * 100).toFixed(0)}%) - defaulting to ${this.config.defaultMode} mode`,
      };
    }

    return {
      suggestedMode: winner.mode,
      confidence,
      keywords: winner.keywords,
      reasoning: this.generateReasoning(winner.mode, winner.keywords, confidence),
    };
  }

  /**
   * Find keywords that match in the input text.
   *
   * @param input - Normalized input text
   * @param keywords - Keywords to search for
   * @returns Array of matched keywords
   */
  private findKeywordMatches(input: string, keywords: readonly string[]): string[] {
    const matches: string[] = [];
    for (const keyword of keywords) {
      if (input.includes(keyword)) {
        matches.push(keyword);
      }
    }
    return matches;
  }

  /**
   * Calculate a score based on keyword matches and input length.
   *
   * @param matchCount - Number of keyword matches
   * @param inputLength - Length of input text
   * @returns Normalized score between 0 and 1
   */
  private calculateScore(matchCount: number, inputLength: number): number {
    if (matchCount === 0) return 0;

    // Base score from match count
    const baseScore = Math.min(1, matchCount * 0.2);

    // Density bonus for shorter inputs with matches
    const density = inputLength > 0 ? matchCount / (inputLength / 50) : 0;
    const densityBonus = Math.min(0.2, density * 0.1);

    return Math.min(1, baseScore + densityBonus);
  }

  /**
   * Generate human-readable reasoning for the suggestion.
   *
   * @param mode - The suggested mode
   * @param keywords - Matched keywords
   * @param confidence - Confidence score
   * @returns Reasoning string
   */
  private generateReasoning(mode: CodingMode, keywords: string[], confidence: number): string {
    const keywordList = keywords.length > 0 ? keywords.slice(0, 3).join(", ") : "context";
    const confidencePercent = (confidence * 100).toFixed(0);

    switch (mode) {
      case "vibe":
        return `Keywords [${keywordList}] suggest a quick task suitable for autonomous execution (${confidencePercent}% confidence)`;
      case "plan":
        return `Keywords [${keywordList}] suggest analysis and structured implementation needed (${confidencePercent}% confidence)`;
      case "spec":
        return `Keywords [${keywordList}] suggest comprehensive, production-quality work required (${confidencePercent}% confidence)`;
    }
  }
}

// ============================================
// ComplexityAnalyzer Class (T029)
// ============================================

/**
 * Configuration options for ComplexityAnalyzer.
 */
export interface ComplexityAnalyzerConfig {
  /** File count threshold for medium complexity */
  mediumFileThreshold?: number;
  /** File count threshold for high complexity */
  highFileThreshold?: number;
}

/**
 * Analyzes task complexity based on various factors.
 *
 * Considers:
 * - File count mentions
 * - Scope keywords (all, entire, complete)
 * - Multi-step indicators
 * - Architecture/system-level keywords
 *
 * @example
 * ```typescript
 * const analyzer = new ComplexityAnalyzer();
 *
 * // Single file change → low
 * const result1 = analyzer.analyze("fix bug in app.ts");
 * console.log(result1.level); // 'low'
 *
 * // Multi-file feature → medium
 * const result2 = analyzer.analyze("implement auth in 4 files");
 * console.log(result2.level); // 'medium'
 *
 * // System refactor → high
 * const result3 = analyzer.analyze("refactor entire authentication system");
 * console.log(result3.level); // 'high'
 * ```
 */
export class ComplexityAnalyzer {
  private readonly config: Required<ComplexityAnalyzerConfig>;

  /**
   * Create a new ComplexityAnalyzer.
   *
   * @param config - Optional configuration options
   */
  constructor(config: ComplexityAnalyzerConfig = {}) {
    this.config = {
      mediumFileThreshold: config.mediumFileThreshold ?? 3,
      highFileThreshold: config.highFileThreshold ?? 6,
    };
  }

  /**
   * Analyze the complexity of a task based on input text.
   *
   * @param input - The user's input text to analyze
   * @returns Complexity result with level, score, and factors
   */
  analyze(input: string): ComplexityResult {
    const normalizedInput = input.toLowerCase();
    const factors: string[] = [];
    let score = 0;

    // Check for file count mentions
    const fileCount = this.extractFileCount(normalizedInput);
    if (fileCount !== null) {
      if (fileCount >= this.config.highFileThreshold) {
        score += 0.5;
        factors.push(`${fileCount} files mentioned`);
      } else if (fileCount >= this.config.mediumFileThreshold) {
        score += 0.35;
        factors.push(`${fileCount} files mentioned`);
      } else if (fileCount <= 2) {
        score -= 0.05; // Simple single/dual file change
      }
    }

    // Check for high complexity keywords
    for (const keyword of HIGH_COMPLEXITY_KEYWORDS) {
      if (normalizedInput.includes(keyword)) {
        score += 0.25;
        factors.push(keyword);
      }
    }

    // Check for medium complexity keywords
    for (const keyword of MEDIUM_COMPLEXITY_KEYWORDS) {
      if (normalizedInput.includes(keyword)) {
        score += 0.15;
        if (!factors.includes(keyword)) {
          factors.push(keyword);
        }
      }
    }

    // Check for multi-step indicators
    if (this.hasMultiStepIndicators(normalizedInput)) {
      score += 0.15;
      factors.push("multi-step task");
    }

    // Check for scope keywords
    if (this.hasScopeKeywords(normalizedInput)) {
      score += 0.25;
      factors.push("broad scope");
    }

    // Normalize score to 0-1
    score = Math.max(0, Math.min(1, score));

    // Determine level
    const level = this.scoreToLevel(score);

    return {
      level,
      score,
      factors: factors.slice(0, 5), // Limit to top 5 factors
      reasoning: this.generateReasoning(level, score, factors),
    };
  }

  /**
   * Extract file count from input if mentioned.
   *
   * @param input - Normalized input text
   * @returns Extracted file count or null if not found
   */
  private extractFileCount(input: string): number | null {
    for (const pattern of FILE_COUNT_PATTERNS) {
      const match = input.match(pattern);
      if (match?.[1]) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  /**
   * Check for multi-step task indicators.
   *
   * @param input - Normalized input text
   * @returns True if multi-step indicators found
   */
  private hasMultiStepIndicators(input: string): boolean {
    const indicators = [
      /first.*then/i,
      /step\s*1|step\s*2/i,
      /and then/i,
      /after that/i,
      /followed by/i,
      /1\.|2\.|3\./,
      /\d+\)/,
    ];

    return indicators.some((pattern) => pattern.test(input));
  }

  /**
   * Check for scope-expanding keywords.
   *
   * @param input - Normalized input text
   * @returns True if scope keywords found
   */
  private hasScopeKeywords(input: string): boolean {
    const scopeKeywords = ["all", "entire", "every", "whole", "complete", "across", "throughout"];
    return scopeKeywords.some((keyword) => input.includes(keyword));
  }

  /**
   * Convert numeric score to complexity level.
   *
   * @param score - Numeric score (0-1)
   * @returns Complexity level
   */
  private scoreToLevel(score: number): ComplexityLevel {
    if (score >= 0.7) return "high";
    if (score >= 0.3) return "medium";
    return "low";
  }

  /**
   * Generate human-readable reasoning for the complexity.
   *
   * @param level - Complexity level
   * @param score - Numeric score
   * @param factors - Contributing factors
   * @returns Reasoning string
   */
  private generateReasoning(level: ComplexityLevel, score: number, factors: string[]): string {
    const factorList =
      factors.length > 0 ? factors.slice(0, 3).join(", ") : "no complexity indicators";
    const scorePercent = (score * 100).toFixed(0);

    switch (level) {
      case "low":
        return `Low complexity (${scorePercent}%): ${factorList}`;
      case "medium":
        return `Medium complexity (${scorePercent}%): ${factorList}`;
      case "high":
        return `High complexity (${scorePercent}%): ${factorList}`;
    }
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a ModeDetector with default configuration.
 *
 * @returns A new ModeDetector instance
 */
export function createModeDetector(config?: ModeDetectorConfig): ModeDetector {
  return new ModeDetector(config);
}

/**
 * Create a ComplexityAnalyzer with default configuration.
 *
 * @returns A new ComplexityAnalyzer instance
 */
export function createComplexityAnalyzer(config?: ComplexityAnalyzerConfig): ComplexityAnalyzer {
  return new ComplexityAnalyzer(config);
}

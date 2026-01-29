/**
 * Task Intent Classifier - Rule-Based Intent Detection
 *
 * Classifies user input into task intents (debug, implement, refactor, etc.)
 * using keyword matching and contextual boosting. Designed for extensibility
 * with future ML-based classification support.
 *
 * Algorithm:
 * 1. Tokenize and normalize input text
 * 2. Score each intent based on keyword matches
 * 3. Apply context boosters (error presence, test files, etc.)
 * 4. Return top intent with confidence score
 *
 * @packageDocumentation
 * @module context/evidence/adaptive
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Possible task intents that can be classified.
 */
export type TaskIntent =
  | "debug" // Error fixing, bug hunting
  | "implement" // New feature implementation
  | "refactor" // Code restructuring
  | "explore" // Understanding codebase
  | "document" // Documentation tasks
  | "test" // Test writing/fixing
  | "review" // Code review
  | "unknown";

/**
 * Result of intent classification.
 */
export interface ClassificationResult {
  /** Primary detected intent */
  readonly intent: TaskIntent;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Signals that contributed to classification */
  readonly signals: string[];
  /** Secondary intent if ambiguous */
  readonly secondaryIntent?: TaskIntent;
}

/**
 * Configuration options for the TaskIntentClassifier.
 */
export interface TaskIntentClassifierConfig {
  /** Minimum confidence threshold (default: 0.3) */
  readonly minConfidence?: number;
  /** Enable ML-based classification - reserved for future use (default: false) */
  readonly useML?: boolean;
}

/**
 * Context for enhanced classification.
 */
export interface ClassificationContext {
  /** Recently accessed files */
  readonly recentFiles?: string[];
  /** Whether an error is present in the session */
  readonly errorPresent?: boolean;
  /** Whether the current file is a test file */
  readonly testFile?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Keyword mappings for each intent type.
 */
const INTENT_KEYWORDS: Record<TaskIntent, readonly string[]> = {
  debug: [
    "error",
    "bug",
    "fix",
    "crash",
    "exception",
    "fail",
    "broken",
    "issue",
    "typeerror",
    "undefined",
    "null",
    "debug",
    "trace",
    "stack",
    "wrong",
    "incorrect",
  ],
  implement: [
    "add",
    "create",
    "implement",
    "build",
    "new",
    "feature",
    "develop",
    "make",
    "write",
    "generate",
  ],
  refactor: [
    "refactor",
    "clean",
    "reorganize",
    "improve",
    "optimize",
    "restructure",
    "simplify",
    "extract",
    "rename",
    "move",
  ],
  explore: [
    "what",
    "how",
    "where",
    "understand",
    "explain",
    "find",
    "show",
    "list",
    "why",
    "describe",
    "look",
    "search",
  ],
  document: [
    "document",
    "readme",
    "comment",
    "jsdoc",
    "describe",
    "docs",
    "documentation",
    "changelog",
    "api",
  ],
  test: [
    "test",
    "spec",
    "coverage",
    "assert",
    "expect",
    "mock",
    "vitest",
    "jest",
    "unit",
    "integration",
    "e2e",
  ],
  review: [
    "review",
    "check",
    "audit",
    "assess",
    "evaluate",
    "analyze",
    "inspect",
    "verify",
    "validate",
  ],
  unknown: [],
} as const;

/** Context boost values */
const CONTEXT_BOOSTS = {
  errorPresent: { intent: "debug" as const, boost: 0.3 },
  testFile: { intent: "test" as const, boost: 0.3 },
  recentTestFiles: { intent: "test" as const, boost: 0.2 },
} as const;

/** Default configuration */
const DEFAULT_CONFIG: Required<TaskIntentClassifierConfig> = {
  minConfidence: 0.3,
  useML: false,
};

// =============================================================================
// TaskIntentClassifier
// =============================================================================

/**
 * Classifies user input into task intents using rule-based matching.
 *
 * @example
 * ```typescript
 * const classifier = new TaskIntentClassifier();
 *
 * // Simple classification
 * const result = classifier.classify("fix the TypeError in auth.ts");
 * // { intent: 'debug', confidence: 0.8, signals: ['fix', 'typeerror'] }
 *
 * // With context
 * const contextResult = classifier.classifyWithContext(
 *   "help me with this",
 *   { errorPresent: true }
 * );
 * // { intent: 'debug', confidence: 0.6, signals: ['context:errorPresent'] }
 * ```
 */
export class TaskIntentClassifier {
  private readonly config: Required<TaskIntentClassifierConfig>;

  constructor(config?: TaskIntentClassifierConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify task intent from user input.
   *
   * @param input - User's natural language input
   * @returns Classification result with intent, confidence, and signals
   */
  classify(input: string): ClassificationResult {
    return this.classifyWithContext(input, {});
  }

  /**
   * Classify task intent with additional context.
   *
   * @param input - User's natural language input
   * @param context - Additional context for classification
   * @returns Classification result with intent, confidence, and signals
   */
  classifyWithContext(input: string, context: ClassificationContext): ClassificationResult {
    const tokens = this.tokenize(input);
    const scores = this.computeScores(tokens);
    const signals: string[] = [];

    // Collect matched signals
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      if (intent === "unknown") continue;
      for (const keyword of keywords) {
        if (tokens.includes(keyword)) {
          signals.push(keyword);
        }
      }
    }

    // Apply context boosting
    this.applyContextBoosts(scores, signals, context);

    // Find top two intents
    const sorted = this.getSortedIntents(scores);
    const [topIntent, topScore] = sorted[0] ?? ["unknown", 0];
    const [secondIntent, secondScore] = sorted[1] ?? [undefined, 0];

    // Compute confidence (normalized to 0-1)
    const maxPossibleScore = tokens.length > 0 ? tokens.length : 1;
    const confidence = Math.min(1, topScore / Math.max(1, maxPossibleScore));

    // Determine if we have enough confidence
    const finalIntent = confidence >= this.config.minConfidence ? topIntent : "unknown";

    // Include secondary intent if close in score
    const hasSecondary =
      secondIntent !== undefined && secondScore > 0 && secondScore / topScore > 0.5;

    return {
      intent: finalIntent,
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
      signals,
      ...(hasSecondary && { secondaryIntent: secondIntent }),
    };
  }

  /**
   * Get the keyword list for a specific intent.
   *
   * @param intent - The task intent
   * @returns Read-only array of keywords for the intent
   */
  getIntentKeywords(intent: TaskIntent): readonly string[] {
    return INTENT_KEYWORDS[intent];
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Tokenize and normalize input text.
   */
  private tokenize(input: string): string[] {
    return input
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Remove punctuation
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  /**
   * Compute scores for each intent based on keyword matches.
   */
  private computeScores(tokens: string[]): Map<TaskIntent, number> {
    const scores = new Map<TaskIntent, number>();

    for (const intent of Object.keys(INTENT_KEYWORDS) as TaskIntent[]) {
      if (intent === "unknown") continue;

      const keywords = INTENT_KEYWORDS[intent];
      let score = 0;

      for (const token of tokens) {
        if (keywords.includes(token)) {
          score += 1;
        }
        // Partial match bonus (for compound words)
        for (const keyword of keywords) {
          if (token.includes(keyword) && token !== keyword) {
            score += 0.5;
          }
        }
      }

      scores.set(intent, score);
    }

    return scores;
  }

  /**
   * Apply context-based boosting to scores.
   */
  private applyContextBoosts(
    scores: Map<TaskIntent, number>,
    signals: string[],
    context: ClassificationContext
  ): void {
    // Boost debug if error is present
    if (context.errorPresent) {
      const current = scores.get(CONTEXT_BOOSTS.errorPresent.intent) ?? 0;
      scores.set(CONTEXT_BOOSTS.errorPresent.intent, current + CONTEXT_BOOSTS.errorPresent.boost);
      signals.push("context:errorPresent");
    }

    // Boost test if in test file
    if (context.testFile) {
      const current = scores.get(CONTEXT_BOOSTS.testFile.intent) ?? 0;
      scores.set(CONTEXT_BOOSTS.testFile.intent, current + CONTEXT_BOOSTS.testFile.boost);
      signals.push("context:testFile");
    }

    // Boost test if recent files include test files
    if (context.recentFiles?.some((f) => f.includes(".test."))) {
      const current = scores.get(CONTEXT_BOOSTS.recentTestFiles.intent) ?? 0;
      scores.set(
        CONTEXT_BOOSTS.recentTestFiles.intent,
        current + CONTEXT_BOOSTS.recentTestFiles.boost
      );
      signals.push("context:recentTestFiles");
    }
  }

  /**
   * Get intents sorted by score (descending).
   */
  private getSortedIntents(scores: Map<TaskIntent, number>): Array<[TaskIntent, number]> {
    return [...scores.entries()].filter(([, score]) => score > 0).sort(([, a], [, b]) => b - a);
  }
}

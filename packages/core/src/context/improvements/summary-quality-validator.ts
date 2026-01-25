/**
 * Summary Quality Validator
 *
 * Validates summary quality using both rule-based (fast) and LLM-based (deep) methods.
 * Ensures summaries retain critical information like technical terms, code references,
 * file paths, and error messages.
 *
 * @module @vellum/core/context/improvements/summary-quality-validator
 */

import { createLogger } from "../../logger/index.js";
import type { ContextMessage } from "../types.js";
import type {
  LLMValidationResult,
  LostItem,
  RuleValidationResult,
  SummaryQualityConfig,
  SummaryQualityReport,
} from "./types.js";

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger({ name: "summary-quality-validator" });

// ============================================================================
// Technical Term Extractor
// ============================================================================

/**
 * Regular expression patterns for extracting technical terms.
 */
const TECH_PATTERNS = {
  /**
   * Function names: functionName(), async function xxx, function xxx
   * Matches: `myFunc()`, `async function handleClick`, `function process`
   */
  functionName: /(?:async\s+)?function\s+(\w+)|(\w+)\s*\(/g,

  /**
   * Class/Interface names: class Xxx, interface Xxx, type Xxx
   * Matches: `class MyComponent`, `interface Config`, `type Options`
   */
  className: /(?:class|interface|type|enum)\s+(\w+)/g,

  /**
   * Variable declarations: const xxx, let xxx, var xxx
   * Matches: `const result`, `let counter`, `var data`
   */
  variableName: /(?:const|let|var)\s+(\w+)/g,

  /**
   * File paths: /path/to/file.ts, src/xxx/yyy.ts, ./relative/path
   * Matches: `/home/user/file.ts`, `src/components/Button.tsx`, `./utils.js`
   */
  filePath:
    /(?:\/[\w.-]+)+(?:\/[\w.-]+)*\.\w+|(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.\w+|[\w-]+\/[\w.-]+\.\w+/g,

  /**
   * Inline code references: `code`, ```code blocks```
   * Matches: `variableName`, `someFunction()`, ```typescript code```
   */
  codeRef: /`{1,3}[^`]+`{1,3}/g,

  /**
   * Error messages: Error:, at xxx:line, TypeError, ReferenceError
   * Matches: `Error: Something went wrong`, `at file.ts:42`, `TypeError: undefined`
   */
  errorMessage:
    /(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):\s*[^\n]+|at\s+[\w./]+:\d+/g,

  /**
   * Import/Export statements: import xxx from, export { xxx }
   * Matches: `import React from 'react'`, `export { Component }`
   */
  importExport: /(?:import|export)\s+(?:(?:type\s+)?{[^}]+}|\w+|\*)\s*(?:from\s+['"][^'"]+['"])?/g,

  /**
   * Package/module names: @scope/package, package-name
   * Matches: `@vellum/core`, `react-dom`, `lodash`
   */
  packageName: /@[\w-]+\/[\w-]+|[\w-]{2,}(?:-[\w-]+)+/g,
} as const;

/**
 * Extracted technical terms from content.
 */
export interface ExtractedTerms {
  /** Function names found */
  functionNames: Set<string>;
  /** Class/interface names found */
  classNames: Set<string>;
  /** File paths found */
  filePaths: Set<string>;
  /** Inline code references found */
  codeRefs: Set<string>;
  /** Error messages found */
  errorMessages: Set<string>;
  /** Import/export statements found */
  imports: Set<string>;
  /** Package names found */
  packageNames: Set<string>;
}

/**
 * Extract technical terms from text content.
 *
 * @param content - Text content to analyze
 * @returns Extracted technical terms grouped by category
 */
export function extractTechnicalTerms(content: string): ExtractedTerms {
  const result: ExtractedTerms = {
    functionNames: new Set<string>(),
    classNames: new Set<string>(),
    filePaths: new Set<string>(),
    codeRefs: new Set<string>(),
    errorMessages: new Set<string>(),
    imports: new Set<string>(),
    packageNames: new Set<string>(),
  };

  // Extract function names
  for (const match of content.matchAll(TECH_PATTERNS.functionName)) {
    const name = match[1] || match[2];
    if (name && name.length > 1 && !isCommonWord(name)) {
      result.functionNames.add(name);
    }
  }

  // Extract class/interface names
  for (const match of content.matchAll(TECH_PATTERNS.className)) {
    if (match[1]) {
      result.classNames.add(match[1]);
    }
  }

  // Extract file paths
  for (const match of content.matchAll(TECH_PATTERNS.filePath)) {
    if (match[0]) {
      result.filePaths.add(match[0]);
    }
  }

  // Extract code references
  for (const match of content.matchAll(TECH_PATTERNS.codeRef)) {
    if (match[0]) {
      result.codeRefs.add(match[0]);
    }
  }

  // Extract error messages
  for (const match of content.matchAll(TECH_PATTERNS.errorMessage)) {
    if (match[0]) {
      result.errorMessages.add(match[0]);
    }
  }

  // Extract imports
  for (const match of content.matchAll(TECH_PATTERNS.importExport)) {
    if (match[0]) {
      result.imports.add(match[0]);
    }
  }

  // Extract package names
  for (const match of content.matchAll(TECH_PATTERNS.packageName)) {
    if (match[0]) {
      result.packageNames.add(match[0]);
    }
  }

  return result;
}

/**
 * Common words to exclude from function name matches.
 */
const COMMON_WORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "return",
  "new",
  "this",
  "that",
  "then",
  "else",
  "case",
  "break",
  "continue",
  "throw",
  "catch",
  "try",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "be",
  "to",
  "of",
  "and",
  "or",
  "not",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "it",
  "its",
  "use",
  "get",
  "set",
  "has",
  "have",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
]);

/**
 * Check if a word is a common word that should be excluded.
 */
function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase());
}

// ============================================================================
// LLM Client Interface
// ============================================================================

/**
 * LLM client interface for quality validation.
 */
export interface QualityValidationLLMClient {
  /**
   * Evaluate summary quality against the original content.
   *
   * @param original - Original content
   * @param summary - Summary content
   * @param prompt - Evaluation prompt
   * @returns Evaluation response text
   */
  evaluate(original: string, summary: string, prompt: string): Promise<string>;
}

// ============================================================================
// SummaryQualityValidator
// ============================================================================

/**
 * Default LLM evaluation prompt for summary quality.
 */
const LLM_EVALUATION_PROMPT = `You are evaluating the quality of a summary. Rate the following aspects on a scale of 0-10:

1. **Completeness**: Does the summary capture all key information from the original?
2. **Accuracy**: Is the summary technically accurate and free of misrepresentations?
3. **Actionability**: Can someone continue the task based solely on the summary?

Respond in JSON format:
{
  "completenessScore": <0-10>,
  "accuracyScore": <0-10>,
  "actionabilityScore": <0-10>,
  "suggestions": ["suggestion1", "suggestion2"]
}

Original content:
---
{original}
---

Summary:
---
{summary}
---

Evaluation:`;

/**
 * Summary quality validator with rule-based and LLM-based validation.
 *
 * The validator supports two validation modes:
 * - **Rule-based (fast)**: Uses pattern matching to detect preserved terms
 * - **LLM-based (deep)**: Uses an LLM to evaluate quality scores
 *
 * @example
 * ```typescript
 * const validator = new SummaryQualityValidator({
 *   enableRuleValidation: true,
 *   enableLLMValidation: false,
 *   minTechTermRetention: 0.8,
 *   minCodeRefRetention: 0.9,
 *   maxCompressionRatio: 10,
 * });
 *
 * const report = await validator.validate(originalContent, summaryContent);
 * if (!report.passed) {
 *   console.log('Summary quality issues:', report.warnings);
 * }
 * ```
 */
export class SummaryQualityValidator {
  private readonly config: SummaryQualityConfig;
  private llmClient?: QualityValidationLLMClient;

  /**
   * Create a new SummaryQualityValidator.
   *
   * @param config - Validation configuration
   * @param llmClient - Optional LLM client for deep validation
   */
  constructor(config: SummaryQualityConfig, llmClient?: QualityValidationLLMClient) {
    this.config = config;
    this.llmClient = llmClient;
  }

  /**
   * Set the LLM client for deep validation.
   *
   * @param client - LLM client instance
   */
  setLLMClient(client: QualityValidationLLMClient): void {
    this.llmClient = client;
  }

  /**
   * Validate summary quality using configured validation methods.
   *
   * @param original - Original message content (string or array of messages)
   * @param summary - Summary content
   * @returns Quality report with pass/fail status and details
   */
  async validate(
    original: string | ContextMessage[],
    summary: string
  ): Promise<SummaryQualityReport> {
    // Convert messages to string if needed
    const originalText = typeof original === "string" ? original : this.messagesToText(original);

    // Calculate token counts (rough estimate: 4 chars per token)
    const originalTokens = Math.ceil(originalText.length / 4);
    const summaryTokens = Math.ceil(summary.length / 4);
    const compressionRatio = originalTokens > 0 ? originalTokens / summaryTokens : 0;

    const warnings: string[] = [];
    let passed = true;

    // Rule-based validation
    let ruleResults: RuleValidationResult | undefined;
    if (this.config.enableRuleValidation) {
      ruleResults = this.validateWithRules(originalText, summary);

      // Check thresholds
      if (ruleResults.techTermRetention < this.config.minTechTermRetention) {
        warnings.push(
          `Technical term retention (${(ruleResults.techTermRetention * 100).toFixed(1)}%) ` +
            `below threshold (${(this.config.minTechTermRetention * 100).toFixed(1)}%)`
        );
        passed = false;
      }

      if (ruleResults.codeRefRetention < this.config.minCodeRefRetention) {
        warnings.push(
          `Code reference retention (${(ruleResults.codeRefRetention * 100).toFixed(1)}%) ` +
            `below threshold (${(this.config.minCodeRefRetention * 100).toFixed(1)}%)`
        );
        passed = false;
      }

      if (!ruleResults.criticalPathsPreserved) {
        warnings.push("Critical file paths were not preserved in summary");
        passed = false;
      }

      // Report lost items
      if (ruleResults.lostItems.length > 0) {
        const lostByType = this.groupLostItems(ruleResults.lostItems);
        for (const [type, items] of Object.entries(lostByType)) {
          if (items.length > 0) {
            warnings.push(`Lost ${items.length} ${type.replace("_", " ")}(s)`);
          }
        }
      }
    }

    // Check compression ratio
    if (compressionRatio > this.config.maxCompressionRatio) {
      warnings.push(
        `Compression ratio (${compressionRatio.toFixed(1)}x) ` +
          `exceeds maximum (${this.config.maxCompressionRatio}x) - summary may be over-compressed`
      );
      passed = false;
    }

    // LLM-based validation
    let llmResults: LLMValidationResult | undefined;
    if (this.config.enableLLMValidation && this.llmClient) {
      try {
        llmResults = await this.validateWithLLM(originalText, summary);

        // Check LLM scores
        const minScore = 6; // Minimum acceptable score
        if (llmResults.completenessScore < minScore) {
          warnings.push(
            `LLM completeness score (${llmResults.completenessScore}/10) below minimum`
          );
          passed = false;
        }
        if (llmResults.accuracyScore < minScore) {
          warnings.push(`LLM accuracy score (${llmResults.accuracyScore}/10) below minimum`);
          passed = false;
        }
        if (llmResults.actionabilityScore < minScore) {
          warnings.push(
            `LLM actionability score (${llmResults.actionabilityScore}/10) below minimum`
          );
          passed = false;
        }
      } catch (error) {
        logger.warn("LLM validation failed, continuing with rule-based results only", { error });
        warnings.push("LLM validation was skipped due to error");
      }
    }

    const report: SummaryQualityReport = {
      passed,
      originalTokens,
      summaryTokens,
      compressionRatio,
      ruleResults,
      llmResults,
      warnings,
    };

    // Log validation result
    logger.debug("Summary quality validation complete", {
      passed,
      compressionRatio: compressionRatio.toFixed(2),
      techTermRetention: ruleResults?.techTermRetention.toFixed(2),
      codeRefRetention: ruleResults?.codeRefRetention.toFixed(2),
      warningCount: warnings.length,
    });

    return report;
  }

  /**
   * Perform fast rule-based validation without LLM calls.
   *
   * Analyzes retention of:
   * - Technical terms (function names, class names)
   * - Code references (inline code, code blocks)
   * - File paths
   * - Error messages
   *
   * @param original - Original text content
   * @param summary - Summary text content
   * @returns Rule validation results
   */
  validateWithRules(original: string, summary: string): RuleValidationResult {
    const originalTerms = extractTechnicalTerms(original);
    const summaryTerms = extractTechnicalTerms(summary);

    // Also check for terms mentioned as plain text (not in code blocks)
    const summaryLower = summary.toLowerCase();

    // Calculate technical term retention
    const techTermRetention = this.calculateRetention(
      [...originalTerms.functionNames, ...originalTerms.classNames],
      [...summaryTerms.functionNames, ...summaryTerms.classNames],
      summaryLower
    );

    // Calculate code reference retention
    const codeRefRetention = this.calculateRetention(
      [...originalTerms.codeRefs],
      [...summaryTerms.codeRefs],
      summaryLower
    );

    // Check critical paths preservation
    const criticalPathsPreserved = this.checkPathsPreserved(
      originalTerms.filePaths,
      summaryTerms.filePaths,
      summary
    );

    // Collect lost items
    const lostItems = this.collectLostItems(originalTerms, summaryTerms, summary);

    return {
      techTermRetention,
      codeRefRetention,
      criticalPathsPreserved,
      lostItems,
    };
  }

  /**
   * Perform deep LLM-based validation.
   *
   * Calls the configured LLM to evaluate:
   * - Completeness: Key information capture
   * - Accuracy: Technical correctness
   * - Actionability: Ability to continue task from summary
   *
   * @param original - Original text content
   * @param summary - Summary text content
   * @returns LLM validation results
   * @throws Error if LLM client is not configured
   */
  async validateWithLLM(original: string, summary: string): Promise<LLMValidationResult> {
    if (!this.llmClient) {
      throw new Error("LLM client not configured for deep validation");
    }

    const prompt = LLM_EVALUATION_PROMPT.replace("{original}", original).replace(
      "{summary}",
      summary
    );

    const response = await this.llmClient.evaluate(original, summary, prompt);

    // Parse JSON response
    try {
      // Extract JSON from response (may have markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      const result = JSON.parse(jsonMatch[0]) as {
        completenessScore?: number;
        accuracyScore?: number;
        actionabilityScore?: number;
        suggestions?: string[];
      };

      return {
        completenessScore: this.clampScore(result.completenessScore ?? 5),
        accuracyScore: this.clampScore(result.accuracyScore ?? 5),
        actionabilityScore: this.clampScore(result.actionabilityScore ?? 5),
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      };
    } catch (parseError) {
      logger.warn("Failed to parse LLM evaluation response", { parseError, response });
      // Return default scores on parse failure
      return {
        completenessScore: 5,
        accuracyScore: 5,
        actionabilityScore: 5,
        suggestions: ["Unable to parse LLM evaluation response"],
      };
    }
  }

  /**
   * Convert messages array to text for analysis.
   */
  private messagesToText(messages: ContextMessage[]): string {
    return messages
      .map((m) => {
        if (typeof m.content === "string") {
          return m.content;
        }
        // Handle content blocks
        if (Array.isArray(m.content)) {
          return m.content
            .map((block) => {
              if ("text" in block) {
                return block.text;
              }
              return "";
            })
            .join("\n");
        }
        return "";
      })
      .join("\n\n");
  }

  /**
   * Calculate retention ratio for a set of terms.
   */
  private calculateRetention(original: string[], summary: string[], summaryLower: string): number {
    if (original.length === 0) {
      return 1; // Nothing to retain = 100% retention
    }

    const summarySet = new Set(summary.map((s) => s.toLowerCase()));
    let retained = 0;

    for (const term of original) {
      const termLower = term.toLowerCase();
      // Check if term is in summary (as extracted or as plain text)
      if (summarySet.has(termLower) || summaryLower.includes(termLower)) {
        retained++;
      }
    }

    return retained / original.length;
  }

  /**
   * Check if critical file paths are preserved in summary.
   */
  private checkPathsPreserved(
    originalPaths: Set<string>,
    summaryPaths: Set<string>,
    summary: string
  ): boolean {
    if (originalPaths.size === 0) {
      return true; // No paths to preserve
    }

    // Check if at least some paths are mentioned
    let preserved = 0;
    for (const path of originalPaths) {
      // Check both extracted paths and plain text mentions
      const pathBasename = path.split("/").pop() ?? path;
      if (summaryPaths.has(path) || summary.includes(pathBasename)) {
        preserved++;
      }
    }

    // Require at least 50% of paths to be preserved
    return preserved >= originalPaths.size * 0.5;
  }

  /**
   * Collect items that were lost during summarization.
   */
  private collectLostItems(
    original: ExtractedTerms,
    summary: ExtractedTerms,
    summaryText: string
  ): LostItem[] {
    const lostItems: LostItem[] = [];
    const summaryLower = summaryText.toLowerCase();

    // Check function names
    for (const name of original.functionNames) {
      if (!summary.functionNames.has(name) && !summaryLower.includes(name.toLowerCase())) {
        lostItems.push({
          type: "tech_term",
          original: name,
          context: `function ${name}`,
        });
      }
    }

    // Check class names
    for (const name of original.classNames) {
      if (!summary.classNames.has(name) && !summaryLower.includes(name.toLowerCase())) {
        lostItems.push({
          type: "tech_term",
          original: name,
          context: `class/interface ${name}`,
        });
      }
    }

    // Check file paths
    for (const path of original.filePaths) {
      const pathBasename = path.split("/").pop() ?? path;
      if (!summary.filePaths.has(path) && !summaryText.includes(pathBasename)) {
        lostItems.push({
          type: "file_path",
          original: path,
          context: path,
        });
      }
    }

    // Check error messages (important for debugging context)
    for (const error of original.errorMessages) {
      const errorLower = error.toLowerCase();
      if (!summary.errorMessages.has(error) && !summaryLower.includes(errorLower)) {
        lostItems.push({
          type: "error_message",
          original: error,
          context: error,
        });
      }
    }

    // Check code references (limit to avoid noise)
    let codeRefLost = 0;
    for (const ref of original.codeRefs) {
      if (!summary.codeRefs.has(ref) && codeRefLost < 10) {
        // Extract content without backticks
        const content = ref.replace(/^`+|`+$/g, "");
        if (content.length > 3 && !summaryLower.includes(content.toLowerCase())) {
          lostItems.push({
            type: "code_ref",
            original: ref,
            context: ref,
          });
          codeRefLost++;
        }
      }
    }

    return lostItems;
  }

  /**
   * Group lost items by type.
   */
  private groupLostItems(items: LostItem[]): Record<string, LostItem[]> {
    const grouped: Record<string, LostItem[]> = {};
    for (const item of items) {
      const list = grouped[item.type];
      if (list) {
        list.push(item);
      } else {
        grouped[item.type] = [item];
      }
    }
    return grouped;
  }

  /**
   * Clamp score to 0-10 range.
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(10, score));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SummaryQualityValidator with default configuration.
 *
 * @param overrides - Configuration overrides
 * @returns Configured validator instance
 */
export function createSummaryQualityValidator(
  overrides?: Partial<SummaryQualityConfig>
): SummaryQualityValidator {
  const config: SummaryQualityConfig = {
    enableRuleValidation: true,
    enableLLMValidation: false,
    minTechTermRetention: 0.8,
    minCodeRefRetention: 0.9,
    maxCompressionRatio: 10,
    ...overrides,
  };

  return new SummaryQualityValidator(config);
}

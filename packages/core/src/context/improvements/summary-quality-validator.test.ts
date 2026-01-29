/**
 * Summary Quality Validator - Unit Tests
 *
 * Tests for rule-based and LLM-based summary quality validation.
 *
 * Test scenarios:
 * - T007a: High-quality summary passes validation
 * - T007b: Missing technical terms produce warnings
 * - T007c: Missing code references produce warnings
 * - T007d: Over-compressed summary fails validation
 * - T007e: Disabled validation skips checks
 * - T007f: LLM validation integration
 */

import { describe, expect, it, vi } from "vitest";
import { MessagePriority } from "../types.js";
import {
  createSummaryQualityValidator,
  extractTechnicalTerms,
  type QualityValidationLLMClient,
  SummaryQualityValidator,
} from "./summary-quality-validator.js";
import type { SummaryQualityConfig } from "./types.js";

vi.mock("../../logger/index.js", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a high-quality summary that preserves key information.
 */
const createHighQualitySummary = () => ({
  original: `
    We need to implement the SummaryQualityValidator class in 
    packages/core/src/context/improvements/summary-quality-validator.ts.
    
    The class should have methods:
    - validate(original, summary) for full validation
    - validateWithRules(original, summary) for fast rule-based checks
    - validateWithLLM(original, summary) for deep LLM evaluation
    
    Error encountered: TypeError: Cannot read property 'content' of undefined
    at packages/core/src/context/compression.ts:234
    
    Key decisions:
    1. Use extractTechnicalTerms() to parse code patterns
    2. Retention thresholds: 80% for tech terms, 90% for code refs
  `,
  summary: `
    ## Task
    Implement SummaryQualityValidator class in 
    packages/core/src/context/improvements/summary-quality-validator.ts.
    
    ## Methods
    - validate() - Full validation
    - validateWithRules() - Fast rule-based checks  
    - validateWithLLM() - Deep LLM evaluation
    
    ## Error
    TypeError: Cannot read property 'content' of undefined
    at compression.ts:234
    
    ## Decisions
    - Use extractTechnicalTerms() for pattern extraction
    - Thresholds: 80% tech terms, 90% code refs
  `,
});

/**
 * Create a poor summary that loses technical terms.
 */
const createPoorTechTermSummary = () => ({
  original: `
    The SummaryQualityValidator class validates summary quality.
    It uses extractTechnicalTerms() to find function names.
    The validateWithRules() method performs fast checks.
    The validateWithLLM() method calls the LLM for deep analysis.
    
    File: packages/core/src/context/improvements/summary-quality-validator.ts
  `,
  summary: `
    A class validates summary quality using pattern matching
    and language model analysis. It has methods for fast and deep validation.
  `,
});

/**
 * Create a poor summary that loses code references.
 */
const createPoorCodeRefSummary = () => ({
  original: `
    Use \`validate()\` to check summary quality.
    Call \`extractTechnicalTerms(content)\` to extract patterns.
    The \`SummaryQualityValidator\` class handles validation.
    
    \`\`\`typescript
    const validator = new SummaryQualityValidator(config);
    const report = await validator.validate(original, summary);
    \`\`\`
  `,
  summary: `
    Check summary quality with validation methods.
    Extract patterns from content.
    A validator class handles the validation process.
  `,
});

/**
 * Create an over-compressed summary.
 */
const createOverCompressedSummary = () => ({
  original: `
    ${"Long content that provides extensive details about the implementation. ".repeat(100)}
    
    Key files:
    - packages/core/src/context/improvements/types.ts
    - packages/core/src/context/improvements/summary-quality-validator.ts
    - packages/core/src/context/compression.ts
    
    Important functions:
    - extractTechnicalTerms()
    - validateWithRules()
    - validateWithLLM()
    - createSummaryQualityValidator()
    
    Error: TypeError at line 42
  `,
  summary: `Did stuff with files.`,
});

/**
 * Create default test config.
 */
const createTestConfig = (overrides?: Partial<SummaryQualityConfig>): SummaryQualityConfig => ({
  enableRuleValidation: true,
  enableLLMValidation: false,
  minTechTermRetention: 0.8,
  minCodeRefRetention: 0.9,
  maxCompressionRatio: 10,
  ...overrides,
});

/**
 * Create mock LLM client.
 */
const createMockLLMClient = (
  response?: Partial<{
    completenessScore: number;
    accuracyScore: number;
    actionabilityScore: number;
    suggestions: string[];
  }>
): QualityValidationLLMClient => ({
  evaluate: vi.fn().mockResolvedValue(
    JSON.stringify({
      completenessScore: response?.completenessScore ?? 8,
      accuracyScore: response?.accuracyScore ?? 9,
      actionabilityScore: response?.actionabilityScore ?? 7,
      suggestions: response?.suggestions ?? [],
    })
  ),
});

// ============================================================================
// extractTechnicalTerms Tests
// ============================================================================

describe("extractTechnicalTerms", () => {
  it("should extract function names", () => {
    const content = `
      function handleClick() {}
      async function fetchData() {}
      const result = processInput();
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.functionNames.has("handleClick")).toBe(true);
    expect(terms.functionNames.has("fetchData")).toBe(true);
    expect(terms.functionNames.has("processInput")).toBe(true);
  });

  it("should extract class and interface names", () => {
    const content = `
      class SummaryQualityValidator {}
      interface ValidationConfig {}
      type RuleResult = {};
      enum Priority {}
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.classNames.has("SummaryQualityValidator")).toBe(true);
    expect(terms.classNames.has("ValidationConfig")).toBe(true);
    expect(terms.classNames.has("RuleResult")).toBe(true);
    expect(terms.classNames.has("Priority")).toBe(true);
  });

  it("should extract file paths", () => {
    const content = `
      File: packages/core/src/context/compression.ts
      Import from ./types.js
      Path: /home/user/project/file.ts
      See src/utils/helpers.ts
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.filePaths.size).toBeGreaterThan(0);
    expect([...terms.filePaths].some((p) => p.includes("compression.ts"))).toBe(true);
  });

  it("should extract code references", () => {
    const content = `
      Use \`validate()\` method.
      Call \`extractTechnicalTerms(content)\`.
      
      \`\`\`typescript
      const x = 1;
      \`\`\`
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.codeRefs.size).toBeGreaterThan(0);
    expect([...terms.codeRefs].some((r) => r.includes("validate"))).toBe(true);
  });

  it("should extract error messages", () => {
    const content = `
      Error: Something went wrong
      TypeError: Cannot read property 'x' of undefined
      at file.ts:42
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.errorMessages.size).toBeGreaterThan(0);
    expect([...terms.errorMessages].some((e) => e.includes("TypeError"))).toBe(true);
  });

  it("should exclude common words from function names", () => {
    const content = `
      if (condition) {}
      for (item of items) {}
      return result;
    `;

    const terms = extractTechnicalTerms(content);

    expect(terms.functionNames.has("if")).toBe(false);
    expect(terms.functionNames.has("for")).toBe(false);
    expect(terms.functionNames.has("return")).toBe(false);
  });
});

// ============================================================================
// SummaryQualityValidator Tests
// ============================================================================

describe("SummaryQualityValidator", () => {
  describe("T007a: High-quality summary passes validation", () => {
    it("should pass validation for well-preserved summaries", async () => {
      const { original, summary } = createHighQualitySummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(true);
      expect(report.ruleResults).toBeDefined();
      expect(report.ruleResults?.techTermRetention).toBeGreaterThanOrEqual(0.8);
    });

    it("should report correct compression metrics", async () => {
      const { original, summary } = createHighQualitySummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.originalTokens).toBeGreaterThan(0);
      expect(report.summaryTokens).toBeGreaterThan(0);
      expect(report.summaryTokens).toBeLessThan(report.originalTokens);
      expect(report.compressionRatio).toBeGreaterThan(1);
    });
  });

  describe("T007b: Missing technical terms produce warnings", () => {
    it("should warn when technical terms are lost", async () => {
      const { original, summary } = createPoorTechTermSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(false);
      expect(report.warnings.some((w) => w.includes("Technical term retention"))).toBe(true);
      expect(report.ruleResults?.techTermRetention).toBeLessThan(0.8);
    });

    it("should list lost technical terms", async () => {
      const { original, summary } = createPoorTechTermSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.ruleResults?.lostItems.length).toBeGreaterThan(0);
      expect(report.ruleResults?.lostItems.some((i) => i.type === "tech_term")).toBe(true);
    });
  });

  describe("T007c: Missing code references produce warnings", () => {
    it("should warn when code references are lost", async () => {
      const { original, summary } = createPoorCodeRefSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(false);
      expect(report.warnings.some((w) => w.includes("Code reference retention"))).toBe(true);
      expect(report.ruleResults?.codeRefRetention).toBeLessThan(0.9);
    });

    it("should list lost code references", async () => {
      const { original, summary } = createPoorCodeRefSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.ruleResults?.lostItems.some((i) => i.type === "code_ref")).toBe(true);
    });
  });

  describe("T007d: Over-compressed summary fails validation", () => {
    it("should fail when compression ratio exceeds maximum", async () => {
      const { original, summary } = createOverCompressedSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(false);
      expect(report.warnings.some((w) => w.includes("Compression ratio"))).toBe(true);
      expect(report.compressionRatio).toBeGreaterThan(10);
    });

    it("should report lost file paths", async () => {
      const { original, summary } = createOverCompressedSummary();
      const validator = new SummaryQualityValidator(createTestConfig());

      const report = await validator.validate(original, summary);

      expect(report.ruleResults?.criticalPathsPreserved).toBe(false);
    });
  });

  describe("T007e: Disabled validation skips checks", () => {
    it("should skip rule validation when disabled", async () => {
      const { original, summary } = createPoorTechTermSummary();
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableRuleValidation: false })
      );

      const report = await validator.validate(original, summary);

      expect(report.ruleResults).toBeUndefined();
    });

    it("should skip LLM validation when disabled", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient = createMockLLMClient();
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: false }),
        mockClient
      );

      const report = await validator.validate(original, summary);

      expect(report.llmResults).toBeUndefined();
      expect(mockClient.evaluate).not.toHaveBeenCalled();
    });

    it("should pass validation when all checks disabled and ratio OK", async () => {
      const { original, summary } = createPoorTechTermSummary();
      const validator = new SummaryQualityValidator(
        createTestConfig({
          enableRuleValidation: false,
          enableLLMValidation: false,
          maxCompressionRatio: 100, // Very lenient
        })
      );

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(true);
    });
  });

  describe("T007f: LLM validation integration", () => {
    it("should call LLM when enabled", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient = createMockLLMClient();
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true }),
        mockClient
      );

      await validator.validate(original, summary);

      expect(mockClient.evaluate).toHaveBeenCalled();
    });

    it("should include LLM results in report", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient = createMockLLMClient({
        completenessScore: 8,
        accuracyScore: 9,
        actionabilityScore: 7,
        suggestions: ["Consider adding more context"],
      });
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true }),
        mockClient
      );

      const report = await validator.validate(original, summary);

      expect(report.llmResults).toBeDefined();
      expect(report.llmResults?.completenessScore).toBe(8);
      expect(report.llmResults?.accuracyScore).toBe(9);
      expect(report.llmResults?.actionabilityScore).toBe(7);
      expect(report.llmResults?.suggestions).toContain("Consider adding more context");
    });

    it("should fail when LLM scores are low", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient = createMockLLMClient({
        completenessScore: 3, // Below minimum of 6
        accuracyScore: 4,
        actionabilityScore: 2,
      });
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true }),
        mockClient
      );

      const report = await validator.validate(original, summary);

      expect(report.passed).toBe(false);
      expect(report.warnings.some((w) => w.includes("LLM completeness score"))).toBe(true);
      expect(report.warnings.some((w) => w.includes("LLM accuracy score"))).toBe(true);
      expect(report.warnings.some((w) => w.includes("LLM actionability score"))).toBe(true);
    });

    it("should handle LLM errors gracefully", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient: QualityValidationLLMClient = {
        evaluate: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
      };
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true }),
        mockClient
      );

      const report = await validator.validate(original, summary);

      // Should still pass based on rule validation
      expect(report.warnings.some((w) => w.includes("LLM validation was skipped"))).toBe(true);
    });

    it("should parse LLM response with markdown code blocks", async () => {
      const { original, summary } = createHighQualitySummary();
      const mockClient: QualityValidationLLMClient = {
        evaluate: vi.fn().mockResolvedValue(`
          Here's my evaluation:
          
          \`\`\`json
          {
            "completenessScore": 8,
            "accuracyScore": 9,
            "actionabilityScore": 7,
            "suggestions": ["Add more details"]
          }
          \`\`\`
        `),
      };
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true }),
        mockClient
      );

      const report = await validator.validate(original, summary);

      expect(report.llmResults).toBeDefined();
      expect(report.llmResults?.completenessScore).toBe(8);
    });
  });

  describe("validateWithRules", () => {
    it("should return 100% retention when no technical terms in original", () => {
      const validator = new SummaryQualityValidator(createTestConfig());

      const result = validator.validateWithRules(
        "Just some plain text without code.",
        "Plain text summary."
      );

      expect(result.techTermRetention).toBe(1);
      expect(result.codeRefRetention).toBe(1);
    });

    it("should detect error messages", () => {
      const validator = new SummaryQualityValidator(createTestConfig());

      const result = validator.validateWithRules(
        "Error: Connection failed at network.ts:42",
        "Something failed."
      );

      expect(result.lostItems.some((i) => i.type === "error_message")).toBe(true);
    });
  });

  describe("validateWithLLM", () => {
    it("should throw error when LLM client not configured", async () => {
      const validator = new SummaryQualityValidator(createTestConfig());

      await expect(validator.validateWithLLM("original", "summary")).rejects.toThrow(
        "LLM client not configured"
      );
    });

    it("should handle invalid JSON response", async () => {
      const mockClient: QualityValidationLLMClient = {
        evaluate: vi.fn().mockResolvedValue("Invalid response without JSON"),
      };
      const validator = new SummaryQualityValidator(createTestConfig(), mockClient);

      const result = await validator.validateWithLLM("original", "summary");

      // Should return default scores
      expect(result.completenessScore).toBe(5);
      expect(result.accuracyScore).toBe(5);
      expect(result.actionabilityScore).toBe(5);
    });

    it("should clamp scores to 0-10 range", async () => {
      const mockClient: QualityValidationLLMClient = {
        evaluate: vi.fn().mockResolvedValue(
          JSON.stringify({
            completenessScore: 15, // Above 10
            accuracyScore: -5, // Below 0
            actionabilityScore: 5,
          })
        ),
      };
      const validator = new SummaryQualityValidator(createTestConfig(), mockClient);

      const result = await validator.validateWithLLM("original", "summary");

      expect(result.completenessScore).toBe(10);
      expect(result.accuracyScore).toBe(0);
      expect(result.actionabilityScore).toBe(5);
    });
  });

  describe("setLLMClient", () => {
    it("should allow setting LLM client after construction", async () => {
      const validator = new SummaryQualityValidator(
        createTestConfig({ enableLLMValidation: true })
      );
      const mockClient = createMockLLMClient();

      validator.setLLMClient(mockClient);
      const { original, summary } = createHighQualitySummary();
      await validator.validate(original, summary);

      expect(mockClient.evaluate).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// createSummaryQualityValidator Tests
// ============================================================================

describe("createSummaryQualityValidator", () => {
  it("should create validator with default config", () => {
    const validator = createSummaryQualityValidator();

    expect(validator).toBeInstanceOf(SummaryQualityValidator);
  });

  it("should apply config overrides", async () => {
    const validator = createSummaryQualityValidator({
      minTechTermRetention: 0.5, // Lower threshold
    });

    // This would normally fail with 0.8 threshold
    const report = await validator.validate(
      "class Foo {} function bar() {}",
      "A class and function exist."
    );

    // Should pass with lower threshold
    expect(report.ruleResults?.techTermRetention).toBeLessThan(0.8);
  });
});

// ============================================================================
// Integration with ContextMessage Tests
// ============================================================================

describe("Integration with ContextMessage array", () => {
  it("should handle array of messages", async () => {
    const validator = new SummaryQualityValidator(createTestConfig());
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content: "Implement SummaryQualityValidator",
        priority: MessagePriority.NORMAL,
      },
      {
        id: "2",
        role: "assistant" as const,
        content: "I'll create the validator in packages/core/src/context/improvements/",
        priority: MessagePriority.NORMAL,
      },
      {
        id: "3",
        role: "user" as const,
        content: "Use extractTechnicalTerms() for parsing",
        priority: MessagePriority.NORMAL,
      },
    ];

    const summary = `
      Task: Implement SummaryQualityValidator
      Location: packages/core/src/context/improvements/
      Method: Use extractTechnicalTerms() for parsing
    `;

    const report = await validator.validate(messages, summary);

    expect(report.passed).toBe(true);
  });

  it("should handle messages with content blocks", async () => {
    const validator = new SummaryQualityValidator(createTestConfig());
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "Create the SummaryQualityValidator class" }],
        priority: MessagePriority.NORMAL,
      },
    ];

    const summary = "Create SummaryQualityValidator class";

    const report = await validator.validate(messages, summary);

    expect(report.passed).toBe(true);
  });
});

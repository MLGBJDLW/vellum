// ============================================
// Mode Detection Tests
// ============================================
// T030: Write detection unit tests
// ============================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
  createModeDetector,
  ModeDetector,
} from "../mode-detection.js";

describe("ModeDetector", () => {
  let detector: ModeDetector;

  beforeEach(() => {
    detector = new ModeDetector();
  });

  describe("constructor", () => {
    it("should create with default configuration", () => {
      const result = detector.analyze("test input");
      expect(result).toBeDefined();
      expect(result.suggestedMode).toBeDefined();
    });

    it("should accept custom configuration", () => {
      const customDetector = new ModeDetector({
        confidenceThreshold: 0.8,
        defaultMode: "plan",
        useComplexityAnalysis: false,
      });
      const result = customDetector.analyze("some input");
      expect(result).toBeDefined();
    });
  });

  describe("vibe mode detection", () => {
    it("should detect 'quick' keyword", () => {
      const result = detector.analyze("quick fix for the typo");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("quick");
    });

    it("should detect 'fast' keyword", () => {
      const result = detector.analyze("fast change to the config");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("fast");
    });

    it("should detect 'just do it' phrase", () => {
      const result = detector.analyze("just do it, update the version");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("just do it");
    });

    it("should detect 'fix this' phrase", () => {
      const result = detector.analyze("fix this bug in the function");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("fix this");
    });

    it("should detect 'hack' keyword", () => {
      const result = detector.analyze("hack together a quick solution");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("hack");
    });

    it("should detect 'tweak' keyword", () => {
      const result = detector.analyze("tweak the styling a bit");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("tweak");
    });

    it("should detect 'simple' keyword", () => {
      const result = detector.analyze("simple rename of the variable");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("simple");
    });

    it("should detect 'minor' keyword", () => {
      const result = detector.analyze("minor update to the readme");
      expect(result.suggestedMode).toBe("vibe");
      expect(result.keywords).toContain("minor");
    });
  });

  describe("plan mode detection", () => {
    it("should detect 'explain' keyword", () => {
      const result = detector.analyze("explain how this algorithm works");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("explain");
    });

    it("should detect 'how' keyword with context", () => {
      const result = detector.analyze("how should I implement pagination");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("how");
    });

    it("should detect 'design' keyword", () => {
      const result = detector.analyze("design a solution for caching");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("design");
    });

    it("should detect 'architecture' keyword", () => {
      const result = detector.analyze("review the architecture of this module");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("architecture");
    });

    it("should detect 'think' keyword", () => {
      const result = detector.analyze("think about the best approach");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("think");
    });

    it("should detect 'analyze' keyword", () => {
      const result = detector.analyze("analyze the performance issues");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("analyze");
    });

    it("should detect 'implement' keyword", () => {
      const result = detector.analyze("implement the user login");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("implement");
    });

    it("should detect 'build' keyword", () => {
      const result = detector.analyze("build a user dashboard");
      expect(result.suggestedMode).toBe("plan");
      expect(result.keywords).toContain("build");
    });
  });

  describe("spec mode detection", () => {
    it("should detect 'feature' with complexity", () => {
      const result = detector.analyze("full feature implementation for payment system");
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("feature");
    });

    it("should detect 'proper' keyword", () => {
      const result = detector.analyze("proper production implementation with tests and docs");
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("proper");
    });

    it("should detect 'production' keyword", () => {
      const result = detector.analyze(
        "production-ready robust solution with comprehensive error handling"
      );
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("production");
    });

    it("should detect 'comprehensive' keyword", () => {
      const result = detector.analyze("comprehensive refactoring of the entire module");
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("comprehensive");
    });

    it("should detect 'requirements' keyword", () => {
      const result = detector.analyze("gather requirements for the new system");
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("requirements");
    });

    it("should detect 'specification' keyword", () => {
      const result = detector.analyze("write a full specification for the API");
      expect(result.suggestedMode).toBe("spec");
      expect(result.keywords).toContain("specification");
    });

    it("should detect high complexity indicators", () => {
      const result = detector.analyze("refactor entire authentication system across all packages");
      expect(result.suggestedMode).toBe("spec");
    });
  });

  describe("confidence scoring", () => {
    it("should return confidence between 0 and 1", () => {
      const result = detector.analyze("some random input");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should have higher confidence with more keywords", () => {
      const lowKeyword = detector.analyze("fix the bug");
      const highKeyword = detector.analyze("quick fast simple fix for the typo");
      expect(highKeyword.confidence).toBeGreaterThan(lowKeyword.confidence);
    });

    it("should default to vibe mode when confidence is low", () => {
      const lowConfidenceDetector = new ModeDetector({
        confidenceThreshold: 0.9,
        defaultMode: "vibe",
      });
      const result = lowConfidenceDetector.analyze("something unclear");
      expect(result.suggestedMode).toBe("vibe");
    });
  });

  describe("reasoning", () => {
    it("should include matched keywords in reasoning", () => {
      const result = detector.analyze("quick fix");
      expect(result.reasoning).toContain("quick");
    });

    it("should include confidence percentage", () => {
      const result = detector.analyze("quick fix");
      expect(result.reasoning).toMatch(/\d+%/);
    });

    it("should have appropriate reasoning for each mode", () => {
      const vibeResult = detector.analyze("quick fix");
      expect(vibeResult.reasoning.toLowerCase()).toContain("autonomous");

      const planResult = detector.analyze("explain how this works");
      expect(planResult.reasoning.toLowerCase()).toContain("analysis");

      const specResult = detector.analyze("comprehensive production system");
      expect(specResult.reasoning.toLowerCase()).toContain("comprehensive");
    });
  });

  describe("createModeDetector factory", () => {
    it("should create a detector with default config", () => {
      const detector = createModeDetector();
      expect(detector).toBeInstanceOf(ModeDetector);
    });

    it("should create a detector with custom config", () => {
      const detector = createModeDetector({ confidenceThreshold: 0.7 });
      expect(detector).toBeInstanceOf(ModeDetector);
    });
  });
});

describe("ComplexityAnalyzer", () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => {
    analyzer = new ComplexityAnalyzer();
  });

  describe("constructor", () => {
    it("should create with default configuration", () => {
      const result = analyzer.analyze("test input");
      expect(result).toBeDefined();
      expect(result.level).toBeDefined();
    });

    it("should accept custom configuration", () => {
      const customAnalyzer = new ComplexityAnalyzer({
        mediumFileThreshold: 5,
        highFileThreshold: 10,
      });
      const result = customAnalyzer.analyze("change 4 files");
      expect(result).toBeDefined();
    });
  });

  describe("low complexity detection", () => {
    it("should classify single file change as low", () => {
      const result = analyzer.analyze("fix bug in app.ts");
      expect(result.level).toBe("low");
      expect(result.score).toBeLessThan(0.3);
    });

    it("should classify simple rename as low", () => {
      const result = analyzer.analyze("rename variable in utils.ts");
      expect(result.level).toBe("low");
    });

    it("should classify typo fix as low", () => {
      const result = analyzer.analyze("fix typo in readme");
      expect(result.level).toBe("low");
    });

    it("should classify 1-2 files as low", () => {
      const result = analyzer.analyze("update 2 files with new import");
      expect(result.level).toBe("low");
    });
  });

  describe("medium complexity detection", () => {
    it("should classify 3-5 files as medium", () => {
      const result = analyzer.analyze("update 4 files with the new API");
      expect(result.level).toBe("medium");
      expect(result.score).toBeGreaterThanOrEqual(0.3);
      expect(result.score).toBeLessThan(0.7);
    });

    it("should classify feature implementation as medium", () => {
      const result = analyzer.analyze("implement a new feature for user profiles");
      expect(result.level).toBe("medium");
      expect(result.factors).toContain("feature");
    });

    it("should classify integration work as medium", () => {
      const result = analyzer.analyze("integrate the payment gateway and add multiple endpoints");
      expect(result.level).toBe("medium");
      expect(result.factors).toContain("integrate");
    });

    it("should classify multiple component work as medium", () => {
      const result = analyzer.analyze("create several components for the dashboard");
      expect(result.level).toBe("medium");
    });
  });

  describe("high complexity detection", () => {
    it("should classify 6+ files as high", () => {
      const result = analyzer.analyze("update 8 files across the codebase");
      expect(result.level).toBe("high");
      expect(result.score).toBeGreaterThanOrEqual(0.7);
    });

    it("should classify refactoring as high", () => {
      const result = analyzer.analyze("refactor the entire module");
      expect(result.level).toBe("high");
      expect(result.factors).toContain("refactor");
    });

    it("should classify architecture work as high", () => {
      const result = analyzer.analyze("redesign the entire architecture of the system");
      expect(result.level).toBe("high");
      expect(result.factors).toContain("architecture");
    });

    it("should classify 'entire' scope as high", () => {
      const result = analyzer.analyze("refactor the entire authentication flow");
      expect(result.level).toBe("high");
      expect(result.factors).toContain("entire");
    });

    it("should classify 'all' scope as high", () => {
      const result = analyzer.analyze("refactor all components with new architecture");
      expect(result.level).toBe("high");
      expect(result.factors).toContain("all");
    });

    it("should classify system-level work as high", () => {
      const result = analyzer.analyze("overhaul the system completely");
      expect(result.level).toBe("high");
    });

    it("should classify cross-package work as high", () => {
      const result = analyzer.analyze("cross-package refactor of all shared utilities");
      expect(result.level).toBe("high");
      expect(result.factors).toContain("cross-package");
    });

    it("should classify monorepo work as high", () => {
      const result = analyzer.analyze("update the entire monorepo structure");
      expect(result.level).toBe("high");
    });
  });

  describe("file count extraction", () => {
    it("should extract file count from 'N files' pattern", () => {
      const result = analyzer.analyze("change 5 files");
      expect(result.factors.some((f) => f.includes("5 files"))).toBe(true);
    });

    it("should extract file count from 'files: N' pattern", () => {
      const result = analyzer.analyze("files: 8 need updating across the system");
      expect(result.level).toBe("high");
    });

    it("should extract component count", () => {
      const result = analyzer.analyze("update 4 components");
      expect(result.factors.some((f) => f.includes("4"))).toBe(true);
    });
  });

  describe("multi-step detection", () => {
    it("should detect 'first...then' pattern", () => {
      const result = analyzer.analyze("first analyze the code, then implement changes");
      expect(result.factors).toContain("multi-step task");
    });

    it("should detect numbered steps", () => {
      const result = analyzer.analyze("1. read the file 2. parse content 3. update");
      expect(result.factors).toContain("multi-step task");
    });

    it("should detect 'and then' pattern", () => {
      const result = analyzer.analyze("create the component and then add tests");
      expect(result.factors).toContain("multi-step task");
    });
  });

  describe("score calculation", () => {
    it("should return score between 0 and 1", () => {
      const result = analyzer.analyze("some random input");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("should have higher score with more complexity factors", () => {
      const simple = analyzer.analyze("fix bug");
      const complex = analyzer.analyze(
        "refactor entire architecture across all modules in monorepo"
      );
      expect(complex.score).toBeGreaterThan(simple.score);
    });
  });

  describe("reasoning", () => {
    it("should include complexity level", () => {
      const result = analyzer.analyze("quick fix");
      expect(result.reasoning.toLowerCase()).toContain("complexity");
    });

    it("should include factors in reasoning", () => {
      const result = analyzer.analyze("refactor the module");
      expect(result.reasoning).toContain("refactor");
    });

    it("should include percentage in reasoning", () => {
      const result = analyzer.analyze("fix bug");
      expect(result.reasoning).toMatch(/\d+%/);
    });
  });

  describe("createComplexityAnalyzer factory", () => {
    it("should create an analyzer with default config", () => {
      const analyzer = createComplexityAnalyzer();
      expect(analyzer).toBeInstanceOf(ComplexityAnalyzer);
    });

    it("should create an analyzer with custom config", () => {
      const analyzer = createComplexityAnalyzer({ mediumFileThreshold: 4 });
      expect(analyzer).toBeInstanceOf(ComplexityAnalyzer);
    });
  });
});

describe("Integration: ModeDetector with ComplexityAnalyzer", () => {
  let detector: ModeDetector;

  beforeEach(() => {
    detector = new ModeDetector({ useComplexityAnalysis: true });
  });

  it("should boost spec mode for high complexity tasks", () => {
    const result = detector.analyze("refactor entire authentication system");
    expect(result.suggestedMode).toBe("spec");
  });

  it("should not override clear vibe signals with complexity", () => {
    const result = detector.analyze("quick simple fix");
    expect(result.suggestedMode).toBe("vibe");
  });

  it("should consider complexity for ambiguous inputs", () => {
    const detectorWithComplexity = new ModeDetector({ useComplexityAnalysis: true });

    // High complexity input - should suggest spec with complexity analysis
    const input = "refactor entire authentication system across all packages";

    const withComplexity = detectorWithComplexity.analyze(input);

    // With complexity analysis, should suggest spec mode
    expect(withComplexity.suggestedMode).toBe("spec");
  });
});

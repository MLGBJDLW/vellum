import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomAgentRegistry } from "../registry.js";
import type { RoutingContext } from "../router.js";
import { AgentRouter, createAgentRouter, MIN_ROUTING_SCORE, ROUTING_WEIGHTS } from "../router.js";
import type { CustomAgentDefinition, TriggerPattern } from "../types.js";

// ============================================
// AgentRouter Tests (T019)
// ============================================

/**
 * Helper to create a minimal agent definition.
 */
function createTestAgent(
  slug: string,
  name: string,
  extras: Partial<CustomAgentDefinition> = {}
): CustomAgentDefinition {
  return {
    slug,
    name,
    ...extras,
  };
}

/**
 * Helper to create triggers.
 */
function createTriggers(
  patterns: Array<{ type: TriggerPattern["type"]; pattern: string }>
): TriggerPattern[] {
  return patterns.map(({ type, pattern }) => ({ type, pattern }));
}

describe("AgentRouter", () => {
  let registry: CustomAgentRegistry;
  let router: AgentRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new CustomAgentRegistry();
    router = new AgentRouter(registry);
  });

  // ============================================
  // Explicit @slug Invocation Tests
  // ============================================

  describe("explicit @slug invocation", () => {
    it("routes to agent with explicit @slug prefix", () => {
      registry.register(createTestAgent("test-writer", "Test Writer"));

      const result = router.route({
        message: "@test-writer write tests for User class",
      });

      expect(result.explicit).toBe(true);
      expect(result.explicitSlug).toBe("test-writer");
      expect(result.agent?.slug).toBe("test-writer");
    });

    it("handles single-character slug", () => {
      registry.register(createTestAgent("a", "Agent A"));

      const result = router.route({
        message: "@a do something",
      });

      expect(result.explicit).toBe(true);
      expect(result.agent?.slug).toBe("a");
    });

    it("is case-insensitive for @slug", () => {
      registry.register(createTestAgent("test-writer", "Test Writer"));

      const result = router.route({
        message: "@TEST-WRITER write tests",
      });

      expect(result.explicit).toBe(true);
      expect(result.agent?.slug).toBe("test-writer");
    });

    it("returns explicit: true with undefined agent when slug not found", () => {
      const result = router.route({
        message: "@non-existent do something",
      });

      expect(result.explicit).toBe(true);
      expect(result.explicitSlug).toBe("non-existent");
      expect(result.agent).toBeUndefined();
      expect(result.candidates).toEqual([]);
    });

    it("extracts slug correctly from message start", () => {
      registry.register(createTestAgent("my-agent", "My Agent"));

      const result = router.route({
        message: "@my-agent please help with this task",
      });

      expect(result.explicitSlug).toBe("my-agent");
    });

    it("does not match @slug in middle of message", () => {
      registry.register(createTestAgent("helper", "Helper"));

      const result = router.route({
        message: "please use @helper for this",
      });

      expect(result.explicit).toBe(false);
    });

    it("gives explicit match score of 1.0", () => {
      registry.register(createTestAgent("test-agent", "Test Agent"));

      const result = router.route({
        message: "@test-agent do work",
      });

      expect(result.candidates[0]?.score).toBe(1.0);
      expect(result.candidates[0]?.explicit).toBe(true);
    });
  });

  // ============================================
  // Pattern Matching Tests
  // ============================================

  describe("pattern matching", () => {
    describe("file patterns", () => {
      it("matches glob pattern against active file", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([{ type: "file", pattern: "**/*.test.ts" }]),
            },
          })
        );

        const result = router.route({
          message: "write tests",
          activeFile: "src/components/User.test.ts",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0]?.agent.slug).toBe("test-writer");
        expect(result.candidates[0]?.scoreBreakdown.filePatterns).toBe(1.0);
      });

      it("matches file extension patterns", () => {
        registry.register(
          createTestAgent("style-agent", "Style Agent", {
            whenToUse: {
              description: "For CSS",
              triggers: createTriggers([{ type: "file", pattern: "**/*.css" }]),
            },
          })
        );

        const result = router.route({
          message: "fix styles",
          activeFile: "src/styles/main.css",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0]?.agent.slug).toBe("style-agent");
      });

      it("does not match when file pattern doesn't match", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([{ type: "file", pattern: "**/*.test.ts" }]),
            },
          })
        );

        const result = router.route({
          message: "write tests",
          activeFile: "src/components/User.ts",
        });

        // No match because User.ts doesn't match *.test.ts
        const testWriter = result.candidates.find((c) => c.agent.slug === "test-writer");
        expect(testWriter?.scoreBreakdown.filePatterns ?? 0).toBe(0);
      });

      it("returns zero file score when no active file", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([{ type: "file", pattern: "**/*.test.ts" }]),
            },
          })
        );

        const result = router.route({
          message: "write tests",
          // No activeFile
        });

        const candidate = result.candidates.find((c) => c.agent.slug === "test-writer");
        expect(candidate?.scoreBreakdown.filePatterns ?? 0).toBe(0);
      });
    });

    describe("keyword patterns", () => {
      it("matches keyword in message", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([{ type: "keyword", pattern: "test|spec|describe" }]),
            },
          })
        );

        const result = router.route({
          message: "write unit test for User class",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0]?.agent.slug).toBe("test-writer");
      });

      it("is case-insensitive for keywords", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
            },
          })
        );

        const result = router.route({
          message: "please write a TEST",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
      });

      it("matches multiple keyword triggers", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([
                { type: "keyword", pattern: "test" },
                { type: "keyword", pattern: "spec" },
              ]),
            },
          })
        );

        const result = router.route({
          message: "write test and spec",
        });

        // Both triggers match, should get full score
        expect(result.candidates[0]?.scoreBreakdown.keywords).toBe(1.0);
      });

      it("calculates partial keyword score", () => {
        registry.register(
          createTestAgent("test-writer", "Test Writer", {
            whenToUse: {
              description: "For tests",
              triggers: createTriggers([
                { type: "keyword", pattern: "test" },
                { type: "keyword", pattern: "coverage" },
              ]),
            },
          })
        );

        const result = router.route({
          message: "write test", // Only matches one trigger
        });

        // 1 out of 2 triggers match = 0.5
        expect(result.candidates[0]?.scoreBreakdown.keywords).toBe(0.5);
      });
    });

    describe("regex patterns", () => {
      it("matches regex pattern in message", () => {
        registry.register(
          createTestAgent("bug-fixer", "Bug Fixer", {
            whenToUse: {
              description: "For bugs",
              triggers: createTriggers([{ type: "regex", pattern: "^(fix|bug|issue):" }]),
            },
          })
        );

        const result = router.route({
          message: "fix: handle null pointer exception",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0]?.agent.slug).toBe("bug-fixer");
      });
    });

    describe("directory patterns", () => {
      it("matches directory-specific file patterns", () => {
        registry.register(
          createTestAgent("component-agent", "Component Agent", {
            whenToUse: {
              description: "For components",
              triggers: createTriggers([{ type: "file", pattern: "src/components/**/*.tsx" }]),
            },
          })
        );

        const result = router.route({
          message: "create component",
          activeFile: "src/components/Button/Button.tsx",
          workingDir: "/project",
        });

        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0]?.scoreBreakdown.directories).toBe(1.0);
      });
    });
  });

  // ============================================
  // Score Calculation Tests
  // ============================================

  describe("score calculation verification", () => {
    it("applies correct weights to score components", () => {
      // Create agent that matches all categories
      registry.register(
        createTestAgent("full-match", "Full Match Agent", {
          whenToUse: {
            description: "Matches everything",
            triggers: createTriggers([
              { type: "file", pattern: "**/*.ts" },
              { type: "keyword", pattern: "code" },
            ]),
          },
        })
      );

      const result = router.route({
        message: "code something",
        activeFile: "src/app.ts",
      });

      const candidate = result.candidates.find((c) => c.agent.slug === "full-match");
      expect(candidate).toBeDefined();
      if (!candidate?.scoreBreakdown) return;

      // Verify weights are applied correctly
      const breakdown = candidate.scoreBreakdown;
      const expectedScore =
        breakdown.filePatterns * ROUTING_WEIGHTS.FILE_PATTERNS +
        breakdown.keywords * ROUTING_WEIGHTS.KEYWORDS +
        breakdown.directories * ROUTING_WEIGHTS.DIRECTORIES +
        breakdown.priorityBonus;

      expect(candidate?.score).toBeCloseTo(expectedScore, 5);
    });

    it("includes priority bonus in score", () => {
      registry.register(
        createTestAgent("priority-agent", "Priority Agent", {
          whenToUse: {
            description: "Has priority",
            priority: 100,
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test something",
      });

      const candidate = result.candidates.find((c) => c.agent.slug === "priority-agent");
      // Priority 100 / 1000 = 0.1 bonus
      expect(candidate?.scoreBreakdown.priorityBonus).toBeCloseTo(0.1, 5);
    });

    it("caps priority bonus at 0.1", () => {
      registry.register(
        createTestAgent("high-priority", "High Priority Agent", {
          whenToUse: {
            description: "Very high priority",
            priority: 500, // Very high
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test something",
      });

      const candidate = result.candidates.find((c) => c.agent.slug === "high-priority");
      expect(candidate?.scoreBreakdown.priorityBonus).toBeLessThanOrEqual(0.1);
    });

    it("score is deterministic for same input", () => {
      registry.register(
        createTestAgent("test-agent", "Test Agent", {
          whenToUse: {
            description: "For tests",
            triggers: createTriggers([
              { type: "file", pattern: "**/*.test.ts" },
              { type: "keyword", pattern: "test|spec" },
            ]),
          },
        })
      );

      const context: RoutingContext = {
        message: "write test",
        activeFile: "src/User.test.ts",
      };

      const result1 = router.route(context);
      const result2 = router.route(context);

      expect(result1.candidates[0]?.score).toBe(result2.candidates[0]?.score);
    });

    it("clamps total score to 0-1 range", () => {
      // Create agent with maximum everything
      registry.register(
        createTestAgent("max-agent", "Max Agent", {
          whenToUse: {
            description: "Maximum scores",
            priority: 1000,
            triggers: createTriggers([
              { type: "file", pattern: "**/*.ts" },
              { type: "keyword", pattern: ".*" }, // Matches everything
            ]),
          },
        })
      );

      const result = router.route({
        message: "test code fix",
        activeFile: "src/app.ts",
        workingDir: "/project",
      });

      const candidate = result.candidates.find((c) => c.agent.slug === "max-agent");
      expect(candidate?.score).toBeLessThanOrEqual(1.0);
    });
  });

  // ============================================
  // Fallback Behavior Tests
  // ============================================

  describe("fallback behavior", () => {
    it("returns empty candidates when no agents match", () => {
      registry.register(
        createTestAgent("specific-agent", "Specific Agent", {
          whenToUse: {
            description: "Very specific",
            triggers: createTriggers([{ type: "keyword", pattern: "veryrareword" }]),
          },
        })
      );

      const result = router.route({
        message: "do something generic",
      });

      expect(result.agent).toBeUndefined();
      expect(result.candidates).toHaveLength(0);
    });

    it("returns explicit: false for implicit routing", () => {
      registry.register(
        createTestAgent("test-agent", "Test Agent", {
          whenToUse: {
            description: "For tests",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "write test",
      });

      expect(result.explicit).toBe(false);
      expect(result.explicitSlug).toBeUndefined();
    });

    it("filters out candidates below minimum score", () => {
      registry.register(
        createTestAgent("low-match", "Low Match", {
          whenToUse: {
            description: "Low match",
            triggers: createTriggers([{ type: "keyword", pattern: "xyz" }]),
          },
        })
      );

      const result = router.route({
        message: "abc",
      });

      // No matches above MIN_ROUTING_SCORE
      expect(result.candidates).toHaveLength(0);
    });

    it("respects custom minimum score", () => {
      const customRouter = new AgentRouter(registry, { minScore: 0.5 });

      registry.register(
        createTestAgent("partial-match", "Partial Match", {
          whenToUse: {
            description: "Partial",
            triggers: createTriggers([
              { type: "keyword", pattern: "test" },
              { type: "keyword", pattern: "foo" },
              { type: "keyword", pattern: "bar" },
            ]),
          },
        })
      );

      const result = customRouter.route({
        message: "test something", // Only matches 1/3 keywords
      });

      // 1/3 keywords * 0.35 weight = ~0.117, below 0.5 threshold
      expect(result.candidates).toHaveLength(0);
    });
  });

  // ============================================
  // Multiple Candidates Ranking Tests
  // ============================================

  describe("multiple candidates ranking", () => {
    it("ranks candidates by score descending", () => {
      registry.register(
        createTestAgent("high-match", "High Match", {
          whenToUse: {
            description: "High match",
            triggers: createTriggers([
              { type: "keyword", pattern: "test" },
              { type: "file", pattern: "**/*.test.ts" },
            ]),
          },
        })
      );
      registry.register(
        createTestAgent("low-match", "Low Match", {
          whenToUse: {
            description: "Low match",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test something",
        activeFile: "src/User.test.ts",
      });

      expect(result.candidates.length).toBeGreaterThan(0);
      // High match should be first (matches both file and keyword)
      expect(result.candidates[0]?.agent.slug).toBe("high-match");

      // Verify ordering
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i - 1]?.score).toBeGreaterThanOrEqual(
          result.candidates[i]?.score ?? 0
        );
      }
    });

    it("returns best match as agent property", () => {
      registry.register(
        createTestAgent("best-match", "Best Match", {
          whenToUse: {
            description: "Best",
            priority: 100,
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );
      registry.register(
        createTestAgent("ok-match", "OK Match", {
          whenToUse: {
            description: "OK",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test something",
      });

      expect(result.agent?.slug).toBe("best-match");
      expect(result.agent).toBe(result.candidates[0]?.agent);
    });

    it("handles agents with same score", () => {
      registry.register(
        createTestAgent("agent-a", "Agent A", {
          whenToUse: {
            description: "A",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );
      registry.register(
        createTestAgent("agent-b", "Agent B", {
          whenToUse: {
            description: "B",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test",
      });

      // Both should be in candidates
      expect(result.candidates).toHaveLength(2);
    });
  });

  // ============================================
  // Hidden Agents Tests
  // ============================================

  describe("hidden agents", () => {
    it("excludes hidden agents from implicit routing", () => {
      registry.register(
        createTestAgent("hidden-agent", "Hidden Agent", {
          hidden: true,
          whenToUse: {
            description: "Hidden",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "test something",
      });

      const hidden = result.candidates.find((c) => c.agent.slug === "hidden-agent");
      expect(hidden).toBeUndefined();
    });

    it("includes hidden agents in explicit @slug routing", () => {
      registry.register(
        createTestAgent("hidden-agent", "Hidden Agent", {
          hidden: true,
        })
      );

      const result = router.route({
        message: "@hidden-agent do something",
      });

      expect(result.agent?.slug).toBe("hidden-agent");
    });
  });

  // ============================================
  // Helper Methods Tests
  // ============================================

  describe("helper methods", () => {
    it("getCandidatesForFile returns matching agents", () => {
      registry.register(
        createTestAgent("test-writer", "Test Writer", {
          whenToUse: {
            description: "For tests",
            triggers: createTriggers([{ type: "file", pattern: "**/*.test.ts" }]),
          },
        })
      );
      registry.register(
        createTestAgent("other-agent", "Other Agent", {
          whenToUse: {
            description: "Other",
            triggers: createTriggers([{ type: "file", pattern: "**/*.css" }]),
          },
        })
      );

      const result = router.getCandidatesForFile("src/User.test.ts");

      expect(result).toHaveLength(1);
      expect(result[0]?.slug).toBe("test-writer");
    });

    it("getCandidatesForKeyword returns matching agents", () => {
      registry.register(
        createTestAgent("test-writer", "Test Writer", {
          whenToUse: {
            description: "For tests",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.getCandidatesForKeyword("test");

      expect(result).toHaveLength(1);
      expect(result[0]?.slug).toBe("test-writer");
    });

    it("clearCache clears pattern cache", () => {
      // Should not throw
      router.clearCache();
    });
  });

  // ============================================
  // Factory Function Tests
  // ============================================

  describe("createAgentRouter factory", () => {
    it("creates a new router instance", () => {
      const newRouter = createAgentRouter(registry);

      expect(newRouter).toBeInstanceOf(AgentRouter);
    });

    it("accepts options", () => {
      const newRouter = createAgentRouter(registry, { minScore: 0.5 });

      // Verify custom minScore is applied
      registry.register(
        createTestAgent("low-match", "Low Match", {
          whenToUse: {
            description: "Low",
            triggers: createTriggers([
              { type: "keyword", pattern: "test" },
              { type: "keyword", pattern: "foo" },
              { type: "keyword", pattern: "bar" },
            ]),
          },
        })
      );

      const result = newRouter.route({
        message: "test", // Only 1/3 match
      });

      expect(result.candidates).toHaveLength(0);
    });

    it("accepts custom weights", () => {
      const customRouter = createAgentRouter(registry, {
        weights: {
          FILE_PATTERNS: 0.8,
          KEYWORDS: 0.1,
          DIRECTORIES: 0.1,
        },
      });

      registry.register(
        createTestAgent("file-agent", "File Agent", {
          whenToUse: {
            description: "File based",
            triggers: createTriggers([{ type: "file", pattern: "**/*.ts" }]),
          },
        })
      );

      const result = customRouter.route({
        message: "something",
        activeFile: "src/app.ts",
      });

      // With 0.8 file weight, score should be close to 0.8
      expect(result.candidates[0]?.score).toBeCloseTo(0.8, 1);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("edge cases", () => {
    it("handles empty registry", () => {
      const result = router.route({
        message: "test something",
      });

      expect(result.candidates).toHaveLength(0);
      expect(result.agent).toBeUndefined();
    });

    it("handles empty message", () => {
      registry.register(
        createTestAgent("test-agent", "Test Agent", {
          whenToUse: {
            description: "Test",
            triggers: createTriggers([{ type: "keyword", pattern: "test" }]),
          },
        })
      );

      const result = router.route({
        message: "",
      });

      expect(result.explicit).toBe(false);
    });

    it("handles invalid regex patterns gracefully", () => {
      registry.register(
        createTestAgent("bad-regex", "Bad Regex", {
          whenToUse: {
            description: "Bad",
            triggers: createTriggers([
              { type: "regex", pattern: "[invalid(" }, // Invalid regex
            ]),
          },
        })
      );

      // Should not throw
      const result = router.route({
        message: "test something",
      });

      expect(result).toBeDefined();
    });

    it("handles agents without whenToUse", () => {
      registry.register(createTestAgent("simple-agent", "Simple Agent"));

      const result = router.route({
        message: "test something",
      });

      // Agent without triggers shouldn't match implicitly
      const simple = result.candidates.find((c) => c.agent.slug === "simple-agent");
      expect(simple).toBeUndefined();
    });

    it("handles agents with empty triggers array", () => {
      registry.register(
        createTestAgent("empty-triggers", "Empty Triggers", {
          whenToUse: {
            description: "No triggers",
            triggers: [],
          },
        })
      );

      const result = router.route({
        message: "test something",
      });

      const empty = result.candidates.find((c) => c.agent.slug === "empty-triggers");
      expect(empty).toBeUndefined();
    });
  });

  // ============================================
  // Constants Exports Tests
  // ============================================

  describe("constants", () => {
    it("exports ROUTING_WEIGHTS", () => {
      expect(ROUTING_WEIGHTS.FILE_PATTERNS).toBe(0.4);
      expect(ROUTING_WEIGHTS.KEYWORDS).toBe(0.35);
      expect(ROUTING_WEIGHTS.DIRECTORIES).toBe(0.25);
    });

    it("exports MIN_ROUTING_SCORE", () => {
      expect(MIN_ROUTING_SCORE).toBe(0.1);
    });
  });
});

// ============================================
// Delegation Protocol Tests
// ============================================
// REQ-013: Type-safe delegation targets using discriminated unions

import { describe, expect, it } from "vitest";
import { AgentLevel } from "../../../agent/level.js";
import {
  BuiltinTargetSchema,
  CustomAgentTargetSchema,
  CustomModeTargetSchema,
  type DelegationTarget,
  DelegationTargetSchema,
  isBuiltinTarget,
  isCustomAgentTarget,
  isCustomModeTarget,
  isMcpTarget,
  McpTargetSchema,
} from "../delegation.js";

describe("Delegation Protocol", () => {
  // ============================================
  // BuiltinTargetSchema Tests
  // ============================================
  describe("BuiltinTargetSchema", () => {
    it("validates correct builtin target", () => {
      const target = {
        kind: "builtin",
        slug: "coder",
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("builtin");
        expect(result.data.slug).toBe("coder");
      }
    });

    it("accepts various valid agent slugs", () => {
      const slugs = ["coder", "qa", "writer", "analyst", "devops", "architect"];

      for (const slug of slugs) {
        const result = BuiltinTargetSchema.safeParse({ kind: "builtin", slug });
        expect(result.success).toBe(true);
      }
    });

    it("rejects empty slug", () => {
      const target = {
        kind: "builtin",
        slug: "",
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects missing slug", () => {
      const target = {
        kind: "builtin",
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });

    it("rejects wrong kind", () => {
      const target = {
        kind: "custom",
        slug: "coder",
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // CustomAgentTargetSchema Tests (REQ-011)
  // ============================================
  describe("CustomAgentTargetSchema", () => {
    it("validates correct custom agent target", () => {
      const target = {
        kind: "custom",
        slug: "test-writer",
      };

      const result = CustomAgentTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("custom");
        expect(result.data.slug).toBe("test-writer");
      }
    });

    it("rejects empty slug", () => {
      const target = {
        kind: "custom",
        slug: "",
      };

      const result = CustomAgentTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });
  });

  // ============================================
  // CustomModeTargetSchema Tests
  // ============================================
  describe("CustomModeTargetSchema", () => {
    // Note: level, canSpawnAgents, fileRestrictions, maxConcurrentSubagents
    // are now in AgentConfig, not ExtendedModeConfig
    const validModeConfig = {
      name: "code",
      description: "Custom analyzer mode",
      tools: { edit: false, bash: "readonly" as const },
      prompt: "You are a custom analyzer...",
    };

    it("validates correct custom mode target with ExtendedModeConfig", () => {
      const target = {
        kind: "custom-mode",
        slug: "custom-analyzer",
        modeConfig: validModeConfig,
      };

      const result = CustomModeTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("custom-mode");
        expect(result.data.slug).toBe("custom-analyzer");
        expect(result.data.modeConfig.name).toBe("code");
      }
    });

    it("validates custom mode target with full modeConfig options", () => {
      const fullModeConfig = {
        ...validModeConfig,
        parentMode: "orchestrator",
        toolGroups: [{ group: "filesystem", enabled: true }],
      };

      const target = {
        kind: "custom-mode",
        slug: "full-custom",
        modeConfig: fullModeConfig,
      };

      const result = CustomModeTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modeConfig.parentMode).toBe("orchestrator");
      }
    });

    it("rejects empty slug", () => {
      const target = {
        kind: "custom-mode",
        slug: "",
        modeConfig: validModeConfig,
      };

      const result = CustomModeTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects missing modeConfig", () => {
      const target = {
        kind: "custom-mode",
        slug: "custom-agent",
      };

      const result = CustomModeTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });

    it("rejects invalid modeConfig", () => {
      const target = {
        kind: "custom-mode",
        slug: "custom-agent",
        modeConfig: {
          name: "invalid-mode", // Invalid mode name
          description: "Test",
          tools: { edit: true, bash: true },
          prompt: "Test",
          level: AgentLevel.worker,
        },
      };

      const result = CustomModeTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // McpTargetSchema Tests
  // ============================================
  describe("McpTargetSchema", () => {
    it("validates correct MCP target with serverId and toolName", () => {
      const target = {
        kind: "mcp",
        serverId: "github-server",
        toolName: "create_pull_request",
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("mcp");
        expect(result.data.serverId).toBe("github-server");
        expect(result.data.toolName).toBe("create_pull_request");
        expect(result.data.params).toBeUndefined();
      }
    });

    it("validates MCP target with optional params", () => {
      const target = {
        kind: "mcp",
        serverId: "github-server",
        toolName: "create_pull_request",
        params: {
          title: "Feature update",
          base: "main",
          draft: true,
        },
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.params).toEqual({
          title: "Feature update",
          base: "main",
          draft: true,
        });
      }
    });

    it("validates MCP target with complex nested params", () => {
      const target = {
        kind: "mcp",
        serverId: "database-server",
        toolName: "query",
        params: {
          sql: "SELECT * FROM users",
          options: {
            timeout: 5000,
            retries: 3,
          },
          filters: ["active", "verified"],
        },
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
    });

    it("rejects empty serverId", () => {
      const target = {
        kind: "mcp",
        serverId: "",
        toolName: "some_tool",
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects empty toolName", () => {
      const target = {
        kind: "mcp",
        serverId: "server",
        toolName: "",
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot be empty");
      }
    });

    it("rejects missing required fields", () => {
      const target = {
        kind: "mcp",
        serverId: "server",
        // missing toolName
      };

      const result = McpTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // DelegationTargetSchema Discriminated Union Tests
  // ============================================
  describe("DelegationTargetSchema", () => {
    it("discriminates builtin target by kind", () => {
      const target = {
        kind: "builtin",
        slug: "coder",
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("builtin");
        // Type narrowing should work
        if (result.data.kind === "builtin") {
          expect(result.data.slug).toBe("coder");
        }
      }
    });

    it("discriminates custom agent target by kind", () => {
      const target = {
        kind: "custom",
        slug: "test-writer",
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("custom");
        if (result.data.kind === "custom") {
          expect(result.data.slug).toBe("test-writer");
        }
      }
    });

    it("discriminates custom mode target by kind", () => {
      const target = {
        kind: "custom-mode",
        slug: "custom-agent",
        modeConfig: {
          name: "code",
          description: "Custom mode",
          tools: { edit: true, bash: true },
          prompt: "Custom prompt",
          level: AgentLevel.worker,
        },
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("custom-mode");
        if (result.data.kind === "custom-mode") {
          expect(result.data.modeConfig).toBeDefined();
        }
      }
    });

    it("discriminates MCP target by kind", () => {
      const target = {
        kind: "mcp",
        serverId: "test-server",
        toolName: "test_tool",
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kind).toBe("mcp");
        if (result.data.kind === "mcp") {
          expect(result.data.serverId).toBe("test-server");
        }
      }
    });

    it("rejects unknown kind with clear error", () => {
      const target = {
        kind: "unknown",
        slug: "test",
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Discriminated union should provide clear error about invalid discriminator
        // Zod v4 uses "Invalid input" instead of "Invalid discriminator value"
        const errorMessage = result.error.issues[0]?.message;
        expect(["Invalid discriminator value", "Invalid input"]).toContain(errorMessage);
      }
    });

    it("rejects target missing kind field", () => {
      const target = {
        slug: "coder",
      };

      const result = DelegationTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
    });

    it("validates all target types in sequence", () => {
      const targets = [
        { kind: "builtin", slug: "qa" },
        { kind: "custom", slug: "test-writer" },
        {
          kind: "custom-mode",
          slug: "analyzer",
          modeConfig: {
            name: "plan",
            description: "Analyzer",
            tools: { edit: false, bash: false },
            prompt: "Analyze",
            level: AgentLevel.worker,
          },
        },
        { kind: "mcp", serverId: "s1", toolName: "t1" },
      ];

      for (const target of targets) {
        const result = DelegationTargetSchema.safeParse(target);
        expect(result.success).toBe(true);
      }
    });
  });

  // ============================================
  // Type Guards Tests
  // ============================================
  describe("Type Guards", () => {
    describe("isBuiltinTarget", () => {
      it("returns true for builtin target", () => {
        const target: DelegationTarget = { kind: "builtin", slug: "coder" };

        expect(isBuiltinTarget(target)).toBe(true);
      });

      it("returns false for custom agent target", () => {
        const target: DelegationTarget = {
          kind: "custom",
          slug: "test-writer",
        };

        expect(isBuiltinTarget(target)).toBe(false);
      });

      it("returns false for custom mode target", () => {
        const target: DelegationTarget = {
          kind: "custom-mode",
          slug: "custom",
          modeConfig: {
            name: "code",
            description: "Test",
            tools: { edit: true, bash: true },
            prompt: "Test",
          },
        };

        expect(isBuiltinTarget(target)).toBe(false);
      });

      it("returns false for MCP target", () => {
        const target: DelegationTarget = {
          kind: "mcp",
          serverId: "server",
          toolName: "tool",
        };

        expect(isBuiltinTarget(target)).toBe(false);
      });

      it("enables type narrowing in TypeScript", () => {
        const target: DelegationTarget = { kind: "builtin", slug: "coder" };

        if (isBuiltinTarget(target)) {
          // TypeScript should narrow the type to BuiltinTarget
          const slug: string = target.slug;
          expect(slug).toBe("coder");
        }
      });
    });

    describe("isCustomAgentTarget", () => {
      it("returns true for custom agent target", () => {
        const target: DelegationTarget = {
          kind: "custom",
          slug: "test-writer",
        };

        expect(isCustomAgentTarget(target)).toBe(true);
      });

      it("returns false for builtin target", () => {
        const target: DelegationTarget = { kind: "builtin", slug: "coder" };

        expect(isCustomAgentTarget(target)).toBe(false);
      });

      it("returns false for custom mode target", () => {
        const target: DelegationTarget = {
          kind: "custom-mode",
          slug: "custom",
          modeConfig: {
            name: "code",
            description: "Test",
            tools: { edit: true, bash: true },
            prompt: "Test",
          },
        };

        expect(isCustomAgentTarget(target)).toBe(false);
      });

      it("returns false for MCP target", () => {
        const target: DelegationTarget = {
          kind: "mcp",
          serverId: "server",
          toolName: "tool",
        };

        expect(isCustomAgentTarget(target)).toBe(false);
      });

      it("enables type narrowing to access slug", () => {
        const target: DelegationTarget = {
          kind: "custom",
          slug: "test-writer",
        };

        if (isCustomAgentTarget(target)) {
          expect(target.slug).toBe("test-writer");
        }
      });
    });

    describe("isCustomModeTarget", () => {
      it("returns true for custom mode target", () => {
        const target: DelegationTarget = {
          kind: "custom-mode",
          slug: "custom",
          modeConfig: {
            name: "code",
            description: "Test",
            tools: { edit: true, bash: true },
            prompt: "Test",
          },
        };

        expect(isCustomModeTarget(target)).toBe(true);
      });

      it("returns false for builtin target", () => {
        const target: DelegationTarget = { kind: "builtin", slug: "coder" };

        expect(isCustomModeTarget(target)).toBe(false);
      });

      it("returns false for custom agent target", () => {
        const target: DelegationTarget = {
          kind: "custom",
          slug: "test-writer",
        };

        expect(isCustomModeTarget(target)).toBe(false);
      });

      it("returns false for MCP target", () => {
        const target: DelegationTarget = {
          kind: "mcp",
          serverId: "server",
          toolName: "tool",
        };

        expect(isCustomModeTarget(target)).toBe(false);
      });

      it("enables type narrowing to access modeConfig", () => {
        const target: DelegationTarget = {
          kind: "custom-mode",
          slug: "custom",
          modeConfig: {
            name: "code",
            description: "Test",
            tools: { edit: true, bash: true },
            prompt: "Test prompt",
          },
        };

        if (isCustomModeTarget(target)) {
          expect(target.modeConfig.prompt).toBe("Test prompt");
        }
      });
    });

    describe("isMcpTarget", () => {
      it("returns true for MCP target", () => {
        const target: DelegationTarget = {
          kind: "mcp",
          serverId: "server",
          toolName: "tool",
        };

        expect(isMcpTarget(target)).toBe(true);
      });

      it("returns false for builtin target", () => {
        const target: DelegationTarget = { kind: "builtin", slug: "coder" };

        expect(isMcpTarget(target)).toBe(false);
      });

      it("returns false for custom agent target", () => {
        const target: DelegationTarget = {
          kind: "custom",
          slug: "test-writer",
        };

        expect(isMcpTarget(target)).toBe(false);
      });

      it("returns false for custom mode target", () => {
        const target: DelegationTarget = {
          kind: "custom-mode",
          slug: "custom",
          modeConfig: {
            name: "code",
            description: "Test",
            tools: { edit: true, bash: true },
            prompt: "Test",
          },
        };

        expect(isMcpTarget(target)).toBe(false);
      });

      it("enables type narrowing to access MCP-specific fields", () => {
        const target: DelegationTarget = {
          kind: "mcp",
          serverId: "github",
          toolName: "create_issue",
          params: { title: "Bug" },
        };

        if (isMcpTarget(target)) {
          expect(target.serverId).toBe("github");
          expect(target.toolName).toBe("create_issue");
          expect(target.params).toEqual({ title: "Bug" });
        }
      });
    });
  });

  // ============================================
  // Edge Cases and Error Messages
  // ============================================
  describe("Edge Cases", () => {
    it("rejects null input", () => {
      const result = DelegationTargetSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined input", () => {
      const result = DelegationTargetSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("rejects non-object input", () => {
      const result = DelegationTargetSchema.safeParse("builtin:coder");
      expect(result.success).toBe(false);
    });

    it("rejects array input", () => {
      const result = DelegationTargetSchema.safeParse(["builtin", "coder"]);
      expect(result.success).toBe(false);
    });

    it("provides clear error for invalid builtin slug type", () => {
      const target = {
        kind: "builtin",
        slug: 123, // Should be string
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain("slug");
      }
    });

    it("handles extra fields gracefully (strips them)", () => {
      const target = {
        kind: "builtin",
        slug: "coder",
        extraField: "should be ignored",
      };

      const result = BuiltinTargetSchema.safeParse(target);

      expect(result.success).toBe(true);
      if (result.success) {
        expect("extraField" in result.data).toBe(false);
      }
    });
  });
});

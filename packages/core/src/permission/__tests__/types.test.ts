import { describe, expect, it } from "vitest";
import {
  createPermissionInfo,
  isAllowed,
  isDenied,
  PatternPermissionSchema,
  PERMISSION_LEVELS,
  PERMISSION_RESPONSES,
  type PermissionConfig,
  PermissionConfigSchema,
  type PermissionDecisionResult,
  PermissionDecisionResultSchema,
  type PermissionInfo,
  PermissionInfoSchema,
  PermissionLevelSchema,
  PermissionRecordSchema,
  PermissionResponseSchema,
  requiresConfirmation,
  resolvePermissionConfig,
  TRUST_MODE_INFO,
  TRUST_PRESET_CONFIGS,
  TRUST_PRESETS,
  TrustPresetSchema,
} from "../types.js";

// ============================================
// PermissionLevel Tests
// ============================================

describe("PermissionLevel", () => {
  it("should validate valid permission levels", () => {
    expect(PermissionLevelSchema.parse("allow")).toBe("allow");
    expect(PermissionLevelSchema.parse("deny")).toBe("deny");
    expect(PermissionLevelSchema.parse("ask")).toBe("ask");
  });

  it("should reject invalid permission levels", () => {
    expect(() => PermissionLevelSchema.parse("invalid")).toThrow();
    expect(() => PermissionLevelSchema.parse("")).toThrow();
    expect(() => PermissionLevelSchema.parse(null)).toThrow();
    expect(() => PermissionLevelSchema.parse(undefined)).toThrow();
    expect(() => PermissionLevelSchema.parse(123)).toThrow();
  });

  it("should have all levels in PERMISSION_LEVELS constant", () => {
    expect(PERMISSION_LEVELS).toEqual(["allow", "deny", "ask"]);
    expect(PERMISSION_LEVELS.length).toBe(3);
  });

  it("should be case-sensitive", () => {
    expect(() => PermissionLevelSchema.parse("Allow")).toThrow();
    expect(() => PermissionLevelSchema.parse("DENY")).toThrow();
    expect(() => PermissionLevelSchema.parse("ASK")).toThrow();
  });
});

// ============================================
// TrustPreset Tests
// ============================================

describe("TrustPreset", () => {
  it("should validate valid trust presets", () => {
    expect(TrustPresetSchema.parse("paranoid")).toBe("paranoid");
    expect(TrustPresetSchema.parse("cautious")).toBe("cautious");
    expect(TrustPresetSchema.parse("default")).toBe("default");
    expect(TrustPresetSchema.parse("relaxed")).toBe("relaxed");
    expect(TrustPresetSchema.parse("yolo")).toBe("yolo");
  });

  it("should reject invalid trust presets", () => {
    expect(() => TrustPresetSchema.parse("invalid")).toThrow();
    expect(() => TrustPresetSchema.parse("strict")).toThrow();
    expect(() => TrustPresetSchema.parse("")).toThrow();
    expect(() => TrustPresetSchema.parse(null)).toThrow();
  });

  it("should have all presets in TRUST_PRESETS constant", () => {
    expect(TRUST_PRESETS).toEqual(["paranoid", "cautious", "default", "relaxed", "yolo"]);
    expect(TRUST_PRESETS.length).toBe(5);
  });

  it("should have config for each trust preset", () => {
    for (const preset of TRUST_PRESETS) {
      expect(TRUST_PRESET_CONFIGS[preset]).toBeDefined();
      expect(TRUST_PRESET_CONFIGS[preset].edit).toBeDefined();
      expect(TRUST_PRESET_CONFIGS[preset].bash).toBeDefined();
    }
  });

  it("should have display info for each trust preset", () => {
    for (const preset of TRUST_PRESETS) {
      const info = TRUST_MODE_INFO[preset];
      expect(info).toBeDefined();
      expect(info.name).toBeTruthy();
      expect(info.icon).toBeTruthy();
      expect(info.color).toBeTruthy();
      expect(info.shortcut).toBeTruthy();
      expect(info.description).toBeTruthy();
    }
  });
});

// ============================================
// PermissionConfig Tests
// ============================================

describe("PermissionConfig", () => {
  it("should validate minimal config", () => {
    const config = {};
    const result = PermissionConfigSchema.parse(config);
    expect(result).toEqual({});
  });

  it("should validate config with all fields", () => {
    const config: PermissionConfig = {
      preset: "default",
      edit: "allow",
      bash: "ask",
      webfetch: "deny",
      external_directory: "ask",
      doom_loop: "deny",
      mcp: {
        "my-server": "allow",
      },
    };
    const result = PermissionConfigSchema.parse(config);
    expect(result).toEqual(config);
  });

  it("should validate config with pattern permissions for bash", () => {
    const config: PermissionConfig = {
      bash: {
        "git status": "allow",
        "git push *": "ask",
        "rm -rf *": "deny",
        "*": "ask",
      },
    };
    const result = PermissionConfigSchema.parse(config);
    expect(result.bash).toEqual(config.bash);
  });

  it("should validate MCP with nested pattern permissions", () => {
    const config: PermissionConfig = {
      mcp: {
        "filesystem-server": {
          "read *": "allow",
          "write *": "ask",
          "*": "deny",
        },
        "web-server": "ask",
      },
    };
    const result = PermissionConfigSchema.parse(config);
    expect(result.mcp).toEqual(config.mcp);
  });

  it("should reject invalid field values", () => {
    expect(() =>
      PermissionConfigSchema.parse({
        edit: "invalid",
      })
    ).toThrow();

    expect(() =>
      PermissionConfigSchema.parse({
        preset: "strict", // invalid preset
      })
    ).toThrow();
  });
});

// ============================================
// PatternPermission Tests
// ============================================

describe("PatternPermission", () => {
  it("should validate simple permission level", () => {
    expect(PatternPermissionSchema.parse("allow")).toBe("allow");
    expect(PatternPermissionSchema.parse("deny")).toBe("deny");
    expect(PatternPermissionSchema.parse("ask")).toBe("ask");
  });

  it("should validate pattern record", () => {
    const patterns = {
      "git *": "allow",
      "rm -rf": "deny",
      "*": "ask",
    };
    const result = PatternPermissionSchema.parse(patterns);
    expect(result).toEqual(patterns);
  });

  it("should reject invalid pattern values", () => {
    expect(() =>
      PatternPermissionSchema.parse({
        "git *": "invalid",
      })
    ).toThrow();
  });
});

// ============================================
// PermissionInfo Tests
// ============================================

describe("PermissionInfo", () => {
  it("should validate complete permission info", () => {
    const info: PermissionInfo = {
      id: "perm_123",
      type: "bash",
      pattern: "git push origin main",
      sessionId: "session_456",
      messageId: "msg_789",
      callId: "call_abc",
      title: "Execute git push",
      metadata: { command: "git push" },
      time: {
        created: Date.now(),
        resolved: Date.now() + 1000,
      },
    };
    const result = PermissionInfoSchema.parse(info);
    expect(result).toEqual(info);
  });

  it("should validate minimal permission info", () => {
    const info = {
      id: "perm_123",
      type: "edit",
      sessionId: "session_456",
      messageId: "msg_789",
      title: "Edit file",
      time: {
        created: Date.now(),
      },
    };
    const result = PermissionInfoSchema.parse(info);
    expect(result.id).toBe("perm_123");
    expect(result.pattern).toBeUndefined();
    expect(result.callId).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(result.time.resolved).toBeUndefined();
  });

  it("should validate array pattern", () => {
    const info = {
      id: "perm_123",
      type: "edit",
      pattern: ["file1.ts", "file2.ts"],
      sessionId: "session_456",
      messageId: "msg_789",
      title: "Edit files",
      time: { created: Date.now() },
    };
    const result = PermissionInfoSchema.parse(info);
    expect(result.pattern).toEqual(["file1.ts", "file2.ts"]);
  });

  it("should reject missing required fields", () => {
    expect(() =>
      PermissionInfoSchema.parse({
        id: "perm_123",
        // missing type, sessionId, messageId, title, time
      })
    ).toThrow();
  });
});

// ============================================
// PermissionResponse Tests
// ============================================

describe("PermissionResponse", () => {
  it("should validate valid responses", () => {
    expect(PermissionResponseSchema.parse("once")).toBe("once");
    expect(PermissionResponseSchema.parse("always")).toBe("always");
    expect(PermissionResponseSchema.parse("reject")).toBe("reject");
  });

  it("should reject invalid responses", () => {
    expect(() => PermissionResponseSchema.parse("never")).toThrow();
    expect(() => PermissionResponseSchema.parse("")).toThrow();
  });

  it("should have all responses in PERMISSION_RESPONSES constant", () => {
    expect(PERMISSION_RESPONSES).toEqual(["once", "always", "reject"]);
  });
});

// ============================================
// PermissionDecisionResult Tests
// ============================================

describe("PermissionDecisionResult", () => {
  it("should validate complete decision", () => {
    const decision: PermissionDecisionResult = {
      decision: "allow",
      reason: "Matched pattern",
      cached: false,
      matchedPattern: "git *",
      source: "config",
    };
    const result = PermissionDecisionResultSchema.parse(decision);
    expect(result).toEqual(decision);
  });

  it("should validate minimal decision", () => {
    const decision = {
      decision: "deny",
    };
    const result = PermissionDecisionResultSchema.parse(decision);
    expect(result.decision).toBe("deny");
    expect(result.reason).toBeUndefined();
    expect(result.cached).toBeUndefined();
  });

  it("should validate all source types", () => {
    const sources = ["config", "session", "user", "default"] as const;
    for (const source of sources) {
      const decision = { decision: "allow" as const, source };
      expect(PermissionDecisionResultSchema.parse(decision).source).toBe(source);
    }
  });
});

// ============================================
// PermissionRecord Tests
// ============================================

describe("PermissionRecord", () => {
  it("should validate complete record", () => {
    const record = {
      info: {
        id: "perm_123",
        type: "bash",
        sessionId: "session_456",
        messageId: "msg_789",
        title: "Execute command",
        time: { created: Date.now() },
      },
      response: "always" as const,
      timestamp: Date.now(),
    };
    const result = PermissionRecordSchema.parse(record);
    expect(result.info.id).toBe("perm_123");
    expect(result.response).toBe("always");
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe("resolvePermissionConfig", () => {
  it("should use default preset when none specified", () => {
    const config: PermissionConfig = {};
    const resolved = resolvePermissionConfig(config);
    expect(resolved.edit).toBe("allow");
    expect(resolved.webfetch).toBe("ask");
  });

  it("should use specified preset as base", () => {
    const config: PermissionConfig = { preset: "paranoid" };
    const resolved = resolvePermissionConfig(config);
    expect(resolved.edit).toBe("deny");
    expect(resolved.bash).toBe("deny");
  });

  it("should allow overrides to take precedence", () => {
    const config: PermissionConfig = {
      preset: "paranoid",
      edit: "allow", // override
    };
    const resolved = resolvePermissionConfig(config);
    expect(resolved.edit).toBe("allow"); // overridden
    expect(resolved.bash).toBe("deny"); // from preset
  });

  it("should include MCP config", () => {
    const config: PermissionConfig = {
      mcp: { "my-server": "allow" },
    };
    const resolved = resolvePermissionConfig(config);
    expect(resolved.mcp).toEqual({ "my-server": "allow" });
  });
});

describe("isAllowed", () => {
  it("should return true for allow", () => {
    expect(isAllowed("allow")).toBe(true);
  });

  it("should return false for deny and ask", () => {
    expect(isAllowed("deny")).toBe(false);
    expect(isAllowed("ask")).toBe(false);
  });
});

describe("isDenied", () => {
  it("should return true for deny", () => {
    expect(isDenied("deny")).toBe(true);
  });

  it("should return false for allow and ask", () => {
    expect(isDenied("allow")).toBe(false);
    expect(isDenied("ask")).toBe(false);
  });
});

describe("requiresConfirmation", () => {
  it("should return true for ask", () => {
    expect(requiresConfirmation("ask")).toBe(true);
  });

  it("should return false for allow and deny", () => {
    expect(requiresConfirmation("allow")).toBe(false);
    expect(requiresConfirmation("deny")).toBe(false);
  });
});

describe("createPermissionInfo", () => {
  it("should create info with required fields", () => {
    const info = createPermissionInfo("bash", "Execute command", "sess_1", "msg_1");
    expect(info.type).toBe("bash");
    expect(info.title).toBe("Execute command");
    expect(info.sessionId).toBe("sess_1");
    expect(info.messageId).toBe("msg_1");
    expect(info.id).toMatch(/^perm_\d+_[a-z0-9]+$/);
    expect(info.time.created).toBeGreaterThan(0);
  });

  it("should create info with optional fields", () => {
    const info = createPermissionInfo("edit", "Edit file", "sess_1", "msg_1", {
      pattern: "src/index.ts",
      callId: "call_1",
      metadata: { foo: "bar" },
    });
    expect(info.pattern).toBe("src/index.ts");
    expect(info.callId).toBe("call_1");
    expect(info.metadata).toEqual({ foo: "bar" });
  });

  it("should generate unique IDs", () => {
    const info1 = createPermissionInfo("bash", "cmd1", "s", "m");
    const info2 = createPermissionInfo("bash", "cmd2", "s", "m");
    expect(info1.id).not.toBe(info2.id);
  });
});

// ============================================
// Trust Preset Config Validation Tests
// ============================================

describe("TRUST_PRESET_CONFIGS", () => {
  it("should have increasingly permissive configs", () => {
    // Paranoid should be most restrictive
    expect(TRUST_PRESET_CONFIGS.paranoid.edit).toBe("deny");
    expect(TRUST_PRESET_CONFIGS.paranoid.bash).toBe("deny");

    // Cautious should ask for everything
    expect(TRUST_PRESET_CONFIGS.cautious.edit).toBe("ask");
    expect(TRUST_PRESET_CONFIGS.cautious.bash).toBe("ask");

    // YOLO should allow everything
    expect(TRUST_PRESET_CONFIGS.yolo.edit).toBe("allow");
    expect(TRUST_PRESET_CONFIGS.yolo.bash).toBe("allow");
    expect(TRUST_PRESET_CONFIGS.yolo.webfetch).toBe("allow");
  });

  it("should have valid permission levels in all configs", () => {
    for (const [, config] of Object.entries(TRUST_PRESET_CONFIGS)) {
      if (typeof config.edit === "string") {
        expect(PERMISSION_LEVELS).toContain(config.edit);
      }
      if (typeof config.webfetch === "string") {
        expect(PERMISSION_LEVELS).toContain(config.webfetch);
      }
    }
  });
});

/**
 * Execution policy engine tests
 *
 * Tests for policy evaluation and security checks.
 */

import { describe, expect, it } from "vitest";
import { DangerousCommandDetector } from "../detector.js";
import { ExecPolicyEngine, securityCheck } from "../policy.js";

describe("ExecPolicyEngine", () => {
  describe("evaluate", () => {
    const rules = [
      {
        name: "allow-npm",
        pattern: /^npm\s/,
        decision: "allow" as const,
        reason: "npm commands are allowed",
      },
      {
        name: "prompt-git",
        pattern: /^git\s/,
        decision: "prompt" as const,
        reason: "git commands require confirmation",
      },
      {
        name: "forbid-curl",
        pattern: /^curl\s/,
        decision: "forbidden" as const,
        reason: "curl commands are forbidden",
      },
    ];

    const engine = new ExecPolicyEngine(rules);

    it("returns allow for matching allow rule", () => {
      const result = engine.evaluate("npm install lodash");

      expect(result.decision).toBe("allow");
      expect(result.matchedRule?.name).toBe("allow-npm");
      expect(result.reason).toBe("npm commands are allowed");
      expect(result.command).toBe("npm install lodash");
    });

    it("returns prompt for matching prompt rule", () => {
      const result = engine.evaluate("git push origin main");

      expect(result.decision).toBe("prompt");
      expect(result.matchedRule?.name).toBe("prompt-git");
      expect(result.reason).toBe("git commands require confirmation");
    });

    it("returns forbidden for matching forbidden rule", () => {
      const result = engine.evaluate("curl https://example.com");

      expect(result.decision).toBe("forbidden");
      expect(result.matchedRule?.name).toBe("forbid-curl");
      expect(result.reason).toBe("curl commands are forbidden");
    });

    it("returns prompt with no matched rule for unknown commands", () => {
      const result = engine.evaluate("python script.py");

      expect(result.decision).toBe("prompt");
      expect(result.matchedRule).toBeNull();
      expect(result.reason).toBe("No policy rule matched");
    });

    it("uses first matching rule", () => {
      const overlappingRules = [
        {
          name: "first",
          pattern: /test/,
          decision: "allow" as const,
          reason: "First rule",
        },
        {
          name: "second",
          pattern: /test/,
          decision: "forbidden" as const,
          reason: "Second rule",
        },
      ];
      const overlappingEngine = new ExecPolicyEngine(overlappingRules);

      const result = overlappingEngine.evaluate("npm test");

      expect(result.decision).toBe("allow");
      expect(result.matchedRule?.name).toBe("first");
    });
  });

  describe("empty rules", () => {
    const emptyEngine = new ExecPolicyEngine([]);

    it("defaults to prompt for all commands", () => {
      const result = emptyEngine.evaluate("any command");

      expect(result.decision).toBe("prompt");
      expect(result.matchedRule).toBeNull();
    });
  });
});

describe("securityCheck", () => {
  const rules = [
    {
      name: "allow-safe",
      pattern: /^echo\s/,
      decision: "allow" as const,
      reason: "echo is safe",
    },
  ];
  const engine = new ExecPolicyEngine(rules);
  const detector = new DangerousCommandDetector();

  it("blocks critical dangerous commands", async () => {
    const result = await securityCheck("rm -rf /", engine, detector);

    expect(result.allowed).toBe(false);
    expect(result.policyResult.decision).toBe("forbidden");
    expect(result.detectionResult.dangerous).toBe(true);
    expect(result.reason).toContain("Blocked");
  });

  it("blocks high severity dangerous commands", async () => {
    const result = await securityCheck("sudo rm -rf ./folder", engine, detector);

    expect(result.allowed).toBe(false);
    expect(result.detectionResult.dangerous).toBe(true);
  });

  it("allows safe commands that match allow policy", async () => {
    const result = await securityCheck("echo hello world", engine, detector);

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe("allow");
    expect(result.detectionResult.dangerous).toBe(false);
  });

  it("prompts for unknown safe commands", async () => {
    const result = await securityCheck("node app.js", engine, detector);

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe("prompt");
    expect(result.detectionResult.dangerous).toBe(false);
  });

  it("dangerous detection takes precedence over policy", async () => {
    const permissiveRules = [
      {
        name: "allow-all",
        pattern: /.*/,
        decision: "allow" as const,
        reason: "Allow everything",
      },
    ];
    const permissiveEngine = new ExecPolicyEngine(permissiveRules);

    const result = await securityCheck("rm -rf /", permissiveEngine, detector);

    expect(result.allowed).toBe(false);
    expect(result.detectionResult.dangerous).toBe(true);
  });
});

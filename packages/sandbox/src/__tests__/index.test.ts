/**
 * Sandbox package exports tests
 *
 * Verifies that all public APIs are properly exported.
 */

import { describe, expect, it } from "vitest";
import {
  configFromTrustPreset,
  DangerousCommandDetector,
  detectSandboxBackend,
  ExecPolicyEngine,
  isCommandDangerous,
  mergeSandboxConfig,
  SandboxExecutor,
  securityCheck,
} from "../index.js";

describe("package exports", () => {
  describe("detector exports", () => {
    it("exports DangerousCommandDetector class", () => {
      expect(DangerousCommandDetector).toBeDefined();
      expect(typeof DangerousCommandDetector).toBe("function");
    });

    it("exports isCommandDangerous function", () => {
      expect(isCommandDangerous).toBeDefined();
      expect(typeof isCommandDangerous).toBe("function");
    });
  });

  describe("executor exports", () => {
    it("exports SandboxExecutor class", () => {
      expect(SandboxExecutor).toBeDefined();
      expect(typeof SandboxExecutor).toBe("function");
    });

    it("exports detectSandboxBackend function", () => {
      expect(detectSandboxBackend).toBeDefined();
      expect(typeof detectSandboxBackend).toBe("function");
    });
  });

  describe("policy exports", () => {
    it("exports ExecPolicyEngine class", () => {
      expect(ExecPolicyEngine).toBeDefined();
      expect(typeof ExecPolicyEngine).toBe("function");
    });

    it("exports securityCheck function", () => {
      expect(securityCheck).toBeDefined();
      expect(typeof securityCheck).toBe("function");
    });
  });

  describe("profiles exports", () => {
    it("exports configFromTrustPreset function", () => {
      expect(configFromTrustPreset).toBeDefined();
      expect(typeof configFromTrustPreset).toBe("function");
    });

    it("exports mergeSandboxConfig function", () => {
      expect(mergeSandboxConfig).toBeDefined();
      expect(typeof mergeSandboxConfig).toBe("function");
    });
  });

  describe("functional verification", () => {
    it("configFromTrustPreset creates valid config", () => {
      const config = configFromTrustPreset("default", "/test");

      expect(config.id).toBeDefined();
      expect(config.strategy).toBe("subprocess");
      expect(config.workingDir).toBe("/test");
    });

    it("DangerousCommandDetector detects dangerous commands", () => {
      const detector = new DangerousCommandDetector();
      const result = detector.detect("rm -rf /");

      expect(result.dangerous).toBe(true);
    });

    it("ExecPolicyEngine evaluates commands", () => {
      const engine = new ExecPolicyEngine([
        {
          name: "test",
          pattern: /test/,
          decision: "allow",
          reason: "Test",
        },
      ]);
      const result = engine.evaluate("npm test");

      expect(result.decision).toBe("allow");
    });

    it("detectSandboxBackend returns valid backend", () => {
      const backend = detectSandboxBackend();

      expect(["subprocess", "platform", "container"]).toContain(backend);
    });

    it("isCommandDangerous helper works", () => {
      expect(isCommandDangerous("ls -la")).toBe(false);
      expect(isCommandDangerous("sudo rm -rf /")).toBe(true);
    });

    it("mergeSandboxConfig merges configs", () => {
      const base = configFromTrustPreset("default", "/base");
      const merged = mergeSandboxConfig(base, { workingDir: "/merged" });

      expect(merged.workingDir).toBe("/merged");
      expect(merged.id).toBe(base.id);
    });

    it("securityCheck performs combined check", async () => {
      const detector = new DangerousCommandDetector();
      const engine = new ExecPolicyEngine([]);

      const result = await securityCheck("echo hello", engine, detector);

      expect(result.allowed).toBe(true);
      expect(result.detectionResult.dangerous).toBe(false);
    });
  });
});

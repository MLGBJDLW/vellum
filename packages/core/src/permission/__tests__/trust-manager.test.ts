import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrustManager, TRUST_ENV_VAR, TrustManager } from "../trust-manager.js";
import { TrustedFoldersManager } from "../trusted-folders.js";

describe("TrustManager", () => {
  // Store original env
  const originalEnv = process.env[TRUST_ENV_VAR];

  afterEach(() => {
    // Restore env
    if (originalEnv === undefined) {
      delete process.env[TRUST_ENV_VAR];
    } else {
      process.env[TRUST_ENV_VAR] = originalEnv;
    }
  });

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with default values", () => {
      const manager = new TrustManager();
      expect(manager.trustedFolders).toBeInstanceOf(TrustedFoldersManager);
    });

    it("should accept custom trusted folders manager", () => {
      const customFolders = new TrustedFoldersManager(["/custom/path"]);
      const manager = new TrustManager({ trustedFolders: customFolders });
      expect(manager.trustedFolders).toBe(customFolders);
    });
  });

  // ============================================
  // getEffectivePreset - Priority Tests
  // ============================================

  describe("getEffectivePreset - priority", () => {
    it("should use CLI preset when provided (highest priority)", () => {
      const manager = new TrustManager({
        cliPreset: "cautious",
        envPreset: "relaxed",
        configPreset: "paranoid",
      });

      const result = manager.getEffectivePreset();
      expect(result.preset).toBe("cautious");
      expect(result.source).toBe("cli");
    });

    it("should use env preset when CLI not provided", () => {
      const manager = new TrustManager({
        envPreset: "relaxed",
        configPreset: "paranoid",
      });

      const result = manager.getEffectivePreset();
      expect(result.preset).toBe("relaxed");
      expect(result.source).toBe("env");
    });

    it("should use config preset when CLI and env not provided", () => {
      const manager = new TrustManager({
        configPreset: "paranoid",
      });

      const result = manager.getEffectivePreset();
      expect(result.preset).toBe("paranoid");
      expect(result.source).toBe("config");
    });

    it("should use default when no preset provided", () => {
      const manager = new TrustManager();

      const result = manager.getEffectivePreset();
      expect(result.preset).toBe("default");
      expect(result.source).toBe("default");
    });

    it("should read from VELLUM_TRUST_PRESET environment variable", () => {
      process.env[TRUST_ENV_VAR] = "cautious";

      const manager = new TrustManager();
      const result = manager.getEffectivePreset();

      expect(result.preset).toBe("cautious");
      expect(result.source).toBe("env");
    });

    it("should ignore invalid env preset values", () => {
      process.env[TRUST_ENV_VAR] = "invalid-preset";

      const manager = new TrustManager();
      const result = manager.getEffectivePreset();

      expect(result.preset).toBe("default");
      expect(result.source).toBe("default");
    });

    it("should handle case-insensitive env preset", () => {
      process.env[TRUST_ENV_VAR] = "CAUTIOUS";

      const manager = new TrustManager();
      const result = manager.getEffectivePreset();

      expect(result.preset).toBe("cautious");
    });
  });

  // ============================================
  // All 5 Presets
  // ============================================

  describe("all 5 presets", () => {
    const presets = ["paranoid", "cautious", "default", "relaxed", "yolo"] as const;

    for (const preset of presets) {
      it(`should support "${preset}" preset`, () => {
        const manager = new TrustManager({ cliPreset: preset });
        const result = manager.getEffectivePreset();
        expect(result.preset).toBe(preset);
      });
    }
  });

  // ============================================
  // getEffectiveConfig
  // ============================================

  describe("getEffectiveConfig", () => {
    it("should return config based on effective preset", () => {
      const manager = new TrustManager({ cliPreset: "paranoid" });
      const config = manager.getEffectiveConfig();

      expect(config.edit).toBe("deny");
      expect(config.bash).toBe("deny");
      expect(config.webfetch).toBe("deny");
    });

    it("should apply config overrides on top of preset", () => {
      const manager = new TrustManager({
        cliPreset: "paranoid",
        config: {
          edit: "allow", // Override the paranoid default
        },
      });

      const config = manager.getEffectiveConfig();
      expect(config.edit).toBe("allow"); // Overridden
      expect(config.bash).toBe("deny"); // From preset
    });
  });

  // ============================================
  // Workspace Trust Capping
  // ============================================

  describe("workspace trust capping", () => {
    it("should cap trust for untrusted workspace", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted/path"]);
      const manager = new TrustManager({
        cliPreset: "yolo",
        trustedFolders,
        workspacePath: "/untrusted/workspace",
      });

      const result = manager.getEffectivePreset();

      expect(result.wasCapped).toBe(true);
      expect(result.preset).toBe("default");
      expect(result.originalPreset).toBe("yolo");
    });

    it("should not cap trust for trusted workspace", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted/path"]);
      const manager = new TrustManager({
        cliPreset: "yolo",
        trustedFolders,
        workspacePath: "/trusted/path/project",
      });

      const result = manager.getEffectivePreset();

      expect(result.wasCapped).toBe(false);
      expect(result.preset).toBe("yolo");
    });

    it("should not cap restrictive presets", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted/path"]);
      const manager = new TrustManager({
        cliPreset: "cautious",
        trustedFolders,
        workspacePath: "/untrusted/workspace",
      });

      const result = manager.getEffectivePreset();

      expect(result.wasCapped).toBe(false);
      expect(result.preset).toBe("cautious");
    });

    it("should report wasWorkspaceTrustCapped correctly", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted"]);
      const manager = new TrustManager({
        cliPreset: "relaxed",
        trustedFolders,
        workspacePath: "/untrusted",
      });

      expect(manager.wasWorkspaceTrustCapped()).toBe(true);
      expect(manager.getCapReason()).toContain("not in a trusted folder");
    });

    it("should not cap when no workspace path provided", () => {
      const manager = new TrustManager({
        cliPreset: "yolo",
      });

      const result = manager.getEffectivePreset();
      expect(result.wasCapped).toBe(false);
    });
  });

  // ============================================
  // Yolo Mode Confirmation (REQ-016)
  // ============================================

  describe("confirmYoloMode (REQ-016)", () => {
    it("should require confirmation for yolo mode", async () => {
      const manager = new TrustManager({
        cliPreset: "yolo",
      });

      const result = await manager.confirmYoloMode();

      expect(result.confirmed).toBe(false);
      expect(result.effectivePreset).toBe("relaxed");
      expect(result.reason).toContain("requires explicit confirmation");
    });

    it("should allow yolo when confirmed via callback", async () => {
      const manager = new TrustManager({
        cliPreset: "yolo",
        confirmYoloMode: async () => true,
      });

      const result = await manager.confirmYoloMode();

      expect(result.confirmed).toBe(true);
      expect(result.effectivePreset).toBe("yolo");
      expect(manager.isYoloConfirmed).toBe(true);
    });

    it("should fall back to relaxed when yolo rejected", async () => {
      const manager = new TrustManager({
        cliPreset: "yolo",
        confirmYoloMode: async () => false,
      });

      const result = await manager.confirmYoloMode();

      expect(result.confirmed).toBe(false);
      expect(result.effectivePreset).toBe("relaxed");
    });

    it("should skip confirmation for non-yolo presets", async () => {
      const manager = new TrustManager({
        cliPreset: "relaxed",
      });

      const result = await manager.confirmYoloMode();

      expect(result.confirmed).toBe(true);
      expect(result.effectivePreset).toBe("relaxed");
    });

    it("should remember yolo confirmation", async () => {
      const confirmMock = vi.fn().mockResolvedValue(true);
      const manager = new TrustManager({
        cliPreset: "yolo",
        confirmYoloMode: confirmMock,
      });

      await manager.confirmYoloMode();
      await manager.confirmYoloMode();

      // Should only call once
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });

    it("should allow resetting yolo confirmation", async () => {
      const confirmMock = vi.fn().mockResolvedValue(true);
      const manager = new TrustManager({
        cliPreset: "yolo",
        confirmYoloMode: confirmMock,
      });

      await manager.confirmYoloMode();
      manager.resetYoloConfirmation();
      await manager.confirmYoloMode();

      expect(confirmMock).toHaveBeenCalledTimes(2);
    });

    it("should handle callback errors gracefully", async () => {
      const manager = new TrustManager({
        cliPreset: "yolo",
        confirmYoloMode: async () => {
          throw new Error("Callback failed");
        },
      });

      const result = await manager.confirmYoloMode();

      expect(result.confirmed).toBe(false);
      expect(result.effectivePreset).toBe("relaxed");
      expect(result.reason).toContain("failed");
    });
  });

  // ============================================
  // EC-010: Yolo with Protected Files
  // ============================================

  describe("EC-010: yolo with protected", () => {
    it("should still require confirmation even with trusted workspace", async () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted"]);
      const manager = new TrustManager({
        cliPreset: "yolo",
        trustedFolders,
        workspacePath: "/trusted/project",
        // No confirmation callback
      });

      const result = await manager.confirmYoloMode();

      // Even though workspace is trusted, yolo needs explicit confirmation
      expect(result.confirmed).toBe(false);
    });
  });

  // ============================================
  // isWorkspaceTrusted
  // ============================================

  describe("isWorkspaceTrusted", () => {
    it("should return true for trusted workspace", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted"]);
      const manager = new TrustManager({
        trustedFolders,
        workspacePath: "/trusted/project",
      });

      expect(manager.isWorkspaceTrusted()).toBe(true);
    });

    it("should return false for untrusted workspace", () => {
      const trustedFolders = new TrustedFoldersManager(["/trusted"]);
      const manager = new TrustManager({
        trustedFolders,
        workspacePath: "/other/project",
      });

      expect(manager.isWorkspaceTrusted()).toBe(false);
    });

    it("should return false when no workspace path", () => {
      const manager = new TrustManager();
      expect(manager.isWorkspaceTrusted()).toBe(false);
    });
  });

  // ============================================
  // Static Methods
  // ============================================

  describe("static methods", () => {
    describe("compareTrustLevels", () => {
      it("should return negative when a is more restrictive", () => {
        expect(TrustManager.compareTrustLevels("paranoid", "yolo")).toBeLessThan(0);
        expect(TrustManager.compareTrustLevels("cautious", "default")).toBeLessThan(0);
      });

      it("should return positive when a is less restrictive", () => {
        expect(TrustManager.compareTrustLevels("yolo", "paranoid")).toBeGreaterThan(0);
        expect(TrustManager.compareTrustLevels("relaxed", "cautious")).toBeGreaterThan(0);
      });

      it("should return 0 when equal", () => {
        expect(TrustManager.compareTrustLevels("default", "default")).toBe(0);
      });
    });

    describe("getMoreRestrictive", () => {
      it("should return next more restrictive preset", () => {
        expect(TrustManager.getMoreRestrictive("yolo")).toBe("relaxed");
        expect(TrustManager.getMoreRestrictive("default")).toBe("cautious");
      });

      it("should return paranoid when already most restrictive", () => {
        expect(TrustManager.getMoreRestrictive("paranoid")).toBe("paranoid");
      });
    });

    describe("getLessRestrictive", () => {
      it("should return next less restrictive preset", () => {
        expect(TrustManager.getLessRestrictive("paranoid")).toBe("cautious");
        expect(TrustManager.getLessRestrictive("default")).toBe("relaxed");
      });

      it("should return yolo when already least restrictive", () => {
        expect(TrustManager.getLessRestrictive("yolo")).toBe("yolo");
      });
    });
  });

  // ============================================
  // Factory Function
  // ============================================

  describe("createTrustManager", () => {
    it("should create a TrustManager with options", () => {
      const manager = createTrustManager({ cliPreset: "cautious" });
      expect(manager).toBeInstanceOf(TrustManager);
      expect(manager.getEffectivePreset().preset).toBe("cautious");
    });

    it("should create a TrustManager with defaults", () => {
      const manager = createTrustManager();
      expect(manager).toBeInstanceOf(TrustManager);
    });
  });
});

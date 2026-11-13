// ============================================
// Session Integration Tests
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsLoader } from "../loader.js";
import {
  createSessionAgentsIntegration,
  SessionAgentsIntegration,
} from "../session-integration.js";
import { ToolAllowlistFilter } from "../tool-allowlist-filter.js";
import { AgentsWatcher } from "../watcher.js";

// ============================================
// Test Helpers
// ============================================

let testDir: string;

function createGate() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function createTestDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `session-integration-test-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeAgentsFile(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, "AGENTS.md"), content);
}

async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================
// Test Suites
// ============================================

describe("SessionAgentsIntegration", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestDir(testDir);
  });

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const integration = new SessionAgentsIntegration();
      expect(integration).toBeDefined();
      expect(integration.getState()).toBe("uninitialized");
    });

    it("should create instance with custom options", () => {
      const integration = new SessionAgentsIntegration({
        enableWatcher: false,
        cacheTtlMs: 10000,
        allowAllIfNoConfig: true,
      });
      expect(integration).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("handles watcher filesystem errors without requiring an error-event subscriber", async () => {
      let watcher: AgentsWatcher | undefined;
      vi.spyOn(AgentsWatcher.prototype, "start").mockImplementation(async function (
        this: AgentsWatcher
      ) {
        watcher = this;
      });
      const integration = new SessionAgentsIntegration();
      await integration.initialize(testDir);
      const filesystemError = Object.assign(new Error("Directory removed during watch"), {
        code: "EPERM",
      });
      expect(() => watcher?.emit("error", filesystemError)).not.toThrow();
      await integration.dispose();
    });

    it("closes a failed watcher before rejecting initialization", async () => {
      vi.spyOn(AgentsWatcher.prototype, "start").mockRejectedValue(
        new Error("watch startup failed")
      );
      const stop = vi.spyOn(AgentsWatcher.prototype, "stop");
      const integration = new SessionAgentsIntegration();
      await expect(integration.initialize(testDir)).rejects.toThrow("watch startup failed");
      expect(stop).toHaveBeenCalledOnce();
      expect(integration.getState()).toBe("uninitialized");
      await integration.dispose();
    });

    it("should initialize successfully with AGENTS.md file", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
---
# Instructions
Follow these rules.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      expect(integration.getState()).toBe("ready");
      expect(integration.getConfig()).not.toBeNull();
      expect(integration.getConfig()?.instructions).toContain("Follow these rules");

      await integration.dispose();
    });

    it("should initialize successfully without AGENTS.md file", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      expect(integration.getState()).toBe("ready");
      expect(integration.getConfig()).toBeNull();

      await integration.dispose();
    });

    it("should emit initialized event", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      const initializedHandler = vi.fn();
      integration.on("initialized", initializedHandler);

      await integration.initialize(testDir);

      expect(initializedHandler).toHaveBeenCalled();

      await integration.dispose();
    });

    it("should throw if already initialized", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      await expect(integration.initialize(testDir)).rejects.toThrow("already initialized");

      await integration.dispose();
    });

    it("should throw if disposed", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);
      await integration.dispose();

      await expect(integration.initialize(testDir)).rejects.toThrow("disposed");
    });
  });

  describe("getSystemPromptSections", () => {
    it("should return sections from config", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
---
# Instructions
Follow these rules.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const sections = integration.getSystemPromptSections();
      expect(sections.length).toBeGreaterThan(0);

      await integration.dispose();
    });

    it("should return empty sections when not initialized", () => {
      const integration = new SessionAgentsIntegration();
      const sections = integration.getSystemPromptSections();
      expect(sections).toEqual([]);
    });

    it("should return empty sections when no config", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const sections = integration.getSystemPromptSections();
      expect(sections).toEqual([]);

      await integration.dispose();
    });
  });

  describe("getToolFilter", () => {
    it("should return ToolAllowlistFilter", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const filter = integration.getToolFilter();
      expect(filter).toBeInstanceOf(ToolAllowlistFilter);

      await integration.dispose();
    });

    it("should return deny-all filter when config has no allowed tools", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
---
No tools specified.
`
      );

      const integration = new SessionAgentsIntegration({
        enableWatcher: false,
        allowAllIfNoConfig: false,
      });
      await integration.initialize(testDir);

      const filter = integration.getToolFilter();
      expect(filter.isAllowed("ReadFile")).toBe(false);

      await integration.dispose();
    });

    it("should return allow-all filter when allowAllIfNoConfig is true and no config", async () => {
      const integration = new SessionAgentsIntegration({
        enableWatcher: false,
        allowAllIfNoConfig: true,
      });
      await integration.initialize(testDir);

      const filter = integration.getToolFilter();
      expect(filter.isAllowed("ReadFile")).toBe(true);

      await integration.dispose();
    });

    it("should configure filter from allowed-tools", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
allowed-tools:
  - ReadFile
  - Grep
---
Instructions here.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const filter = integration.getToolFilter();
      expect(filter.isAllowed("ReadFile")).toBe(true);
      expect(filter.isAllowed("Grep")).toBe(true);
      expect(filter.isAllowed("WriteFile")).toBe(false);

      await integration.dispose();
    });
  });

  describe("isToolAllowed", () => {
    it("should delegate to tool filter", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
allowed-tools:
  - ReadFile
---
Instructions here.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      expect(integration.isToolAllowed("ReadFile")).toBe(true);
      expect(integration.isToolAllowed("WriteFile")).toBe(false);

      await integration.dispose();
    });
  });

  describe("getConfig", () => {
    it("should return current config", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
name: TestProject
---
Instructions.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const config = integration.getConfig();
      expect(config).not.toBeNull();
      expect(config?.name).toBe("TestProject");

      await integration.dispose();
    });

    it("should return null when no AGENTS.md found", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      expect(integration.getConfig()).toBeNull();

      await integration.dispose();
    });
  });

  describe("reload", () => {
    it("should reload config after file change", async () => {
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
name: OriginalName
---
Original instructions.
`
      );

      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      expect(integration.getConfig()?.name).toBe("OriginalName");

      // Update file
      await writeAgentsFile(
        testDir,
        `---
version: "1.0"
name: UpdatedName
---
Updated instructions.
`
      );

      await integration.reload();

      expect(integration.getConfig()?.name).toBe("UpdatedName");

      await integration.dispose();
    });

    it("should throw if not ready", async () => {
      const integration = new SessionAgentsIntegration();

      await expect(integration.reload()).rejects.toThrow("not ready");
    });
  });

  describe("dispose", () => {
    it("drains an in-flight load without recreating disposed configuration or watchers", async () => {
      await writeAgentsFile(testDir, "# Instructions\nDo not resurrect this config");
      const gate = createGate();
      const original = AgentsLoader.prototype.load;
      vi.spyOn(AgentsLoader.prototype, "load").mockImplementation(async function (
        this: AgentsLoader,
        sessionPath
      ) {
        await gate.promise;
        return original.call(this, sessionPath);
      });
      const start = vi.spyOn(AgentsWatcher.prototype, "start");
      const integration = new SessionAgentsIntegration();
      const initialized = vi.fn();
      integration.on("initialized", initialized);
      const initializing = integration.initialize(testDir);
      const disposing = integration.dispose();
      expect(integration.getState()).toBe("disposed");
      gate.resolve();
      await Promise.all([initializing, disposing]);
      expect(integration.getState()).toBe("disposed");
      expect(integration.getConfig()).toBeNull();
      expect(start).not.toHaveBeenCalled();
      expect(initialized).not.toHaveBeenCalled();
    });

    it("waits for pending watcher startup before closing and never emits initialized", async () => {
      const gate = createGate();
      const entered = createGate();
      vi.spyOn(AgentsWatcher.prototype, "start").mockImplementation(async () => {
        entered.resolve();
        await gate.promise;
      });
      const stop = vi.spyOn(AgentsWatcher.prototype, "stop");
      const integration = new SessionAgentsIntegration();
      const initialized = vi.fn();
      integration.on("initialized", initialized);
      const initializing = integration.initialize(testDir);
      await entered.promise;
      const disposing = integration.dispose();
      expect(integration.dispose()).toBe(disposing);
      gate.resolve();
      await Promise.all([initializing, disposing]);
      expect(stop).toHaveBeenCalledOnce();
      expect(integration.getState()).toBe("disposed");
      expect(initialized).not.toHaveBeenCalled();
    });

    it("should clean up state", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      await integration.dispose();

      expect(integration.getState()).toBe("disposed");
      expect(integration.getConfig()).toBeNull();
    });

    it("should emit disposed event", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      const disposedHandler = vi.fn();
      integration.on("disposed", disposedHandler);

      await integration.dispose();

      expect(disposedHandler).toHaveBeenCalled();
    });

    it("should be idempotent", async () => {
      const integration = new SessionAgentsIntegration({ enableWatcher: false });
      await integration.initialize(testDir);

      await integration.dispose();
      await integration.dispose(); // Should not throw

      expect(integration.getState()).toBe("disposed");
    });
  });
});

describe("createSessionAgentsIntegration", () => {
  it("should create integration with default options", () => {
    const integration = createSessionAgentsIntegration();
    expect(integration).toBeInstanceOf(SessionAgentsIntegration);
  });

  it("should create integration with custom options", () => {
    const integration = createSessionAgentsIntegration({
      enableWatcher: false,
      cacheTtlMs: 10000,
    });
    expect(integration).toBeInstanceOf(SessionAgentsIntegration);
  });
});

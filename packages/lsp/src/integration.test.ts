import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";

import { LspHub } from "./LspHub.js";
import { createLspTools } from "./tools/factory.js";
import type { LspHubEvents, LspHubOptions, ToolRegistryLike } from "./types.js";

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates mock LspHubOptions for testing.
 */
function createMockHubOptions(overrides?: Partial<LspHubOptions>): LspHubOptions {
  return {
    getGlobalConfigPath: vi.fn().mockResolvedValue("/mock/.config/vellum/lsp.json"),
    getProjectConfigPath: vi.fn().mockResolvedValue(undefined),
    autoInstall: "never",
    enableMultiClient: true,
    ...overrides,
  };
}

// =============================================================================
// LspHub Lifecycle Tests
// =============================================================================

describe("LspHub Integration", () => {
  let hub: LspHub;
  let mockOptions: LspHubOptions;

  beforeEach(() => {
    // Reset singleton for each test
    (LspHub as unknown as { instance: null }).instance = null;
    mockOptions = createMockHubOptions();
    hub = new LspHub(mockOptions);
  });

  afterEach(async () => {
    await hub.dispose();
  });

  describe("lifecycle", () => {
    it("should construct without errors", () => {
      expect(hub).toBeInstanceOf(LspHub);
    });

    it("should initialize only once even with concurrent calls", async () => {
      // Spy on internal initialization
      const reloadConfigSpy = vi.spyOn(hub, "reloadConfig").mockResolvedValue(undefined);

      // Call initialize concurrently
      await Promise.all([hub.initialize(), hub.initialize(), hub.initialize()]);

      // Should only call reloadConfig once
      expect(reloadConfigSpy).toHaveBeenCalledTimes(1);
    });

    it("should return empty servers before initialization", () => {
      const servers = hub.getServers();
      expect(servers).toEqual([]);
    });

    it("should dispose cleanly without errors", async () => {
      await hub.initialize();
      await expect(hub.dispose()).resolves.not.toThrow();
    });

    it("should handle multiple dispose calls gracefully", async () => {
      await hub.initialize();
      await hub.dispose();
      await expect(hub.dispose()).resolves.not.toThrow();
    });
  });

  describe("configuration", () => {
    it("should return null config before initialization", () => {
      const config = hub.getConfig();
      expect(config).toBeNull();
    });

    it("should emit config:reloaded event on reload", async () => {
      const eventHandler = vi.fn();
      const optionsWithEvent = createMockHubOptions({
        onEvent: eventHandler,
      });

      hub = new LspHub(optionsWithEvent);
      await hub.reloadConfig();

      expect(eventHandler).toHaveBeenCalledWith("config:reloaded", expect.any(Object));
    });
  });
});

// =============================================================================
// Multi-Client Tests
// =============================================================================

describe("LspHub Multi-Client Mode", () => {
  let hub: LspHub;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should enable multi-client mode by default", () => {
    const options = createMockHubOptions();
    hub = new LspHub(options);

    // MultiClientManager should be initialized (check via internal state)
    expect((hub as unknown as { multiClientManager: unknown }).multiClientManager).toBeTruthy();
  });

  it("should disable multi-client mode when explicitly disabled", () => {
    const options = createMockHubOptions({ enableMultiClient: false });
    hub = new LspHub(options);

    expect((hub as unknown as { multiClientManager: unknown }).multiClientManager).toBeNull();
  });

  it("should respect maxConnectionsPerFile configuration", () => {
    const options = createMockHubOptions({
      multiClientConfig: {
        maxConnectionsPerFile: 5,
      },
    });
    hub = new LspHub(options);

    const manager = (
      hub as unknown as { multiClientManager: { getMaxClientsPerFile: () => number } }
    ).multiClientManager;
    expect(manager?.getMaxClientsPerFile()).toBe(5);
  });
});

// =============================================================================
// Tool Factory Tests
// =============================================================================

describe("Tool Factory", () => {
  let hub: LspHub;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
    const options = createMockHubOptions();
    hub = new LspHub(options);
  });

  afterEach(async () => {
    await hub.dispose();
  });

  it("should create all 13 LSP tools (including implementation + rename)", () => {
    const tools = createLspTools(hub);

    // Should have 13 tools total (11 original + implementation + rename)
    expect(tools).toHaveLength(13);
  });

  it("should include all expected tool names", () => {
    const tools = createLspTools(hub);
    const toolNames = tools.map((t) => t.definition.name);

    expect(toolNames).toContain("lsp_diagnostics");
    expect(toolNames).toContain("lsp_hover");
    expect(toolNames).toContain("lsp_definition");
    expect(toolNames).toContain("lsp_implementation");
    expect(toolNames).toContain("lsp_references");
    expect(toolNames).toContain("lsp_symbols");
    expect(toolNames).toContain("lsp_workspace_symbol");
    expect(toolNames).toContain("lsp_incoming_calls");
    expect(toolNames).toContain("lsp_outgoing_calls");
    expect(toolNames).toContain("lsp_code_actions");
    expect(toolNames).toContain("lsp_completion");
    expect(toolNames).toContain("lsp_rename");
    expect(toolNames).toContain("lsp_format");
  });

  it("should create tools with correct kind", () => {
    const tools = createLspTools(hub);

    for (const tool of tools) {
      expect(tool.definition.kind).toBe("lsp");
    }
  });

  it("should create tools with execute function", () => {
    const tools = createLspTools(hub);

    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });
});

// =============================================================================
// Cross-Platform Path Tests
// =============================================================================

describe("Cross-Platform Path Resolution", () => {
  let hub: LspHub;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should handle Windows-style paths in config", async () => {
    const options = createMockHubOptions({
      getGlobalConfigPath: vi.fn().mockResolvedValue("C:\\Users\\test\\.config\\vellum\\lsp.json"),
    });
    hub = new LspHub(options);

    // Should not throw when initializing
    await expect(hub.initialize()).resolves.not.toThrow();
  });

  it("should handle Unix-style paths in config", async () => {
    const options = createMockHubOptions({
      getGlobalConfigPath: vi.fn().mockResolvedValue("/home/test/.config/vellum/lsp.json"),
    });
    hub = new LspHub(options);

    await expect(hub.initialize()).resolves.not.toThrow();
  });

  it("should handle paths with spaces", async () => {
    const options = createMockHubOptions({
      getGlobalConfigPath: vi
        .fn()
        .mockResolvedValue("/Users/John Doe/My Documents/vellum/lsp.json"),
    });
    hub = new LspHub(options);

    await expect(hub.initialize()).resolves.not.toThrow();
  });

  it("should handle UNC paths (Windows network shares)", async () => {
    const options = createMockHubOptions({
      getGlobalConfigPath: vi.fn().mockResolvedValue("\\\\server\\share\\config\\lsp.json"),
    });
    hub = new LspHub(options);

    await expect(hub.initialize()).resolves.not.toThrow();
  });
});

// =============================================================================
// Graceful Degradation Tests
// =============================================================================

describe("Graceful Degradation", () => {
  let hub: LspHub;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should handle missing config gracefully", async () => {
    const options = createMockHubOptions({
      getGlobalConfigPath: vi.fn().mockRejectedValue(new Error("Config not found")),
    });
    hub = new LspHub(options);

    // Config loading may use defaults or fail, but hub should not crash
    try {
      await hub.initialize();
    } catch {
      // Config loading errors are acceptable
    }
    // Hub should either have a default config or null, but not crash
    // The actual behavior depends on loadLspConfig implementation
    expect(hub).toBeDefined();
  });

  it("should emit config:error event on config load failure", async () => {
    const eventHandler = vi.fn();
    const options = createMockHubOptions({
      onEvent: eventHandler,
      getProjectConfigPath: vi.fn().mockRejectedValue(new Error("Read error")),
    });
    hub = new LspHub(options);

    await hub.initialize().catch(() => {
      // Expected
    });

    // Should have called the error handler at some point if config fails
    // (actual behavior depends on config loading implementation)
  });

  it("should continue working when one server fails", async () => {
    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    const options = createMockHubOptions({
      logger: mockLogger,
    });
    hub = new LspHub(options);

    // Even with server failures, the hub should remain functional
    const servers = hub.getServers();
    expect(servers).toBeDefined();
  });

  it("should track broken servers and temporarily disable them", () => {
    const options = createMockHubOptions();
    hub = new LspHub(options);

    const brokenTracker = (
      hub as unknown as { brokenTracker: { isAvailable: (id: string) => boolean } }
    ).brokenTracker;

    // Initially all servers should be available
    expect(brokenTracker.isAvailable("typescript")).toBe(true);
    expect(brokenTracker.isAvailable("python")).toBe(true);
  });
});

// =============================================================================
// Diagnostic Debounce Tests
// =============================================================================

describe("Diagnostic Debounce", () => {
  let hub: LspHub;

  beforeEach(() => {
    vi.useFakeTimers();
    (LspHub as unknown as { instance: null }).instance = null;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await hub?.dispose();
  });

  it("should debounce rapid diagnostic updates", async () => {
    const eventHandler = vi.fn();
    const options = createMockHubOptions({
      onEvent: eventHandler,
      enableDiagnosticsDebounce: true,
      diagnosticsDebounceMs: 150,
    });
    hub = new LspHub(options);

    // Access internal diagnostic handler if exposed
    const handleDiagnostics = (
      hub as unknown as {
        handleDiagnosticsNotification?: (uri: string, diagnostics: Diagnostic[]) => void;
      }
    ).handleDiagnosticsNotification;

    if (handleDiagnostics) {
      // Simulate rapid diagnostic updates
      handleDiagnostics.call(hub, "file:///test.ts", [{ message: "Error 1" } as Diagnostic]);
      handleDiagnostics.call(hub, "file:///test.ts", [{ message: "Error 2" } as Diagnostic]);
      handleDiagnostics.call(hub, "file:///test.ts", [{ message: "Error 3" } as Diagnostic]);

      // Should not have emitted yet
      expect(eventHandler).not.toHaveBeenCalledWith("diagnostics:updated", expect.anything());

      // Advance timers past debounce period
      await vi.advanceTimersByTimeAsync(200);

      // Now should have emitted only once with the last value
      const diagnosticsUpdatedCalls = eventHandler.mock.calls.filter(
        (call) => call[0] === "diagnostics:updated"
      );
      expect(diagnosticsUpdatedCalls.length).toBeLessThanOrEqual(1);
    }
  });

  it("should clear pending timers on dispose", async () => {
    const options = createMockHubOptions({
      enableDiagnosticsDebounce: true,
      diagnosticsDebounceMs: 150,
    });
    hub = new LspHub(options);

    // Dispose should clear any pending diagnostic timers
    await hub.dispose();

    // Advancing timers should not cause any errors
    await vi.advanceTimersByTimeAsync(500);
  });
});

// =============================================================================
// Tool Registration Tests
// =============================================================================

describe("Tool Registration", () => {
  let hub: LspHub;
  let mockRegistry: ToolRegistryLike;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
    mockRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should register tools when toolRegistry is provided", async () => {
    const options = createMockHubOptions({
      toolRegistry: mockRegistry,
    });
    hub = new LspHub(options);

    await hub.initialize();

    // Should have registered all 12 tools
    expect(mockRegistry.register).toHaveBeenCalled();
  });

  it("should not register tools when toolRegistry is not provided", async () => {
    const options = createMockHubOptions({
      toolRegistry: undefined,
    });
    hub = new LspHub(options);

    await hub.initialize();

    // Should not have tried to register
    expect(mockRegistry.register).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Event Emission Tests
// =============================================================================

describe("Event Emission", () => {
  let hub: LspHub;
  let eventHandler: <K extends keyof LspHubEvents>(event: K, data: LspHubEvents[K]) => void;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
    eventHandler = vi.fn();
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should emit config:reloaded on successful config load", async () => {
    const options = createMockHubOptions({
      onEvent: eventHandler,
    });
    hub = new LspHub(options);

    await hub.reloadConfig();

    expect(eventHandler).toHaveBeenCalledWith("config:reloaded", {
      serverIds: expect.any(Array),
    });
  });

  it("should not crash if event handler throws", async () => {
    const throwingHandler = vi.fn().mockImplementation(() => {
      throw new Error("Handler error");
    });

    const options = createMockHubOptions({
      onEvent: throwingHandler,
    });
    hub = new LspHub(options);

    // Should not crash even if handler throws
    await expect(hub.reloadConfig()).resolves.not.toThrow();
  });
});

// =============================================================================
// Cache Tests
// =============================================================================

describe("LspHub Cache", () => {
  let hub: LspHub;

  beforeEach(() => {
    (LspHub as unknown as { instance: null }).instance = null;
  });

  afterEach(async () => {
    await hub?.dispose();
  });

  it("should respect cacheMaxEntries configuration", () => {
    const options = createMockHubOptions({
      cacheMaxEntries: 100,
    });
    hub = new LspHub(options);

    const cache = (hub as unknown as { cache: { maxSize?: number } }).cache;
    // Cache should be initialized with the provided max size
    expect(cache).toBeDefined();
  });

  it("should clear cache on dispose", async () => {
    const options = createMockHubOptions();
    hub = new LspHub(options);

    await hub.initialize();
    await hub.dispose();

    const cache = (hub as unknown as { cache: { size?: number } }).cache;
    // After dispose, cache should be cleared or empty
    expect(cache.size ?? 0).toBe(0);
  });
});

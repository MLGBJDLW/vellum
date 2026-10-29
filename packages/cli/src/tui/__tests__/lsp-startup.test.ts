import {
  DEFAULT_AUTO_MODE_CONFIG,
  LanguageDetector,
  LspHub,
  type ToolRegistryLike,
} from "@vellum/lsp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspIntegrationManager } from "../lsp-integration.js";

afterEach(() => vi.restoreAllMocks());

describe("LSP startup", () => {
  it("registers coding tools without prompting to install detected servers", async () => {
    const hub = new LspHub({
      autoInstall: "never",
      getGlobalConfigPath: async () => "unused-lsp-startup-config.json",
    });
    const manager = new LspIntegrationManager();
    const requestConfirmation = vi.fn(async () => false);
    const registry: ToolRegistryLike = { register: vi.fn(), unregister: vi.fn() };
    const detect = vi.spyOn(LanguageDetector.prototype, "detect").mockResolvedValue([
      {
        languageId: "yaml",
        serverId: "yaml",
        confidence: 1,
        matchedFiles: ["config.yaml"],
        suggestedAction: "install",
      },
    ]);
    vi.spyOn(hub, "isServerInstalled").mockResolvedValue(false);
    vi.spyOn(LspHub, "getInstance").mockReturnValue(hub);

    try {
      await hub.initialize();
      const config = hub.getConfig();
      if (!config) throw new Error("Expected LSP configuration");
      config.autoMode = {
        ...DEFAULT_AUTO_MODE_CONFIG,
        triggers: { ...DEFAULT_AUTO_MODE_CONFIG.triggers, onStartup: true },
        languageOverrides: {},
      };
      config.disabled = [];
      hub.setConfirmationHandler(requestConfirmation);

      const result = await manager.initialize({ toolRegistry: registry });
      await Promise.resolve();

      expect(requestConfirmation).not.toHaveBeenCalled();
      expect(detect).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.hub).toBe(hub);
      expect(result.toolCount).toBe(13);
      expect(registry.register).toHaveBeenCalledTimes(13);

      const yamlServer = hub.getServers().find((server) => server.id === "yaml");
      if (!yamlServer) throw new Error("Expected YAML server configuration");
      const startServer = vi.spyOn(hub, "startServer").mockResolvedValue(yamlServer);
      expect(await manager.startServer("yaml")).toBe(true);
      expect(startServer).toHaveBeenCalledWith("yaml", undefined);
    } finally {
      await manager.dispose();
      await hub.dispose();
    }
  });
});

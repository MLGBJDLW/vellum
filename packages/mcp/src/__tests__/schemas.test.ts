// ============================================
// T007: Unit Tests for MCP Schemas
// ============================================

import { describe, expect, it } from "vitest";
import {
  DEFAULT_MCP_TIMEOUT_SECONDS,
  DEFAULT_OAUTH_PORT,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
} from "../constants.js";
import {
  CliConfigSchema,
  EnterpriseConfigSchema,
  isRemoteConfigSchema,
  isSSEConfigSchema,
  isStdioConfigSchema,
  isStreamableHttpConfigSchema,
  McpSettingsSchema,
  RemoteConfigSchema,
  requiresUrl,
  SSEConfigSchema,
  StdioConfigSchema,
  StreamableHttpConfigSchema,
  validateMcpSettings,
  validateServerConfig,
} from "../schemas.js";

describe("StdioConfigSchema", () => {
  it("should validate minimal stdio config", () => {
    const config = {
      command: "node",
    };

    const result = StdioConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.command).toBe("node");
      expect(result.data.type).toBe("stdio");
      expect(result.data.args).toEqual([]);
      expect(result.data.timeout).toBe(DEFAULT_MCP_TIMEOUT_SECONDS);
      expect(result.data.disabled).toBe(false);
    }
  });

  it("should validate full stdio config", () => {
    const config = {
      type: "stdio" as const,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      cwd: "/home/user",
      env: { NODE_ENV: "production" },
      autoApprove: ["read_file"],
      disabled: false,
      timeout: 120,
    };

    const result = StdioConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.command).toBe("npx");
      expect(result.data.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
      expect(result.data.cwd).toBe("/home/user");
      expect(result.data.env).toEqual({ NODE_ENV: "production" });
      expect(result.data.autoApprove).toEqual(["read_file"]);
      expect(result.data.timeout).toBe(120);
    }
  });

  it("should reject missing command", () => {
    const config = {
      type: "stdio" as const,
    };

    const result = StdioConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject empty command", () => {
    const config = {
      command: "",
    };

    const result = StdioConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject timeout below minimum", () => {
    const config = {
      command: "node",
      timeout: 0,
    };

    const result = StdioConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("SSEConfigSchema", () => {
  it("should validate minimal SSE config", () => {
    const config = {
      type: "sse" as const,
      url: "https://example.com/sse",
    };

    const result = SSEConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("sse");
      expect(result.data.url).toBe("https://example.com/sse");
    }
  });

  it("should validate SSE config with headers", () => {
    const config = {
      type: "sse" as const,
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer token" },
    };

    const result = SSEConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headers).toEqual({ Authorization: "Bearer token" });
    }
  });

  it("should reject invalid URL", () => {
    const config = {
      type: "sse" as const,
      url: "not-a-url",
    };

    const result = SSEConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject missing URL", () => {
    const config = {
      type: "sse" as const,
    };

    const result = SSEConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("StreamableHttpConfigSchema", () => {
  it("should validate minimal streamableHttp config", () => {
    const config = {
      type: "streamableHttp" as const,
      url: "https://api.example.com/mcp",
    };

    const result = StreamableHttpConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("streamableHttp");
      expect(result.data.url).toBe("https://api.example.com/mcp");
    }
  });

  it("should validate streamableHttp config with options", () => {
    const config = {
      type: "streamableHttp" as const,
      url: "https://api.example.com/mcp",
      headers: { "X-API-Key": "secret" },
      timeout: 90,
      autoApprove: ["search"],
    };

    const result = StreamableHttpConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headers).toEqual({ "X-API-Key": "secret" });
      expect(result.data.timeout).toBe(90);
      expect(result.data.autoApprove).toEqual(["search"]);
    }
  });
});

describe("RemoteConfigSchema", () => {
  it("should validate minimal remote config", () => {
    const config = {
      type: "remote" as const,
      url: "https://remote.example.com/mcp",
    };

    const result = RemoteConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("remote");
      expect(result.data.url).toBe("https://remote.example.com/mcp");
    }
  });
});

describe("CliConfigSchema", () => {
  it("should apply defaults for empty config", () => {
    const result = CliConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.oauthCallbackPort).toBe(DEFAULT_OAUTH_PORT);
      expect(result.data.shutdownTimeoutMs).toBe(DEFAULT_SHUTDOWN_TIMEOUT_MS);
      expect(result.data.nonInteractive).toBe(false);
      expect(result.data.autoOpenBrowser).toBe(true);
    }
  });

  it("should reject invalid port ranges", () => {
    const lowPort = CliConfigSchema.safeParse({ oauthCallbackPort: 80 });
    expect(lowPort.success).toBe(false);

    const highPort = CliConfigSchema.safeParse({ oauthCallbackPort: 70000 });
    expect(highPort.success).toBe(false);
  });

  it("should accept valid port", () => {
    const result = CliConfigSchema.safeParse({ oauthCallbackPort: 8080 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.oauthCallbackPort).toBe(8080);
    }
  });
});

describe("EnterpriseConfigSchema", () => {
  it("should apply defaults for empty config", () => {
    const result = EnterpriseConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockPersonalRemoteMCPServers).toBe(false);
      expect(result.data.allowedMCPServers).toEqual([]);
      expect(result.data.mcpMarketplaceEnabled).toBe(true);
    }
  });

  it("should accept enterprise restrictions", () => {
    const config = {
      blockPersonalRemoteMCPServers: true,
      allowedMCPServers: ["official-server-1", "official-server-2"],
      mcpMarketplaceEnabled: false,
    };

    const result = EnterpriseConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockPersonalRemoteMCPServers).toBe(true);
      expect(result.data.allowedMCPServers).toEqual(["official-server-1", "official-server-2"]);
      expect(result.data.mcpMarketplaceEnabled).toBe(false);
    }
  });
});

describe("McpSettingsSchema", () => {
  it("should validate empty settings", () => {
    const result = McpSettingsSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mcpServers).toEqual({});
    }
  });

  it("should validate complete settings file", () => {
    const settings = {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
        },
        github: {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "secret" },
        },
        remote: {
          type: "streamableHttp" as const,
          url: "https://api.example.com/mcp",
        },
      },
      cli: {
        oauthCallbackPort: 4000,
      },
      enterprise: {
        blockPersonalRemoteMCPServers: true,
      },
    };

    const result = McpSettingsSchema.safeParse(settings);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.mcpServers)).toHaveLength(3);
      expect(result.data.cli?.oauthCallbackPort).toBe(4000);
      expect(result.data.enterprise?.blockPersonalRemoteMCPServers).toBe(true);
    }
  });

  it("should reject invalid server config in settings", () => {
    const settings = {
      mcpServers: {
        invalid: {
          type: "stdio" as const,
          // missing command
        },
      },
    };

    const result = McpSettingsSchema.safeParse(settings);
    expect(result.success).toBe(false);
  });
});

describe("validateMcpSettings", () => {
  it("should return success with valid config", () => {
    const config = {
      mcpServers: {
        test: { command: "node" },
      },
    };

    const result = validateMcpSettings(config);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it("should return formatted errors for invalid config", () => {
    const config = {
      mcpServers: {
        test: {
          type: "sse",
          url: "not-a-url",
        },
      },
    };

    const result = validateMcpSettings(config);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

describe("validateServerConfig", () => {
  it("should validate single server config", () => {
    const config = {
      command: "node",
      args: ["server.js"],
    };

    const result = validateServerConfig(config, "my-server");

    expect(result.success).toBe(true);
    expect(result.data?.mcpServers["my-server"]).toBeDefined();
  });

  it("should include server name in error messages", () => {
    const config = {
      type: "sse",
      // missing url
    };

    const result = validateServerConfig(config, "my-server");

    expect(result.success).toBe(false);
    expect(result.errors!.some((e) => e.includes("my-server"))).toBe(true);
  });
});

describe("Type guard functions", () => {
  describe("isStdioConfigSchema", () => {
    it("should identify stdio config", () => {
      expect(
        isStdioConfigSchema({
          type: "stdio",
          command: "node",
          args: [],
          timeout: 60,
          disabled: false,
        })
      ).toBe(true);
    });

    it("should return false for other types", () => {
      expect(
        isStdioConfigSchema({
          type: "sse",
          url: "https://example.com",
          timeout: 60,
          disabled: false,
        })
      ).toBe(false);
    });
  });

  describe("isSSEConfigSchema", () => {
    it("should identify SSE config", () => {
      expect(
        isSSEConfigSchema({ type: "sse", url: "https://example.com", timeout: 60, disabled: false })
      ).toBe(true);
    });
  });

  describe("isStreamableHttpConfigSchema", () => {
    it("should identify streamableHttp config", () => {
      expect(
        isStreamableHttpConfigSchema({
          type: "streamableHttp",
          url: "https://example.com",
          timeout: 60,
          disabled: false,
        })
      ).toBe(true);
    });
  });

  describe("isRemoteConfigSchema", () => {
    it("should identify remote config", () => {
      expect(
        isRemoteConfigSchema({
          type: "remote",
          url: "https://example.com",
          timeout: 60,
          disabled: false,
        })
      ).toBe(true);
    });
  });

  describe("requiresUrl", () => {
    it("should return true for remote transports", () => {
      expect(
        requiresUrl({ type: "sse", url: "https://example.com", timeout: 60, disabled: false })
      ).toBe(true);
      expect(
        requiresUrl({
          type: "streamableHttp",
          url: "https://example.com",
          timeout: 60,
          disabled: false,
        })
      ).toBe(true);
      expect(
        requiresUrl({ type: "remote", url: "https://example.com", timeout: 60, disabled: false })
      ).toBe(true);
    });

    it("should return false for stdio transport", () => {
      expect(
        requiresUrl({ type: "stdio", command: "node", args: [], timeout: 60, disabled: false })
      ).toBe(false);
    });
  });
});

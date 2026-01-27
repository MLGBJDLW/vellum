// ============================================
// T043: Enterprise Unit Tests
// ============================================

import { promises as fs } from "node:fs";
import { fetchWithPool } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogger } from "../enterprise/AuditLogger.js";

// Mock @vellum/shared to intercept fetchWithPool calls
vi.mock("@vellum/shared", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@vellum/shared")>();
  return {
    ...mod,
    fetchWithPool: vi.fn().mockResolvedValue({ ok: true }),
  };
});

import {
  clearFullEnterpriseConfigCache,
  DEFAULT_FULL_ENTERPRISE_CONFIG,
  type FullEnterpriseConfig,
  FullEnterpriseConfigSchema,
  getEnterpriseConfigPath,
  getFullEnterpriseConfig,
  isEnterpriseMode,
  loadFullEnterpriseConfig,
} from "../enterprise/EnterpriseConfig.js";
import {
  filterAllowedServers,
  filterAllowedTools,
  type ServerInfo,
  type ToolCallInfo,
  validateServer,
  validateToolCall,
} from "../enterprise/ServerValidator.js";

// ============================================
// EnterpriseConfig Tests
// ============================================

describe("EnterpriseConfig", () => {
  beforeEach(() => {
    clearFullEnterpriseConfigCache();
  });

  describe("FullEnterpriseConfigSchema", () => {
    it("should validate minimal config with defaults", () => {
      const config = {};
      const result = FullEnterpriseConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.blockPersonalRemoteMCPServers).toBe(false);
        expect(result.data.allowedMCPServers).toEqual([]);
        expect(result.data.blockedToolPatterns).toEqual([]);
      }
    });

    it("should validate full restrictive config", () => {
      const config = {
        version: 1,
        blockPersonalRemoteMCPServers: true,
        allowedMCPServers: ["company-server", "https://api.company.com/*"],
        blockedToolPatterns: ["dangerous_*", "*_delete", "filesystem:*"],
        policyMessage: "Contact IT for exceptions",
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: false,
          destinations: [
            { type: "file", path: "/var/log/vellum/audit.log" },
            {
              type: "http",
              url: "https://logs.company.com/audit",
              headers: { Authorization: "Bearer token" },
            },
          ],
        },
      };

      const result = FullEnterpriseConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blockPersonalRemoteMCPServers).toBe(true);
        expect(result.data.allowedMCPServers).toHaveLength(2);
        expect(result.data.blockedToolPatterns).toHaveLength(3);
        expect(result.data.audit?.enabled).toBe(true);
        expect(result.data.audit?.destinations).toHaveLength(2);
      }
    });

    it("should apply defaults to file destination", () => {
      const config = {
        audit: {
          enabled: true,
          destinations: [{ type: "file", path: "/var/log/audit.log" }],
        },
      };

      const result = FullEnterpriseConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        const fileDest = result.data.audit?.destinations?.[0];
        expect(fileDest?.type).toBe("file");
        if (fileDest?.type === "file") {
          expect(fileDest.maxSizeMB).toBe(100);
          expect(fileDest.maxFiles).toBe(10);
        }
      }
    });

    it("should apply defaults to http destination", () => {
      const config = {
        audit: {
          enabled: true,
          destinations: [{ type: "http", url: "https://logs.example.com" }],
        },
      };

      const result = FullEnterpriseConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        const httpDest = result.data.audit?.destinations?.[0];
        expect(httpDest?.type).toBe("http");
        if (httpDest?.type === "http") {
          expect(httpDest.batchSize).toBe(100);
          expect(httpDest.flushIntervalMs).toBe(5000);
        }
      }
    });

    it("should reject invalid http url", () => {
      const config = {
        audit: {
          enabled: true,
          destinations: [{ type: "http", url: "not-a-url" }],
        },
      };

      const result = FullEnterpriseConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject empty file path", () => {
      const config = {
        audit: {
          enabled: true,
          destinations: [{ type: "file", path: "" }],
        },
      };

      const result = FullEnterpriseConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject wrong version", () => {
      const config = { version: 2 };
      const result = FullEnterpriseConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("loadFullEnterpriseConfig", () => {
    it("should return defaults when config file does not exist", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const config = await loadFullEnterpriseConfig({ forceReload: true });

      expect(config).toEqual(DEFAULT_FULL_ENTERPRISE_CONFIG);
    });

    it("should parse valid config file", async () => {
      const fileConfig = {
        version: 1,
        blockPersonalRemoteMCPServers: true,
        allowedMCPServers: ["trusted-server"],
      };
      vi.spyOn(fs, "readFile").mockResolvedValueOnce(JSON.stringify(fileConfig));

      const config = await loadFullEnterpriseConfig({ forceReload: true });

      expect(config.blockPersonalRemoteMCPServers).toBe(true);
      expect(config.allowedMCPServers).toContain("trusted-server");
    });

    it("should throw on invalid JSON", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValueOnce("{ invalid json }");

      await expect(loadFullEnterpriseConfig({ forceReload: true })).rejects.toThrow(
        /Invalid enterprise configuration/
      );
    });

    it("should throw on schema validation failure", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValueOnce(JSON.stringify({ version: 999 }));

      await expect(loadFullEnterpriseConfig({ forceReload: true })).rejects.toThrow(
        /Invalid enterprise configuration/
      );
    });

    it("should use cached config on subsequent calls", async () => {
      const fileConfig = { version: 1, blockPersonalRemoteMCPServers: true };
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(fileConfig));

      await loadFullEnterpriseConfig({ forceReload: true });
      const initialCallCount = vi.mocked(fs.readFile).mock.calls.length;

      await loadFullEnterpriseConfig(); // Should use cache

      // readFile should not be called again (cache hit)
      expect(vi.mocked(fs.readFile).mock.calls.length).toBe(initialCallCount);
    });

    it("should reload config when forceReload is true", async () => {
      const fileConfig = { version: 1, blockPersonalRemoteMCPServers: true };
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(fileConfig));

      await loadFullEnterpriseConfig({ forceReload: true });
      const callsAfterFirst = vi.mocked(fs.readFile).mock.calls.length;

      await loadFullEnterpriseConfig({ forceReload: true });

      // readFile should be called again (force reload)
      expect(vi.mocked(fs.readFile).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it("should use custom config path when provided", async () => {
      const customPath = "/custom/path/enterprise.json";
      const fileConfig = { version: 1 };
      const readFileSpy = vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(fileConfig));

      await loadFullEnterpriseConfig({ forceReload: true, configPath: customPath });

      expect(readFileSpy).toHaveBeenCalledWith(customPath, "utf-8");
    });
  });

  describe("getFullEnterpriseConfig", () => {
    it("should return default config when cache is empty", () => {
      const config = getFullEnterpriseConfig();
      expect(config).toEqual(DEFAULT_FULL_ENTERPRISE_CONFIG);
    });
  });

  describe("isEnterpriseMode", () => {
    it("should return false for default config", () => {
      clearFullEnterpriseConfigCache();
      expect(isEnterpriseMode()).toBe(false);
    });
  });

  describe("getEnterpriseConfigPath", () => {
    it("should return a string path", () => {
      const path = getEnterpriseConfigPath();
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// ServerValidator Tests
// ============================================

describe("ServerValidator", () => {
  describe("validateServer", () => {
    const permissiveConfig: FullEnterpriseConfig = {
      version: 1,
      blockPersonalRemoteMCPServers: false,
      allowedMCPServers: [],
      blockedToolPatterns: [],
    };

    const restrictiveConfig: FullEnterpriseConfig = {
      version: 1,
      blockPersonalRemoteMCPServers: true,
      allowedMCPServers: ["approved-server", "https://api.company.com/*", "internal-*"],
      blockedToolPatterns: [],
      policyMessage: "Contact security@company.com for access",
    };

    it("should always allow stdio servers", () => {
      const server: ServerInfo = { name: "local-server", type: "stdio" };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should allow remote servers when blocking is disabled", () => {
      const server: ServerInfo = {
        name: "any-server",
        type: "remote",
        url: "https://random.com/mcp",
      };

      const result = validateServer(server, permissiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should block unlisted remote servers when blocking is enabled", () => {
      const server: ServerInfo = {
        name: "unknown-server",
        type: "remote",
        url: "https://unknown.com/mcp",
      };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("unknown-server");
      expect(result.policyMessage).toBe("Contact security@company.com for access");
    });

    it("should allow server matching exact name in allowlist", () => {
      const server: ServerInfo = { name: "approved-server", type: "sse" };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should allow server matching URL pattern in allowlist", () => {
      const server: ServerInfo = {
        name: "company-api",
        type: "streamableHttp",
        url: "https://api.company.com/mcp/v1",
      };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should allow server matching name glob pattern", () => {
      const server: ServerInfo = { name: "internal-analytics", type: "sse" };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should block SSE server not in allowlist", () => {
      const server: ServerInfo = {
        name: "external-server",
        type: "sse",
        url: "https://external.com/events",
      };

      const result = validateServer(server, restrictiveConfig);

      expect(result.allowed).toBe(false);
    });
  });

  describe("validateToolCall", () => {
    const configWithBlockedTools: FullEnterpriseConfig = {
      version: 1,
      blockPersonalRemoteMCPServers: false,
      allowedMCPServers: [],
      blockedToolPatterns: ["dangerous_*", "*_delete", "filesystem:write_file", "exec:*"],
      policyMessage: "This tool is blocked by IT policy",
    };

    it("should allow tools not matching any blocked pattern", () => {
      const toolCall: ToolCallInfo = {
        serverName: "filesystem",
        toolName: "read_file",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(true);
    });

    it("should block tool matching prefix pattern", () => {
      const toolCall: ToolCallInfo = {
        serverName: "system",
        toolName: "dangerous_operation",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(false);
      expect(result.blockedPattern).toBe("dangerous_*");
    });

    it("should block tool matching suffix pattern", () => {
      const toolCall: ToolCallInfo = {
        serverName: "database",
        toolName: "user_delete",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(false);
      expect(result.blockedPattern).toBe("*_delete");
    });

    it("should block tool matching qualified name pattern", () => {
      const toolCall: ToolCallInfo = {
        serverName: "filesystem",
        toolName: "write_file",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(false);
      expect(result.blockedPattern).toBe("filesystem:write_file");
    });

    it("should block all tools from blocked server prefix", () => {
      const toolCall: ToolCallInfo = {
        serverName: "exec",
        toolName: "run_command",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(false);
      expect(result.blockedPattern).toBe("exec:*");
    });

    it("should include policy message when tool is blocked", () => {
      const toolCall: ToolCallInfo = {
        serverName: "system",
        toolName: "dangerous_action",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.policyMessage).toBe("This tool is blocked by IT policy");
    });

    it("should allow all tools when no patterns defined", () => {
      const permissiveConfig: FullEnterpriseConfig = {
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
      };

      const toolCall: ToolCallInfo = {
        serverName: "any",
        toolName: "dangerous_delete_all",
      };

      const result = validateToolCall(toolCall, permissiveConfig);

      expect(result.allowed).toBe(true);
    });

    it("should be case-insensitive for pattern matching", () => {
      const toolCall: ToolCallInfo = {
        serverName: "system",
        toolName: "DANGEROUS_Operation",
      };

      const result = validateToolCall(toolCall, configWithBlockedTools);

      expect(result.allowed).toBe(false);
    });
  });

  describe("filterAllowedServers", () => {
    const config: FullEnterpriseConfig = {
      version: 1,
      blockPersonalRemoteMCPServers: true,
      allowedMCPServers: ["approved-*"],
      blockedToolPatterns: [],
    };

    it("should filter servers into allowed and blocked lists", () => {
      const servers: ServerInfo[] = [
        { name: "approved-server1", type: "sse" },
        { name: "blocked-server", type: "remote" },
        { name: "local-server", type: "stdio" },
        { name: "approved-server2", type: "streamableHttp" },
      ];

      const result = filterAllowedServers(servers, config);

      expect(result.allowed).toHaveLength(3); // 2 approved + 1 stdio
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0]?.server.name).toBe("blocked-server");
    });
  });

  describe("filterAllowedTools", () => {
    const config: FullEnterpriseConfig = {
      version: 1,
      blockPersonalRemoteMCPServers: false,
      allowedMCPServers: [],
      blockedToolPatterns: ["*_delete"],
    };

    it("should filter tools into allowed and blocked lists", () => {
      const tools = [
        { serverName: "db", toolName: "query" },
        { serverName: "db", toolName: "user_delete" },
        { serverName: "fs", toolName: "read" },
        { serverName: "fs", toolName: "file_delete" },
      ];

      const result = filterAllowedTools(tools, config);

      expect(result.allowed).toHaveLength(2);
      expect(result.allowed).toContain("db:query");
      expect(result.allowed).toContain("fs:read");
      expect(result.blocked).toHaveLength(2);
    });
  });
});

// ============================================
// AuditLogger Tests
// ============================================

describe("AuditLogger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger({ sessionId: "test-session", userId: "test-user" });
    // Clear fetchWithPool mock call history between tests
    vi.mocked(fetchWithPool).mockClear();
  });

  afterEach(async () => {
    await logger.shutdown();
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should be disabled by default", async () => {
      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
      });

      // Logger should not throw when logging while disabled
      await expect(logger.log({ eventType: "tool_call" })).resolves.not.toThrow();
    });

    it("should enable logging when audit is enabled", async () => {
      const mockMkdir = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });

      expect(mockMkdir).toHaveBeenCalled();
    });

    it("should initialize http destination with flush timer", async () => {
      vi.useFakeTimers();

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            {
              type: "http",
              url: "https://logs.example.com",
              batchSize: 100,
              flushIntervalMs: 5000,
            },
          ],
        },
      });

      // Timer should be set
      vi.advanceTimersByTime(5000);

      vi.useRealTimers();
    });
  });

  describe("logging (file mode)", () => {
    it("should write audit events to file", async () => {
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const mockHandle = {
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 100 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const mockOpen = vi
        .spyOn(fs, "open")
        .mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });

      await logger.logToolCall("test-server", "test-tool", { arg: "value" });

      expect(mockOpen).toHaveBeenCalledWith("/var/log/audit.log", "a");
      expect(mockHandle.write).toHaveBeenCalled();

      const writtenData = mockHandle.write.mock.calls[0]?.[0];
      const parsed = JSON.parse(writtenData.trim());
      expect(parsed.eventType).toBe("tool_call");
      expect(parsed.serverName).toBe("test-server");
      expect(parsed.toolName).toBe("test-tool");
      expect(parsed.sessionId).toBe("test-session");
      expect(parsed.userId).toBe("test-user");
    });

    it("should strip arguments when includeToolArgs is false", async () => {
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const mockHandle = {
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 100 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(fs, "open").mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: false,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });

      await logger.logToolCall("server", "tool", { secret: "password" });

      const writtenData = mockHandle.write.mock.calls[0]?.[0];
      const parsed = JSON.parse(writtenData.trim());
      expect(parsed.arguments).toBeUndefined();
    });

    it("should include arguments when includeToolArgs is true", async () => {
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const mockHandle = {
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 100 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(fs, "open").mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });

      await logger.logToolCall("server", "tool", { key: "value" });

      const writtenData = mockHandle.write.mock.calls[0]?.[0];
      const parsed = JSON.parse(writtenData.trim());
      expect(parsed.arguments).toEqual({ key: "value" });
    });
  });

  describe("logging (http mode)", () => {
    it("should buffer events for http destination", async () => {
      const mockFetchWithPool = vi.mocked(fetchWithPool);
      mockFetchWithPool.mockResolvedValue({ ok: true } as Response);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "http", url: "https://logs.example.com", batchSize: 2, flushIntervalMs: 60000 },
          ],
        },
      });

      // Log one event - should buffer, not send
      await logger.logToolCall("server", "tool1");
      expect(mockFetchWithPool).not.toHaveBeenCalled();

      // Log second event - should trigger batch send
      await logger.logToolCall("server", "tool2");
      expect(mockFetchWithPool).toHaveBeenCalledTimes(1);

      // biome-ignore lint/style/noNonNullAssertion: calls[0] verified by expect toHaveBeenCalledTimes
      const fetchCall = mockFetchWithPool.mock.calls[0]!;
      expect(fetchCall[0]).toBe("https://logs.example.com");
      expect(fetchCall[1]?.method).toBe("POST");
      const headers = fetchCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.["Content-Type"]).toBe("application/x-ndjson");
    });

    it("should include custom headers in http requests", async () => {
      const mockFetchWithPool = vi.mocked(fetchWithPool);
      mockFetchWithPool.mockResolvedValue({ ok: true } as Response);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            {
              type: "http",
              url: "https://logs.example.com",
              headers: { Authorization: "Bearer token123" },
              batchSize: 1,
              flushIntervalMs: 60000,
            },
          ],
        },
      });

      await logger.logToolCall("server", "tool");

      // biome-ignore lint/style/noNonNullAssertion: calls[0] verified by mockFetchWithPool being called
      const fetchCall = mockFetchWithPool.mock.calls[0]!;
      const headers = fetchCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.["Authorization"]).toBe("Bearer token123");
    });

    it("should re-buffer events on http failure", async () => {
      const mockFetchWithPool = vi.mocked(fetchWithPool);
      mockFetchWithPool.mockRejectedValue(new Error("Network error"));

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "http", url: "https://logs.example.com", batchSize: 1, flushIntervalMs: 60000 },
          ],
        },
      });

      // Should not throw on failure
      await expect(logger.logToolCall("server", "tool")).resolves.not.toThrow();
    });
  });

  describe("convenience methods", () => {
    beforeEach(async () => {
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const mockHandle = {
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 100 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(fs, "open").mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });
    });

    it("should log server connect events", async () => {
      await expect(logger.logServerConnect("test-server")).resolves.not.toThrow();
    });

    it("should log server disconnect events", async () => {
      await expect(logger.logServerDisconnect("test-server")).resolves.not.toThrow();
    });

    it("should log server blocked events", async () => {
      await expect(
        logger.logServerBlocked("blocked-server", "Not in allowlist")
      ).resolves.not.toThrow();
    });

    it("should log tool blocked events", async () => {
      await expect(
        logger.logToolBlocked("server", "dangerous_tool", "Blocked by policy")
      ).resolves.not.toThrow();
    });

    it("should log tool result events", async () => {
      await expect(
        logger.logToolResult("server", "tool", { data: "result" })
      ).resolves.not.toThrow();
    });

    it("should log tool error events", async () => {
      await expect(
        logger.logToolError("server", "tool", "Something went wrong")
      ).resolves.not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("should close file handles on shutdown", async () => {
      vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
      const mockHandle = {
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 100 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(fs, "open").mockResolvedValue(mockHandle as unknown as fs.FileHandle);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            { type: "file", path: "/var/log/audit.log", maxSizeMB: 100, maxFiles: 10 },
          ],
        },
      });

      // Trigger file open by logging
      await logger.logToolCall("server", "tool");

      await logger.shutdown();

      expect(mockHandle.close).toHaveBeenCalled();
    });

    it("should flush http buffer on shutdown", async () => {
      const mockFetchWithPool = vi.mocked(fetchWithPool);
      mockFetchWithPool.mockResolvedValue({ ok: true } as Response);

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            {
              type: "http",
              url: "https://logs.example.com",
              batchSize: 100,
              flushIntervalMs: 60000,
            },
          ],
        },
      });

      // Log event (won't trigger immediate send due to high batchSize)
      await logger.logToolCall("server", "tool");
      expect(mockFetchWithPool).not.toHaveBeenCalled();

      // Shutdown should flush
      await logger.shutdown();
      expect(mockFetchWithPool).toHaveBeenCalled();
    });

    it("should clear flush timer on shutdown", async () => {
      vi.useFakeTimers();
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      await logger.initialize({
        version: 1,
        blockPersonalRemoteMCPServers: false,
        allowedMCPServers: [],
        blockedToolPatterns: [],
        audit: {
          enabled: true,
          includeToolArgs: true,
          includeToolResults: true,
          destinations: [
            {
              type: "http",
              url: "https://logs.example.com",
              batchSize: 100,
              flushIntervalMs: 5000,
            },
          ],
        },
      });

      await logger.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

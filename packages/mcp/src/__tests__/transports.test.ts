// ============================================
// T021: Unit Tests for MCP Transports
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpTransportError } from "../errors.js";

// Create mock class factories
const createMockTransport = () => ({
  start: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

// Mock the MCP SDK transports with class constructors
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(function (this: any, options: any) {
    Object.assign(this, createMockTransport());
    this._options = options;
    this._process = null;
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (
    this: any,
    url: any,
    options: any
  ) {
    Object.assign(this, createMockTransport());
    this._url = url;
    this._options = options;
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn().mockImplementation(function (this: any, url: any, options: any) {
    Object.assign(this, createMockTransport());
    this._url = url;
    this._options = options;
  }),
}));

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
// Import after mocks are set up
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRemoteTransport, validateRemoteConfig } from "../transports/FallbackTransport.js";
import { createSSETransport, validateSseConfig } from "../transports/SSEAdapter.js";
import { createStdioTransport, validateStdioConfig } from "../transports/StdioAdapter.js";
import {
  createStreamableHttpTransport,
  validateStreamableHttpConfig,
} from "../transports/StreamableHttpAdapter.js";

describe("StdioAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createStdioTransport", () => {
    it("should create a stdio transport with command and args", async () => {
      const config = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      };

      const result = await createStdioTransport(config, {
        serverName: "test-server",
      });

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          stderr: "pipe",
        })
      );
    });

    it("should expand environment variables", async () => {
      // Set up environment variable
      process.env.TEST_VAR = "test-value";

      const config = {
        command: "node",
        args: ["server.js"],
        env: {
          CUSTOM_VAR: "${env:TEST_VAR}",
        },
      };

      await createStdioTransport(config, { serverName: "test-server" });

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: "test-value",
          }),
        })
      );

      // Clean up
      delete process.env.TEST_VAR;
    });

    it("should merge with process.env", async () => {
      const config = {
        command: "node",
        args: ["server.js"],
        env: {
          CUSTOM_VAR: "custom-value",
        },
      };

      await createStdioTransport(config, { serverName: "test-server" });

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            PATH: process.env.PATH, // Should inherit from process.env
            CUSTOM_VAR: "custom-value",
          }),
        })
      );
    });

    it("should pass cwd when provided", async () => {
      const config = {
        command: "node",
        args: ["server.js"],
        cwd: "/path/to/directory",
      };

      await createStdioTransport(config, { serverName: "test-server" });

      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/path/to/directory",
        })
      );
    });

    it("should handle close correctly", async () => {
      const config = { command: "node", args: ["server.js"] };
      const result = await createStdioTransport(config, { serverName: "test-server" });

      await result.close();

      expect(result.transport.close).toHaveBeenCalled();
    });
  });

  describe("validateStdioConfig", () => {
    it("should return empty array for valid config", () => {
      const errors = validateStdioConfig({
        command: "node",
        args: ["server.js"],
      });

      expect(errors).toEqual([]);
    });

    it("should return error for missing command", () => {
      const errors = validateStdioConfig({
        command: "",
      });

      expect(errors).toContain("Command is required and must be a string");
    });

    it("should return error for non-array args", () => {
      const errors = validateStdioConfig({
        command: "node",
        args: "not-an-array" as unknown as string[],
      });

      expect(errors).toContain("Args must be an array of strings");
    });

    it("should return error for non-string args elements", () => {
      const errors = validateStdioConfig({
        command: "node",
        args: [123 as unknown as string],
      });

      expect(errors).toContain("All args must be strings");
    });

    it("should return error for non-string cwd", () => {
      const errors = validateStdioConfig({
        command: "node",
        cwd: 123 as unknown as string,
      });

      expect(errors).toContain("Cwd must be a string");
    });

    it("should return error for non-object env", () => {
      const errors = validateStdioConfig({
        command: "node",
        env: "not-an-object" as unknown as Record<string, string>,
      });

      expect(errors).toContain("Env must be an object");
    });
  });
});

describe("StreamableHttpAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createStreamableHttpTransport", () => {
    it("should create a transport with URL", async () => {
      const config = {
        type: "streamableHttp" as const,
        url: "https://mcp.example.com/api",
      };

      const result = await createStreamableHttpTransport(config, {
        serverName: "test-server",
      });

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL("https://mcp.example.com/api"),
        expect.any(Object)
      );
    });

    it("should pass headers in requestInit", async () => {
      const config = {
        type: "streamableHttp" as const,
        url: "https://mcp.example.com/api",
        headers: {
          Authorization: "Bearer token",
          "X-Custom": "value",
        },
      };

      await createStreamableHttpTransport(config, { serverName: "test-server" });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: {
            headers: {
              Authorization: "Bearer token",
              "X-Custom": "value",
            },
          },
        })
      );
    });

    it("should pass authProvider when provided", async () => {
      const mockAuthProvider = {
        redirectUrl: "http://localhost:3333/callback",
        clientMetadata: { redirect_uris: ["http://localhost:3333/callback"] },
        clientInformation: vi.fn().mockReturnValue(undefined),
        tokens: vi.fn(),
        saveTokens: vi.fn(),
        redirectToAuthorization: vi.fn(),
        saveCodeVerifier: vi.fn(),
        codeVerifier: vi.fn(),
      };

      const config = {
        type: "streamableHttp" as const,
        url: "https://mcp.example.com/api",
      };

      await createStreamableHttpTransport(config, {
        serverName: "test-server",
        authProvider: mockAuthProvider,
      });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          authProvider: mockAuthProvider,
        })
      );
    });

    it("should throw McpTransportError for invalid URL", async () => {
      const config = {
        type: "streamableHttp" as const,
        url: "not-a-valid-url",
      };

      await expect(
        createStreamableHttpTransport(config, { serverName: "test-server" })
      ).rejects.toThrow(McpTransportError);
    });

    it("should handle close correctly", async () => {
      const config = {
        type: "streamableHttp" as const,
        url: "https://mcp.example.com/api",
      };

      const result = await createStreamableHttpTransport(config, {
        serverName: "test-server",
      });

      await result.close();

      expect(result.transport.close).toHaveBeenCalled();
    });
  });

  describe("validateStreamableHttpConfig", () => {
    it("should return empty array for valid config", () => {
      const errors = validateStreamableHttpConfig({
        type: "streamableHttp",
        url: "https://mcp.example.com/api",
      });

      expect(errors).toEqual([]);
    });

    it("should return error for missing URL", () => {
      const errors = validateStreamableHttpConfig({
        type: "streamableHttp",
        url: "",
      });

      expect(errors).toContain("URL is required and must be a string");
    });

    it("should return error for invalid URL", () => {
      const errors = validateStreamableHttpConfig({
        type: "streamableHttp",
        url: "not-a-url",
      });

      expect(errors).toContain("URL is not a valid URL");
    });

    it("should return error for non-http protocol", () => {
      const errors = validateStreamableHttpConfig({
        type: "streamableHttp",
        url: "ftp://example.com",
      });

      expect(errors).toContain("URL must use http or https protocol");
    });

    it("should return error for non-object headers", () => {
      const errors = validateStreamableHttpConfig({
        type: "streamableHttp",
        url: "https://mcp.example.com",
        headers: "not-an-object" as unknown as Record<string, string>,
      });

      expect(errors).toContain("Headers must be an object");
    });
  });
});

describe("SSEAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSSETransport", () => {
    it("should create a transport with URL", async () => {
      const config = {
        type: "sse" as const,
        url: "https://mcp.example.com/sse",
      };

      const result = await createSSETransport(config, {
        serverName: "test-server",
      });

      expect(result.transport).toBeDefined();
      expect(result.close).toBeInstanceOf(Function);
      expect(SSEClientTransport).toHaveBeenCalledWith(
        new URL("https://mcp.example.com/sse"),
        expect.any(Object)
      );
    });

    it("should log deprecation warning when logger provided", async () => {
      const mockLogger = {
        warn: vi.fn(),
      };

      const config = {
        type: "sse" as const,
        url: "https://mcp.example.com/sse",
      };

      await createSSETransport(config, {
        serverName: "test-server",
        logger: mockLogger,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("SSE transport is deprecated")
      );
    });

    it("should pass headers in requestInit", async () => {
      const config = {
        type: "sse" as const,
        url: "https://mcp.example.com/sse",
        headers: {
          Authorization: "Bearer token",
        },
      };

      await createSSETransport(config, { serverName: "test-server" });

      expect(SSEClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: {
            headers: {
              Authorization: "Bearer token",
            },
          },
        })
      );
    });

    it("should pass authProvider when provided", async () => {
      const mockAuthProvider = {
        redirectUrl: "http://localhost:3333/callback",
        clientMetadata: { redirect_uris: ["http://localhost:3333/callback"] },
        clientInformation: vi.fn().mockReturnValue(undefined),
        tokens: vi.fn(),
        saveTokens: vi.fn(),
        redirectToAuthorization: vi.fn(),
        saveCodeVerifier: vi.fn(),
        codeVerifier: vi.fn(),
      };

      const config = {
        type: "sse" as const,
        url: "https://mcp.example.com/sse",
      };

      await createSSETransport(config, {
        serverName: "test-server",
        authProvider: mockAuthProvider,
      });

      expect(SSEClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          authProvider: mockAuthProvider,
        })
      );
    });

    it("should throw McpTransportError for invalid URL", async () => {
      const config = {
        type: "sse" as const,
        url: "not-a-valid-url",
      };

      await expect(createSSETransport(config, { serverName: "test-server" })).rejects.toThrow(
        McpTransportError
      );
    });
  });

  describe("validateSseConfig", () => {
    it("should return empty array for valid config", () => {
      const errors = validateSseConfig({
        type: "sse",
        url: "https://mcp.example.com/sse",
      });

      expect(errors).toEqual([]);
    });

    it("should return error for missing URL", () => {
      const errors = validateSseConfig({
        type: "sse",
        url: "",
      });

      expect(errors).toContain("URL is required and must be a string");
    });

    it("should return error for invalid URL", () => {
      const errors = validateSseConfig({
        type: "sse",
        url: "not-a-url",
      });

      expect(errors).toContain("URL is not a valid URL");
    });

    it("should return error for non-http protocol", () => {
      const errors = validateSseConfig({
        type: "sse",
        url: "ftp://example.com",
      });

      expect(errors).toContain("URL must use http or https protocol");
    });
  });
});

describe("FallbackTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRemoteTransport", () => {
    it("should try Streamable HTTP first and succeed", async () => {
      const mockLogger = {
        debug: vi.fn(),
        warn: vi.fn(),
      };

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      const result = await createRemoteTransport(config, {
        serverName: "test-server",
        logger: mockLogger,
      });

      expect(result.transportType).toBe("streamableHttp");
      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
      expect(SSEClientTransport).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Attempting Streamable HTTP")
      );
    });

    it("should fall back to SSE when Streamable HTTP fails", async () => {
      // Make StreamableHTTPClientTransport throw
      vi.mocked(StreamableHTTPClientTransport).mockImplementationOnce(() => {
        throw new Error("Streamable HTTP not supported");
      });

      const mockLogger = {
        debug: vi.fn(),
        warn: vi.fn(),
      };

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      const result = await createRemoteTransport(config, {
        serverName: "test-server",
        logger: mockLogger,
      });

      expect(result.transportType).toBe("sse");
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("trying SSE fallback"));
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Connected using SSE fallback")
      );
    });

    it("should skip Streamable HTTP when skipStreamableHttp is true", async () => {
      const mockLogger = {
        debug: vi.fn(),
        warn: vi.fn(),
      };

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      const result = await createRemoteTransport(config, {
        serverName: "test-server",
        logger: mockLogger,
        skipStreamableHttp: true,
      });

      expect(result.transportType).toBe("sse");
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
      expect(SSEClientTransport).toHaveBeenCalled();
    });

    it("should throw when both transports fail", async () => {
      // Make both transports throw
      vi.mocked(StreamableHTTPClientTransport).mockImplementationOnce(() => {
        throw new Error("Streamable HTTP failed");
      });
      vi.mocked(SSEClientTransport).mockImplementationOnce(() => {
        throw new Error("SSE failed");
      });

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      await expect(createRemoteTransport(config, { serverName: "test-server" })).rejects.toThrow(
        McpTransportError
      );
    });

    it("should include both error messages when both fail", async () => {
      vi.mocked(StreamableHTTPClientTransport).mockImplementationOnce(() => {
        throw new Error("HTTP error");
      });
      vi.mocked(SSEClientTransport).mockImplementationOnce(() => {
        throw new Error("SSE error");
      });

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      try {
        await createRemoteTransport(config, { serverName: "test-server" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(McpTransportError);
        expect((error as McpTransportError).message).toContain("HTTP error");
        expect((error as McpTransportError).message).toContain("SSE error");
      }
    });

    it("should pass headers to both transport attempts", async () => {
      // Make Streamable HTTP fail so SSE is tried
      vi.mocked(StreamableHTTPClientTransport).mockImplementationOnce(() => {
        throw new Error("Streamable HTTP not supported");
      });

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
        headers: {
          Authorization: "Bearer token",
        },
      };

      await createRemoteTransport(config, { serverName: "test-server" });

      // Check that headers were passed to SSE
      expect(SSEClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: {
            headers: {
              Authorization: "Bearer token",
            },
          },
        })
      );
    });

    it("should pass authProvider through", async () => {
      const mockAuthProvider = {
        redirectUrl: "http://localhost:3333/callback",
        clientMetadata: { redirect_uris: ["http://localhost:3333/callback"] },
        clientInformation: vi.fn().mockReturnValue(undefined),
        tokens: vi.fn(),
        saveTokens: vi.fn(),
        redirectToAuthorization: vi.fn(),
        saveCodeVerifier: vi.fn(),
        codeVerifier: vi.fn(),
      };

      const config = {
        type: "remote" as const,
        url: "https://mcp.example.com",
      };

      await createRemoteTransport(config, {
        serverName: "test-server",
        authProvider: mockAuthProvider,
      });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          authProvider: mockAuthProvider,
        })
      );
    });
  });

  describe("validateRemoteConfig", () => {
    it("should return empty array for valid config", () => {
      const errors = validateRemoteConfig({
        type: "remote",
        url: "https://mcp.example.com",
      });

      expect(errors).toEqual([]);
    });

    it("should return error for missing URL", () => {
      const errors = validateRemoteConfig({
        type: "remote",
        url: "",
      });

      expect(errors).toContain("URL is required and must be a string");
    });

    it("should return error for invalid URL", () => {
      const errors = validateRemoteConfig({
        type: "remote",
        url: "not-a-url",
      });

      expect(errors).toContain("URL is not a valid URL");
    });

    it("should return error for non-http protocol", () => {
      const errors = validateRemoteConfig({
        type: "remote",
        url: "ftp://example.com",
      });

      expect(errors).toContain("URL must use http or https protocol");
    });

    it("should return error for non-object headers", () => {
      const errors = validateRemoteConfig({
        type: "remote",
        url: "https://mcp.example.com",
        headers: "not-an-object" as unknown as Record<string, string>,
      });

      expect(errors).toContain("Headers must be an object");
    });
  });
});

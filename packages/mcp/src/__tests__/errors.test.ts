// ============================================
// T007: Unit Tests for MCP Errors
// ============================================

import { describe, expect, it } from "vitest";
import {
  isAuthRequiredError,
  isMcpError,
  McpConfigError,
  McpConnectionError,
  McpError,
  McpErrorCode,
  McpTimeoutError,
  McpToolError,
  McpTransportError,
  NeedsClientRegistrationError,
  OAuthTimeoutError,
} from "../errors.js";

describe("McpError", () => {
  describe("base class", () => {
    it("should create error with message and code", () => {
      const error = new McpError("Test error", McpErrorCode.MCP_CONNECTION);

      expect(error.message).toBe("Test error");
      expect(error.code).toBe(McpErrorCode.MCP_CONNECTION);
      expect(error.name).toBe("McpError");
      expect(error.isRetryable).toBe(false);
    });

    it("should include server name when provided", () => {
      const error = new McpError("Test error", McpErrorCode.MCP_CONNECTION, {
        serverName: "test-server",
      });

      expect(error.serverName).toBe("test-server");
    });

    it("should include context when provided", () => {
      const error = new McpError("Test error", McpErrorCode.MCP_CONNECTION, {
        context: { key: "value" },
      });

      expect(error.context).toEqual({ key: "value" });
    });

    it("should include cause when provided", () => {
      const cause = new Error("Underlying error");
      const error = new McpError("Test error", McpErrorCode.MCP_CONNECTION, {
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    it("should serialize to JSON correctly", () => {
      const cause = new Error("Underlying error");
      const error = new McpError("Test error", McpErrorCode.MCP_CONNECTION, {
        serverName: "test-server",
        context: { key: "value" },
        cause,
        isRetryable: true,
        retryDelay: 1000,
      });

      const json = error.toJSON();

      expect(json.name).toBe("McpError");
      expect(json.message).toBe("Test error");
      expect(json.code).toBe(McpErrorCode.MCP_CONNECTION);
      expect(json.serverName).toBe("test-server");
      expect(json.context).toEqual({ key: "value" });
      expect(json.cause).toBe("Underlying error");
      expect(json.isRetryable).toBe(true);
      expect(json.retryDelay).toBe(1000);
    });
  });
});

describe("McpConnectionError", () => {
  it("should create connection error with server name", () => {
    const error = new McpConnectionError("Connection failed", "my-server");

    expect(error.name).toBe("McpConnectionError");
    expect(error.code).toBe(McpErrorCode.MCP_CONNECTION);
    expect(error.serverName).toBe("my-server");
    expect(error.isRetryable).toBe(true);
    expect(error.retryDelay).toBe(1000);
  });

  it("should allow custom retry settings", () => {
    const error = new McpConnectionError("Connection failed", "my-server", {
      isRetryable: false,
      retryDelay: 5000,
    });

    expect(error.isRetryable).toBe(false);
    expect(error.retryDelay).toBe(5000);
  });
});

describe("McpTimeoutError", () => {
  it("should create timeout error with timeout duration", () => {
    const error = new McpTimeoutError("Operation timed out", "my-server", 30000);

    expect(error.name).toBe("McpTimeoutError");
    expect(error.code).toBe(McpErrorCode.MCP_TIMEOUT);
    expect(error.serverName).toBe("my-server");
    expect(error.timeoutMs).toBe(30000);
    expect(error.context?.timeoutMs).toBe(30000);
    expect(error.isRetryable).toBe(true);
    expect(error.retryDelay).toBe(500);
  });
});

describe("McpToolError", () => {
  it("should create tool error with tool name", () => {
    const error = new McpToolError("Tool execution failed", "my-server", "read_file");

    expect(error.name).toBe("McpToolError");
    expect(error.code).toBe(McpErrorCode.MCP_TOOL_ERROR);
    expect(error.serverName).toBe("my-server");
    expect(error.toolName).toBe("read_file");
    expect(error.context?.toolName).toBe("read_file");
    expect(error.isRetryable).toBe(false);
  });
});

describe("OAuthTimeoutError", () => {
  it("should create OAuth timeout error", () => {
    const error = new OAuthTimeoutError("OAuth flow timed out", "my-server");

    expect(error.name).toBe("OAuthTimeoutError");
    expect(error.code).toBe(McpErrorCode.OAUTH_TIMEOUT);
    expect(error.serverName).toBe("my-server");
    expect(error.isRetryable).toBe(false);
  });
});

describe("NeedsClientRegistrationError", () => {
  it("should create registration error without endpoint", () => {
    const error = new NeedsClientRegistrationError("Client registration required", "my-server");

    expect(error.name).toBe("NeedsClientRegistrationError");
    expect(error.code).toBe(McpErrorCode.NEEDS_CLIENT_REGISTRATION);
    expect(error.serverName).toBe("my-server");
    expect(error.registrationEndpoint).toBeUndefined();
    expect(error.isRetryable).toBe(false);
  });

  it("should include registration endpoint when provided", () => {
    const error = new NeedsClientRegistrationError(
      "Client registration required",
      "my-server",
      "https://example.com/register"
    );

    expect(error.registrationEndpoint).toBe("https://example.com/register");
    expect(error.context?.registrationEndpoint).toBe("https://example.com/register");
  });
});

describe("McpConfigError", () => {
  it("should create config error with validation errors", () => {
    const validationErrors = ["command is required", "timeout must be positive"];
    const error = new McpConfigError("Invalid configuration", "my-server", validationErrors);

    expect(error.name).toBe("McpConfigError");
    expect(error.code).toBe(McpErrorCode.CONFIG_INVALID);
    expect(error.serverName).toBe("my-server");
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.isRetryable).toBe(false);
  });
});

describe("McpTransportError", () => {
  it("should create transport error with transport type", () => {
    const error = new McpTransportError("Transport failed", "my-server", "streamableHttp");

    expect(error.name).toBe("McpTransportError");
    expect(error.code).toBe(McpErrorCode.TRANSPORT_ERROR);
    expect(error.serverName).toBe("my-server");
    expect(error.transportType).toBe("streamableHttp");
    expect(error.isRetryable).toBe(true);
    expect(error.retryDelay).toBe(1000);
  });
});

describe("isMcpError", () => {
  it("should return true for McpError instances", () => {
    const error = new McpError("Test", McpErrorCode.MCP_CONNECTION);
    expect(isMcpError(error)).toBe(true);
  });

  it("should return true for McpError subclass instances", () => {
    const error = new McpConnectionError("Test", "server");
    expect(isMcpError(error)).toBe(true);
  });

  it("should return false for regular Error", () => {
    const error = new Error("Test");
    expect(isMcpError(error)).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isMcpError(null)).toBe(false);
    expect(isMcpError(undefined)).toBe(false);
    expect(isMcpError("error")).toBe(false);
    expect(isMcpError({})).toBe(false);
  });
});

describe("isAuthRequiredError", () => {
  it("should return true for NeedsClientRegistrationError", () => {
    const error = new NeedsClientRegistrationError("Test", "server");
    expect(isAuthRequiredError(error)).toBe(true);
  });

  it("should return true for UnauthorizedError pattern", () => {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    expect(isAuthRequiredError(error)).toBe(true);
  });

  it("should return false for other MCP errors", () => {
    const error = new McpConnectionError("Test", "server");
    expect(isAuthRequiredError(error)).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isAuthRequiredError(null)).toBe(false);
    expect(isAuthRequiredError("error")).toBe(false);
  });
});

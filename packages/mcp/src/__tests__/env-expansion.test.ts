// ============================================
// T007: Unit Tests for Environment Variable Expansion
// ============================================
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Test file for environment variable expansion patterns like ${env:VAR}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  expandEnvironmentVariables,
  extractEnvironmentVariables,
  hasEnvironmentVariables,
  validateConfigEnvironmentVariables,
  validateEnvironmentVariables,
} from "../env-expansion.js";

describe("expandEnvironmentVariables", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment variables
    process.env.TEST_VAR = "test-value";
    process.env.API_KEY = "secret-key-123";
    process.env.EMPTY_VAR = "";
    process.env.NESTED_VAR = "nested";
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("string expansion", () => {
    it("should expand single environment variable", () => {
      const result = expandEnvironmentVariables("${env:TEST_VAR}");
      expect(result).toBe("test-value");
    });

    it("should expand multiple environment variables", () => {
      const result = expandEnvironmentVariables("${env:TEST_VAR}-${env:API_KEY}");
      expect(result).toBe("test-value-secret-key-123");
    });

    it("should expand variable with surrounding text", () => {
      const result = expandEnvironmentVariables("Bearer ${env:API_KEY}");
      expect(result).toBe("Bearer secret-key-123");
    });

    it("should return empty string for undefined variable", () => {
      const result = expandEnvironmentVariables("${env:UNDEFINED_VAR}");
      expect(result).toBe("");
    });

    it("should preserve empty string variable value", () => {
      const result = expandEnvironmentVariables("prefix-${env:EMPTY_VAR}-suffix");
      expect(result).toBe("prefix--suffix");
    });

    it("should not modify strings without env pattern", () => {
      const result = expandEnvironmentVariables("no-variables-here");
      expect(result).toBe("no-variables-here");
    });

    it("should not expand malformed patterns", () => {
      // Missing closing brace
      expect(expandEnvironmentVariables("${env:TEST_VAR")).toBe("${env:TEST_VAR");
      // Wrong prefix
      expect(expandEnvironmentVariables("${ENV:TEST_VAR}")).toBe("${ENV:TEST_VAR}");
      // No colon
      expect(expandEnvironmentVariables("${envTEST_VAR}")).toBe("${envTEST_VAR}");
    });
  });

  describe("array expansion", () => {
    it("should expand variables in arrays", () => {
      const result = expandEnvironmentVariables(["${env:TEST_VAR}", "static", "${env:API_KEY}"]);
      expect(result).toEqual(["test-value", "static", "secret-key-123"]);
    });

    it("should handle empty arrays", () => {
      const result = expandEnvironmentVariables([]);
      expect(result).toEqual([]);
    });

    it("should handle nested arrays", () => {
      const result = expandEnvironmentVariables([["${env:TEST_VAR}"], ["${env:API_KEY}"]]);
      expect(result).toEqual([["test-value"], ["secret-key-123"]]);
    });
  });

  describe("object expansion", () => {
    it("should expand variables in objects", () => {
      const config = {
        token: "${env:API_KEY}",
        name: "${env:TEST_VAR}",
      };

      const result = expandEnvironmentVariables(config);

      expect(result).toEqual({
        token: "secret-key-123",
        name: "test-value",
      });
    });

    it("should expand nested objects", () => {
      const config = {
        outer: {
          inner: {
            value: "${env:TEST_VAR}",
          },
        },
      };

      const result = expandEnvironmentVariables(config);

      expect(result).toEqual({
        outer: {
          inner: {
            value: "test-value",
          },
        },
      });
    });

    it("should handle mixed objects with arrays", () => {
      const config = {
        headers: {
          Authorization: "Bearer ${env:API_KEY}",
        },
        args: ["--token", "${env:TEST_VAR}"],
      };

      const result = expandEnvironmentVariables(config);

      expect(result).toEqual({
        headers: {
          Authorization: "Bearer secret-key-123",
        },
        args: ["--token", "test-value"],
      });
    });

    it("should handle null values", () => {
      const config = {
        value: null,
        other: "${env:TEST_VAR}",
      };

      const result = expandEnvironmentVariables(config);

      expect(result).toEqual({
        value: null,
        other: "test-value",
      });
    });
  });

  describe("primitive values", () => {
    it("should return numbers unchanged", () => {
      expect(expandEnvironmentVariables(42)).toBe(42);
      expect(expandEnvironmentVariables(3.14)).toBe(3.14);
    });

    it("should return booleans unchanged", () => {
      expect(expandEnvironmentVariables(true)).toBe(true);
      expect(expandEnvironmentVariables(false)).toBe(false);
    });

    it("should return null unchanged", () => {
      expect(expandEnvironmentVariables(null)).toBe(null);
    });

    it("should return undefined unchanged", () => {
      expect(expandEnvironmentVariables(undefined)).toBe(undefined);
    });
  });

  describe("real-world MCP config example", () => {
    it("should expand a complete MCP server config", () => {
      const config = {
        mcpServers: {
          github: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "${env:API_KEY}",
              NODE_ENV: "production",
            },
          },
          remote: {
            type: "streamableHttp",
            url: "https://api.example.com",
            headers: {
              Authorization: "Bearer ${env:API_KEY}",
              "X-Custom": "${env:TEST_VAR}",
            },
          },
        },
      };

      const result = expandEnvironmentVariables(config);

      expect(result.mcpServers.github.env.GITHUB_TOKEN).toBe("secret-key-123");
      expect(result.mcpServers.github.env.NODE_ENV).toBe("production");
      expect(result.mcpServers.remote.headers.Authorization).toBe("Bearer secret-key-123");
      expect(result.mcpServers.remote.headers["X-Custom"]).toBe("test-value");
    });
  });
});

describe("hasEnvironmentVariables", () => {
  it("should return true for strings with env pattern", () => {
    expect(hasEnvironmentVariables("${env:TEST_VAR}")).toBe(true);
    expect(hasEnvironmentVariables("Bearer ${env:API_KEY}")).toBe(true);
    expect(hasEnvironmentVariables("${env:A} and ${env:B}")).toBe(true);
  });

  it("should return false for strings without env pattern", () => {
    expect(hasEnvironmentVariables("no-variables")).toBe(false);
    expect(hasEnvironmentVariables("")).toBe(false);
    expect(hasEnvironmentVariables("$TEST_VAR")).toBe(false);
    expect(hasEnvironmentVariables("${TEST_VAR}")).toBe(false);
  });
});

describe("extractEnvironmentVariables", () => {
  it("should extract single variable name", () => {
    const result = extractEnvironmentVariables("${env:API_KEY}");
    expect(result).toEqual(["API_KEY"]);
  });

  it("should extract multiple variable names", () => {
    const result = extractEnvironmentVariables("${env:A} and ${env:B} and ${env:C}");
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("should return empty array for no variables", () => {
    const result = extractEnvironmentVariables("no variables here");
    expect(result).toEqual([]);
  });

  it("should handle duplicate variables", () => {
    const result = extractEnvironmentVariables("${env:A} ${env:A} ${env:B}");
    expect(result).toEqual(["A", "A", "B"]);
  });
});

describe("validateEnvironmentVariables", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DEFINED_VAR = "value";
    delete process.env.UNDEFINED_VAR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return valid for defined variables", () => {
    const result = validateEnvironmentVariables("${env:DEFINED_VAR}");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("should return missing for undefined variables", () => {
    const result = validateEnvironmentVariables("${env:UNDEFINED_VAR}");
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["UNDEFINED_VAR"]);
  });

  it("should handle mixed defined and undefined", () => {
    const result = validateEnvironmentVariables("${env:DEFINED_VAR} ${env:UNDEFINED_VAR}");
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["UNDEFINED_VAR"]);
  });

  it("should return valid for strings without variables", () => {
    const result = validateEnvironmentVariables("no variables");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

describe("validateConfigEnvironmentVariables", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DEFINED = "value";
    delete process.env.MISSING_1;
    delete process.env.MISSING_2;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should validate nested config", () => {
    const config = {
      headers: {
        Authorization: "${env:DEFINED}",
      },
      env: {
        TOKEN: "${env:MISSING_1}",
        SECRET: "${env:MISSING_2}",
      },
    };

    const result = validateConfigEnvironmentVariables(config);

    expect(result.valid).toBe(false);
    expect(result.missing).toContain("MISSING_1");
    expect(result.missing).toContain("MISSING_2");
    expect(result.missing).not.toContain("DEFINED");
  });

  it("should return valid for config with all defined variables", () => {
    const config = {
      token: "${env:DEFINED}",
      value: "static",
    };

    const result = validateConfigEnvironmentVariables(config);

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("should deduplicate missing variables", () => {
    const config = {
      a: "${env:MISSING_1}",
      b: "${env:MISSING_1}",
      c: "${env:MISSING_1}",
    };

    const result = validateConfigEnvironmentVariables(config);

    expect(result.missing).toEqual(["MISSING_1"]);
  });

  it("should handle arrays in config", () => {
    const config = {
      args: ["--token", "${env:MISSING_1}"],
    };

    const result = validateConfigEnvironmentVariables(config);

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["MISSING_1"]);
  });
});

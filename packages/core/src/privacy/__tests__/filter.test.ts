import { describe, expect, it } from "vitest";
import {
  PrivacyFilter,
  SENSITIVE_PATTERNS,
  type SensitivePattern,
  TelemetrySanitizer,
} from "../filter.js";

describe("PrivacyFilter", () => {
  describe("filterString", () => {
    const filter = new PrivacyFilter();

    it("redacts Anthropic API keys (sk-ant-xxx pattern)", () => {
      const input = "Using key sk-ant-api03-abcdefghijklmnopqrstuvwxyz12345";
      const result = filter.filterString(input);
      expect(result).toBe("Using key [ANTHROPIC_KEY_REDACTED]");
      expect(result).not.toContain("sk-ant-");
    });

    it("redacts OpenAI API keys (sk-xxx pattern)", () => {
      const input = "API key is sk-abcdefghijklmnopqrstuvwxyz12345";
      const result = filter.filterString(input);
      expect(result).toBe("API key is [OPENAI_KEY_REDACTED]");
      expect(result).not.toContain("sk-abcdef");
    });

    it("does not confuse Anthropic keys with OpenAI keys", () => {
      const anthropicKey = "sk-ant-api03-abcdefghijklmnopqrst";
      const openaiKey = "sk-abcdefghijklmnopqrstuvwxyz";

      expect(filter.filterString(anthropicKey)).toBe("[ANTHROPIC_KEY_REDACTED]");
      expect(filter.filterString(openaiKey)).toBe("[OPENAI_KEY_REDACTED]");
    });

    it("redacts Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload";
      const result = filter.filterString(input);
      expect(result).toBe("Authorization: Bearer [TOKEN_REDACTED]");
      expect(result).not.toContain("eyJ");
    });

    it("redacts private keys in PEM format", () => {
      const input = `Config:
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7h
-----END PRIVATE KEY-----
done`;
      const result = filter.filterString(input);
      expect(result).toBe("Config:\n[PRIVATE_KEY_REDACTED]\ndone");
      expect(result).not.toContain("BEGIN PRIVATE KEY");
    });

    it("redacts RSA private keys", () => {
      const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2Z3qX2BTLS4e
-----END RSA PRIVATE KEY-----`;
      const result = filter.filterString(input);
      expect(result).toBe("[PRIVATE_KEY_REDACTED]");
    });

    it("redacts generic API key patterns", () => {
      const filter = new PrivacyFilter();

      // apikey=value format
      expect(filter.filterString("apikey=abc123def456ghi789jkl")).toBe("[API_KEY_REDACTED]");
      // api_key=value format
      expect(filter.filterString("api_key=abc123def456ghi789jkl")).toBe("[API_KEY_REDACTED]");
      // API-KEY=value format
      expect(filter.filterString("API-KEY=abc123def456ghi789jkl")).toBe("[API_KEY_REDACTED]");
      // api_key:value format (no space)
      expect(filter.filterString("api_key:abc123def456ghi789jkl")).toBe("[API_KEY_REDACTED]");
    });

    it("redacts generic secrets", () => {
      const filter = new PrivacyFilter();

      // secret=value format
      expect(filter.filterString("secret=mysecretvalue123")).toBe("[SECRET_REDACTED]");
      // secret:value format
      expect(filter.filterString("secret:supersecret123")).toBe("[SECRET_REDACTED]");
      // secret_=value format
      expect(filter.filterString("secret_=abcd1234efgh56")).toBe("[SECRET_REDACTED]");
      // In config context
      expect(filter.filterString("config: secret=mypassword123")).toBe("config: [SECRET_REDACTED]");
    });

    it("redacts AWS access keys", () => {
      const input = "AWS key: AKIAIOSFODNN7EXAMPLE";
      const result = filter.filterString(input);
      expect(result).toBe("AWS key: [AWS_ACCESS_KEY_REDACTED]");
    });

    it("redacts Google API keys", () => {
      const input = "Google key: AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe";
      const result = filter.filterString(input);
      expect(result).toBe("Google key: [GOOGLE_API_KEY_REDACTED]");
    });

    it("redacts GitHub tokens", () => {
      const tokens = [
        "ghp_abcdefghijklmnopqrstuvwxyz1234567890", // PAT
        "gho_abcdefghijklmnopqrstuvwxyz1234567890", // OAuth
        "ghu_abcdefghijklmnopqrstuvwxyz1234567890", // User-to-server
        "ghs_abcdefghijklmnopqrstuvwxyz1234567890", // Server-to-server
        "ghr_abcdefghijklmnopqrstuvwxyz1234567890", // Refresh
      ];

      for (const token of tokens) {
        const result = filter.filterString(`Token: ${token}`);
        expect(result).toBe("Token: [GITHUB_TOKEN_REDACTED]");
      }
    });

    it("redacts multiple sensitive values in one string", () => {
      const input =
        "OpenAI: sk-abcdefghijklmnopqrstuvwxyz, Anthropic: sk-ant-api03-12345678901234567890";
      const result = filter.filterString(input);
      expect(result).toBe("OpenAI: [OPENAI_KEY_REDACTED], Anthropic: [ANTHROPIC_KEY_REDACTED]");
    });

    it("handles strings with no sensitive data", () => {
      const input = "Hello, this is a normal log message with no secrets.";
      const result = filter.filterString(input);
      expect(result).toBe(input);
    });

    it("handles empty strings", () => {
      expect(filter.filterString("")).toBe("");
    });

    it("handles long strings without catastrophic backtracking", () => {
      // Create a long string that could cause backtracking issues
      const longString = `${"a".repeat(10000)} sk-abcdefghijklmnopqrstuvwxyz ${"b".repeat(10000)}`;

      const start = performance.now();
      const result = filter.filterString(longString);
      const elapsed = performance.now() - start;

      expect(result).toContain("[OPENAI_KEY_REDACTED]");
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe("filterObject", () => {
    const filter = new PrivacyFilter();

    it("redacts sensitive field names", () => {
      const obj = {
        username: "john",
        password: "secret123",
        email: "john@example.com",
      };

      const result = filter.filterObject(obj);
      expect(result).toEqual({
        username: "john",
        password: "[REDACTED]",
        email: "john@example.com",
      });
    });

    it("redacts various sensitive field name variations", () => {
      const obj = {
        apiKey: "key123",
        api_key: "key456",
        accessToken: "token123",
        access_token: "token456",
        refreshToken: "refresh123",
        Authorization: "Bearer xyz",
        privateKey: "private123",
        credentials: { user: "admin" },
      };

      const result = filter.filterObject(obj);
      expect(result.apiKey).toBe("[REDACTED]");
      expect(result.api_key).toBe("[REDACTED]");
      expect(result.accessToken).toBe("[REDACTED]");
      expect(result.access_token).toBe("[REDACTED]");
      expect(result.refreshToken).toBe("[REDACTED]");
      expect(result.Authorization).toBe("[REDACTED]");
      expect(result.privateKey).toBe("[REDACTED]");
      expect(result.credentials).toBe("[REDACTED]");
    });

    it("filters nested objects recursively", () => {
      const obj = {
        user: {
          name: "John",
          details: {
            password: "secret",
            apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
          },
        },
        config: {
          url: "https://api.example.com?key=sk-abcdefghijklmnopqrstuvwxyz",
        },
      };

      const result = filter.filterObject(obj);
      expect(result.user.name).toBe("John");
      expect(result.user.details.password).toBe("[REDACTED]");
      expect(result.user.details.apiKey).toBe("[REDACTED]");
      expect(result.config.url).toBe("https://api.example.com?key=[OPENAI_KEY_REDACTED]");
    });

    it("redacts entire value when field name is sensitive", () => {
      const obj = {
        user: "john",
        auth: { nested: "data", key: "value" },
      };

      const result = filter.filterObject(obj);
      expect(result.user).toBe("john");
      expect(result.auth).toBe("[REDACTED]");
    });

    it("handles arrays correctly", () => {
      const obj = {
        keys: [
          "sk-abcdefghijklmnopqrstuvwxyz",
          "normal-value",
          "sk-ant-api03-12345678901234567890",
        ],
        users: [{ name: "John", password: "secret" }, { name: "Jane" }],
      };

      const result = filter.filterObject(obj);
      expect(result.keys).toEqual([
        "[OPENAI_KEY_REDACTED]",
        "normal-value",
        "[ANTHROPIC_KEY_REDACTED]",
      ]);
      expect((result.users[0] as Record<string, unknown>).password).toBe("[REDACTED]");
      expect((result.users[1] as Record<string, unknown>).name).toBe("Jane");
    });

    it("respects maxDepth parameter", () => {
      const deepObj = {
        level1: {
          level2: {
            level3: {
              secret: "should-be-redacted",
            },
          },
        },
      };

      const result = filter.filterObject(deepObj, 2);
      expect(result.level1.level2).toBe("[MAX_DEPTH_EXCEEDED]");
    });

    it("handles null and undefined values", () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: "test",
      };

      const result = filter.filterObject(obj);
      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
      expect(result.normalValue).toBe("test");
    });

    it("handles primitive values directly", () => {
      expect(filter.filterObject(42)).toBe(42);
      expect(filter.filterObject(true)).toBe(true);
      expect(filter.filterObject("sk-abcdefghijklmnopqrstuvwxyz")).toBe("[OPENAI_KEY_REDACTED]");
      expect(filter.filterObject(null)).toBeNull();
      expect(filter.filterObject(undefined)).toBeUndefined();
    });

    it("does not mutate the original object", () => {
      const original = {
        password: "secret123",
        nested: { token: "abc123" },
      };
      const originalCopy = JSON.parse(JSON.stringify(original));

      filter.filterObject(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe("custom patterns", () => {
    it("allows adding custom patterns", () => {
      const customPatterns: SensitivePattern[] = [
        { pattern: /CUSTOM-[A-Z0-9]{10}/g, replacement: "[CUSTOM_REDACTED]" },
      ];

      const filter = new PrivacyFilter(customPatterns);
      const input = "Custom token: CUSTOM-ABCD123456";

      expect(filter.filterString(input)).toBe("Custom token: [CUSTOM_REDACTED]");
    });

    it("custom patterns work alongside default patterns", () => {
      const customPatterns: SensitivePattern[] = [
        { pattern: /MY_SECRET_[a-z]+/g, replacement: "[MY_SECRET_REDACTED]" },
      ];

      const filter = new PrivacyFilter(customPatterns);
      const input = "Keys: MY_SECRET_value sk-abcdefghijklmnopqrstuvwxyz";

      const result = filter.filterString(input);
      expect(result).toBe("Keys: [MY_SECRET_REDACTED] [OPENAI_KEY_REDACTED]");
    });
  });

  describe("SENSITIVE_PATTERNS export", () => {
    it("exports the default patterns array", () => {
      expect(Array.isArray(SENSITIVE_PATTERNS)).toBe(true);
      expect(SENSITIVE_PATTERNS.length).toBeGreaterThan(0);
    });

    it("each pattern has required properties", () => {
      for (const pattern of SENSITIVE_PATTERNS) {
        expect(pattern).toHaveProperty("pattern");
        expect(pattern).toHaveProperty("replacement");
        expect(pattern.pattern).toBeInstanceOf(RegExp);
        expect(typeof pattern.replacement).toBe("string");
      }
    });
  });
});

describe("TelemetrySanitizer", () => {
  describe("sanitizeAttributes", () => {
    const sanitizer = new TelemetrySanitizer();

    it("removes prompt key from attributes", () => {
      const attributes = {
        "gen_ai.model": "gpt-4",
        prompt: "This is a user prompt",
        duration: 1000,
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("prompt");
      expect(result["gen_ai.model"]).toBe("gpt-4");
      expect(result.duration).toBe(1000);
    });

    it("removes response key from attributes", () => {
      const attributes = {
        model: "claude-3",
        response: "This is the AI response",
        tokens: 500,
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("response");
      expect(result.model).toBe("claude-3");
      expect(result.tokens).toBe(500);
    });

    it("removes input and output keys", () => {
      const attributes = {
        input: "User input data",
        output: "Model output data",
        latency: 250,
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("input");
      expect(result).not.toHaveProperty("output");
      expect(result.latency).toBe(250);
    });

    it("removes content and message keys", () => {
      const attributes = {
        content: "Message content",
        message: "Full message",
        status: "success",
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("content");
      expect(result).not.toHaveProperty("message");
      expect(result.status).toBe("success");
    });

    it("removes gen_ai.* prefixed sensitive keys", () => {
      const attributes = {
        "gen_ai.prompt": "The prompt text",
        "gen_ai.response": "The response text",
        "gen_ai.content": "The content",
        "gen_ai.model": "gpt-4",
        "gen_ai.tokens.input": 100,
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("gen_ai.prompt");
      expect(result).not.toHaveProperty("gen_ai.response");
      expect(result).not.toHaveProperty("gen_ai.content");
      expect(result["gen_ai.model"]).toBe("gpt-4");
      expect(result["gen_ai.tokens.input"]).toBe(100);
    });

    it("handles case-insensitive key matching", () => {
      const attributes = {
        PROMPT: "uppercase prompt",
        Response: "mixed case response",
        INPUT: "uppercase input",
        model: "gpt-4",
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result).not.toHaveProperty("PROMPT");
      expect(result).not.toHaveProperty("Response");
      expect(result).not.toHaveProperty("INPUT");
      expect(result.model).toBe("gpt-4");
    });

    it("filters string values for sensitive patterns", () => {
      const attributes = {
        error: "Authentication failed with key sk-abcdefghijklmnopqrstuvwxyz",
        model: "gpt-4",
        url: "https://api.openai.com",
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result.error).toBe("Authentication failed with key [OPENAI_KEY_REDACTED]");
      expect(result.model).toBe("gpt-4");
      expect(result.url).toBe("https://api.openai.com");
    });

    it("preserves non-string values without modification", () => {
      const attributes = {
        count: 42,
        success: true,
        metadata: { nested: "object" },
        tags: ["tag1", "tag2"],
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result.count).toBe(42);
      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({ nested: "object" });
      expect(result.tags).toEqual(["tag1", "tag2"]);
    });

    it("handles empty attributes", () => {
      const result = sanitizer.sanitizeAttributes({});
      expect(result).toEqual({});
    });

    it("does not mutate the original attributes", () => {
      const original = {
        prompt: "secret prompt",
        model: "gpt-4",
        error: "key: sk-abcdefghijklmnopqrstuvwxyz",
      };
      const originalCopy = JSON.parse(JSON.stringify(original));

      sanitizer.sanitizeAttributes(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe("custom PrivacyFilter", () => {
    it("uses provided PrivacyFilter instance", () => {
      const customPatterns: SensitivePattern[] = [
        { pattern: /CUSTOM_TOKEN_[A-Z0-9]+/g, replacement: "[CUSTOM_REDACTED]" },
      ];
      const customFilter = new PrivacyFilter(customPatterns);
      const sanitizer = new TelemetrySanitizer(customFilter);

      const attributes = {
        error: "Token was CUSTOM_TOKEN_ABC123",
        model: "gpt-4",
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result.error).toBe("Token was [CUSTOM_REDACTED]");
    });

    it("creates default PrivacyFilter if none provided", () => {
      const sanitizer = new TelemetrySanitizer();

      const attributes = {
        error: "Key: sk-abcdefghijklmnopqrstuvwxyz",
      };

      const result = sanitizer.sanitizeAttributes(attributes);
      expect(result.error).toBe("Key: [OPENAI_KEY_REDACTED]");
    });
  });
});

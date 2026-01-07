/**
 * Security Module Unit Tests
 *
 * Tests for the InputSanitizer class including:
 * - Input sanitization
 * - Path validation
 * - Shell metacharacter escaping
 *
 * Tests for the SensitiveDataHandler class including:
 * - Sensitive data detection
 * - Sensitive data masking
 * - Custom pattern registration
 *
 * @module cli/commands/__tests__/security
 */

import { describe, expect, it } from "vitest";

import {
  type CommandSecurityPolicy,
  createDefaultHandler,
  createPermissionChecker,
  InputSanitizer,
  PermissionChecker,
  SensitiveDataHandler,
} from "../security/index.js";

// =============================================================================
// T050: InputSanitizer Tests
// =============================================================================

describe("InputSanitizer", () => {
  const sanitizer = new InputSanitizer();

  // ===========================================================================
  // sanitize() Tests
  // ===========================================================================

  describe("sanitize", () => {
    it("should return empty string for empty input", () => {
      expect(sanitizer.sanitize("")).toBe("");
    });

    it("should return empty string for null/undefined input", () => {
      expect(sanitizer.sanitize(null as unknown as string)).toBe("");
      expect(sanitizer.sanitize(undefined as unknown as string)).toBe("");
    });

    it("should pass through safe input unchanged", () => {
      expect(sanitizer.sanitize("hello world")).toBe("hello world");
      expect(sanitizer.sanitize("file.txt")).toBe("file.txt");
      expect(sanitizer.sanitize("user@example.com")).toBe("user@example.com");
    });

    it("should remove pipe character", () => {
      expect(sanitizer.sanitize("cat file | grep test")).toBe("cat file  grep test");
    });

    it("should remove ampersand", () => {
      expect(sanitizer.sanitize("cmd1 && cmd2")).toBe("cmd1  cmd2");
      expect(sanitizer.sanitize("background &")).toBe("background ");
    });

    it("should remove semicolon", () => {
      expect(sanitizer.sanitize("cmd1; cmd2")).toBe("cmd1 cmd2");
    });

    it("should remove dollar sign", () => {
      expect(sanitizer.sanitize("echo $HOME")).toBe("echo HOME");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal string sanitization, not template
      expect(sanitizer.sanitize("${PATH}")).toBe("PATH");
    });

    it("should remove backticks", () => {
      expect(sanitizer.sanitize("`whoami`")).toBe("whoami");
    });

    it("should remove backslash", () => {
      expect(sanitizer.sanitize("path\\to\\file")).toBe("pathtofile");
    });

    it("should remove exclamation mark", () => {
      expect(sanitizer.sanitize("history!")).toBe("history");
    });

    it("should remove parentheses", () => {
      expect(sanitizer.sanitize("$(cmd)")).toBe("cmd");
      expect(sanitizer.sanitize("(subshell)")).toBe("subshell");
    });

    it("should remove curly braces", () => {
      expect(sanitizer.sanitize("{a,b,c}")).toBe("a,b,c");
    });

    it("should remove square brackets", () => {
      expect(sanitizer.sanitize("file[0-9]")).toBe("file0-9");
    });

    it("should remove angle brackets", () => {
      expect(sanitizer.sanitize("cmd > file")).toBe("cmd  file");
      expect(sanitizer.sanitize("cmd < input")).toBe("cmd  input");
    });

    it("should remove asterisk and question mark", () => {
      expect(sanitizer.sanitize("*.txt")).toBe(".txt");
      expect(sanitizer.sanitize("file?.log")).toBe("file.log");
    });

    it("should remove hash", () => {
      expect(sanitizer.sanitize("# comment")).toBe(" comment");
    });

    it("should remove tilde", () => {
      expect(sanitizer.sanitize("~/home")).toBe("/home");
    });

    it("should remove control characters", () => {
      expect(sanitizer.sanitize("hello\x00world")).toBe("helloworld");
      expect(sanitizer.sanitize("test\x1b[31m")).toBe("test31m");
    });

    it("should handle complex injection attempts", () => {
      expect(sanitizer.sanitize("hello; rm -rf /")).toBe("hello rm -rf /");
      expect(sanitizer.sanitize("$(cat /etc/passwd)")).toBe("cat /etc/passwd");
      expect(sanitizer.sanitize("`cat /etc/passwd`")).toBe("cat /etc/passwd");
    });
  });

  // ===========================================================================
  // validatePath() Tests
  // ===========================================================================

  describe("validatePath", () => {
    const allowedRoot = "/app/data";

    it("should return false for empty inputs", () => {
      expect(sanitizer.validatePath("", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("file.txt", "")).toBe(false);
      expect(sanitizer.validatePath("", "")).toBe(false);
    });

    it("should return false for null/undefined inputs", () => {
      expect(sanitizer.validatePath(null as unknown as string, allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("file.txt", null as unknown as string)).toBe(false);
    });

    it("should allow simple relative paths", () => {
      expect(sanitizer.validatePath("file.txt", allowedRoot)).toBe(true);
      expect(sanitizer.validatePath("subdir/file.txt", allowedRoot)).toBe(true);
    });

    it("should reject path traversal with ../", () => {
      expect(sanitizer.validatePath("../secret", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("subdir/../../../etc/passwd", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("../", allowedRoot)).toBe(false);
    });

    it("should reject path traversal with ..\\", () => {
      expect(sanitizer.validatePath("..\\secret", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("subdir\\..\\..\\secret", allowedRoot)).toBe(false);
    });

    it("should reject paths starting with ~", () => {
      expect(sanitizer.validatePath("~/secret", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("~user/secret", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("~", allowedRoot)).toBe(false);
    });

    it("should reject Unix absolute paths", () => {
      expect(sanitizer.validatePath("/etc/passwd", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("/", allowedRoot)).toBe(false);
    });

    it("should reject Windows absolute paths", () => {
      expect(sanitizer.validatePath("C:\\Windows\\System32", allowedRoot)).toBe(false);
      expect(sanitizer.validatePath("D:/data/file.txt", allowedRoot)).toBe(false);
    });

    it("should handle nested directories correctly", () => {
      expect(sanitizer.validatePath("a/b/c/file.txt", allowedRoot)).toBe(true);
      expect(sanitizer.validatePath("deep/nested/path/file.txt", allowedRoot)).toBe(true);
    });

    it("should use actual filesystem for real path validation", () => {
      // Use process.cwd() as a real path that exists
      const realRoot = process.cwd();
      expect(sanitizer.validatePath(".", realRoot)).toBe(true);
      expect(sanitizer.validatePath("subdir", realRoot)).toBe(true);
    });
  });

  // ===========================================================================
  // escapeShellMeta() Tests
  // ===========================================================================

  describe("escapeShellMeta", () => {
    it("should return empty string for empty input", () => {
      expect(sanitizer.escapeShellMeta("")).toBe("");
    });

    it("should return empty string for null/undefined input", () => {
      expect(sanitizer.escapeShellMeta(null as unknown as string)).toBe("");
      expect(sanitizer.escapeShellMeta(undefined as unknown as string)).toBe("");
    });

    it("should pass through safe input unchanged", () => {
      expect(sanitizer.escapeShellMeta("hello world")).toBe("hello world");
      expect(sanitizer.escapeShellMeta("file.txt")).toBe("file.txt");
    });

    it("should escape pipe character", () => {
      expect(sanitizer.escapeShellMeta("cat file | grep test")).toBe("cat file \\| grep test");
    });

    it("should escape ampersand", () => {
      expect(sanitizer.escapeShellMeta("cmd1 && cmd2")).toBe("cmd1 \\&\\& cmd2");
    });

    it("should escape semicolon", () => {
      expect(sanitizer.escapeShellMeta("cmd1; cmd2")).toBe("cmd1\\; cmd2");
    });

    it("should escape dollar sign", () => {
      expect(sanitizer.escapeShellMeta("echo $HOME")).toBe("echo \\$HOME");
    });

    it("should escape backticks", () => {
      expect(sanitizer.escapeShellMeta("`whoami`")).toBe("\\`whoami\\`");
    });

    it("should escape backslash", () => {
      expect(sanitizer.escapeShellMeta("path\\file")).toBe("path\\\\file");
    });

    it("should escape exclamation mark", () => {
      expect(sanitizer.escapeShellMeta("history!")).toBe("history\\!");
    });

    it("should escape parentheses", () => {
      expect(sanitizer.escapeShellMeta("(subshell)")).toBe("\\(subshell\\)");
    });

    it("should escape curly braces", () => {
      expect(sanitizer.escapeShellMeta("{a,b}")).toBe("\\{a,b\\}");
    });

    it("should escape square brackets", () => {
      expect(sanitizer.escapeShellMeta("file[0-9]")).toBe("file\\[0-9\\]");
    });

    it("should escape angle brackets", () => {
      expect(sanitizer.escapeShellMeta("cmd > file")).toBe("cmd \\> file");
      expect(sanitizer.escapeShellMeta("cmd < input")).toBe("cmd \\< input");
    });

    it("should escape asterisk and question mark", () => {
      expect(sanitizer.escapeShellMeta("*.txt")).toBe("\\*.txt");
      expect(sanitizer.escapeShellMeta("file?.log")).toBe("file\\?.log");
    });

    it("should escape hash", () => {
      expect(sanitizer.escapeShellMeta("# comment")).toBe("\\# comment");
    });

    it("should escape tilde", () => {
      expect(sanitizer.escapeShellMeta("~/home")).toBe("\\~/home");
    });

    it("should escape multiple metacharacters", () => {
      expect(sanitizer.escapeShellMeta("$(cmd) | grep *")).toBe("\\$\\(cmd\\) \\| grep \\*");
    });
  });

  // ===========================================================================
  // containsShellMeta() Tests
  // ===========================================================================

  describe("containsShellMeta", () => {
    it("should return false for empty input", () => {
      expect(sanitizer.containsShellMeta("")).toBe(false);
      expect(sanitizer.containsShellMeta(null as unknown as string)).toBe(false);
    });

    it("should return false for safe input", () => {
      expect(sanitizer.containsShellMeta("hello world")).toBe(false);
      expect(sanitizer.containsShellMeta("file.txt")).toBe(false);
    });

    it("should return true for input with metacharacters", () => {
      expect(sanitizer.containsShellMeta("cmd | grep")).toBe(true);
      expect(sanitizer.containsShellMeta("$HOME")).toBe(true);
      expect(sanitizer.containsShellMeta("`cmd`")).toBe(true);
    });
  });

  // ===========================================================================
  // containsPathTraversal() Tests
  // ===========================================================================

  describe("containsPathTraversal", () => {
    it("should return false for empty input", () => {
      expect(sanitizer.containsPathTraversal("")).toBe(false);
      expect(sanitizer.containsPathTraversal(null as unknown as string)).toBe(false);
    });

    it("should return false for safe paths", () => {
      expect(sanitizer.containsPathTraversal("file.txt")).toBe(false);
      expect(sanitizer.containsPathTraversal("subdir/file.txt")).toBe(false);
    });

    it("should return true for paths with traversal patterns", () => {
      expect(sanitizer.containsPathTraversal("../secret")).toBe(true);
      expect(sanitizer.containsPathTraversal("..\\secret")).toBe(true);
      expect(sanitizer.containsPathTraversal("~/home")).toBe(true);
      expect(sanitizer.containsPathTraversal("/etc/passwd")).toBe(true);
      expect(sanitizer.containsPathTraversal("C:\\Windows")).toBe(true);
    });
  });
});

// =============================================================================
// T051: SensitiveDataHandler Tests
// =============================================================================

describe("SensitiveDataHandler", () => {
  // ===========================================================================
  // Constructor and Pattern Management Tests
  // ===========================================================================

  describe("constructor and pattern management", () => {
    it("should create handler with no patterns", () => {
      const handler = new SensitiveDataHandler();
      expect(handler.getPatternNames()).toEqual([]);
    });

    it("should create handler with initial patterns", () => {
      const handler = new SensitiveDataHandler([{ name: "test", regex: /test-[a-z]+/g }]);
      expect(handler.getPatternNames()).toContain("test");
    });

    it("should add custom pattern", () => {
      const handler = new SensitiveDataHandler();
      handler.addPattern("custom", /custom-[0-9]+/);
      expect(handler.getPatternNames()).toContain("custom");
    });

    it("should ensure global flag on added patterns", () => {
      const handler = new SensitiveDataHandler();
      handler.addPattern("local", /local-[0-9]+/i);
      // Should be able to mask multiple occurrences
      const text = "local-123 and local-456";
      expect(handler.mask(text)).toBe("**** and ****");
    });

    it("should remove pattern", () => {
      const handler = new SensitiveDataHandler([{ name: "test", regex: /test/g }]);
      expect(handler.removePattern("test")).toBe(true);
      expect(handler.getPatternNames()).not.toContain("test");
    });

    it("should return false when removing non-existent pattern", () => {
      const handler = new SensitiveDataHandler();
      expect(handler.removePattern("nonexistent")).toBe(false);
    });
  });

  // ===========================================================================
  // isSensitive() Tests
  // ===========================================================================

  describe("isSensitive", () => {
    const handler = createDefaultHandler();

    it("should return false for empty/null input", () => {
      expect(handler.isSensitive("")).toBe(false);
      expect(handler.isSensitive(null as unknown as string)).toBe(false);
      expect(handler.isSensitive(undefined as unknown as string)).toBe(false);
    });

    it("should return false for safe text", () => {
      expect(handler.isSensitive("Hello world")).toBe(false);
      expect(handler.isSensitive("Just some normal text")).toBe(false);
    });

    it("should detect OpenAI keys", () => {
      expect(handler.isSensitive("sk-abcdefghijklmnopqrstuvwxyz1234567890")).toBe(true);
      expect(handler.isSensitive("My key is sk-proj-abc123def456ghi789jkl012")).toBe(true);
    });

    it("should detect GitHub tokens (fine-grained)", () => {
      expect(handler.isSensitive("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect GitHub tokens (classic)", () => {
      expect(handler.isSensitive("github_pat_abcdefghij1234567890_ABCD")).toBe(true);
    });

    it("should detect Anthropic keys", () => {
      expect(handler.isSensitive("sk-ant-api03-abc123def456ghi789")).toBe(true);
    });

    it("should detect Bearer tokens", () => {
      expect(handler.isSensitive("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(true);
    });

    it("should detect password assignments", () => {
      expect(handler.isSensitive("password=mysecret123")).toBe(true);
      expect(handler.isSensitive("pwd: secretvalue")).toBe(true);
    });

    it("should detect generic API keys", () => {
      expect(handler.isSensitive('api_key="abc123def456ghi789jkl0"')).toBe(true);
      expect(handler.isSensitive("apikey: xxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect connection string passwords", () => {
      expect(handler.isSensitive("mongodb://user:secretpass@localhost")).toBe(true);
    });
  });

  // ===========================================================================
  // mask() Tests
  // ===========================================================================

  describe("mask", () => {
    const handler = createDefaultHandler();

    it("should return empty string for null/undefined", () => {
      expect(handler.mask(null as unknown as string)).toBe("");
      expect(handler.mask(undefined as unknown as string)).toBe("");
    });

    it("should return empty string unchanged", () => {
      expect(handler.mask("")).toBe("");
    });

    it("should not modify safe text", () => {
      const text = "Hello, this is safe text!";
      expect(handler.mask(text)).toBe(text);
    });

    it("should mask OpenAI keys with first 4 and last 4 chars", () => {
      const result = handler.mask("Key: sk-proj-abcdefghij1234567890xyz");
      expect(result).toBe("Key: sk-p...0xyz");
    });

    it("should mask GitHub tokens", () => {
      const result = handler.mask("Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890");
      expect(result).toBe("Token: ghp_...7890");
    });

    it("should mask Anthropic keys", () => {
      const result = handler.mask("Key: sk-ant-api03-abc123def456789");
      expect(result).toBe("Key: sk-a...6789");
    });

    it("should mask Bearer tokens", () => {
      const result = handler.mask("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(result).toBe("Authorization: Bear...VCJ9");
    });

    it("should mask multiple sensitive values", () => {
      const text =
        "OpenAI: sk-abcd1234567890efghijk GitHub: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const masked = handler.mask(text);
      expect(masked).not.toContain("sk-abcd1234567890efghijk");
      expect(masked).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(masked).toContain("...");
    });

    it("should mask short sensitive values with ****", () => {
      const handler = new SensitiveDataHandler([{ name: "short", regex: /short-[a-z]{4}/g }]);
      expect(handler.mask("value: short-abcd")).toBe("value: ****");
    });

    it("should preserve surrounding text", () => {
      const result = handler.mask("Before sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx After");
      expect(result).toMatch(/^Before .+\.\.\..+ After$/);
    });
  });

  // ===========================================================================
  // Default Patterns Coverage Tests
  // ===========================================================================

  describe("default patterns", () => {
    const handler = createDefaultHandler();

    it("should detect and mask AWS access keys", () => {
      expect(handler.isSensitive("AKIAIOSFODNN7EXAMPLE")).toBe(true);
      expect(handler.mask("Key: AKIAIOSFODNN7EXAMPLE")).toBe("Key: AKIA...MPLE");
    });

    it("should detect and mask Stripe keys", () => {
      expect(handler.isSensitive("sk_test_abcdefghijklmnopqrstuvwxyz")).toBe(true);
      expect(handler.isSensitive("pk_live_abcdefghijklmnopqrstuvwxyz")).toBe(true);
    });

    it("should detect and mask Slack tokens", () => {
      expect(handler.isSensitive("xoxb-123456789012-1234567890123-abcdefghij")).toBe(true);
    });

    it("should detect and mask NPM tokens", () => {
      expect(handler.isSensitive("npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect and mask Google AI keys", () => {
      expect(handler.isSensitive("AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe")).toBe(true);
    });

    it("should detect GitHub OAuth tokens", () => {
      expect(handler.isSensitive("gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect GitHub App tokens", () => {
      expect(handler.isSensitive("ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(handler.isSensitive("ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect private keys", () => {
      const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...
-----END PRIVATE KEY-----`;
      expect(handler.isSensitive(privateKey)).toBe(true);
    });

    it("should detect Twilio keys", () => {
      expect(handler.isSensitive("SKabcdef0123456789abcdef0123456789")).toBe(true);
    });
  });

  // ===========================================================================
  // createDefaultHandler() Tests
  // ===========================================================================

  describe("createDefaultHandler", () => {
    it("should create handler with default patterns", () => {
      const handler = createDefaultHandler();
      const names = handler.getPatternNames();

      expect(names).toContain("openai-key");
      expect(names).toContain("github-token-fine");
      expect(names).toContain("github-token-classic");
      expect(names).toContain("anthropic-key");
      expect(names).toContain("bearer-token");
      expect(names).toContain("password-assign");
    });

    it("should allow adding custom patterns to default handler", () => {
      const handler = createDefaultHandler();
      handler.addPattern("custom-service", /custom-svc-[a-z0-9]{20}/gi);

      expect(handler.isSensitive("custom-svc-abcdefghij1234567890")).toBe(true);
      expect(handler.mask("Key: custom-svc-abcdefghij1234567890")).toBe("Key: cust...7890");
    });
  });
});

// =============================================================================
// T052: PermissionChecker Tests
// =============================================================================

describe("PermissionChecker", () => {
  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe("constructor", () => {
    it("should create checker with default base directory", () => {
      const checker = new PermissionChecker();
      expect(checker).toBeInstanceOf(PermissionChecker);
    });

    it("should create checker with custom base directory", () => {
      const checker = new PermissionChecker("/custom/base");
      expect(checker).toBeInstanceOf(PermissionChecker);
    });
  });

  // ===========================================================================
  // checkFileAccess() Tests
  // ===========================================================================

  describe("checkFileAccess", () => {
    const checker = new PermissionChecker("/app");

    it("should deny access for empty file path", () => {
      const result = checker.checkFileAccess("", {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("File path is required");
      }
    });

    it("should allow access when no policy restrictions", () => {
      const result = checker.checkFileAccess("/app/src/file.ts", {});
      expect(result.allowed).toBe(true);
    });

    it("should allow access for path matching allowed patterns", () => {
      const policy: CommandSecurityPolicy = {
        allowedPaths: ["/app/src/**", "/app/config/**"],
      };
      const result = checker.checkFileAccess("/app/src/file.ts", policy);
      expect(result.allowed).toBe(true);
    });

    it("should deny access for path not matching allowed patterns", () => {
      const policy: CommandSecurityPolicy = {
        allowedPaths: ["/app/src/**"],
      };
      const result = checker.checkFileAccess("/app/secrets/key.txt", policy);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("not in allowed paths");
      }
    });

    it("should deny access for path matching denied patterns", () => {
      const policy: CommandSecurityPolicy = {
        deniedPaths: ["**/.env", "**/secrets/**"],
      };
      const result = checker.checkFileAccess("/app/.env", policy);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("blocked by security policy");
      }
    });

    it("should deny access when path matches both allowed and denied (denied takes precedence)", () => {
      const policy: CommandSecurityPolicy = {
        allowedPaths: ["/app/**"],
        deniedPaths: ["/app/secrets/**"],
      };
      const result = checker.checkFileAccess("/app/secrets/key.txt", policy);
      expect(result.allowed).toBe(false);
    });

    it("should handle relative paths", () => {
      // Use process.cwd() to ensure cross-platform compatibility
      const baseDir = process.cwd().replace(/\\/g, "/");
      const checker = new PermissionChecker(baseDir);
      const policy: CommandSecurityPolicy = {
        allowedPaths: [`${baseDir}/src/**`],
      };
      const result = checker.checkFileAccess("./src/file.ts", policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ===========================================================================
  // checkNetworkAccess() Tests
  // ===========================================================================

  describe("checkNetworkAccess", () => {
    const checker = new PermissionChecker();

    it("should deny access for empty host", () => {
      const result = checker.checkNetworkAccess("", {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("Host is required");
      }
    });

    it("should allow access when no policy restrictions", () => {
      const result = checker.checkNetworkAccess("api.example.com", {});
      expect(result.allowed).toBe(true);
    });

    it("should allow access for host matching allowed hosts", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["api.example.com", "localhost"],
      };
      const result = checker.checkNetworkAccess("api.example.com", policy);
      expect(result.allowed).toBe(true);
    });

    it("should deny access for host not matching allowed hosts", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["api.example.com"],
      };
      const result = checker.checkNetworkAccess("evil.com", policy);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("not in allowed hosts");
      }
    });

    it("should deny access for host matching denied hosts", () => {
      const policy: CommandSecurityPolicy = {
        deniedHosts: ["*.evil.com", "blocked.example.com"],
      };
      const result = checker.checkNetworkAccess("blocked.example.com", policy);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("blocked by security policy");
      }
    });

    it("should deny access when host matches both allowed and denied (denied takes precedence)", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["*.example.com"],
        deniedHosts: ["internal.example.com"],
      };
      const result = checker.checkNetworkAccess("internal.example.com", policy);
      expect(result.allowed).toBe(false);
    });

    it("should support wildcard host patterns", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["*.example.com"],
      };
      expect(checker.checkNetworkAccess("api.example.com", policy).allowed).toBe(true);
      expect(checker.checkNetworkAccess("sub.api.example.com", policy).allowed).toBe(true);
      expect(checker.checkNetworkAccess("example.com", policy).allowed).toBe(true);
      expect(checker.checkNetworkAccess("notexample.com", policy).allowed).toBe(false);
    });

    it("should support full wildcard (*) for allowing all hosts", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["*"],
      };
      expect(checker.checkNetworkAccess("any.host.com", policy).allowed).toBe(true);
    });

    it("should be case-insensitive for host matching", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["API.Example.COM"],
      };
      expect(checker.checkNetworkAccess("api.example.com", policy).allowed).toBe(true);
    });
  });

  // ===========================================================================
  // checkPolicy() Tests
  // ===========================================================================

  describe("checkPolicy", () => {
    const checker = new PermissionChecker("/app");

    it("should deny for empty action", () => {
      const result = checker.checkPolicy("", "resource", {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("Action is required");
      }
    });

    it("should deny for empty resource", () => {
      const result = checker.checkPolicy("read", "", {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe("Resource is required");
      }
    });

    it("should delegate file: resources to checkFileAccess", () => {
      const policy: CommandSecurityPolicy = {
        allowedPaths: ["/app/data/**"],
      };
      const result = checker.checkPolicy("read", "file:/app/data/file.txt", policy);
      expect(result.allowed).toBe(true);

      const result2 = checker.checkPolicy("read", "file:/app/secrets/key.txt", policy);
      expect(result2.allowed).toBe(false);
    });

    it("should delegate http/https URLs to checkNetworkAccess", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["api.example.com"],
      };
      const result = checker.checkPolicy("fetch", "https://api.example.com/data", policy);
      expect(result.allowed).toBe(true);

      const result2 = checker.checkPolicy("fetch", "http://evil.com/data", policy);
      expect(result2.allowed).toBe(false);
    });

    it("should delegate host: resources to checkNetworkAccess", () => {
      const policy: CommandSecurityPolicy = {
        allowedHosts: ["localhost"],
      };
      const result = checker.checkPolicy("connect", "host:localhost", policy);
      expect(result.allowed).toBe(true);
    });

    it("should allow unknown resource types by default", () => {
      const result = checker.checkPolicy("execute", "shell:ls", {});
      expect(result.allowed).toBe(true);
    });

    it("should handle invalid URLs gracefully", () => {
      const result = checker.checkPolicy("fetch", "https://invalid url with spaces", {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("Invalid URL");
      }
    });
  });

  // ===========================================================================
  // createPermissionChecker() Tests
  // ===========================================================================

  describe("createPermissionChecker", () => {
    it("should create a PermissionChecker instance", () => {
      const checker = createPermissionChecker();
      expect(checker).toBeInstanceOf(PermissionChecker);
    });

    it("should create checker with custom base directory", () => {
      const checker = createPermissionChecker("/custom/path");
      expect(checker).toBeInstanceOf(PermissionChecker);
    });
  });

  // ===========================================================================
  // Integration with CommandSecurityPolicy
  // ===========================================================================

  describe("CommandSecurityPolicy integration", () => {
    it("should validate complete policy with all fields", () => {
      const checker = new PermissionChecker("/app");
      const policy: CommandSecurityPolicy = {
        allowedPaths: ["/app/src/**", "/app/config/**"],
        deniedPaths: ["/app/config/secrets/**", "**/.env"],
        allowedHosts: ["api.example.com", "localhost", "*.trusted.com"],
        deniedHosts: ["*.evil.com"],
        requiresAuth: true,
        maxExecutionTime: 30000,
      };

      // File access tests
      expect(checker.checkFileAccess("/app/src/index.ts", policy).allowed).toBe(true);
      expect(checker.checkFileAccess("/app/config/app.json", policy).allowed).toBe(true);
      expect(checker.checkFileAccess("/app/config/secrets/key.txt", policy).allowed).toBe(false);

      // Network access tests
      expect(checker.checkNetworkAccess("api.example.com", policy).allowed).toBe(true);
      expect(checker.checkNetworkAccess("sub.trusted.com", policy).allowed).toBe(true);
      expect(checker.checkNetworkAccess("malware.evil.com", policy).allowed).toBe(false);
    });
  });
});

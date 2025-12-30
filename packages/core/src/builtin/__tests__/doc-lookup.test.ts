/**
 * Tests for doc_lookup tool
 *
 * @module builtin/__tests__/doc-lookup.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { docLookupParamsSchema, docLookupTool, truncateContent } from "../doc-lookup.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock security validation functions
vi.mock("../security/url-validator.js", () => ({
  validateUrlWithDNS: vi.fn().mockResolvedValue({ valid: true, url: null, resolvedIPs: [] }),
  isCloudMetadata: vi.fn().mockReturnValue({ isMetadata: false }),
}));

// Import mocked module for dynamic control
import { isCloudMetadata, validateUrlWithDNS } from "../security/url-validator.js";

describe("docLookupTool", () => {
  const mockContext: ToolContext = {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(docLookupTool.definition.name).toBe("doc_lookup");
    });

    it("should have correct kind", () => {
      expect(docLookupTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(docLookupTool.definition.description).toBeTruthy();
    });

    it("should have correct category", () => {
      expect(docLookupTool.definition.category).toBe("documentation");
    });
  });

  describe("parameter validation", () => {
    it("should require query for MDN source", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "mdn",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Required field missing");
      }
    });

    it("should require package for npm source", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "npm",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Required field missing");
      }
    });

    it("should require package for pypi source", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "pypi",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Required field missing");
      }
    });

    it("should require repo for github source", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "github",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Required field missing");
      }
    });

    it("should reject invalid source", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "invalid",
        query: "test",
      });
      expect(result.success).toBe(false);
    });

    it("should default maxLength to 10000", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "mdn",
        query: "Array.map",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxLength).toBe(10000);
      }
    });

    it("should accept valid MDN params", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "mdn",
        query: "Array.map",
        maxLength: 5000,
      });
      expect(result.success).toBe(true);
    });

    it("should accept valid npm params", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "npm",
        package: "zod",
      });
      expect(result.success).toBe(true);
    });

    it("should accept valid pypi params", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "pypi",
        package: "requests",
      });
      expect(result.success).toBe(true);
    });

    it("should accept valid github params", () => {
      const result = docLookupParamsSchema.safeParse({
        source: "github",
        repo: "microsoft/vscode",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("truncateContent helper", () => {
    it("should not truncate short content", () => {
      const result = truncateContent("short text", 100);
      expect(result.text).toBe("short text");
      expect(result.truncated).toBe(false);
    });

    it("should truncate long content", () => {
      const longContent = "a".repeat(150);
      const result = truncateContent(longContent, 100);
      expect(result.text.length).toBeLessThanOrEqual(100 + 30); // account for truncation marker
      expect(result.truncated).toBe(true);
      expect(result.text).toContain("[... content truncated ...]");
    });

    it("should handle content exactly at maxLength", () => {
      const exactContent = "a".repeat(100);
      const result = truncateContent(exactContent, 100);
      expect(result.text).toBe(exactContent);
      expect(result.truncated).toBe(false);
    });
  });

  describe("MDN source", () => {
    it("should return results for valid query", async () => {
      // Mock search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          documents: [
            {
              title: "Array.prototype.map()",
              slug: "Web/JavaScript/Reference/Global_Objects/Array/map",
              summary: "The map() method creates a new array.",
            },
          ],
        }),
      });

      // Mock doc response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          doc: {
            body: [
              {
                type: "prose",
                value: { content: "<p>The map() method creates a new array.</p>" },
              },
            ],
          },
        }),
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "Array.map", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.source).toBe("mdn");
        expect(result.output.title).toBe("Array.prototype.map()");
        expect(result.output.url).toContain("developer.mozilla.org");
      }
    });

    it("should handle 404 gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "nonexistent_function", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("doc_lookup failed");
      }
    });

    it("should handle empty search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          documents: [],
        }),
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "zzzznonexistent", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No MDN documentation found");
      }
    });

    it("should truncate content when exceeds maxLength", async () => {
      const longContent = "<p>" + "x".repeat(200) + "</p>";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          documents: [
            {
              title: "Test Doc",
              slug: "test/doc",
              summary: "Short summary",
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          doc: {
            body: [
              {
                type: "prose",
                value: { content: longContent },
              },
            ],
          },
        }),
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "test", maxLength: 50 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.truncated).toBe(true);
        expect(result.output.content).toContain("truncated");
      }
    });
  });

  describe("npm source", () => {
    it("should return package info for valid package", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "zod",
          description: "TypeScript-first schema validation",
          "dist-tags": { latest: "3.22.0" },
          versions: {
            "3.22.0": {
              readme: "# Zod\n\nTypeScript-first schema validation.",
              author: { name: "Colin McDonnell" },
              license: "MIT",
            },
          },
          readme: "# Zod\n\nTypeScript-first schema validation.",
          author: { name: "Colin McDonnell" },
          license: "MIT",
        }),
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "zod", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.source).toBe("npm");
        expect(result.output.title).toBe("zod");
        expect(result.output.url).toBe("https://www.npmjs.com/package/zod");
        expect(result.output.metadata?.version).toBe("3.22.0");
        expect(result.output.metadata?.description).toBe("TypeScript-first schema validation");
        expect(result.output.metadata?.author).toBe("Colin McDonnell");
        expect(result.output.metadata?.license).toBe("MIT");
      }
    });

    it("should handle 404 gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "nonexistent-pkg-12345", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("npm package not found");
      }
    });

    it("should extract README content", async () => {
      const readmeContent = "# Package\n\nThis is the README.";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "test-pkg",
          description: "Test package",
          readme: readmeContent,
        }),
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain("This is the README");
      }
    });

    it("should handle author as string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "test-pkg",
          description: "Test package",
          author: "John Doe <john@example.com>",
        }),
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.metadata?.author).toBe("John Doe <john@example.com>");
      }
    });

    it("should handle registry errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("npm registry error");
      }
    });
  });

  describe("PyPI source", () => {
    it("should return package info for valid package", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          info: {
            name: "requests",
            version: "2.31.0",
            summary: "Python HTTP for Humans.",
            description: "# Requests\n\nRequests is a simple HTTP library.",
            author: "Kenneth Reitz",
            license: "Apache 2.0",
          },
        }),
      });

      const result = await docLookupTool.execute(
        { source: "pypi", package: "requests", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.source).toBe("pypi");
        expect(result.output.title).toBe("requests");
        expect(result.output.url).toBe("https://pypi.org/project/requests/");
        expect(result.output.metadata?.version).toBe("2.31.0");
        expect(result.output.metadata?.description).toBe("Python HTTP for Humans.");
        expect(result.output.metadata?.author).toBe("Kenneth Reitz");
        expect(result.output.metadata?.license).toBe("Apache 2.0");
      }
    });

    it("should handle 404 gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await docLookupTool.execute(
        { source: "pypi", package: "nonexistent-pkg-12345", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("PyPI package not found");
      }
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await docLookupTool.execute(
        { source: "pypi", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("PyPI API error");
      }
    });

    it("should use author_email as fallback", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          info: {
            name: "test-pkg",
            version: "1.0.0",
            author_email: "author@example.com",
          },
        }),
      });

      const result = await docLookupTool.execute(
        { source: "pypi", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.metadata?.author).toBe("author@example.com");
      }
    });
  });

  describe("GitHub source", () => {
    it("should return README for valid repo", async () => {
      const readmeContent = "# VSCode\n\nVisual Studio Code is a code editor.";
      const base64Content = Buffer.from(readmeContent).toString("base64");

      // Mock README response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "README.md",
          path: "README.md",
          content: base64Content,
          encoding: "base64",
          html_url: "https://github.com/microsoft/vscode/blob/main/README.md",
        }),
      });

      // Mock repo info response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          description: "Visual Studio Code",
          license: { name: "MIT" },
        }),
      });

      const result = await docLookupTool.execute(
        { source: "github", repo: "microsoft/vscode", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.source).toBe("github");
        expect(result.output.title).toContain("microsoft/vscode");
        expect(result.output.content).toContain("Visual Studio Code");
        expect(result.output.metadata?.description).toBe("Visual Studio Code");
      }
    });

    it("should handle invalid repo format", async () => {
      const result = await docLookupTool.execute(
        { source: "github", repo: "invalid-format", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid GitHub repo format");
      }
    });

    it("should handle repo with too many slashes", async () => {
      const result = await docLookupTool.execute(
        { source: "github", repo: "a/b/c", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid GitHub repo format");
      }
    });

    it("should handle rate limiting gracefully", async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      const mockHeaders = new Headers();
      mockHeaders.set("X-RateLimit-Reset", resetTime.toString());

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: mockHeaders,
      });

      const result = await docLookupTool.execute(
        { source: "github", repo: "microsoft/vscode", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("rate limited");
        expect(result.error).toContain("Resets at");
      }
    });

    it("should handle 404 gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await docLookupTool.execute(
        { source: "github", repo: "nonexistent/repo", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should decode base64 content", async () => {
      const originalContent = "This is the README content with special chars: é ñ 中文";
      const base64Content = Buffer.from(originalContent).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "README.md",
          path: "README.md",
          content: base64Content,
          encoding: "base64",
          html_url: "https://github.com/test/repo/blob/main/README.md",
        }),
      });

      // Mock repo info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await docLookupTool.execute(
        { source: "github", repo: "test/repo", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain(originalContent);
      }
    });

    it("should handle non-base64 encoding", async () => {
      const rawContent = "Plain text README";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "README.md",
          path: "README.md",
          content: rawContent,
          encoding: "utf-8",
          html_url: "https://github.com/test/repo/blob/main/README.md",
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await docLookupTool.execute(
        { source: "github", repo: "test/repo", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain(rawContent);
      }
    });

    it("should handle repo metadata fetch failure gracefully", async () => {
      const readmeContent = "# Test";
      const base64Content = Buffer.from(readmeContent).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "README.md",
          content: base64Content,
          encoding: "base64",
          html_url: "https://github.com/test/repo",
        }),
      });

      // Repo info fails
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await docLookupTool.execute(
        { source: "github", repo: "test/repo", maxLength: 10000 },
        mockContext
      );

      // Should still succeed, just without description
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain("Test");
      }
    });
  });

  describe("security integration", () => {
    it("should apply SSRF protection to all sources", async () => {
      const mockedValidateUrlWithDNS = vi.mocked(validateUrlWithDNS);
      mockedValidateUrlWithDNS.mockResolvedValueOnce({
        valid: false,
        url: new URL("http://localhost"),
        resolvedIPs: ["127.0.0.1"],
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "test", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("doc_lookup failed");
      }
    });

    it("should block cloud metadata endpoints", async () => {
      const mockedIsCloudMetadata = vi.mocked(isCloudMetadata);
      mockedIsCloudMetadata.mockReturnValueOnce({
        isMetadata: true,
        provider: "aws",
      });

      const result = await docLookupTool.execute(
        { source: "mdn", query: "test", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("doc_lookup failed");
      }
    });
  });

  describe("permission checks", () => {
    it("should check network:read permission", async () => {
      await docLookupTool.execute({ source: "mdn", query: "test", maxLength: 10000 }, mockContext);

      expect(mockContext.checkPermission).toHaveBeenCalledWith("network:read", "mdn");
    });

    it("should fail if permission denied", async () => {
      const deniedContext: ToolContext = {
        ...mockContext,
        checkPermission: vi.fn().mockResolvedValue(false),
      };

      const result = await docLookupTool.execute(
        { source: "npm", package: "zod", maxLength: 10000 },
        deniedContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("abort signal", () => {
    it("should respect abort signal", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const abortedContext: ToolContext = {
        ...mockContext,
        abortSignal: abortController.signal,
      };

      const result = await docLookupTool.execute(
        { source: "mdn", query: "test", maxLength: 10000 },
        abortedContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("output formatting", () => {
    it("should format output with metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "test-pkg",
          description: "Test description",
          "dist-tags": { latest: "1.0.0" },
          versions: {
            "1.0.0": {
              license: "MIT",
            },
          },
          readme: "README content here",
        }),
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "test-pkg", maxLength: 10000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain("# test-pkg");
        expect(result.output.content).toContain("Source: npm");
        expect(result.output.content).toContain("Version: 1.0.0");
        expect(result.output.content).toContain("Description: Test description");
      }
    });

    it("should include truncation warning when content is truncated", async () => {
      const longReadme = "x".repeat(200);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          name: "test-pkg",
          readme: longReadme,
        }),
      });

      const result = await docLookupTool.execute(
        { source: "npm", package: "test-pkg", maxLength: 50 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain("⚠️ Content was truncated");
      }
    });
  });
});

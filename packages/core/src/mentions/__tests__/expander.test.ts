/**
 * Unit tests for mention expander
 *
 * Tests expansion of @ mentions into content with mocked fs/git.
 *
 * @module core/mentions/__tests__/expander
 */

import * as fs from "node:fs/promises";
import { fetchWithPool, type Mention } from "@vellum/shared";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { expandAllMentions, expandMention, previewMention } from "../expander.js";
import type { MentionExpansionContext } from "../types.js";

// =============================================================================
// Mocks
// =============================================================================

vi.mock("node:fs/promises");
vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => ({
    diff: vi.fn(),
    status: vi.fn(),
  })),
}));
vi.mock("@vellum/shared", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@vellum/shared")>();
  return {
    ...mod,
    fetchWithPool: vi.fn(),
  };
});

const mockFs = fs as unknown as {
  stat: Mock;
  readFile: Mock;
  access: Mock;
  readdir: Mock;
  realpath: Mock;
};

// =============================================================================
// Test Helpers
// =============================================================================

function createMention(type: Mention["type"], value: string, start: number = 0): Mention {
  const raw = value ? `@${type}:${value}` : `@${type}`;
  return {
    type,
    raw,
    value,
    start,
    end: start + raw.length,
  };
}

function createContext(overrides: Partial<MentionExpansionContext> = {}): MentionExpansionContext {
  return {
    cwd: "/project",
    ...overrides,
  };
}

// =============================================================================
// File Mention Tests
// =============================================================================

describe("expandMention - @file", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands file mention successfully", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 100,
    });
    mockFs.readFile.mockResolvedValue("file content");

    const mention = createMention("file", "./test.ts");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(true);
    expect(result.content).toContain("file content");
    expect(result.content).toContain("--- ./test.ts ---");
  });

  it("returns error for non-existent file", async () => {
    const error = new Error("ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockFs.stat.mockRejectedValue(error);

    const mention = createMention("file", "./missing.ts");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });

  it("returns error for permission denied", async () => {
    const error = new Error("EACCES");
    (error as NodeJS.ErrnoException).code = "EACCES";
    mockFs.stat.mockRejectedValue(error);

    const mention = createMention("file", "./protected.ts");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("returns error if path is a directory", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => false,
      isDirectory: () => true,
    });

    const mention = createMention("file", "./src");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a file");
  });

  it("returns error for file too large", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 10 * 1024 * 1024, // 10MB
    });

    const mention = createMention("file", "./huge.bin");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("File too large");
  });

  it("truncates content exceeding max length", async () => {
    const longContent = "x".repeat(60000);
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 60000,
    });
    mockFs.readFile.mockResolvedValue(longContent);

    const mention = createMention("file", "./long.txt");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(true);
    expect(result.content).toContain("[truncated]");
    expect(result.metadata?.truncated).toBe(true);
  });

  it("includes metadata when enabled", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 100,
    });
    mockFs.readFile.mockResolvedValue("line1\nline2\nline3");

    const mention = createMention("file", "./test.ts");
    const result = await expandMention(mention, createContext(), { includeMetadata: true });

    expect(result.metadata?.fileSize).toBe(100);
    expect(result.metadata?.lineCount).toBe(3);
  });
});

// =============================================================================
// Folder Mention Tests
// =============================================================================

describe("expandMention - @folder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands folder mention with files", async () => {
    mockFs.stat.mockResolvedValue({
      isDirectory: () => true,
    });
    mockFs.realpath.mockImplementation((p) => Promise.resolve(p));
    mockFs.readdir.mockResolvedValue([
      { name: "index.ts", isDirectory: () => false },
      { name: "utils", isDirectory: () => true },
    ]);

    const mention = createMention("folder", "./src");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(true);
    expect(result.content).toContain("index.ts");
    expect(result.content).toContain("utils/");
  });

  it("returns error for non-existent folder", async () => {
    const error = new Error("ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockFs.stat.mockRejectedValue(error);

    const mention = createMention("folder", "./missing");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Folder not found");
  });

  it("returns error if path is a file", async () => {
    mockFs.stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    });

    const mention = createMention("folder", "./file.ts");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a directory");
  });

  it("skips hidden directories", async () => {
    mockFs.stat.mockResolvedValue({
      isDirectory: () => true,
    });
    mockFs.realpath.mockImplementation((p) => Promise.resolve(p));
    mockFs.readdir.mockResolvedValue([
      { name: ".git", isDirectory: () => true },
      { name: "src", isDirectory: () => true },
      { name: "node_modules", isDirectory: () => true },
    ]);

    const mention = createMention("folder", "./project");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(true);
    expect(result.content).not.toContain(".git");
    expect(result.content).not.toContain("node_modules");
    expect(result.content).toContain("src/");
  });
});

// =============================================================================
// URL Mention Tests
// =============================================================================

const mockFetchWithPool = fetchWithPool as Mock;

describe("expandMention - @url", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands URL mention successfully", async () => {
    mockFetchWithPool.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html>content</html>"),
    });

    const mention = createMention("url", "https://example.com");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(true);
    expect(result.content).toContain("content");
  });

  it("adds https protocol if missing", async () => {
    mockFetchWithPool.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("content"),
    });

    const mention = createMention("url", "example.com");
    await expandMention(mention, createContext());

    expect(mockFetchWithPool).toHaveBeenCalledWith("https://example.com", expect.any(Object));
  });

  it("returns error for HTTP error response", async () => {
    mockFetchWithPool.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const mention = createMention("url", "https://example.com/missing");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
  });

  it("returns error for invalid URL", async () => {
    const mention = createMention("url", "not a url!!!");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("handles fetch timeout", async () => {
    mockFetchWithPool.mockRejectedValue(
      Object.assign(new Error("Timeout"), { name: "AbortError" })
    );

    const mention = createMention("url", "https://slow.example.com");
    const result = await expandMention(mention, createContext(), { urlTimeout: 100 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });
});

// =============================================================================
// Git Diff Mention Tests
// =============================================================================

describe("expandMention - @git-diff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when not in git repo", async () => {
    mockFs.access.mockRejectedValue(new Error("ENOENT"));

    const mention = createMention("git-diff", "");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not in a git repository");
  });

  it("expands git diff when in repo", async () => {
    mockFs.access.mockResolvedValue(undefined);
    const { simpleGit } = await import("simple-git");
    const mockGit = {
      diff: vi.fn().mockResolvedValue("+ added line"),
      status: vi.fn().mockResolvedValue({ not_added: [] }),
    };
    (simpleGit as Mock).mockReturnValue(mockGit);

    const mention = createMention("git-diff", "");
    const result = await expandMention(mention, createContext({ gitRoot: "/project" }));

    expect(result.success).toBe(true);
  });

  it("shows no changes message when clean", async () => {
    mockFs.access.mockResolvedValue(undefined);
    const { simpleGit } = await import("simple-git");
    const mockGit = {
      diff: vi.fn().mockResolvedValue(""),
      status: vi.fn().mockResolvedValue({ not_added: [] }),
    };
    (simpleGit as Mock).mockReturnValue(mockGit);

    const mention = createMention("git-diff", "");
    const result = await expandMention(mention, createContext({ gitRoot: "/project" }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("No changes detected");
  });
});

// =============================================================================
// Problems Mention Tests
// =============================================================================

describe("expandMention - @problems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fallback when getProblems not provided", async () => {
    const mention = createMention("problems", "");
    const result = await expandMention(mention, createContext());

    // With fallback, it should succeed (either find problems or say none found)
    expect(result.success).toBe(true);
    expect(result.content).toContain("@problems");
  });

  it("expands problems when getProblems provided", async () => {
    const getProblems = vi.fn().mockResolvedValue("Error in file.ts:10");

    const mention = createMention("problems", "");
    const result = await expandMention(mention, createContext({ getProblems }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("Error in file.ts:10");
  });

  it("shows no problems message when empty", async () => {
    const getProblems = vi.fn().mockResolvedValue("");

    const mention = createMention("problems", "");
    const result = await expandMention(mention, createContext({ getProblems }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("No problems found");
  });

  it("handles getProblems throwing error", async () => {
    const getProblems = vi.fn().mockRejectedValue(new Error("LSP connection lost"));

    const mention = createMention("problems", "");
    const result = await expandMention(mention, createContext({ getProblems }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("LSP connection lost");
  });
});

// =============================================================================
// Terminal Mention Tests
// =============================================================================

describe("expandMention - @terminal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fallback when getTerminalOutput not provided", async () => {
    // Mock fs.readFile to simulate no history/logs
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

    const mention = createMention("terminal", "");
    const result = await expandMention(mention, createContext());

    // With fallback, it should succeed (either find output or say none available)
    expect(result.success).toBe(true);
    expect(result.content).toContain("@terminal");
  });

  it("expands terminal output when getTerminalOutput provided", async () => {
    const getTerminalOutput = vi.fn().mockResolvedValue("$ ls\nfile.ts");

    const mention = createMention("terminal", "");
    const result = await expandMention(mention, createContext({ getTerminalOutput }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("$ ls");
  });

  it("shows no output message when empty", async () => {
    const getTerminalOutput = vi.fn().mockResolvedValue("");

    const mention = createMention("terminal", "");
    const result = await expandMention(mention, createContext({ getTerminalOutput }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("No terminal output available");
  });

  it("handles getTerminalOutput throwing error", async () => {
    const getTerminalOutput = vi.fn().mockRejectedValue(new Error("Terminal disconnected"));

    const mention = createMention("terminal", "");
    const result = await expandMention(mention, createContext({ getTerminalOutput }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Terminal disconnected");
  });
});

// =============================================================================
// Codebase Mention Tests
// =============================================================================

describe("expandMention - @codebase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fallback search when searchCodebase not provided", async () => {
    // Mock realpath to resolve to same path
    mockFs.realpath.mockImplementation(async (p: string) => p);
    // Mock readdir to return empty directory (no files to search)
    mockFs.readdir.mockResolvedValue([]);

    const mention = createMention("codebase", "auth logic");
    const result = await expandMention(mention, createContext());

    // With fallback, it should succeed (either find results or say none found)
    expect(result.success).toBe(true);
    expect(result.content).toContain("@codebase:auth logic");
  });

  it("expands codebase search when searchCodebase provided", async () => {
    const searchCodebase = vi.fn().mockResolvedValue("Found in auth.ts:42");

    const mention = createMention("codebase", "auth logic");
    const result = await expandMention(mention, createContext({ searchCodebase }));

    expect(result.success).toBe(true);
    expect(result.content).toContain("Found in auth.ts:42");
    expect(searchCodebase).toHaveBeenCalledWith("auth logic");
  });

  it("returns error for empty query", async () => {
    const mention = createMention("codebase", "");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a query");
  });

  it("returns error for whitespace-only query", async () => {
    const mention = createMention("codebase", "   ");
    const result = await expandMention(mention, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a query");
  });

  it("handles searchCodebase throwing error", async () => {
    const searchCodebase = vi.fn().mockRejectedValue(new Error("Index not available"));

    const mention = createMention("codebase", "auth");
    const result = await expandMention(mention, createContext({ searchCodebase }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Index not available");
  });
});

// =============================================================================
// expandAllMentions Tests
// =============================================================================

describe("expandAllMentions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns original text when no mentions", async () => {
    const text = "Hello world";
    const result = await expandAllMentions(text, createContext());

    expect(result.originalText).toBe(text);
    expect(result.expandedText).toBe(text);
    expect(result.expansions).toHaveLength(0);
  });

  it("expands multiple mentions in parallel", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 50,
    });
    mockFs.readFile.mockResolvedValueOnce("content A").mockResolvedValueOnce("content B");

    const text = "@file:a.ts and @file:b.ts";
    const result = await expandAllMentions(text, createContext());

    expect(result.expansions).toHaveLength(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
  });

  it("counts successes and failures correctly", async () => {
    mockFs.stat
      .mockResolvedValueOnce({ isFile: () => true, size: 50 })
      .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockFs.readFile.mockResolvedValue("content");

    const text = "@file:exists.ts @file:missing.ts";
    const result = await expandAllMentions(text, createContext());

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
  });

  it("replaces mentions with expanded content", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 50,
    });
    mockFs.readFile.mockResolvedValue("file content");

    const text = "Check @file:test.ts please";
    const result = await expandAllMentions(text, createContext());

    expect(result.expandedText).toContain("file content");
    expect(result.expandedText).not.toContain("@file:test.ts");
  });
});

// =============================================================================
// previewMention Tests
// =============================================================================

describe("previewMention", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns truncated preview", async () => {
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 50,
    });
    mockFs.readFile.mockResolvedValue("short content");

    const mention = createMention("file", "./test.ts");
    const preview = await previewMention(mention, createContext(), 100);

    expect(preview).toContain("short content");
  });

  it("returns error message on failure", async () => {
    const error = new Error("ENOENT");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    mockFs.stat.mockRejectedValue(error);

    const mention = createMention("file", "./missing.ts");
    const preview = await previewMention(mention, createContext());

    expect(preview).toContain("[Error:");
  });
});

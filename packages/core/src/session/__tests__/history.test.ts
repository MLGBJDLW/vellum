/**
 * Command History Tests
 *
 * Tests for the CommandHistory class including:
 * - Adding commands
 * - Getting recent commands
 * - Searching history
 * - Sensitive data masking
 * - Bash-style history expansion (!!, !n, !prefix)
 * - Persistence (save/load)
 * - Clear functionality
 *
 * @module core/session/__tests__/history
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CommandHistory } from "../history.js";

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;
let historyFile: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-history-test-"));
  historyFile = path.join(tempDir, ".command-history.json");
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

// =============================================================================
// add() Tests
// =============================================================================

describe("CommandHistory.add", () => {
  it("should add a command to history", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("test command");

    expect(history.length).toBe(1);
    const entries = history.getAllEntries();
    expect(entries[0]?.command).toBe("test command");
  });

  it("should add timestamp to entry", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    const before = new Date();
    await history.add("test command");
    const after = new Date();

    const entries = history.getAllEntries();
    expect(entries[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entries[0]?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("should add session ID to entry when provided", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("test command", "session-123");

    const entries = history.getAllEntries();
    expect(entries[0]?.sessionId).toBe("session-123");
  });

  it("should skip empty commands", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("");
    await history.add("   ");
    await history.add("\n\t");

    expect(history.length).toBe(0);
  });

  it("should skip duplicate of last command", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("test command");
    await history.add("test command");
    await history.add("test command");

    expect(history.length).toBe(1);
  });

  it("should allow same command if not consecutive", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("test command");
    await history.add("other command");
    await history.add("test command");

    expect(history.length).toBe(3);
  });

  it("should prune history when exceeding maxEntries", async () => {
    const maxEntries = 3;
    const history = new CommandHistory(historyFile, maxEntries);
    await history.load();

    await history.add("command 1");
    await history.add("command 2");
    await history.add("command 3");
    await history.add("command 4");
    await history.add("command 5");

    expect(history.length).toBe(maxEntries);
    const entries = history.getAllEntries();
    expect(entries[0]?.command).toBe("command 3");
    expect(entries[2]?.command).toBe("command 5");
  });
});

// =============================================================================
// getRecent() Tests
// =============================================================================

describe("CommandHistory.getRecent", () => {
  it("should return recent commands in reverse chronological order", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("first");
    await history.add("second");
    await history.add("third");

    const recent = history.getRecent(10);

    expect(recent).toHaveLength(3);
    expect(recent[0]?.command).toBe("third");
    expect(recent[1]?.command).toBe("second");
    expect(recent[2]?.command).toBe("first");
  });

  it("should limit results to specified count", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("first");
    await history.add("second");
    await history.add("third");
    await history.add("fourth");
    await history.add("fifth");

    const recent = history.getRecent(3);

    expect(recent).toHaveLength(3);
    expect(recent[0]?.command).toBe("fifth");
    expect(recent[2]?.command).toBe("third");
  });

  it("should return all entries when limit exceeds history size", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("first");
    await history.add("second");

    const recent = history.getRecent(100);

    expect(recent).toHaveLength(2);
  });

  it("should return default 10 entries when no limit specified", async () => {
    const history = new CommandHistory(historyFile, 20);
    await history.load();

    for (let i = 1; i <= 15; i++) {
      await history.add(`command ${i}`);
    }

    const recent = history.getRecent();

    expect(recent).toHaveLength(10);
  });
});

// =============================================================================
// search() Tests
// =============================================================================

describe("CommandHistory.search", () => {
  it("should find commands matching prefix", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("git status");
    await history.add("git commit -m 'test'");
    await history.add("npm install");
    await history.add("git push");

    const results = history.search("git");

    expect(results).toHaveLength(3);
    // Most recent first
    expect(results[0]?.command).toBe("git push");
  });

  it("should perform case-insensitive search", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("Git status");
    await history.add("GIT commit");

    const results = history.search("git");

    expect(results).toHaveLength(2);
  });

  it("should return empty array when no matches", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("npm install");
    await history.add("yarn add");

    const results = history.search("pip");

    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Sensitive Data Masking Tests
// =============================================================================

describe("CommandHistory sensitive data masking", () => {
  it("should mask OpenAI API keys (sk-)", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("curl -H 'Authorization: sk-abcdefghij1234567890abcdefghij1234567890abcd'");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("sk-***");
    expect(entries[0]?.command).not.toContain("abcdef");
  });

  it("should mask GitHub Personal Access Tokens (ghp_)", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add(
      "git clone https://ghp_abcdefghijklmnop1234567890qrstuvwxyz12@github.com/user/repo"
    );

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("ghp_***");
    expect(entries[0]?.command).not.toContain("abcdefghijklmnop");
  });

  it("should mask GitHub OAuth tokens (gho_)", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("curl -H 'Authorization: gho_abcdefghijklmnop1234567890qrstuvwxyz12'");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("gho_***");
  });

  it("should mask Anthropic API keys (sk-ant-)", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("curl -H 'X-API-Key: sk-ant-api03-abcdefghijklmnop1234567890'");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("sk-ant-***");
  });

  it("should mask passwords in URLs", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("git clone https://user:secretpassword123@github.com/repo");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("://user:***@");
    expect(entries[0]?.command).not.toContain("secretpassword");
  });

  it("should mask Bearer tokens", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("curl -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test'");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("Bearer ***");
    expect(entries[0]?.command).not.toContain("eyJhbGci");
  });

  it("should mask API keys in URL query parameters", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("curl 'https://api.example.com?api_key=mysecretapikey123'");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("api_key=***");
    expect(entries[0]?.command).not.toContain("mysecretapikey");
  });

  it("should mask AWS access keys", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");

    const entries = history.getAllEntries();
    expect(entries[0]?.command).toContain("AKIA***");
    expect(entries[0]?.command).not.toContain("IOSFODNN");
  });
});

// =============================================================================
// History Expansion Tests (!!, !n, !prefix)
// =============================================================================

describe("CommandHistory.expand", () => {
  describe("!! (last command)", () => {
    it("should expand !! to last command", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("git status");

      const result = history.expand("!!");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("git status");
    });

    it("should expand !! inline", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("file.txt");

      const result = history.expand("cat !!");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("cat file.txt");
    });

    it("should return error when history is empty", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      const result = history.expand("!!");

      expect(result.expanded).toBe(false);
      expect(result.error).toContain("No commands in history");
    });
  });

  describe("!n (command number)", () => {
    it("should expand !n to nth command (1-based)", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("first");
      await history.add("second");
      await history.add("third");

      const result = history.expand("!2");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("second");
    });

    it("should return error for out of range index", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("first");

      const result = history.expand("!10");

      expect(result.error).toContain("!10: event not found");
    });
  });

  describe("!-n (relative index)", () => {
    it("should expand !-n to nth previous command", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("first");
      await history.add("second");
      await history.add("third");

      const result = history.expand("!-2");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("second");
    });

    it("should expand !-1 to last command", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("first");
      await history.add("last");

      const result = history.expand("!-1");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("last");
    });
  });

  describe("!prefix (prefix search)", () => {
    it("should expand !prefix to most recent matching command", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("git status");
      await history.add("git commit -m 'test'");
      await history.add("npm install");
      await history.add("git push");

      const result = history.expand("!git");

      expect(result.expanded).toBe(true);
      expect(result.command).toBe("git push");
    });

    it("should return error when no command matches prefix", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("npm install");

      const result = history.expand("!git");

      expect(result.error).toContain("!git: event not found");
    });
  });

  describe("no expansion", () => {
    it("should return original command when no ! pattern present", async () => {
      const history = new CommandHistory(historyFile);
      await history.load();

      await history.add("previous");

      const result = history.expand("regular command");

      expect(result.expanded).toBe(false);
      expect(result.command).toBe("regular command");
    });
  });
});

// =============================================================================
// Persistence Tests (save/load)
// =============================================================================

describe("CommandHistory persistence", () => {
  it("should save history to file", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("test command");

    const fileContent = await fs.readFile(historyFile, "utf-8");
    const data = JSON.parse(fileContent);

    expect(data.version).toBe(1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].command).toBe("test command");
  });

  it("should load history from file", async () => {
    // Create history file manually
    const data = {
      version: 1,
      entries: [{ command: "loaded command", timestamp: new Date().toISOString() }],
    };
    await fs.writeFile(historyFile, JSON.stringify(data));

    const history = new CommandHistory(historyFile);
    await history.load();

    expect(history.length).toBe(1);
    expect(history.getAllEntries()[0]?.command).toBe("loaded command");
  });

  it("should create empty history when file does not exist", async () => {
    const nonExistentFile = path.join(tempDir, "nonexistent", "history.json");
    const history = new CommandHistory(nonExistentFile);

    await history.load();

    expect(history.length).toBe(0);
    expect(history.isLoaded()).toBe(true);
  });

  it("should persist history across instances", async () => {
    const history1 = new CommandHistory(historyFile);
    await history1.load();
    await history1.add("persisted command");

    const history2 = new CommandHistory(historyFile);
    await history2.load();

    expect(history2.length).toBe(1);
    expect(history2.getAllEntries()[0]?.command).toBe("persisted command");
  });

  it("should create parent directory if it does not exist", async () => {
    const deepPath = path.join(tempDir, "deep", "nested", "history.json");
    const history = new CommandHistory(deepPath);
    await history.load();

    await history.add("test");

    const exists = await fs
      .access(deepPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should handle unknown version gracefully", async () => {
    const data = {
      version: 999,
      entries: [{ command: "test", timestamp: new Date().toISOString() }],
    };
    await fs.writeFile(historyFile, JSON.stringify(data));

    const history = new CommandHistory(historyFile);
    await history.load();

    // Should start with empty history due to version mismatch
    expect(history.length).toBe(0);
  });
});

// =============================================================================
// clear() Tests
// =============================================================================

describe("CommandHistory.clear", () => {
  it("should clear all history entries", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("command 1");
    await history.add("command 2");
    await history.add("command 3");

    expect(history.length).toBe(3);

    await history.clear();

    expect(history.length).toBe(0);
  });

  it("should persist empty history after clear", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("command 1");
    await history.clear();

    // Load in new instance
    const history2 = new CommandHistory(historyFile);
    await history2.load();

    expect(history2.length).toBe(0);
  });
});

// =============================================================================
// Utility Method Tests
// =============================================================================

describe("CommandHistory utility methods", () => {
  it("should return correct length", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    expect(history.length).toBe(0);

    await history.add("first");
    expect(history.length).toBe(1);

    await history.add("second");
    expect(history.length).toBe(2);
  });

  it("should get entry by index", async () => {
    const history = new CommandHistory(historyFile);
    await history.load();

    await history.add("first");
    await history.add("second");
    await history.add("third");

    expect(history.get(0)?.command).toBe("first");
    expect(history.get(1)?.command).toBe("second");
    expect(history.get(2)?.command).toBe("third");
    expect(history.get(99)).toBeUndefined();
  });

  it("should return history file path", async () => {
    const history = new CommandHistory(historyFile);

    expect(history.getHistoryFilePath()).toBe(historyFile);
  });

  it("should track loaded state", async () => {
    const history = new CommandHistory(historyFile);

    expect(history.isLoaded()).toBe(false);

    await history.load();

    expect(history.isLoaded()).toBe(true);
  });
});

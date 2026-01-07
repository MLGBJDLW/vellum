import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSnapshot,
  DEFAULT_SESSION_DIR,
  FileStatePersister,
  isValidSnapshot,
  MemoryStatePersister,
  type SessionSnapshot,
  SNAPSHOT_VERSION,
  type SnapshotContext,
} from "../state-persister.js";

// Mock fs module
vi.mock("node:fs/promises");

describe("State Persister (T023)", () => {
  describe("FileStatePersister", () => {
    const mockFs = vi.mocked(fs);
    const baseDir = "/test/project";
    let persister: FileStatePersister;

    beforeEach(() => {
      vi.clearAllMocks();
      persister = new FileStatePersister({ baseDir });
    });

    describe("save", () => {
      it("creates directory and saves snapshot", async () => {
        const snapshot = createTestSnapshot("session-123");

        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.rename.mockResolvedValue(undefined);

        await persister.save(snapshot);

        expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(baseDir, DEFAULT_SESSION_DIR), {
          recursive: true,
        });
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining("session-123.json.tmp"),
          expect.any(String),
          "utf-8"
        );
        expect(mockFs.rename).toHaveBeenCalled();
      });

      it("sanitizes session ID to prevent directory traversal", async () => {
        const snapshot = createTestSnapshot("../../../etc/passwd");

        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.rename.mockResolvedValue(undefined);

        await persister.save(snapshot);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining("______etc_passwd.json.tmp"),
          expect.any(String),
          "utf-8"
        );
      });

      it("writes valid JSON", async () => {
        const snapshot = createTestSnapshot("session-123");
        let savedContent = "";

        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockImplementation(async (_path, content) => {
          savedContent = content as string;
        });
        mockFs.rename.mockResolvedValue(undefined);

        await persister.save(snapshot);

        const parsed = JSON.parse(savedContent);
        expect(parsed.id).toBe("session-123");
        expect(parsed.state).toBe("idle");
        expect(parsed.version).toBe(SNAPSHOT_VERSION);
      });
    });

    describe("load", () => {
      it("returns snapshot when file exists", async () => {
        const snapshot = createTestSnapshot("session-123");

        mockFs.readFile.mockResolvedValue(JSON.stringify(snapshot));

        const result = await persister.load("session-123");

        expect(result).toEqual(snapshot);
      });

      it("returns null when file not found", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        mockFs.readFile.mockRejectedValue(error);

        const result = await persister.load("nonexistent");

        expect(result).toBeNull();
      });

      it("returns null when access denied", async () => {
        const error = new Error("EACCES") as NodeJS.ErrnoException;
        error.code = "EACCES";
        mockFs.readFile.mockRejectedValue(error);

        const result = await persister.load("protected");

        expect(result).toBeNull();
      });

      it("returns null for invalid JSON", async () => {
        mockFs.readFile.mockResolvedValue("not valid json");

        const result = await persister.load("invalid");

        expect(result).toBeNull();
      });

      it("returns null for invalid snapshot structure", async () => {
        mockFs.readFile.mockResolvedValue(JSON.stringify({ foo: "bar" }));

        const result = await persister.load("invalid-structure");

        expect(result).toBeNull();
      });

      it("throws on unexpected errors", async () => {
        const error = new Error("Disk failure");
        mockFs.readFile.mockRejectedValue(error);

        await expect(persister.load("session-123")).rejects.toThrow("Disk failure");
      });
    });

    describe("delete", () => {
      it("deletes existing file", async () => {
        mockFs.unlink.mockResolvedValue(undefined);

        await persister.delete("session-123");

        expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining("session-123.json"));
      });

      it("ignores ENOENT errors", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        mockFs.unlink.mockRejectedValue(error);

        await expect(persister.delete("nonexistent")).resolves.toBeUndefined();
      });

      it("throws on other errors", async () => {
        const error = new Error("Disk failure");
        mockFs.unlink.mockRejectedValue(error);

        await expect(persister.delete("session-123")).rejects.toThrow("Disk failure");
      });
    });

    describe("list", () => {
      it("returns session IDs from directory", async () => {
        (mockFs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
          "session-1.json",
          "session-2.json",
          "session-3.json",
        ]);

        const result = await persister.list();

        expect(result).toEqual(["session-1", "session-2", "session-3"]);
      });

      it("filters non-JSON files", async () => {
        (mockFs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
          "session-1.json",
          "readme.txt",
          "session-2.json",
          ".gitkeep",
        ]);

        const result = await persister.list();

        expect(result).toEqual(["session-1", "session-2"]);
      });

      it("returns empty array when directory does not exist", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        (mockFs.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(error);

        const result = await persister.list();

        expect(result).toEqual([]);
      });

      it("throws on other errors", async () => {
        const error = new Error("Permission denied");
        (mockFs.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(error);

        await expect(persister.list()).rejects.toThrow("Permission denied");
      });
    });

    describe("getSessionsPath", () => {
      it("returns correct path with default options", () => {
        const p = new FileStatePersister();
        // Platform-independent check - normalize to forward slashes for comparison
        const normalizedPath = p.getSessionsPath().replace(/\\/g, "/");
        expect(normalizedPath).toContain(DEFAULT_SESSION_DIR);
      });

      it("returns correct path with custom options", () => {
        const p = new FileStatePersister({
          baseDir: "/custom/base",
          sessionDir: "custom/sessions",
        });
        expect(p.getSessionsPath()).toBe(path.join("/custom/base", "custom/sessions"));
      });
    });
  });

  describe("MemoryStatePersister", () => {
    let persister: MemoryStatePersister;

    beforeEach(() => {
      persister = new MemoryStatePersister();
    });

    it("saves and loads snapshot", async () => {
      const snapshot = createTestSnapshot("session-123");

      await persister.save(snapshot);
      const result = await persister.load("session-123");

      expect(result).toEqual(snapshot);
    });

    it("returns null for missing snapshot", async () => {
      const result = await persister.load("nonexistent");

      expect(result).toBeNull();
    });

    it("deletes snapshot", async () => {
      const snapshot = createTestSnapshot("session-123");

      await persister.save(snapshot);
      await persister.delete("session-123");
      const result = await persister.load("session-123");

      expect(result).toBeNull();
    });

    it("lists all session IDs", async () => {
      await persister.save(createTestSnapshot("session-1"));
      await persister.save(createTestSnapshot("session-2"));
      await persister.save(createTestSnapshot("session-3"));

      const result = await persister.list();

      expect(result).toEqual(["session-1", "session-2", "session-3"]);
    });

    it("clears all snapshots", async () => {
      await persister.save(createTestSnapshot("session-1"));
      await persister.save(createTestSnapshot("session-2"));

      persister.clear();

      const result = await persister.list();
      expect(result).toEqual([]);
    });

    it("returns copies to prevent mutation", async () => {
      const snapshot = createTestSnapshot("session-123");
      await persister.save(snapshot);

      const loaded = await persister.load("session-123");
      if (loaded) {
        loaded.state = "streaming";
      }

      const reloaded = await persister.load("session-123");
      expect(reloaded?.state).toBe("idle");
    });
  });

  describe("createSnapshot", () => {
    it("creates snapshot with correct structure", () => {
      const context = createTestContext();
      const snapshot = createSnapshot("session-123", "streaming", [], context);

      expect(snapshot.id).toBe("session-123");
      expect(snapshot.state).toBe("streaming");
      expect(snapshot.messages).toEqual([]);
      expect(snapshot.context).toBe(context);
      expect(snapshot.version).toBe(SNAPSHOT_VERSION);
      expect(typeof snapshot.timestamp).toBe("number");
    });

    it("includes current timestamp", () => {
      const now = Date.now();
      const snapshot = createSnapshot("session-123", "idle", [], createTestContext());

      expect(snapshot.timestamp).toBeGreaterThanOrEqual(now);
      expect(snapshot.timestamp).toBeLessThanOrEqual(Date.now() + 100);
    });
  });

  describe("isValidSnapshot", () => {
    it("returns true for valid snapshot", () => {
      const snapshot = createTestSnapshot("session-123");
      expect(isValidSnapshot(snapshot)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isValidSnapshot(null)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isValidSnapshot("string")).toBe(false);
      expect(isValidSnapshot(123)).toBe(false);
    });

    it("returns false for missing id", () => {
      const snapshot = createTestSnapshot("session-123") as unknown as Record<string, unknown>;
      delete snapshot.id;
      expect(isValidSnapshot(snapshot)).toBe(false);
    });

    it("returns false for missing state", () => {
      const snapshot = createTestSnapshot("session-123") as unknown as Record<string, unknown>;
      delete snapshot.state;
      expect(isValidSnapshot(snapshot)).toBe(false);
    });

    it("returns false for missing version", () => {
      const snapshot = createTestSnapshot("session-123") as unknown as Record<string, unknown>;
      delete snapshot.version;
      expect(isValidSnapshot(snapshot)).toBe(false);
    });

    it("returns false for non-array messages", () => {
      const snapshot = createTestSnapshot("session-123") as unknown as Record<string, unknown>;
      snapshot.messages = "not an array";
      expect(isValidSnapshot(snapshot)).toBe(false);
    });

    it("returns false for null context", () => {
      const snapshot = createTestSnapshot("session-123") as unknown as Record<string, unknown>;
      snapshot.context = null;
      expect(isValidSnapshot(snapshot)).toBe(false);
    });
  });
});

// Helper functions
function createTestContext(): SnapshotContext {
  return {
    stateContext: {
      sessionId: "session-123",
      messageId: "msg-1",
      attempt: 0,
      enteredAt: Date.now(),
      metadata: {},
    },
    cwd: "/test/cwd",
    providerType: "anthropic",
    model: "claude-3-opus",
    mode: "code",
  };
}

function createTestSnapshot(id: string): SessionSnapshot {
  return {
    id,
    state: "idle",
    messages: [],
    context: createTestContext(),
    timestamp: Date.now(),
    version: SNAPSHOT_VERSION,
  };
}

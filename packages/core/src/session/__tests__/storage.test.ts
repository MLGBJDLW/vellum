import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createStorageConfig,
  getDefaultStorageConfig,
  StorageConfigSchema,
  StorageError,
  StorageErrorType,
  StorageManager,
} from "../storage.js";
import type { Session, SessionMetadata } from "../types.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

describe("StorageConfig", () => {
  describe("StorageConfigSchema", () => {
    it("should validate a complete config", () => {
      const config = {
        basePath: "/some/path",
        maxSessions: 50,
        compressionEnabled: false,
        indexFileName: "custom.json",
      };

      const result = StorageConfigSchema.parse(config);

      expect(result).toEqual(config);
    });

    it("should apply defaults for optional fields", () => {
      const config = {
        basePath: "/some/path",
      };

      const result = StorageConfigSchema.parse(config);

      expect(result.basePath).toBe("/some/path");
      expect(result.maxSessions).toBe(100);
      expect(result.compressionEnabled).toBe(true);
      expect(result.indexFileName).toBe("index.json");
    });

    it("should reject invalid maxSessions", () => {
      const config = {
        basePath: "/some/path",
        maxSessions: -1,
      };

      expect(() => StorageConfigSchema.parse(config)).toThrow();
    });

    it("should reject non-integer maxSessions", () => {
      const config = {
        basePath: "/some/path",
        maxSessions: 10.5,
      };

      expect(() => StorageConfigSchema.parse(config)).toThrow();
    });
  });

  describe("getDefaultStorageConfig", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore original environment
      process.env = { ...originalEnv };
      // Note: process.platform is read-only, so we test behavior through mocking
    });

    it("should return a valid StorageConfig", () => {
      const config = getDefaultStorageConfig();

      expect(config).toHaveProperty("basePath");
      expect(config).toHaveProperty("maxSessions", 100);
      expect(config).toHaveProperty("compressionEnabled", true);
      expect(config).toHaveProperty("indexFileName", "index.json");
    });

    it("should return basePath as a string", () => {
      const config = getDefaultStorageConfig();

      expect(typeof config.basePath).toBe("string");
      expect(config.basePath.length).toBeGreaterThan(0);
    });

    it("should include 'vellum/sessions' in the path", () => {
      const config = getDefaultStorageConfig();
      const normalizedPath = config.basePath.replace(/\\/g, "/");

      expect(normalizedPath).toContain("vellum/sessions");
    });

    it("should pass schema validation", () => {
      const config = getDefaultStorageConfig();

      const result = StorageConfigSchema.safeParse(config);

      expect(result.success).toBe(true);
    });
  });

  describe("getDefaultStorageConfig - Windows path", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

    beforeEach(() => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
      });
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("should use APPDATA on Windows when available", () => {
      process.env.APPDATA = "C:\\Users\\Test\\AppData\\Roaming";

      const config = getDefaultStorageConfig();

      expect(config.basePath).toBe(
        path.join("C:\\Users\\Test\\AppData\\Roaming", "vellum", "sessions")
      );
    });

    it("should fallback to homedir on Windows when APPDATA is not set", () => {
      delete process.env.APPDATA;
      const homedir = os.homedir();

      const config = getDefaultStorageConfig();

      expect(config.basePath).toBe(path.join(homedir, "AppData", "Roaming", "vellum", "sessions"));
    });
  });

  describe("getDefaultStorageConfig - macOS path", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

    beforeEach(() => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        writable: true,
      });
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("should use Library/Application Support on macOS", () => {
      const homedir = os.homedir();

      const config = getDefaultStorageConfig();

      expect(config.basePath).toBe(
        path.join(homedir, "Library", "Application Support", "vellum", "sessions")
      );
    });
  });

  describe("getDefaultStorageConfig - Linux path", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalEnv = { ...process.env };

    beforeEach(() => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        writable: true,
      });
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
      process.env = { ...originalEnv };
    });

    it("should use XDG_DATA_HOME on Linux when available", () => {
      process.env.XDG_DATA_HOME = "/custom/data";

      const config = getDefaultStorageConfig();

      expect(config.basePath).toBe(path.join("/custom/data", "vellum", "sessions"));
    });

    it("should fallback to ~/.local/share on Linux when XDG_DATA_HOME is not set", () => {
      delete process.env.XDG_DATA_HOME;
      const homedir = os.homedir();

      const config = getDefaultStorageConfig();

      expect(config.basePath).toBe(path.join(homedir, ".local", "share", "vellum", "sessions"));
    });
  });

  describe("createStorageConfig", () => {
    it("should return default config when no overrides provided", () => {
      const config = createStorageConfig();
      const defaultConfig = getDefaultStorageConfig();

      expect(config).toEqual(defaultConfig);
    });

    it("should override basePath", () => {
      const config = createStorageConfig({ basePath: "/custom/path" });

      expect(config.basePath).toBe("/custom/path");
      expect(config.maxSessions).toBe(100);
      expect(config.compressionEnabled).toBe(true);
      expect(config.indexFileName).toBe("index.json");
    });

    it("should override maxSessions", () => {
      const config = createStorageConfig({ maxSessions: 50 });

      expect(config.maxSessions).toBe(50);
    });

    it("should override compressionEnabled", () => {
      const config = createStorageConfig({ compressionEnabled: false });

      expect(config.compressionEnabled).toBe(false);
    });

    it("should override indexFileName", () => {
      const config = createStorageConfig({ indexFileName: "sessions.json" });

      expect(config.indexFileName).toBe("sessions.json");
    });

    it("should override multiple fields", () => {
      const config = createStorageConfig({
        basePath: "/custom/path",
        maxSessions: 25,
        compressionEnabled: false,
        indexFileName: "custom.json",
      });

      expect(config.basePath).toBe("/custom/path");
      expect(config.maxSessions).toBe(25);
      expect(config.compressionEnabled).toBe(false);
      expect(config.indexFileName).toBe("custom.json");
    });
  });
});

// =============================================================================
// StorageManager Tests
// =============================================================================

describe("StorageManager", () => {
  let tempDir: string;

  // Helper to create a valid SessionMetadata object
  function createTestMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
    const now = new Date();
    return {
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Session",
      createdAt: now,
      updatedAt: now,
      lastActive: now,
      status: "active",
      mode: "chat",
      tags: [],
      workingDirectory: "/test/dir",
      tokenCount: 0,
      messageCount: 0,
      ...overrides,
    };
  }

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(
      os.tmpdir(),
      `vellum-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("create", () => {
    it("should create a StorageManager with default config", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      expect(manager).toBeInstanceOf(StorageManager);
      expect(manager.getConfig().basePath).toBe(tempDir);
    });

    it("should create sessions directory", async () => {
      await StorageManager.create({ basePath: tempDir });

      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should create .recovery subdirectory", async () => {
      await StorageManager.create({ basePath: tempDir });

      const recoveryPath = path.join(tempDir, ".recovery");
      const stat = await fs.stat(recoveryPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should use custom config values", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        maxSessions: 50,
        compressionEnabled: false,
        indexFileName: "custom.json",
      });

      const config = manager.getConfig();
      expect(config.maxSessions).toBe(50);
      expect(config.compressionEnabled).toBe(false);
      expect(config.indexFileName).toBe("custom.json");
    });

    it("should load existing index from disk", async () => {
      // Pre-create an index file
      await fs.mkdir(tempDir, { recursive: true });
      const metadata = createTestMetadata();
      const indexContent = { [metadata.id]: metadata };
      await fs.writeFile(path.join(tempDir, "index.json"), JSON.stringify(indexContent), "utf-8");

      const manager = await StorageManager.create({ basePath: tempDir });
      const index = await manager.getIndex();

      expect(index.size).toBe(1);
      expect(index.has(metadata.id)).toBe(true);
    });

    it("should start with empty index when file doesn't exist", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const index = await manager.getIndex();

      expect(index.size).toBe(0);
    });

    it("should handle corrupted index file gracefully", async () => {
      // Pre-create a corrupted index file
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, "index.json"), "invalid json{", "utf-8");

      const manager = await StorageManager.create({ basePath: tempDir });
      const index = await manager.getIndex();

      expect(index.size).toBe(0);
    });
  });

  describe("getIndex", () => {
    it("should return a copy of the index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      const index1 = await manager.getIndex();
      const index2 = await manager.getIndex();

      expect(index1).not.toBe(index2); // Different Map instances
      expect(index1.size).toBe(index2.size);
    });

    it("should not allow external mutation of internal index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      const index = await manager.getIndex();
      index.delete(metadata.id); // Mutate the returned copy

      const freshIndex = await manager.getIndex();
      expect(freshIndex.has(metadata.id)).toBe(true); // Internal index unchanged
    });
  });

  describe("updateIndex", () => {
    it("should add new entry to index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();

      await manager.updateIndex(metadata);
      const index = await manager.getIndex();

      expect(index.size).toBe(1);
      expect(index.get(metadata.id)).toEqual(metadata);
    });

    it("should update existing entry in index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      const updatedMetadata = { ...metadata, title: "Updated Title" };
      await manager.updateIndex(updatedMetadata);
      const index = await manager.getIndex();

      expect(index.size).toBe(1);
      expect(index.get(metadata.id)?.title).toBe("Updated Title");
    });

    it("should persist index to disk", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();

      await manager.updateIndex(metadata);

      // Read directly from disk
      const content = await fs.readFile(path.join(tempDir, "index.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed[metadata.id]).toBeDefined();
      expect(parsed[metadata.id].title).toBe(metadata.title);
    });

    it("should add multiple entries", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata1 = createTestMetadata({ id: "11111111-1111-1111-1111-111111111111" });
      const metadata2 = createTestMetadata({ id: "22222222-2222-2222-2222-222222222222" });

      await manager.updateIndex(metadata1);
      await manager.updateIndex(metadata2);
      const index = await manager.getIndex();

      expect(index.size).toBe(2);
    });
  });

  describe("removeFromIndex", () => {
    it("should remove existing entry from index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      await manager.removeFromIndex(metadata.id);
      const index = await manager.getIndex();

      expect(index.size).toBe(0);
      expect(index.has(metadata.id)).toBe(false);
    });

    it("should persist removal to disk", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      await manager.removeFromIndex(metadata.id);

      // Read directly from disk
      const content = await fs.readFile(path.join(tempDir, "index.json"), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed[metadata.id]).toBeUndefined();
    });

    it("should be a no-op for non-existent entry", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      await manager.removeFromIndex("non-existent-id");
      const index = await manager.getIndex();

      expect(index.size).toBe(1); // Original entry still there
    });

    it("should only remove specified entry", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata1 = createTestMetadata({ id: "11111111-1111-1111-1111-111111111111" });
      const metadata2 = createTestMetadata({ id: "22222222-2222-2222-2222-222222222222" });
      await manager.updateIndex(metadata1);
      await manager.updateIndex(metadata2);

      await manager.removeFromIndex(metadata1.id);
      const index = await manager.getIndex();

      expect(index.size).toBe(1);
      expect(index.has(metadata1.id)).toBe(false);
      expect(index.has(metadata2.id)).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("should return the storage configuration", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        maxSessions: 75,
      });

      const config = manager.getConfig();

      expect(config.basePath).toBe(tempDir);
      expect(config.maxSessions).toBe(75);
    });
  });

  describe("index persistence across instances", () => {
    it("should load index from previous manager instance", async () => {
      const metadata = createTestMetadata();

      // First manager: add data
      const manager1 = await StorageManager.create({ basePath: tempDir });
      await manager1.updateIndex(metadata);

      // Second manager: should see the data
      const manager2 = await StorageManager.create({ basePath: tempDir });
      const index = await manager2.getIndex();

      expect(index.size).toBe(1);
      expect(index.get(metadata.id)?.title).toBe(metadata.title);
    });
  });

  // ===========================================================================
  // Session CRUD Operations Tests
  // ===========================================================================

  // Helper to create a valid Session object
  function createTestSession(overrides: Partial<Session> = {}): Session {
    const metadata = createTestMetadata(overrides.metadata);
    return {
      metadata,
      messages: overrides.messages ?? [],
      checkpoints: overrides.checkpoints ?? [],
    };
  }

  describe("save", () => {
    it("should save session with compression enabled", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();

      await manager.save(session);

      // Check file exists
      const filePath = path.join(tempDir, `${session.metadata.id}.json.gz`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);

      // Verify content is compressed
      const content = await fs.readFile(filePath);
      const decompressed = await gunzip(content);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.metadata.id).toBe(session.metadata.id);
    });

    it("should save session without compression", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();

      await manager.save(session);

      // Check file exists
      const filePath = path.join(tempDir, `${session.metadata.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);

      // Verify content is plain JSON
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.metadata.id).toBe(session.metadata.id);
    });

    it("should update index after saving", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();

      await manager.save(session);

      const index = await manager.getIndex();
      expect(index.has(session.metadata.id)).toBe(true);
      expect(index.get(session.metadata.id)?.title).toBe(session.metadata.title);
    });

    it("should overwrite existing session file", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();

      await manager.save(session);

      // Modify and save again
      const updatedSession = {
        ...session,
        metadata: { ...session.metadata, title: "Updated Title" },
      };
      await manager.save(updatedSession);

      // Verify updated content
      const loaded = await manager.load(session.metadata.id);
      expect(loaded.metadata.title).toBe("Updated Title");
    });

    it("should use atomic write (temp file then rename)", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();

      await manager.save(session);

      // Temp file should not exist after successful save
      const tempPath = path.join(tempDir, `${session.metadata.id}.json.gz.tmp`);
      await expect(fs.access(tempPath)).rejects.toThrow();
    });
  });

  describe("load", () => {
    it("should load compressed session", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();
      await manager.save(session);

      const loaded = await manager.load(session.metadata.id);

      expect(loaded.metadata.id).toBe(session.metadata.id);
      expect(loaded.metadata.title).toBe(session.metadata.title);
    });

    it("should load uncompressed session", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();
      await manager.save(session);

      const loaded = await manager.load(session.metadata.id);

      expect(loaded.metadata.id).toBe(session.metadata.id);
      expect(loaded.metadata.title).toBe(session.metadata.title);
    });

    it("should prefer compressed file over uncompressed", async () => {
      const session = createTestSession();

      // Create both compressed and uncompressed files
      const jsonPath = path.join(tempDir, `${session.metadata.id}.json`);
      const gzPath = path.join(tempDir, `${session.metadata.id}.json.gz`);

      await fs.mkdir(tempDir, { recursive: true });

      // Uncompressed with different title
      const uncompressedSession = {
        ...session,
        metadata: { ...session.metadata, title: "Uncompressed" },
      };
      await fs.writeFile(jsonPath, JSON.stringify(uncompressedSession), "utf-8");

      // Compressed with original title
      const compressedSession = {
        ...session,
        metadata: { ...session.metadata, title: "Compressed" },
      };
      const compressed = await gzip(Buffer.from(JSON.stringify(compressedSession), "utf-8"));
      await fs.writeFile(gzPath, compressed);

      const manager = await StorageManager.create({ basePath: tempDir });
      const loaded = await manager.load(session.metadata.id);

      expect(loaded.metadata.title).toBe("Compressed");
    });

    it("should throw sessionNotFound for non-existent session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      await expect(manager.load("non-existent-id")).rejects.toThrow(StorageError);
      await expect(manager.load("non-existent-id")).rejects.toMatchObject({
        type: StorageErrorType.SESSION_NOT_FOUND,
        sessionId: "non-existent-id",
      });
    });

    it("should throw on invalid JSON", async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, "bad-session.json");
      await fs.writeFile(filePath, "invalid json{", "utf-8");

      const manager = await StorageManager.create({ basePath: tempDir });

      await expect(manager.load("bad-session")).rejects.toThrow(StorageError);
      await expect(manager.load("bad-session")).rejects.toMatchObject({
        type: StorageErrorType.SERIALIZATION,
      });
    });

    it("should throw on invalid session schema", async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const filePath = path.join(tempDir, "invalid-session.json");
      // Valid JSON but invalid Session schema
      await fs.writeFile(filePath, JSON.stringify({ invalid: "data" }), "utf-8");

      const manager = await StorageManager.create({ basePath: tempDir });

      await expect(manager.load("invalid-session")).rejects.toThrow(StorageError);
      await expect(manager.load("invalid-session")).rejects.toMatchObject({
        type: StorageErrorType.SERIALIZATION,
      });
    });

    it("should preserve all session data through save/load cycle", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession({
        messages: [],
        checkpoints: [],
      });

      await manager.save(session);
      const loaded = await manager.load(session.metadata.id);

      expect(loaded.metadata.id).toBe(session.metadata.id);
      expect(loaded.metadata.title).toBe(session.metadata.title);
      expect(loaded.metadata.status).toBe(session.metadata.status);
      expect(loaded.metadata.mode).toBe(session.metadata.mode);
      expect(loaded.metadata.tags).toEqual(session.metadata.tags);
      expect(loaded.metadata.tokenCount).toBe(session.metadata.tokenCount);
      expect(loaded.metadata.messageCount).toBe(session.metadata.messageCount);
      expect(loaded.messages).toEqual(session.messages);
      expect(loaded.checkpoints).toEqual(session.checkpoints);
    });
  });

  describe("delete", () => {
    it("should delete compressed session file", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();
      await manager.save(session);

      const result = await manager.delete(session.metadata.id);

      expect(result).toBe(true);

      // File should not exist
      const filePath = path.join(tempDir, `${session.metadata.id}.json.gz`);
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("should delete uncompressed session file", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();
      await manager.save(session);

      const result = await manager.delete(session.metadata.id);

      expect(result).toBe(true);

      // File should not exist
      const filePath = path.join(tempDir, `${session.metadata.id}.json`);
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("should delete both compressed and uncompressed files", async () => {
      const session = createTestSession();

      // Create both files
      await fs.mkdir(tempDir, { recursive: true });
      const jsonPath = path.join(tempDir, `${session.metadata.id}.json`);
      const gzPath = path.join(tempDir, `${session.metadata.id}.json.gz`);
      await fs.writeFile(jsonPath, JSON.stringify(session), "utf-8");
      const compressed = await gzip(Buffer.from(JSON.stringify(session), "utf-8"));
      await fs.writeFile(gzPath, compressed);

      const manager = await StorageManager.create({ basePath: tempDir });
      await manager.updateIndex(session.metadata);

      const result = await manager.delete(session.metadata.id);

      expect(result).toBe(true);
      await expect(fs.access(jsonPath)).rejects.toThrow();
      await expect(fs.access(gzPath)).rejects.toThrow();
    });

    it("should remove from index after deleting", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();
      await manager.save(session);

      await manager.delete(session.metadata.id);

      const index = await manager.getIndex();
      expect(index.has(session.metadata.id)).toBe(false);
    });

    it("should return false for non-existent session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      const result = await manager.delete("non-existent-id");

      expect(result).toBe(false);
    });

    it("should return true when only index entry exists", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const metadata = createTestMetadata();
      await manager.updateIndex(metadata);

      const result = await manager.delete(metadata.id);

      expect(result).toBe(true);
      const index = await manager.getIndex();
      expect(index.has(metadata.id)).toBe(false);
    });
  });

  describe("exists", () => {
    it("should return true for existing compressed session", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();
      await manager.save(session);

      const result = await manager.exists(session.metadata.id);

      expect(result).toBe(true);
    });

    it("should return true for existing uncompressed session", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();
      await manager.save(session);

      const result = await manager.exists(session.metadata.id);

      expect(result).toBe(true);
    });

    it("should return false for non-existent session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      const result = await manager.exists("non-existent-id");

      expect(result).toBe(false);
    });

    it("should return true if either file format exists", async () => {
      const session = createTestSession();
      await fs.mkdir(tempDir, { recursive: true });

      // Create only uncompressed file
      const jsonPath = path.join(tempDir, `${session.metadata.id}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(session), "utf-8");

      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true, // Manager prefers compressed, but uncompressed exists
      });

      const result = await manager.exists(session.metadata.id);

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // Retention Policy & Archiving Tests
  // ===========================================================================

  describe("enforceRetentionPolicy", () => {
    it("should not archive when under limit", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        maxSessions: 5,
      });

      // Create 3 sessions (under limit of 5)
      for (let i = 0; i < 3; i++) {
        const session = createTestSession({
          metadata: createTestMetadata({
            id: `1111111${i}-1111-1111-1111-111111111111`,
            lastActive: new Date(Date.now() - i * 1000),
          }),
        });
        await manager.save(session);
      }

      const archivedCount = await manager.enforceRetentionPolicy();

      expect(archivedCount).toBe(0);
      const index = await manager.getIndex();
      expect(index.size).toBe(3);
    });

    it("should archive oldest sessions when over limit", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        maxSessions: 2,
      });

      // Create 4 sessions with different ages
      const sessions = [];
      for (let i = 0; i < 4; i++) {
        const session = createTestSession({
          metadata: createTestMetadata({
            id: `1111111${i}-1111-1111-1111-111111111111`,
            lastActive: new Date(Date.now() - (4 - i) * 100000), // Oldest first
          }),
        });
        sessions.push(session);
      }

      // Save without enforcing (bypass save's auto-enforce by saving directly)
      for (const session of sessions) {
        const filePath = path.join(tempDir, `${session.metadata.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(session), "utf-8");
        await manager.updateIndex(session.metadata);
      }

      // Now enforce
      const archivedCount = await manager.enforceRetentionPolicy();

      expect(archivedCount).toBe(2); // 4 - 2 = 2 excess
      const index = await manager.getIndex();
      expect(index.size).toBe(2);

      // Verify oldest were archived (sessions 0 and 1)
      expect(index.has(sessions[0]?.metadata.id)).toBe(false);
      expect(index.has(sessions[1]?.metadata.id)).toBe(false);
      expect(index.has(sessions[2]?.metadata.id)).toBe(true);
      expect(index.has(sessions[3]?.metadata.id)).toBe(true);
    });

    it("should move archived files to archived directory", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        maxSessions: 1,
        compressionEnabled: false,
      });

      // Create 2 sessions
      const oldSession = createTestSession({
        metadata: createTestMetadata({
          id: "11111110-1111-1111-1111-111111111111",
          lastActive: new Date(Date.now() - 100000),
        }),
      });
      const newSession = createTestSession({
        metadata: createTestMetadata({
          id: "11111111-1111-1111-1111-111111111111",
          lastActive: new Date(),
        }),
      });

      // Save both directly to bypass auto-enforce
      await fs.writeFile(
        path.join(tempDir, `${oldSession.metadata.id}.json`),
        JSON.stringify(oldSession),
        "utf-8"
      );
      await fs.writeFile(
        path.join(tempDir, `${newSession.metadata.id}.json`),
        JSON.stringify(newSession),
        "utf-8"
      );
      await manager.updateIndex(oldSession.metadata);
      await manager.updateIndex(newSession.metadata);

      await manager.enforceRetentionPolicy();

      // Old session should be in archived/
      const archivedPath = path.join(tempDir, "archived", `${oldSession.metadata.id}.json`);
      const stat = await fs.stat(archivedPath);
      expect(stat.isFile()).toBe(true);

      // Original location should not exist
      const originalPath = path.join(tempDir, `${oldSession.metadata.id}.json`);
      await expect(fs.access(originalPath)).rejects.toThrow();
    });
  });

  describe("archiveSession", () => {
    it("should move session to archived directory", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();
      await manager.save(session);

      await manager.archiveSession(session.metadata.id);

      // Should exist in archived/
      const archivedPath = path.join(tempDir, "archived", `${session.metadata.id}.json`);
      const stat = await fs.stat(archivedPath);
      expect(stat.isFile()).toBe(true);

      // Should not exist in original location
      const originalPath = path.join(tempDir, `${session.metadata.id}.json`);
      await expect(fs.access(originalPath)).rejects.toThrow();
    });

    it("should update metadata status to archived", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: false,
      });
      const session = createTestSession();
      await manager.save(session);

      await manager.archiveSession(session.metadata.id);

      // Load from archived and check status
      const archivedPath = path.join(tempDir, "archived", `${session.metadata.id}.json`);
      const content = await fs.readFile(archivedPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.metadata.status).toBe("archived");
    });

    it("should remove from active index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();
      await manager.save(session);

      await manager.archiveSession(session.metadata.id);

      const index = await manager.getIndex();
      expect(index.has(session.metadata.id)).toBe(false);
    });

    it("should add to archived index", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();
      await manager.save(session);

      await manager.archiveSession(session.metadata.id);

      // Check archived-index.json
      const archivedIndexPath = path.join(tempDir, "archived", "archived-index.json");
      const content = await fs.readFile(archivedIndexPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed[session.metadata.id]).toBeDefined();
      expect(parsed[session.metadata.id].status).toBe("archived");
    });

    it("should throw for non-existent session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      await expect(manager.archiveSession("non-existent-id")).rejects.toThrow("Session not found");
    });

    it("should handle compressed files", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();
      await manager.save(session);

      await manager.archiveSession(session.metadata.id);

      // Should exist in archived/ as .gz
      const archivedPath = path.join(tempDir, "archived", `${session.metadata.id}.json.gz`);
      const stat = await fs.stat(archivedPath);
      expect(stat.isFile()).toBe(true);

      // Verify content is still valid
      const content = await fs.readFile(archivedPath);
      const decompressed = await gunzip(content);
      const parsed = JSON.parse(decompressed.toString("utf-8"));
      expect(parsed.metadata.id).toBe(session.metadata.id);
      expect(parsed.metadata.status).toBe("archived");
    });
  });

  describe("getArchivedSessions", () => {
    it("should return empty array when no archived sessions", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      const archived = await manager.getArchivedSessions();

      expect(archived).toEqual([]);
    });

    it("should return archived session metadata", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();
      await manager.save(session);
      await manager.archiveSession(session.metadata.id);

      const archived = await manager.getArchivedSessions();

      expect(archived.length).toBe(1);
      expect(archived[0]?.id).toBe(session.metadata.id);
      expect(archived[0]?.status).toBe("archived");
    });

    it("should return multiple archived sessions", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      // Create and archive multiple sessions
      for (let i = 0; i < 3; i++) {
        const session = createTestSession({
          metadata: createTestMetadata({
            id: `1111111${i}-1111-1111-1111-111111111111`,
          }),
        });
        await manager.save(session);
        await manager.archiveSession(session.metadata.id);
      }

      const archived = await manager.getArchivedSessions();

      expect(archived.length).toBe(3);
    });
  });

  describe("loadArchivedSession", () => {
    it("should load archived session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });
      const session = createTestSession();
      await manager.save(session);
      await manager.archiveSession(session.metadata.id);

      const loaded = await manager.loadArchivedSession(session.metadata.id);

      expect(loaded.metadata.id).toBe(session.metadata.id);
      expect(loaded.metadata.status).toBe("archived");
    });

    it("should load compressed archived session", async () => {
      const manager = await StorageManager.create({
        basePath: tempDir,
        compressionEnabled: true,
      });
      const session = createTestSession();
      await manager.save(session);
      await manager.archiveSession(session.metadata.id);

      const loaded = await manager.loadArchivedSession(session.metadata.id);

      expect(loaded.metadata.id).toBe(session.metadata.id);
    });

    it("should throw for non-existent archived session", async () => {
      const manager = await StorageManager.create({ basePath: tempDir });

      await expect(manager.loadArchivedSession("non-existent-id")).rejects.toThrow(
        "Session not found"
      );
    });
  });

  describe("create with archived directory", () => {
    it("should create archived subdirectory on initialization", async () => {
      await StorageManager.create({ basePath: tempDir });

      const archivedPath = path.join(tempDir, "archived");
      const stat = await fs.stat(archivedPath);
      expect(stat.isDirectory()).toBe(true);
    });
  });
});

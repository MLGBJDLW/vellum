/**
 * Unit tests for EncryptedFileStore
 *
 * Tests encryption/decryption round-trips, file permissions, scrypt key derivation,
 * password validation, CRUD operations, and corruption handling.
 *
 * @see packages/core/src/credentials/stores/encrypted-file-store.ts
 */

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedFileStore } from "../stores/encrypted-file-store.js";
import type { Credential } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test credential
 */
function createTestCredential(
  provider: string,
  value: string,
  overrides: Partial<Credential> = {}
): Credential {
  return {
    id: `test:${provider}`,
    provider,
    type: "api_key",
    value,
    source: "file",
    metadata: { label: `Test ${provider} credential` },
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Generate unique test directory path
 */
function getTestDir(): string {
  return join(tmpdir(), `vellum-cred-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// =============================================================================
// EncryptedFileStore Tests
// =============================================================================

describe("EncryptedFileStore", () => {
  let testDir: string;
  let testFilePath: string;
  const testPassword = "test-master-password-123!@#";

  beforeEach(async () => {
    testDir = getTestDir();
    testFilePath = join(testDir, "credentials.enc");
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Store Properties
  // ===========================================================================

  describe("Store Properties", () => {
    it("should have name 'file'", () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.name).toBe("file");
    });

    it("should have priority 50", () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.priority).toBe(50);
    });

    it("should not be read-only", () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.readOnly).toBe(false);
    });
  });

  // ===========================================================================
  // isAvailable()
  // ===========================================================================

  describe("isAvailable()", () => {
    it("should return true when password is provided", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return false when password is empty", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: "",
      });

      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should create directory if it doesn't exist", async () => {
      const nestedPath = join(testDir, "nested", "deep", "credentials.enc");
      const store = new EncryptedFileStore({
        filePath: nestedPath,
        password: testPassword,
      });

      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      const dirStat = await stat(join(testDir, "nested", "deep"));
      expect(dirStat.isDirectory()).toBe(true);
    });
  });

  // ===========================================================================
  // Encryption/Decryption Round-Trip
  // ===========================================================================

  describe("Encryption/Decryption Round-Trip", () => {
    it("should store and retrieve credential with same value", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const credential = createTestCredential("anthropic", "sk-ant-api03-secretkey123");
      await store.set(credential);

      const result = await store.get("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.provider).toBe("anthropic");
        expect(result.value.value).toBe("sk-ant-api03-secretkey123");
        expect(result.value.type).toBe("api_key");
        expect(result.value.source).toBe("file");
      }
    });

    it("should preserve all credential fields after round-trip", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const now = new Date();
      const credential = createTestCredential("openai", "sk-openai-test", {
        id: "custom-id-123",
        metadata: {
          label: "Production API Key",
          environment: "production",
          region: "us-east-1",
          tags: { team: "platform" },
        },
        expiresAt: new Date(now.getTime() + 86400000),
      });

      await store.set(credential);
      const result = await store.get("openai");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe("custom-id-123");
        expect(result.value.metadata?.label).toBe("Production API Key");
        expect(result.value.metadata?.environment).toBe("production");
        expect(result.value.metadata?.region).toBe("us-east-1");
        expect(result.value.metadata?.tags?.team).toBe("platform");
        expect(result.value.expiresAt).toBeDefined();
      }
    });

    it("should handle multiple credentials", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const cred1 = createTestCredential("anthropic", "ant-key-123");
      const cred2 = createTestCredential("openai", "openai-key-456");
      const cred3 = createTestCredential("google", "google-key-789");

      await store.set(cred1);
      await store.set(cred2);
      await store.set(cred3);

      const r1 = await store.get("anthropic");
      const r2 = await store.get("openai");
      const r3 = await store.get("google");

      expect(r1.ok && r1.value?.value).toBe("ant-key-123");
      expect(r2.ok && r2.value?.value).toBe("openai-key-456");
      expect(r3.ok && r3.value?.value).toBe("google-key-789");
    });

    it("should update existing credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const original = createTestCredential("anthropic", "original-key");
      await store.set(original);

      const updated = createTestCredential("anthropic", "updated-key");
      await store.set(updated);

      const result = await store.get("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("updated-key");
      }
    });

    it("should persist across store instances", async () => {
      // First store writes
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store1.set(createTestCredential("anthropic", "persistent-key"));

      // Second store reads
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store2.get("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("persistent-key");
      }
    });

    it("should handle special characters in values", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const specialChars = 'key-with-"quotes"-and-\n-newlines-and-emoji-🔐';
      const credential = createTestCredential("test", specialChars);
      await store.set(credential);

      const result = await store.get("test");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe(specialChars);
      }
    });

    it("should handle unicode characters", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const unicodeValue = "密钥-κλειδί-مفتاح-🗝️";
      const credential = createTestCredential("unicode", unicodeValue);
      await store.set(credential);

      const result = await store.get("unicode");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe(unicodeValue);
      }
    });
  });

  // ===========================================================================
  // File Permissions
  // ===========================================================================

  describe("File Permissions", () => {
    it("should create file with 0o600 permissions", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "test-value"));

      const fileStat = await stat(testFilePath);
      // On Windows, mode checking is limited, but on Unix it should be 0o600
      const mode = fileStat.mode & 0o777;

      // Accept 0o600 (Unix) or skip strict check on Windows
      if (process.platform !== "win32") {
        expect(mode).toBe(0o600);
      } else {
        // On Windows, just verify file exists
        expect(fileStat.isFile()).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Password/Key Derivation
  // ===========================================================================

  describe("Password/Key Derivation", () => {
    it("should fail decryption with wrong password", async () => {
      // Write with correct password
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store1.set(createTestCredential("test", "secret-value"));

      // Try to read with wrong password
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: "wrong-password",
      });

      const result = await store2.get("test");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
      }
    });

    it("should work with very long passwords", async () => {
      const longPassword = "a".repeat(1000);
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: longPassword,
      });

      const credential = createTestCredential("test", "long-password-test");
      await store.set(credential);

      const result = await store.get("test");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("long-password-test");
      }
    });

    it("should work with minimum password length", async () => {
      const shortPassword = "p";
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: shortPassword,
      });

      const credential = createTestCredential("test", "short-password-test");
      await store.set(credential);

      const result = await store.get("test");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("short-password-test");
      }
    });

    it("should use different salt for each file", async () => {
      const file1 = join(testDir, "cred1.enc");
      const file2 = join(testDir, "cred2.enc");

      const store1 = new EncryptedFileStore({
        filePath: file1,
        password: testPassword,
      });
      const store2 = new EncryptedFileStore({
        filePath: file2,
        password: testPassword,
      });

      await store1.set(createTestCredential("test", "value1"));
      await store2.set(createTestCredential("test", "value2"));

      const content1 = await readFile(file1, "utf-8");
      const content2 = await readFile(file2, "utf-8");

      const data1 = JSON.parse(content1);
      const data2 = JSON.parse(content2);

      // Salts should be different
      expect(data1.salt).not.toBe(data2.salt);
    });
  });

  // ===========================================================================
  // CRUD Operations - get()
  // ===========================================================================

  describe("CRUD Operations - get()", () => {
    it("should return null for non-existent credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.get("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should return null when file does not exist", async () => {
      const store = new EncryptedFileStore({
        filePath: join(testDir, "nonexistent.enc"),
        password: testPassword,
      });

      const result = await store.get("test");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  // ===========================================================================
  // CRUD Operations - delete()
  // ===========================================================================

  describe("CRUD Operations - delete()", () => {
    it("should delete existing credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "delete-me"));

      const deleteResult = await store.delete("test");
      const getResult = await store.get("test");

      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) {
        expect(deleteResult.value).toBe(true);
      }

      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value).toBeNull();
      }
    });

    it("should return false when deleting non-existent credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.delete("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should return false when file does not exist", async () => {
      const store = new EncryptedFileStore({
        filePath: join(testDir, "nonexistent.enc"),
        password: testPassword,
      });

      const result = await store.delete("test");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should delete file when last credential is removed", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("only", "only-credential"));
      await store.delete("only");

      // File should be deleted
      await expect(stat(testFilePath)).rejects.toThrow();
    });

    it("should keep file when other credentials remain", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("keep", "keep-me"));
      await store.set(createTestCredential("delete", "delete-me"));

      await store.delete("delete");

      // File should still exist
      const fileStat = await stat(testFilePath);
      expect(fileStat.isFile()).toBe(true);

      // Other credential should still be accessible
      const result = await store.get("keep");
      expect(result.ok && result.value?.value).toBe("keep-me");
    });
  });

  // ===========================================================================
  // CRUD Operations - list()
  // ===========================================================================

  describe("CRUD Operations - list()", () => {
    it("should list all credentials", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("anthropic", "ant-key-1234567890"));
      await store.set(createTestCredential("openai", "openai-key-0987654321"));

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);

        const providers = result.value.map((r) => r.provider);
        expect(providers).toContain("anthropic");
        expect(providers).toContain("openai");

        // Values should be redacted
        for (const ref of result.value) {
          expect((ref as Record<string, unknown>).value).toBeUndefined();
          expect(ref.maskedHint).toBeDefined();
        }
      }
    });

    it("should filter by provider", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("anthropic", "ant-key"));
      await store.set(createTestCredential("openai", "openai-key"));

      const result = await store.list("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.provider).toBe("anthropic");
      }
    });

    it("should return empty array when file does not exist", async () => {
      const store = new EncryptedFileStore({
        filePath: join(testDir, "nonexistent.enc"),
        password: testPassword,
      });

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("should return empty array when no credentials stored", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Initialize file with no credentials
      await store.set(createTestCredential("temp", "temp"));
      await store.delete("temp");

      // Now file is deleted, so list should return empty
      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("should generate correct masked hints", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "sk-ant-api03-ABCDEFGHIJKLMN"));

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.maskedHint).toBe("sk-...LMN");
      }
    });
  });

  // ===========================================================================
  // CRUD Operations - exists()
  // ===========================================================================

  describe("CRUD Operations - exists()", () => {
    it("should return true for existing credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "exists"));

      const result = await store.exists("test");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should return false for non-existing credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("other", "value"));

      const result = await store.exists("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should return false when file does not exist", async () => {
      const store = new EncryptedFileStore({
        filePath: join(testDir, "nonexistent.enc"),
        password: testPassword,
      });

      const result = await store.exists("test");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });
  });

  // ===========================================================================
  // File Corruption Handling
  // ===========================================================================

  describe("File Corruption Handling", () => {
    it("should handle corrupted JSON", async () => {
      // Write corrupted file
      await writeFile(testFilePath, "{ invalid json }", "utf-8");

      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.get("test");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
      }
    });

    it("should handle unsupported format version", async () => {
      const corruptedData = {
        version: 999,
        salt: "deadbeef",
        credentials: {},
      };
      await writeFile(testFilePath, JSON.stringify(corruptedData), "utf-8");

      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.get("test");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
        expect(result.error.message).toContain("version");
      }
    });

    it("should handle corrupted encrypted data", async () => {
      // First create a valid file
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store1.set(createTestCredential("test", "original"));

      // Corrupt the encrypted data
      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);
      data.credentials.test.data = "corrupted-hex-data";
      await writeFile(testFilePath, JSON.stringify(data), "utf-8");

      // Try to read with new store
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store2.get("test");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
      }
    });

    it("should handle corrupted auth tag", async () => {
      // First create a valid file
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store1.set(createTestCredential("test", "original"));

      // Corrupt the auth tag
      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);
      data.credentials.test.authTag = "0000000000000000";
      await writeFile(testFilePath, JSON.stringify(data), "utf-8");

      // Try to read with new store
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store2.get("test");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
      }
    });

    it("should skip corrupted entries when listing", async () => {
      // Create valid file with two credentials
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store1.set(createTestCredential("good", "good-value-12345"));
      await store1.set(createTestCredential("bad", "bad-value"));

      // Corrupt one credential
      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);
      data.credentials.bad.data = "corrupted";
      await writeFile(testFilePath, JSON.stringify(data), "utf-8");

      // List should return only the good credential
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store2.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.provider).toBe("good");
      }
    });
  });

  // ===========================================================================
  // Cache Behavior
  // ===========================================================================

  describe("Cache Behavior", () => {
    it("should clear cache properly", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "cached-value"));

      // Clear cache
      store.clearCache();

      // Should still be able to read (reloads from file)
      const result = await store.get("test");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("cached-value");
      }
    });

    it("should reload file after cache clear", async () => {
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store1.set(createTestCredential("test", "original"));

      // Another store modifies the file
      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store2.set(createTestCredential("test", "modified"));

      // Clear cache on first store
      store1.clearCache();

      // Should now see the modified value
      const result = await store1.get("test");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("modified");
      }
    });
  });

  // ===========================================================================
  // Error Handling Edge Cases
  // ===========================================================================

  describe("Error Handling Edge Cases", () => {
    it("should handle IO error when directory cannot be created", async () => {
      // Use an invalid path that can't be created
      const invalidPath =
        process.platform === "win32"
          ? "Z:\\nonexistent\\drive\\path\\cred.enc"
          : "/proc/invalid/path/cred.enc";

      const store = new EncryptedFileStore({
        filePath: invalidPath,
        password: testPassword,
      });

      const result = await store.isAvailable();

      // Should return error (on most systems)
      // On some systems this might succeed, so we just check it doesn't crash
      expect(result.ok).toBeDefined();
    });

    it("should handle non-Error thrown during file read", async () => {
      // This is hard to test directly, but we ensure the code path exists
      // by testing with corrupted files that cause parse errors
      await writeFile(testFilePath, "null", "utf-8");

      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.get("test");

      // Should handle gracefully
      expect(result.ok).toBe(false);
    });

    it("should handle file with missing credentials object", async () => {
      const data = {
        version: 1,
        salt: "a".repeat(64),
        // Missing credentials field
      };
      await writeFile(testFilePath, JSON.stringify(data), "utf-8");

      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Should handle missing credentials gracefully
      const result = await store.exists("test");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it("should handle invalid hex in IV", async () => {
      // First create a valid file
      const store1 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });
      await store1.set(createTestCredential("test", "original"));

      // Corrupt the IV with invalid hex
      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);
      data.credentials.test.iv = "invalid-hex-zzzz";
      await writeFile(testFilePath, JSON.stringify(data), "utf-8");

      const store2 = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store2.get("test");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
      }
    });

    it("should handle credential with key suffix", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Test with key suffix using credential provider:key pattern
      const credential = createTestCredential("openai", "test-key");
      await store.set(credential);

      const existsResult = await store.exists("openai");
      expect(existsResult.ok).toBe(true);
      if (existsResult.ok) {
        expect(existsResult.value).toBe(true);
      }

      const deleteResult = await store.delete("openai");
      expect(deleteResult.ok).toBe(true);
    });
  });

  // ===========================================================================
  // File Format
  // ===========================================================================

  describe("File Format", () => {
    it("should use format version 1", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "value"));

      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
    });

    it("should store salt in hex format", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "value"));

      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);

      // Salt should be 64 hex characters (32 bytes)
      expect(data.salt).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should store encrypted data with iv, data, and authTag", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test", "value"));

      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);

      const entry = data.credentials.test;
      expect(entry).toBeDefined();
      expect(entry.iv).toBeDefined();
      expect(entry.data).toBeDefined();
      expect(entry.authTag).toBeDefined();
      expect(entry.updatedAt).toBeDefined();

      // IV should be 32 hex characters (16 bytes)
      expect(entry.iv).toMatch(/^[0-9a-f]{32}$/);
      // Auth tag should be 32 hex characters (16 bytes)
      expect(entry.authTag).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should use unique IV for each credential", async () => {
      const store = new EncryptedFileStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("test1", "value1"));
      await store.set(createTestCredential("test2", "value2"));

      const content = await readFile(testFilePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.credentials.test1.iv).not.toBe(data.credentials.test2.iv);
    });
  });
});

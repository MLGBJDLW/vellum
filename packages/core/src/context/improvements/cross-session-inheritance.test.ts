/**
 * Cross-Session Inheritance Resolver Tests
 *
 * Tests for P1-1: Cross-Session Context Inheritance.
 *
 * @module @vellum/core/context/improvements/cross-session-inheritance.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CrossSessionInheritanceResolver,
  createCrossSessionInheritanceResolver,
} from "./cross-session-inheritance.js";
import type { InheritedSummary, SessionInheritanceConfig } from "./types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_STORAGE_DIR = ".vellum-test/inheritance";

function createTestConfig(
  overrides: Partial<SessionInheritanceConfig> = {}
): SessionInheritanceConfig {
  return {
    enabled: true,
    source: "last_session",
    maxInheritedSummaries: 3,
    inheritTypes: ["summary", "decisions"],
    ...overrides,
  };
}

function createTestSummary(overrides: Partial<InheritedSummary> = {}): InheritedSummary {
  return {
    id: `summary-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content: "Test summary content",
    originalSession: "session-original",
    createdAt: Date.now(),
    type: "full",
    ...overrides,
  };
}

// ============================================================================
// Test Setup/Teardown
// ============================================================================

describe("CrossSessionInheritanceResolver", () => {
  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Basic Save and Restore
  // ==========================================================================

  describe("save and restore summaries", () => {
    it("should save summaries to disk", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", content: "Summary 1" }),
        createTestSummary({ id: "s2", content: "Summary 2" }),
      ];

      await resolver.saveSummaries("session-123", summaries);

      // Verify files were created
      const indexPath = path.join(TEST_STORAGE_DIR, "index.json");
      const sessionPath = path.join(TEST_STORAGE_DIR, "session-session-123.json");

      const indexExists = await fs
        .stat(indexPath)
        .then(() => true)
        .catch(() => false);
      const sessionExists = await fs
        .stat(sessionPath)
        .then(() => true)
        .catch(() => false);

      expect(indexExists).toBe(true);
      expect(sessionExists).toBe(true);
    });

    it("should restore summaries from disk", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", content: "Summary 1" }),
        createTestSummary({ id: "s2", content: "Summary 2" }),
      ];

      await resolver.saveSummaries("session-123", summaries);

      // Create new resolver instance (simulating new session)
      const newResolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);
      const inherited = await newResolver.resolveInheritance();

      expect(inherited).not.toBeNull();
      expect(inherited?.sourceSessionId).toBe("session-123");
      expect(inherited?.summaries).toHaveLength(2);
      expect(inherited?.summaries[0]?.content).toBe("Summary 1");
    });

    it("should return null when no previous session exists", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const inherited = await resolver.resolveInheritance();

      expect(inherited).toBeNull();
    });
  });

  // ==========================================================================
  // Project-Level Context
  // ==========================================================================

  describe("project-level context inheritance", () => {
    it("should save summaries with project path", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", type: "decisions", content: "Use TypeScript" }),
      ];

      await resolver.saveSummaries("session-123", summaries, "/path/to/project");

      // Verify project context file was created
      const contextPath = path.join(TEST_STORAGE_DIR, "project-context.json");
      const contextExists = await fs
        .stat(contextPath)
        .then(() => true)
        .catch(() => false);

      expect(contextExists).toBe(true);
    });

    it("should inherit from project context when configured", async () => {
      const config = createTestConfig({
        source: "project_context",
        inheritTypes: ["summary", "decisions"],
      });
      const resolver = new CrossSessionInheritanceResolver(config, TEST_STORAGE_DIR);

      // Save with project path - include both decisions and task summaries
      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", type: "decisions", content: "Use TypeScript" }),
        createTestSummary({ id: "s2", type: "task", content: "Task summary" }),
      ];
      await resolver.saveSummaries("session-123", summaries, "/path/to/project");

      // Resolve from project context
      const inherited = await resolver.resolveInheritance("/path/to/project");

      expect(inherited).not.toBeNull();
      expect(inherited?.sourceSessionId).toBe("project-context");
    });

    it("should prefer same-project session when available", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Save session for project A
      await resolver.saveSummaries(
        "session-a",
        [createTestSummary({ content: "Project A summary" })],
        "/project-a"
      );

      // Save session for project B (more recent)
      await resolver.saveSummaries(
        "session-b",
        [createTestSummary({ content: "Project B summary" })],
        "/project-b"
      );

      // Should prefer project A when requesting that project
      const inherited = await resolver.resolveInheritance("/project-a");

      expect(inherited).not.toBeNull();
      expect(inherited?.sourceSessionId).toBe("session-a");
    });
  });

  // ==========================================================================
  // Configuration Behavior
  // ==========================================================================

  describe("configuration behavior", () => {
    it("should not save when inheritance is disabled", async () => {
      const config = createTestConfig({ enabled: false });
      const resolver = new CrossSessionInheritanceResolver(config, TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [createTestSummary()];
      await resolver.saveSummaries("session-123", summaries);

      // Directory should not be created
      const dirExists = await fs
        .stat(TEST_STORAGE_DIR)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    });

    it("should not resolve when inheritance is disabled", async () => {
      // First save with enabled config
      const enabledResolver = new CrossSessionInheritanceResolver(
        createTestConfig(),
        TEST_STORAGE_DIR
      );
      await enabledResolver.saveSummaries("session-123", [createTestSummary()]);

      // Try to resolve with disabled config
      const disabledConfig = createTestConfig({ enabled: false });
      const disabledResolver = new CrossSessionInheritanceResolver(
        disabledConfig,
        TEST_STORAGE_DIR
      );

      const inherited = await disabledResolver.resolveInheritance();

      expect(inherited).toBeNull();
    });

    it("should respect maxInheritedSummaries limit", async () => {
      const config = createTestConfig({ maxInheritedSummaries: 2 });
      const resolver = new CrossSessionInheritanceResolver(config, TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", content: "Summary 1" }),
        createTestSummary({ id: "s2", content: "Summary 2" }),
        createTestSummary({ id: "s3", content: "Summary 3" }),
        createTestSummary({ id: "s4", content: "Summary 4" }),
      ];

      await resolver.saveSummaries("session-123", summaries);

      const inherited = await resolver.resolveInheritance();

      expect(inherited).not.toBeNull();
      expect(inherited?.summaries).toHaveLength(2);
    });

    it("should filter summaries by inheritTypes", async () => {
      const config = createTestConfig({ inheritTypes: ["decisions"] });
      const resolver = new CrossSessionInheritanceResolver(config, TEST_STORAGE_DIR);

      const summaries: InheritedSummary[] = [
        createTestSummary({ id: "s1", type: "full", content: "Full summary" }),
        createTestSummary({ id: "s2", type: "decisions", content: "Decision summary" }),
        createTestSummary({ id: "s3", type: "code_changes", content: "Code changes" }),
      ];

      await resolver.saveSummaries("session-123", summaries);

      const inherited = await resolver.resolveInheritance();

      expect(inherited).not.toBeNull();
      expect(inherited?.summaries).toHaveLength(1);
      expect(inherited?.summaries[0]?.type).toBe("decisions");
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe("cleanup", () => {
    it("should remove expired session data", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Save a session
      await resolver.saveSummaries("session-old", [createTestSummary()]);

      // Mock the session as being old by modifying the index
      const index = await resolver.loadIndex();
      expect(index).not.toBeNull();
      expect(index?.sessions[0]).toBeDefined();

      // Set savedAt to 10 days ago
      if (index?.sessions[0]) {
        index.sessions[0].savedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
      }
      await fs.writeFile(
        path.join(TEST_STORAGE_DIR, "index.json"),
        JSON.stringify(index, null, 2),
        "utf-8"
      );

      // Clear cache and cleanup
      const newResolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);
      const cleaned = await newResolver.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days

      expect(cleaned).toBe(1);

      // Verify session file was removed
      const sessionPath = path.join(TEST_STORAGE_DIR, "session-session-old.json");
      const exists = await fs
        .stat(sessionPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("should not remove recent session data", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      await resolver.saveSummaries("session-recent", [createTestSummary()]);

      const cleaned = await resolver.cleanup(7 * 24 * 60 * 60 * 1000);

      expect(cleaned).toBe(0);

      // Verify session file still exists
      const sessionPath = path.join(TEST_STORAGE_DIR, "session-session-recent.json");
      const exists = await fs
        .stat(sessionPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should return 0 when nothing to clean", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const cleaned = await resolver.cleanup();

      expect(cleaned).toBe(0);
    });
  });

  // ==========================================================================
  // Message Formatting
  // ==========================================================================

  describe("formatAsMessage", () => {
    it("should format inherited context as a system message", () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const inherited = {
        sourceSessionId: "session-123",
        inheritedAt: Date.now(),
        summaries: [
          createTestSummary({ type: "full", content: "This is a full summary" }),
          createTestSummary({ type: "decisions", content: "We decided to use TypeScript" }),
        ],
        metadata: {},
      };

      const message = resolver.formatAsMessage(inherited);

      expect(message.role).toBe("system");
      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toMatchObject({
        type: "text",
      });

      const textContent = message.content[0] as unknown as { type: "text"; content: string };
      expect(textContent.content).toContain("Inherited Context");
      expect(textContent.content).toContain("Session Summary");
      expect(textContent.content).toContain("Key Decisions");
      expect(textContent.content).toContain("This is a full summary");
      expect(textContent.content).toContain("We decided to use TypeScript");
    });

    it("should include metadata in the message", () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const inherited = {
        sourceSessionId: "session-456",
        inheritedAt: Date.now(),
        summaries: [createTestSummary()],
        metadata: { customKey: "customValue" },
      };

      const message = resolver.formatAsMessage(inherited);

      expect(message.metadata).toMatchObject({
        isInherited: true,
        sourceSession: "session-456",
      });
    });
  });

  // ==========================================================================
  // getLastSessionInfo
  // ==========================================================================

  describe("getLastSessionInfo", () => {
    it("should return null when no sessions exist", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Load index to populate cache (will be null)
      await resolver.loadIndex();

      const info = resolver.getLastSessionInfo();

      expect(info).toBeNull();
    });

    it("should return last session info after saving", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      await resolver.saveSummaries("session-123", [createTestSummary()]);

      const info = resolver.getLastSessionInfo();

      expect(info).not.toBeNull();
      expect(info?.sessionId).toBe("session-123");
      expect(info?.timestamp).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe("createCrossSessionInheritanceResolver", () => {
    it("should create resolver with default config", () => {
      const resolver = createCrossSessionInheritanceResolver();

      expect(resolver).toBeInstanceOf(CrossSessionInheritanceResolver);
    });

    it("should create resolver with partial config", () => {
      const resolver = createCrossSessionInheritanceResolver({
        enabled: false,
        maxInheritedSummaries: 5,
      });

      expect(resolver).toBeInstanceOf(CrossSessionInheritanceResolver);
    });

    it("should use custom storage directory", async () => {
      const customDir = ".vellum-test/custom-inheritance";
      const resolver = createCrossSessionInheritanceResolver({}, customDir);

      await resolver.saveSummaries("session-1", [createTestSummary()]);

      const indexExists = await fs
        .stat(path.join(customDir, "index.json"))
        .then(() => true)
        .catch(() => false);

      expect(indexExists).toBe(true);

      // Cleanup
      await fs.rm(customDir, { recursive: true, force: true });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty summaries array", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      await resolver.saveSummaries("session-123", []);

      // Should not create files for empty summaries
      const sessionPath = path.join(TEST_STORAGE_DIR, "session-session-123.json");
      const exists = await fs
        .stat(sessionPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it("should handle special characters in session ID", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      const sessionId = "session/with:special*chars?";
      await resolver.saveSummaries(sessionId, [createTestSummary()]);

      // Should sanitize the filename
      const inherited = await resolver.resolveInheritance();

      expect(inherited).not.toBeNull();
      expect(inherited?.sourceSessionId).toBe(sessionId);
    });

    it("should handle corrupted index file gracefully", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Create corrupted index file
      await fs.mkdir(TEST_STORAGE_DIR, { recursive: true });
      await fs.writeFile(path.join(TEST_STORAGE_DIR, "index.json"), "{ invalid json", "utf-8");

      // Should handle error gracefully by returning null (not throwing)
      const inherited = await resolver.resolveInheritance();
      expect(inherited).toBeNull();
    });

    it("should handle missing session file referenced in index", async () => {
      const resolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Save a session
      await resolver.saveSummaries("session-123", [createTestSummary()]);

      // Delete the session file
      await fs.unlink(path.join(TEST_STORAGE_DIR, "session-session-123.json"));

      // Create new resolver and try to resolve
      const newResolver = new CrossSessionInheritanceResolver(createTestConfig(), TEST_STORAGE_DIR);

      // Should handle gracefully by returning null (not throwing)
      const inherited = await newResolver.resolveInheritance();
      expect(inherited).toBeNull();
    });

    it("should handle manual source type", async () => {
      const config = createTestConfig({ source: "manual" });
      const resolver = new CrossSessionInheritanceResolver(config, TEST_STORAGE_DIR);

      // Save summaries
      await resolver.saveSummaries("session-123", [createTestSummary()]);

      // Manual source should return null (handled externally)
      const inherited = await resolver.resolveInheritance();

      expect(inherited).toBeNull();
    });
  });
});

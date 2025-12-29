import { normalize, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TrustedFoldersManager } from "../trusted-folders.js";

describe("TrustedFoldersManager", () => {
  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with empty trusted folders", () => {
      const manager = new TrustedFoldersManager();
      expect(manager.getTrustedFolders()).toEqual([]);
      expect(manager.size).toBe(0);
    });

    it("should initialize with provided folders", () => {
      const folders = ["/home/user/project1", "/home/user/project2"];
      const manager = new TrustedFoldersManager(folders);

      expect(manager.size).toBe(2);
      expect(manager.isTrusted("/home/user/project1")).toBe(true);
      expect(manager.isTrusted("/home/user/project2")).toBe(true);
    });

    it("should normalize initial folders", () => {
      const manager = new TrustedFoldersManager(["/path//to/../to/project"]);

      // Should be normalized
      expect(manager.size).toBe(1);
      const folders = manager.getTrustedFolders();
      expect(folders[0]).not.toContain("//");
      expect(folders[0]).not.toContain("..");
    });
  });

  // ============================================
  // addTrusted
  // ============================================

  describe("addTrusted", () => {
    it("should add a folder to the trusted list", () => {
      const manager = new TrustedFoldersManager();
      manager.addTrusted("/home/user/project");

      expect(manager.size).toBe(1);
      expect(manager.isTrusted("/home/user/project")).toBe(true);
    });

    it("should normalize the added path", () => {
      const manager = new TrustedFoldersManager();
      manager.addTrusted("/path//to/project/");

      expect(manager.size).toBe(1);
      const folders = manager.getTrustedFolders();
      expect(folders[0]).not.toContain("//");
    });

    it("should deduplicate identical paths", () => {
      const manager = new TrustedFoldersManager();
      manager.addTrusted("/home/user/project");
      manager.addTrusted("/home/user/project");

      expect(manager.size).toBe(1);
    });

    it("should allow multiple different folders", () => {
      const manager = new TrustedFoldersManager();
      manager.addTrusted("/home/user/project1");
      manager.addTrusted("/home/user/project2");
      manager.addTrusted("/home/user/project3");

      expect(manager.size).toBe(3);
    });
  });

  // ============================================
  // removeTrusted
  // ============================================

  describe("removeTrusted", () => {
    it("should remove a folder from the trusted list", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      const result = manager.removeTrusted("/home/user/project");

      expect(result).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.isTrusted("/home/user/project")).toBe(false);
    });

    it("should return false when folder was not trusted", () => {
      const manager = new TrustedFoldersManager();

      const result = manager.removeTrusted("/nonexistent/path");

      expect(result).toBe(false);
    });

    it("should handle normalized path removal", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      // Remove with different format that normalizes to same path
      const result = manager.removeTrusted("/home/user/project/./");

      expect(result).toBe(true);
      expect(manager.size).toBe(0);
    });

    it("should not affect other trusted folders (EC-003)", () => {
      const manager = new TrustedFoldersManager([
        "/home/user/project1",
        "/home/user/project2",
        "/home/user/project3",
      ]);

      manager.removeTrusted("/home/user/project2");

      expect(manager.size).toBe(2);
      expect(manager.isTrusted("/home/user/project1")).toBe(true);
      expect(manager.isTrusted("/home/user/project2")).toBe(false);
      expect(manager.isTrusted("/home/user/project3")).toBe(true);
    });
  });

  // ============================================
  // isTrusted
  // ============================================

  describe("isTrusted", () => {
    it("should return true for exact match", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      expect(manager.isTrusted("/home/user/project")).toBe(true);
    });

    it("should return true for subdirectory (inheritance)", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      expect(manager.isTrusted("/home/user/project/src")).toBe(true);
      expect(manager.isTrusted("/home/user/project/src/components")).toBe(true);
      expect(manager.isTrusted("/home/user/project/node_modules/pkg")).toBe(true);
    });

    it("should return false for parent directory", () => {
      const manager = new TrustedFoldersManager(["/home/user/project/src"]);

      expect(manager.isTrusted("/home/user/project")).toBe(false);
      expect(manager.isTrusted("/home/user")).toBe(false);
    });

    it("should return false for sibling directory", () => {
      const manager = new TrustedFoldersManager(["/home/user/project1"]);

      expect(manager.isTrusted("/home/user/project2")).toBe(false);
    });

    it("should not match prefix-similar paths", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      // "projects" starts with "project" but is NOT a subdirectory
      expect(manager.isTrusted("/home/user/projects")).toBe(false);
      expect(manager.isTrusted("/home/user/project-backup")).toBe(false);
    });

    it("should return false for empty manager", () => {
      const manager = new TrustedFoldersManager();

      expect(manager.isTrusted("/any/path")).toBe(false);
    });

    it("should handle normalized paths correctly", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      // Path with redundant elements that normalizes to subdirectory
      expect(manager.isTrusted("/home/user/project/./src/../src")).toBe(true);
    });
  });

  // ============================================
  // getTrustedFolders
  // ============================================

  describe("getTrustedFolders", () => {
    it("should return empty array when no folders trusted", () => {
      const manager = new TrustedFoldersManager();
      expect(manager.getTrustedFolders()).toEqual([]);
    });

    it("should return all trusted folders", () => {
      const manager = new TrustedFoldersManager(["/home/user/project1", "/home/user/project2"]);

      const folders = manager.getTrustedFolders();
      expect(folders).toHaveLength(2);
    });

    it("should return a copy (not internal reference)", () => {
      const manager = new TrustedFoldersManager(["/home/user/project"]);

      const folders = manager.getTrustedFolders();
      folders.push("/malicious/path");

      expect(manager.size).toBe(1); // Should not be affected
    });
  });

  // ============================================
  // clear
  // ============================================

  describe("clear", () => {
    it("should remove all trusted folders", () => {
      const manager = new TrustedFoldersManager([
        "/home/user/project1",
        "/home/user/project2",
        "/home/user/project3",
      ]);

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.getTrustedFolders()).toEqual([]);
    });

    it("should work on empty manager", () => {
      const manager = new TrustedFoldersManager();
      manager.clear();
      expect(manager.size).toBe(0);
    });
  });

  // ============================================
  // Nested Folder Scenarios (EC-003)
  // ============================================

  describe("nested folder scenarios (EC-003)", () => {
    it("should handle adding parent after child", () => {
      const manager = new TrustedFoldersManager();

      // Add child first
      manager.addTrusted("/home/user/project/src");
      // Then add parent
      manager.addTrusted("/home/user/project");

      // Both should be trusted
      expect(manager.isTrusted("/home/user/project/src")).toBe(true);
      expect(manager.isTrusted("/home/user/project")).toBe(true);
      expect(manager.isTrusted("/home/user/project/other")).toBe(true);
    });

    it("should handle removing parent when child exists", () => {
      const manager = new TrustedFoldersManager(["/home/user/project", "/home/user/project/src"]);

      manager.removeTrusted("/home/user/project");

      // Child was explicitly added, so it should still be trusted
      expect(manager.isTrusted("/home/user/project/src")).toBe(true);
      expect(manager.isTrusted("/home/user/project/src/components")).toBe(true);

      // Parent and other children lose trust
      expect(manager.isTrusted("/home/user/project")).toBe(false);
      expect(manager.isTrusted("/home/user/project/other")).toBe(false);
    });

    it("should handle removing child when parent exists", () => {
      const manager = new TrustedFoldersManager(["/home/user/project", "/home/user/project/src"]);

      manager.removeTrusted("/home/user/project/src");

      // Parent still trusted, so child inherits trust
      expect(manager.isTrusted("/home/user/project/src")).toBe(true);
      expect(manager.isTrusted("/home/user/project")).toBe(true);
    });
  });

  // ============================================
  // Cross-Platform Paths
  // ============================================

  describe("cross-platform compatibility", () => {
    it("should normalize paths consistently", () => {
      const manager = new TrustedFoldersManager();

      // Add with various path styles
      manager.addTrusted("/home/user/project");

      // Check with normalized version
      const normalized = normalize(resolve("/home/user/project"));
      expect(manager.isTrusted(normalized)).toBe(true);
    });

    it("should handle paths with trailing separators", () => {
      const manager = new TrustedFoldersManager(["/home/user/project/"]);

      expect(manager.isTrusted("/home/user/project")).toBe(true);
      expect(manager.isTrusted("/home/user/project/src")).toBe(true);
    });
  });
});

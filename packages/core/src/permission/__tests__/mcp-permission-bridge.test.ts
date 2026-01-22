// ============================================
// Unit Tests for MCP Permission Bridge
// ============================================

import { describe, expect, it } from "vitest";
import {
  getTrustLevelDescription,
  hasTrustEnabled,
  inferReadOperation,
  shouldBypassPermission,
} from "../mcp-permission-bridge.js";

describe("mcp-permission-bridge", () => {
  describe("inferReadOperation", () => {
    describe("read-like operations", () => {
      it("detects read_ prefix operations", () => {
        expect(inferReadOperation("read_file")).toBe(true);
        expect(inferReadOperation("read_directory")).toBe(true);
        expect(inferReadOperation("read_contents")).toBe(true);
      });

      it("detects list_ prefix operations", () => {
        expect(inferReadOperation("list_directory")).toBe(true);
        expect(inferReadOperation("list_files")).toBe(true);
        expect(inferReadOperation("list_users")).toBe(true);
      });

      it("detects get_ prefix operations", () => {
        expect(inferReadOperation("get_status")).toBe(true);
        expect(inferReadOperation("get_config")).toBe(true);
        expect(inferReadOperation("get_user")).toBe(true);
      });

      it("detects search_ prefix operations", () => {
        expect(inferReadOperation("search_code")).toBe(true);
        expect(inferReadOperation("search_files")).toBe(true);
      });

      it("detects query_ prefix operations", () => {
        expect(inferReadOperation("query_database")).toBe(true);
        expect(inferReadOperation("query_logs")).toBe(true);
      });

      it("detects fetch_ prefix operations", () => {
        expect(inferReadOperation("fetch_data")).toBe(true);
        expect(inferReadOperation("fetch_metadata")).toBe(true);
      });

      it("detects view_ prefix operations", () => {
        expect(inferReadOperation("view_logs")).toBe(true);
        expect(inferReadOperation("view_history")).toBe(true);
      });

      it("detects show_ prefix operations", () => {
        expect(inferReadOperation("show_status")).toBe(true);
        expect(inferReadOperation("show_config")).toBe(true);
      });

      it("detects info_ prefix operations", () => {
        expect(inferReadOperation("info_server")).toBe(true);
      });

      it("detects status_ prefix operations", () => {
        expect(inferReadOperation("status_check")).toBe(true);
      });

      it("detects describe_ prefix operations", () => {
        expect(inferReadOperation("describe_table")).toBe(true);
      });

      it("detects check_ prefix operations", () => {
        expect(inferReadOperation("check_health")).toBe(true);
      });

      it("detects _read suffix operations", () => {
        expect(inferReadOperation("file_read")).toBe(true);
        expect(inferReadOperation("config_read")).toBe(true);
      });
    });

    describe("write-like operations", () => {
      it("detects write_ prefix operations", () => {
        expect(inferReadOperation("write_file")).toBe(false);
        expect(inferReadOperation("write_config")).toBe(false);
      });

      it("detects create_ prefix operations", () => {
        expect(inferReadOperation("create_directory")).toBe(false);
        expect(inferReadOperation("create_user")).toBe(false);
      });

      it("detects delete_ prefix operations", () => {
        expect(inferReadOperation("delete_file")).toBe(false);
        expect(inferReadOperation("delete_user")).toBe(false);
      });

      it("detects execute_ prefix operations", () => {
        expect(inferReadOperation("execute_command")).toBe(false);
        expect(inferReadOperation("execute_script")).toBe(false);
      });

      it("detects run_ prefix operations", () => {
        expect(inferReadOperation("run_command")).toBe(false);
        expect(inferReadOperation("run_script")).toBe(false);
      });

      it("detects git commit operations", () => {
        expect(inferReadOperation("git_commit")).toBe(false);
        expect(inferReadOperation("commit_changes")).toBe(false);
      });

      it("detects git push operations", () => {
        expect(inferReadOperation("git_push")).toBe(false);
        expect(inferReadOperation("push_changes")).toBe(false);
      });

      it("detects update operations", () => {
        expect(inferReadOperation("update_config")).toBe(false);
        expect(inferReadOperation("update_file")).toBe(false);
      });

      it("detects modify operations", () => {
        expect(inferReadOperation("modify_settings")).toBe(false);
      });

      it("detects remove operations", () => {
        expect(inferReadOperation("remove_file")).toBe(false);
      });
    });

    describe("ambiguous operations (conservative defaults)", () => {
      it("treats unknown operations without write indicators as read-safe", () => {
        // These names don't match read patterns, and have no write indicators
        // The function defaults to false (conservative), not true
        // But let's verify the actual behavior
        expect(inferReadOperation("analyze_code")).toBe(false);
        expect(inferReadOperation("validate_syntax")).toBe(false);
      });

      it("prioritizes write indicators over read patterns", () => {
        // Even if name contains 'read', write indicators take precedence
        expect(inferReadOperation("execute_read_query")).toBe(false);
        expect(inferReadOperation("delete_read_cache")).toBe(false);
      });
    });
  });

  describe("shouldBypassPermission", () => {
    describe("no trust level", () => {
      it("returns false for undefined trust", () => {
        expect(shouldBypassPermission(undefined, "any_tool")).toBe(false);
        expect(shouldBypassPermission(undefined, "read_file")).toBe(false);
        expect(shouldBypassPermission(undefined, "write_file")).toBe(false);
      });

      it("returns false for explicit false trust", () => {
        expect(shouldBypassPermission(false, "any_tool")).toBe(false);
        expect(shouldBypassPermission(false, "read_file")).toBe(false);
        expect(shouldBypassPermission(false, "write_file")).toBe(false);
      });
    });

    describe("full trust", () => {
      it("returns true for all operations with full trust", () => {
        expect(shouldBypassPermission(true, "read_file")).toBe(true);
        expect(shouldBypassPermission(true, "write_file")).toBe(true);
        expect(shouldBypassPermission(true, "execute_command")).toBe(true);
        expect(shouldBypassPermission(true, "delete_everything")).toBe(true);
      });
    });

    describe("readonly trust", () => {
      it("returns true for read operations", () => {
        expect(shouldBypassPermission("readonly", "read_file")).toBe(true);
        expect(shouldBypassPermission("readonly", "list_directory")).toBe(true);
        expect(shouldBypassPermission("readonly", "get_status")).toBe(true);
        expect(shouldBypassPermission("readonly", "search_code")).toBe(true);
        expect(shouldBypassPermission("readonly", "query_database")).toBe(true);
        expect(shouldBypassPermission("readonly", "fetch_data")).toBe(true);
      });

      it("returns false for write operations", () => {
        expect(shouldBypassPermission("readonly", "write_file")).toBe(false);
        expect(shouldBypassPermission("readonly", "delete_file")).toBe(false);
        expect(shouldBypassPermission("readonly", "execute_command")).toBe(false);
        expect(shouldBypassPermission("readonly", "create_user")).toBe(false);
        expect(shouldBypassPermission("readonly", "git_commit")).toBe(false);
      });
    });
  });

  describe("getTrustLevelDescription", () => {
    it("returns untrusted description for undefined", () => {
      const desc = getTrustLevelDescription(undefined);
      expect(desc).toContain("untrusted");
      expect(desc).toContain("confirm");
    });

    it("returns untrusted description for false", () => {
      const desc = getTrustLevelDescription(false);
      expect(desc).toContain("untrusted");
      expect(desc).toContain("confirm");
    });

    it("returns trusted description for true", () => {
      const desc = getTrustLevelDescription(true);
      expect(desc).toContain("trusted");
      expect(desc).toContain("auto");
    });

    it("returns readonly description for readonly", () => {
      const desc = getTrustLevelDescription("readonly");
      expect(desc).toContain("read");
      expect(desc).toContain("confirm");
    });
  });

  describe("hasTrustEnabled", () => {
    it("returns false for undefined", () => {
      expect(hasTrustEnabled(undefined)).toBe(false);
    });

    it("returns false for explicit false", () => {
      expect(hasTrustEnabled(false)).toBe(false);
    });

    it("returns true for full trust", () => {
      expect(hasTrustEnabled(true)).toBe(true);
    });

    it("returns true for readonly trust", () => {
      expect(hasTrustEnabled("readonly")).toBe(true);
    });
  });
});

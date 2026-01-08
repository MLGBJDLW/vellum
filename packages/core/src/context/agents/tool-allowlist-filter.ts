// ============================================
// Tool Allowlist Filter
// ============================================
// Implements allowlist-based tool permission filtering with
// glob patterns, group expansion, and argument validation.
// Covers REQ-011, REQ-012, REQ-013, REQ-016.

import picomatch from "picomatch";
import type { ToolPermission } from "./types.js";

// ============================================
// T028: Tool Groups Constant
// ============================================

/**
 * Predefined tool groups for common permission patterns.
 * Groups can reference other groups for composition.
 *
 * @remarks
 * - `@readonly`: Read-only file operations
 * - `@edit`: File modification operations
 * - `@bash`: Command execution tools
 * - `@safe`: Non-destructive operations (includes @readonly)
 * - `@all`: Wildcard matching all tools
 *
 * @example
 * ```yaml
 * allowed-tools:
 *   - "@readonly"    # Expands to Read, Glob, Grep, etc.
 *   - "@edit"        # Expands to Edit, Write, etc.
 * ```
 */
export const TOOL_GROUPS: Readonly<Record<string, readonly string[]>> = {
  // Read-only file operations
  "@readonly": [
    "Read",
    "ReadFile",
    "read_file",
    "View",
    "Glob",
    "Grep",
    "grep_search",
    "LS",
    "ls",
    "list_files",
    "list_dir",
    "Cat",
    "cat",
    "Find",
    "find",
    "file_search",
    "Search",
    "search_files",
    "semantic_search",
    "Head",
    "Tail",
    "Stat",
    "stat",
    "Tree",
    "lsp",
    "lsp_diagnostics",
    "lsp_hover",
    "lsp_definition",
    "lsp_references",
    "lsp_symbols",
    "lsp_workspace_symbol",
    "lsp_incoming_calls",
    "lsp_outgoing_calls",
    "lsp_code_actions",
  ],

  // File modification operations
  "@edit": [
    "Edit",
    "EditFile",
    "edit_file",
    "Write",
    "WriteFile",
    "write_file",
    "create_file",
    "CreateFile",
    "Delete",
    "DeleteFile",
    "delete_file",
    "Remove",
    "rm",
    "MultiEdit",
    "multi_edit",
    "Patch",
    "patch_file",
    "Replace",
    "replace_string_in_file",
    "multi_replace_string_in_file",
    "Rename",
    "rename_file",
    "Move",
    "move_file",
    "Copy",
    "copy_file",
    "Mkdir",
    "mkdir",
    "create_directory",
    "lsp_format",
  ],

  // Command execution tools
  "@bash": [
    "Bash",
    "bash",
    "RunCommand",
    "run_command",
    "run_in_terminal",
    "Shell",
    "shell",
    "Execute",
    "execute",
    "execute_bash",
    "Terminal",
    "terminal",
    "Exec",
    "exec",
  ],

  // Safe operations (non-destructive)
  // Note: @readonly is expanded, plus safe bash commands
  "@safe": [
    "@readonly",
    "Bash(npm run *)",
    "Bash(pnpm *)",
    "Bash(yarn *)",
    "Bash(npx *)",
    "Bash(node *)",
    "Bash(python *)",
    "Bash(pytest *)",
    "Bash(vitest *)",
    "Bash(jest *)",
    "Bash(git status*)",
    "Bash(git log*)",
    "Bash(git diff*)",
    "Bash(git show*)",
  ],

  // Wildcard - matches everything
  "@all": ["*"],
};

// Freeze the TOOL_GROUPS object deeply
Object.freeze(TOOL_GROUPS);
for (const key of Object.keys(TOOL_GROUPS)) {
  Object.freeze(TOOL_GROUPS[key]);
}

/**
 * Gets the list of available tool group names.
 */
export function getToolGroupNames(): string[] {
  return Object.keys(TOOL_GROUPS);
}

/**
 * Checks if a pattern is a group reference.
 */
export function isToolGroup(pattern: string): boolean {
  return pattern.startsWith("@") && pattern in TOOL_GROUPS;
}

// ============================================
// T029: ToolAllowlistFilter Class
// ============================================

/**
 * Internal representation of an expanded permission rule.
 */
interface ExpandedPermission {
  /** Expanded pattern (no group references) */
  pattern: string;
  /** Whether this is a negation rule */
  negated: boolean;
  /** Allowed argument patterns */
  args?: string[];
  /** Compiled picomatch matcher for efficient matching */
  matcher: picomatch.Matcher;
}

/**
 * Filters tool invocations based on an allowlist with glob patterns.
 *
 * Implements deny-by-default semantics:
 * 1. Check all DENY (negated) rules first
 * 2. If any deny matches, return false
 * 3. Check all ALLOW rules
 * 4. If any allow matches, return true
 * 5. Default: return false
 *
 * @example
 * ```typescript
 * const filter = new ToolAllowlistFilter([
 *   { pattern: '@readonly', negated: false },
 *   { pattern: 'Bash', negated: false, args: ['npm run *'] },
 *   { pattern: 'DeleteFile', negated: true },
 * ]);
 *
 * filter.isAllowed('ReadFile');        // true (matches @readonly)
 * filter.isAllowed('DeleteFile');      // false (explicit deny)
 * filter.isAllowed('Bash', ['npm run test']); // true (args match)
 * filter.isAllowed('Bash', ['rm -rf /']); // false (args don't match)
 * ```
 */
export class ToolAllowlistFilter {
  /** Expanded allow rules (non-negated) */
  private readonly allowRules: ExpandedPermission[] = [];

  /** Expanded deny rules (negated) */
  private readonly denyRules: ExpandedPermission[] = [];

  /** Original permissions for debugging/inspection */
  private readonly originalPermissions: ToolPermission[];

  /** All expanded permissions (cached) */
  private readonly expandedPermissionsCache: ToolPermission[];

  /**
   * Creates a new tool allowlist filter.
   *
   * @param permissions - Array of tool permissions to enforce
   */
  constructor(permissions: ToolPermission[] = []) {
    this.originalPermissions = permissions;
    this.expandedPermissionsCache = this.expandAllPermissions(permissions);
    this.compileRules(this.expandedPermissionsCache);
  }

  /**
   * Checks if a tool invocation is allowed.
   *
   * @param toolName - Name of the tool being invoked
   * @param args - Optional arguments passed to the tool
   * @returns true if allowed, false if denied
   *
   * @remarks
   * Evaluation order:
   * 1. Check all DENY rules - if any match, return false
   * 2. Check all ALLOW rules - if any match, return true
   * 3. Default: return false (deny-by-default)
   */
  isAllowed(toolName: string, args?: string[]): boolean {
    // Empty permissions = deny all
    if (this.allowRules.length === 0 && this.denyRules.length === 0) {
      return false;
    }

    // Step 1: Check deny rules first
    for (const rule of this.denyRules) {
      if (this.matchesRule(toolName, args, rule)) {
        return false;
      }
    }

    // Step 2: Check allow rules
    for (const rule of this.allowRules) {
      if (this.matchesRule(toolName, args, rule)) {
        return true;
      }
    }

    // Step 3: Default deny
    return false;
  }

  /**
   * Gets all expanded permissions (for debugging).
   *
   * @returns Array of expanded tool permissions
   */
  getExpandedPermissions(): ToolPermission[] {
    return [...this.expandedPermissionsCache];
  }

  /**
   * Gets the original permissions passed to constructor.
   *
   * @returns Array of original tool permissions
   */
  getOriginalPermissions(): ToolPermission[] {
    return [...this.originalPermissions];
  }

  /**
   * Checks if a tool matches a specific permission.
   *
   * @param toolName - Tool name to check
   * @param permission - Permission to match against
   * @returns true if the tool matches the permission pattern
   */
  matchesPermission(toolName: string, permission: ToolPermission): boolean {
    const expanded = this.expandPermission(permission);
    for (const exp of expanded) {
      const rule = this.compilePermission(exp);
      if (rule.matcher(toolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a tool invocation matches a compiled rule.
   */
  private matchesRule(
    toolName: string,
    args: string[] | undefined,
    rule: ExpandedPermission
  ): boolean {
    // Check tool name pattern
    if (!rule.matcher(toolName)) {
      return false;
    }

    // If rule has argument restrictions, validate them
    if (rule.args && rule.args.length > 0) {
      // No args provided but rule requires specific args
      if (!args || args.length === 0) {
        return false;
      }

      // Check if any provided arg matches any allowed pattern
      return this.matchesArgs(args, rule.args);
    }

    // No arg restrictions, tool name matched
    return true;
  }

  /**
   * Checks if provided arguments match allowed argument patterns.
   */
  private matchesArgs(providedArgs: string[], allowedPatterns: string[]): boolean {
    // Join args into a single string for pattern matching
    const argsString = providedArgs.join(" ");

    for (const pattern of allowedPatterns) {
      // Use picomatch for glob matching on args
      const matcher = picomatch(pattern, { nocase: true });
      if (matcher(argsString)) {
        return true;
      }

      // Also check individual args
      for (const arg of providedArgs) {
        if (matcher(arg)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Expands all permissions, resolving group references.
   */
  private expandAllPermissions(permissions: ToolPermission[]): ToolPermission[] {
    const expanded: ToolPermission[] = [];

    for (const permission of permissions) {
      const expandedPerms = this.expandPermission(permission);
      expanded.push(...expandedPerms);
    }

    return expanded;
  }

  /**
   * Expands a single permission, resolving group references recursively.
   */
  private expandPermission(permission: ToolPermission): ToolPermission[] {
    const { pattern, negated, args } = permission;

    // Check if pattern is a group reference
    if (isToolGroup(pattern)) {
      return this.expandGroup(pattern, negated, args);
    }

    // Not a group, return as-is
    return [permission];
  }

  /**
   * Expands a group reference into individual permissions.
   */
  private expandGroup(
    groupName: string,
    negated: boolean,
    inheritedArgs?: string[]
  ): ToolPermission[] {
    const groupPatterns = TOOL_GROUPS[groupName];
    if (!groupPatterns) {
      return [];
    }

    const expanded: ToolPermission[] = [];

    for (const pattern of groupPatterns) {
      // Handle nested group references (e.g., @safe includes @readonly)
      if (isToolGroup(pattern)) {
        expanded.push(...this.expandGroup(pattern, negated, inheritedArgs));
        continue;
      }

      // Handle patterns with embedded args (e.g., "Bash(npm run *)")
      const argsMatch = pattern.match(/^(.+?)\((.+)\)$/);
      if (argsMatch?.[1] && argsMatch[2]) {
        const toolName = argsMatch[1];
        const embeddedArgs = argsMatch[2].split(",").map((a) => a.trim());
        expanded.push({
          pattern: toolName,
          negated,
          args: inheritedArgs ? [...inheritedArgs, ...embeddedArgs] : embeddedArgs,
        });
      } else {
        expanded.push({
          pattern,
          negated,
          args: inheritedArgs,
        });
      }
    }

    return expanded;
  }

  /**
   * Compiles expanded permissions into allow/deny rule sets.
   */
  private compileRules(permissions: ToolPermission[]): void {
    for (const permission of permissions) {
      const rule = this.compilePermission(permission);

      if (permission.negated) {
        this.denyRules.push(rule);
      } else {
        this.allowRules.push(rule);
      }
    }
  }

  /**
   * Compiles a single permission into an expanded rule with matcher.
   */
  private compilePermission(permission: ToolPermission): ExpandedPermission {
    return {
      pattern: permission.pattern,
      negated: permission.negated,
      args: permission.args,
      // Compile pattern with picomatch for efficient matching
      // nocase: true for case-insensitive matching
      matcher: picomatch(permission.pattern, { nocase: true }),
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates a ToolAllowlistFilter that allows all tools.
 *
 * @returns Filter that permits all tool invocations
 */
export function createAllowAllFilter(): ToolAllowlistFilter {
  return new ToolAllowlistFilter([{ pattern: "*", negated: false }]);
}

/**
 * Creates a ToolAllowlistFilter that denies all tools.
 *
 * @returns Filter that denies all tool invocations
 */
export function createDenyAllFilter(): ToolAllowlistFilter {
  return new ToolAllowlistFilter([]);
}

/**
 * Creates a ToolAllowlistFilter from a list of tool names.
 *
 * @param tools - Array of tool names/patterns to allow
 * @returns Filter that permits only the specified tools
 */
export function createFilterFromTools(tools: string[]): ToolAllowlistFilter {
  const permissions: ToolPermission[] = tools.map((tool) => {
    const negated = tool.startsWith("!");
    const pattern = negated ? tool.slice(1) : tool;

    // Handle args in parentheses
    const argsMatch = pattern.match(/^(.+?)\((.+)\)$/);
    if (argsMatch?.[1] && argsMatch[2]) {
      return {
        pattern: argsMatch[1],
        negated,
        args: argsMatch[2].split(",").map((a) => a.trim()),
      };
    }

    return { pattern, negated };
  });

  return new ToolAllowlistFilter(permissions);
}

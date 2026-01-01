// ============================================
// Permission Inheritance
// ============================================
// REQ-023: Permission inheritance for subagents

import type { FileRestriction, ToolGroupEntry } from "../../agent/restrictions.js";

// ============================================
// PermissionSet Interface
// ============================================

/**
 * Represents a set of permissions for an agent.
 *
 * Defines what files an agent can access, which tools are available,
 * and constraints on subagent spawning.
 *
 * @example
 * ```typescript
 * const permissions: PermissionSet = {
 *   filePatterns: [
 *     { pattern: "src/**\/*.ts", access: "write" },
 *     { pattern: "*.config.js", access: "read" },
 *   ],
 *   toolGroups: [
 *     { group: "filesystem", enabled: true },
 *     { group: "shell", enabled: false },
 *   ],
 *   canApproveSubagent: true,
 *   maxSubagentDepth: 3,
 * };
 * ```
 */
export interface PermissionSet {
  /** File access restrictions for this permission set */
  filePatterns: FileRestriction[];
  /** Tool group configurations */
  toolGroups: ToolGroupEntry[];
  /** Whether this agent can approve subagent escalation requests */
  canApproveSubagent: boolean;
  /** Maximum depth of subagent spawning allowed */
  maxSubagentDepth: number;
}

// ============================================
// PermissionInheritance Interface
// ============================================

/**
 * Interface for managing permission inheritance between parent and child agents.
 *
 * CRITICAL: Child permissions can NEVER exceed parent permissions.
 * All operations enforce the principle of least privilege.
 *
 * @example
 * ```typescript
 * const inheritance = createPermissionInheritance();
 *
 * // Derive child permissions (intersection with parent)
 * const childPerms = inheritance.derive(parentPerms, requestedPerms);
 *
 * // Validate child doesn't exceed parent
 * const { valid, violations } = inheritance.validate(parentPerms, childPerms);
 *
 * // Request escalation if needed
 * const elevated = await inheritance.escalate(currentPerms, { maxSubagentDepth: 5 });
 *
 * // Compute effective permissions from chain
 * const effective = inheritance.getEffective([rootPerms, level1Perms, level2Perms]);
 * ```
 */
export interface PermissionInheritance {
  /**
   * Derives child permissions from parent and requested permissions.
   *
   * Returns the INTERSECTION of parent and child permissions.
   * Child can never exceed parent permissions.
   *
   * @param parent - The parent's permission set
   * @param child - The requested child permissions (partial)
   * @returns The derived permission set (intersection)
   */
  derive(parent: PermissionSet, child: Partial<PermissionSet>): PermissionSet;

  /**
   * Validates that child permissions are a subset of parent permissions.
   *
   * @param parent - The parent's permission set
   * @param child - The child's permission set to validate
   * @returns Validation result with any violations found
   */
  validate(parent: PermissionSet, child: PermissionSet): { valid: boolean; violations: string[] };

  /**
   * Requests escalation of permissions from the parent.
   *
   * This is an async operation as it may require user approval.
   * Returns null if escalation is denied.
   *
   * @param current - The current permission set
   * @param requested - The requested additional permissions
   * @returns The escalated permission set or null if denied
   */
  escalate(
    current: PermissionSet,
    requested: Partial<PermissionSet>
  ): Promise<PermissionSet | null>;

  /**
   * Computes the effective permissions from an inheritance chain.
   *
   * The effective permissions are the intersection of all permissions
   * in the chain, from root to leaf.
   *
   * @param chain - Array of permission sets from root to current
   * @returns The effective (most restrictive) permission set
   */
  getEffective(chain: PermissionSet[]): PermissionSet;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Access level priority for comparison (higher = more permissive).
 */
const ACCESS_PRIORITY: Record<FileRestriction["access"], number> = {
  none: 0,
  read: 1,
  write: 2,
};

/**
 * Gets the more restrictive access level between two levels.
 *
 * @param a - First access level
 * @param b - Second access level
 * @returns The more restrictive access level
 */
function getRestrictiveAccess(
  a: FileRestriction["access"],
  b: FileRestriction["access"]
): FileRestriction["access"] {
  return ACCESS_PRIORITY[a] <= ACCESS_PRIORITY[b] ? a : b;
}

/**
 * Checks if childAccess is equal to or more restrictive than parentAccess.
 *
 * @param parentAccess - The parent's access level
 * @param childAccess - The child's access level
 * @returns True if child access is valid (not exceeding parent)
 */
function isAccessSubset(
  parentAccess: FileRestriction["access"],
  childAccess: FileRestriction["access"]
): boolean {
  return ACCESS_PRIORITY[childAccess] <= ACCESS_PRIORITY[parentAccess];
}

/**
 * Merges file patterns by computing intersection of permissions.
 *
 * For matching patterns, takes the more restrictive access level.
 * Patterns only in child are added if parent has matching permissive pattern.
 *
 * @param parent - Parent file restrictions
 * @param child - Child file restrictions
 * @returns Merged file restrictions (intersection)
 */
function mergeFilePatterns(parent: FileRestriction[], child: FileRestriction[]): FileRestriction[] {
  // Build a map of parent patterns for quick lookup
  const parentMap = new Map<string, FileRestriction>();
  for (const p of parent) {
    parentMap.set(p.pattern, p);
  }

  const result: FileRestriction[] = [];

  // Process child patterns
  for (const childRestriction of child) {
    const parentRestriction = parentMap.get(childRestriction.pattern);

    if (parentRestriction) {
      // Pattern exists in both - take intersection (more restrictive)
      result.push({
        pattern: childRestriction.pattern,
        access: getRestrictiveAccess(parentRestriction.access, childRestriction.access),
      });
    } else {
      // Pattern only in child - only allow if not exceeding any parent pattern
      // For safety, we include it but it will be validated separately
      result.push(childRestriction);
    }
  }

  // Add parent patterns not in child (inherit parent restrictions)
  for (const parentRestriction of parent) {
    const exists = result.some((r) => r.pattern === parentRestriction.pattern);
    if (!exists) {
      result.push(parentRestriction);
    }
  }

  return result;
}

/**
 * Computes tool intersection when merging parent and child tool lists.
 *
 * @param parentTools - Parent's tool list (may be undefined)
 * @param childTools - Child's tool list (may be undefined)
 * @param childEnabled - Whether child has enabled the group
 * @returns The merged tool list or undefined
 */
function computeToolIntersection(
  parentTools: string[] | undefined,
  childTools: string[] | undefined,
  childEnabled: boolean
): string[] | undefined {
  if (parentTools && childTools) {
    return childTools.filter((t) => parentTools.includes(t));
  }
  if (parentTools) {
    // Parent has restrictions, child wants all - use parent's list
    return childEnabled ? parentTools : undefined;
  }
  // Child restricts further - use child's list (or undefined)
  return childTools;
}

/**
 * Merges a single child tool group entry with its parent.
 *
 * @param childEntry - The child's tool group entry
 * @param parentEntry - The parent's tool group entry (may be undefined)
 * @returns The merged tool group entry
 */
function mergeToolGroupEntry(
  childEntry: ToolGroupEntry,
  parentEntry: ToolGroupEntry | undefined
): ToolGroupEntry {
  if (!parentEntry) {
    // Group only in child - disabled by default (not in parent)
    return { group: childEntry.group, enabled: false };
  }

  // Group exists in both - compute intersection
  const enabled = parentEntry.enabled && childEntry.enabled;
  const tools = computeToolIntersection(parentEntry.tools, childEntry.tools, childEntry.enabled);

  return {
    group: childEntry.group,
    enabled,
    ...(tools && { tools }),
  };
}

/**
 * Merges tool groups by computing intersection of enabled tools.
 *
 * @param parent - Parent tool group entries
 * @param child - Child tool group entries
 * @returns Merged tool group entries (intersection)
 */
function mergeToolGroups(parent: ToolGroupEntry[], child: ToolGroupEntry[]): ToolGroupEntry[] {
  // Build a map of parent groups
  const parentMap = new Map<string, ToolGroupEntry>();
  for (const p of parent) {
    parentMap.set(p.group, p);
  }

  const result: ToolGroupEntry[] = [];

  // Process child groups
  for (const childEntry of child) {
    const parentEntry = parentMap.get(childEntry.group);
    result.push(mergeToolGroupEntry(childEntry, parentEntry));
  }

  // Add parent groups not in child (inherit parent restrictions)
  for (const parentEntry of parent) {
    const exists = result.some((r) => r.group === parentEntry.group);
    if (!exists) {
      result.push(parentEntry);
    }
  }

  return result;
}

/**
 * Validates file patterns against parent restrictions.
 *
 * @param parent - Parent file restrictions
 * @param child - Child file restrictions
 * @returns Array of violation messages
 */
function validateFilePatterns(parent: FileRestriction[], child: FileRestriction[]): string[] {
  const violations: string[] = [];
  const parentMap = new Map<string, FileRestriction>();
  for (const p of parent) {
    parentMap.set(p.pattern, p);
  }

  for (const childRestriction of child) {
    const parentRestriction = parentMap.get(childRestriction.pattern);

    if (parentRestriction) {
      if (!isAccessSubset(parentRestriction.access, childRestriction.access)) {
        violations.push(
          `File pattern "${childRestriction.pattern}": child access "${childRestriction.access}" exceeds parent access "${parentRestriction.access}"`
        );
      }
    } else {
      // Child has a pattern not in parent - this is a violation
      // unless the access is "none"
      if (childRestriction.access !== "none") {
        violations.push(`File pattern "${childRestriction.pattern}": not permitted by parent`);
      }
    }
  }

  return violations;
}

/**
 * Validates tool groups against parent restrictions.
 *
 * @param parent - Parent tool group entries
 * @param child - Child tool group entries
 * @returns Array of violation messages
 */
function validateToolGroups(parent: ToolGroupEntry[], child: ToolGroupEntry[]): string[] {
  const violations: string[] = [];
  const parentMap = new Map<string, ToolGroupEntry>();
  for (const p of parent) {
    parentMap.set(p.group, p);
  }

  for (const childEntry of child) {
    const parentEntry = parentMap.get(childEntry.group);

    if (!parentEntry) {
      // Child has a group not in parent
      if (childEntry.enabled) {
        violations.push(`Tool group "${childEntry.group}": not permitted by parent`);
      }
      continue;
    }

    // Check if child is trying to enable a disabled group
    if (childEntry.enabled && !parentEntry.enabled) {
      violations.push(`Tool group "${childEntry.group}": parent has disabled this group`);
      continue;
    }

    // Check if child has tools not in parent's list
    if (childEntry.enabled && childEntry.tools && parentEntry.tools) {
      const parentTools = parentEntry.tools;
      const extraTools = childEntry.tools.filter((t) => !parentTools.includes(t));
      if (extraTools.length > 0) {
        violations.push(
          `Tool group "${childEntry.group}": tools [${extraTools.join(", ")}] not permitted by parent`
        );
      }
    }
  }

  return violations;
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new PermissionInheritance instance.
 *
 * @returns A PermissionInheritance implementation
 *
 * @example
 * ```typescript
 * const inheritance = createPermissionInheritance();
 *
 * const parentPerms: PermissionSet = {
 *   filePatterns: [{ pattern: "src/**", access: "write" }],
 *   toolGroups: [{ group: "filesystem", enabled: true }],
 *   canApproveSubagent: true,
 *   maxSubagentDepth: 3,
 * };
 *
 * const childPerms = inheritance.derive(parentPerms, {
 *   filePatterns: [{ pattern: "src/**", access: "read" }],
 *   maxSubagentDepth: 2,
 * });
 * ```
 */
export function createPermissionInheritance(): PermissionInheritance {
  return {
    derive(parent: PermissionSet, child: Partial<PermissionSet>): PermissionSet {
      return {
        // Merge file patterns (intersection)
        filePatterns: mergeFilePatterns(parent.filePatterns, child.filePatterns ?? []),

        // Merge tool groups (intersection)
        toolGroups: mergeToolGroups(parent.toolGroups, child.toolGroups ?? []),

        // Child can only approve if parent can AND child requests it
        canApproveSubagent: parent.canApproveSubagent && (child.canApproveSubagent ?? false),

        // Take minimum of parent max and child requested
        maxSubagentDepth: Math.min(
          parent.maxSubagentDepth,
          child.maxSubagentDepth ?? parent.maxSubagentDepth
        ),
      };
    },

    validate(
      parent: PermissionSet,
      child: PermissionSet
    ): { valid: boolean; violations: string[] } {
      const violations: string[] = [];

      // Validate file patterns
      violations.push(...validateFilePatterns(parent.filePatterns, child.filePatterns));

      // Validate tool groups
      violations.push(...validateToolGroups(parent.toolGroups, child.toolGroups));

      // Validate canApproveSubagent
      if (child.canApproveSubagent && !parent.canApproveSubagent) {
        violations.push("canApproveSubagent: child cannot approve subagents when parent cannot");
      }

      // Validate maxSubagentDepth
      if (child.maxSubagentDepth > parent.maxSubagentDepth) {
        violations.push(
          `maxSubagentDepth: child depth ${child.maxSubagentDepth} exceeds parent depth ${parent.maxSubagentDepth}`
        );
      }

      return {
        valid: violations.length === 0,
        violations,
      };
    },

    async escalate(
      _current: PermissionSet,
      _requested: Partial<PermissionSet>
    ): Promise<PermissionSet | null> {
      // For now, escalation is not auto-approved
      // This would typically involve user interaction or policy checks
      // Return null to indicate escalation denied
      //
      // In a full implementation, this would:
      // 1. Check if escalation is allowed by policy
      // 2. Prompt the user for approval
      // 3. Log the escalation request
      // 4. Return the elevated permissions if approved

      // Default behavior: deny escalation (safest option)
      // Implementations can override this with actual approval logic
      return null;
    },

    getEffective(chain: PermissionSet[]): PermissionSet {
      const emptyPermissions: PermissionSet = {
        filePatterns: [],
        toolGroups: [],
        canApproveSubagent: false,
        maxSubagentDepth: 0,
      };

      if (chain.length === 0) {
        // Return empty/minimal permissions for empty chain
        return emptyPermissions;
      }

      // Use reduce to compute intersection across all permission sets
      return chain.reduce((effective, current) => this.derive(effective, current));
    },
  };
}

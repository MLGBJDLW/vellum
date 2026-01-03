// ============================================
// Policy Types - Approval & Sandbox Policies
// ============================================

import { z } from "zod";
import type { TrustPreset } from "../permission/types.js";
import type { FileRestriction } from "./restrictions.js";

// ============================================
// Approval Policy
// ============================================

/**
 * Schema for approval policy levels.
 *
 * Defines how agent actions are approved:
 * - `suggest`: All actions require user confirmation
 * - `auto-edit`: File edits auto-approved, commands require confirmation
 * - `on-request`: Auto-approved until agent requests confirmation
 * - `full-auto`: All actions auto-approved (most permissive)
 *
 * @example
 * ```typescript
 * // Validation
 * ApprovalPolicySchema.parse('suggest');    // ✅ Returns 'suggest'
 * ApprovalPolicySchema.parse('full-auto');  // ✅ Returns 'full-auto'
 * ApprovalPolicySchema.parse('invalid');    // ❌ Throws ZodError
 *
 * // Safe parsing
 * const result = ApprovalPolicySchema.safeParse(userInput);
 * if (result.success) {
 *   console.log(result.data);
 * }
 * ```
 */
export const ApprovalPolicySchema = z.enum(["suggest", "auto-edit", "on-request", "full-auto"]);

/**
 * Type for approval policy levels.
 *
 * @example
 * ```typescript
 * const policy: ApprovalPolicy = 'auto-edit';
 *
 * function getApprovalBehavior(policy: ApprovalPolicy): string {
 *   switch (policy) {
 *     case 'suggest':
 *       return 'All actions require confirmation';
 *     case 'auto-edit':
 *       return 'File edits auto, commands ask';
 *     case 'on-request':
 *       return 'Auto until AI requests confirmation';
 *     case 'full-auto':
 *       return 'All actions auto-approved';
 *   }
 * }
 * ```
 */
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

/**
 * All available approval policies as a readonly array.
 */
export const APPROVAL_POLICIES = ApprovalPolicySchema.options;

// ============================================
// Sandbox Policy
// ============================================

/**
 * Schema for sandbox policy levels.
 *
 * Defines file system access boundaries:
 * - `workspace-read`: Read-only access within workspace
 * - `workspace-write`: Read/write access within workspace
 * - `cwd-read`: Read-only access in current working directory
 * - `cwd-write`: Read/write access in current working directory
 * - `full-access`: Full system-wide access (use with caution)
 *
 * @example
 * ```typescript
 * // Validation
 * SandboxPolicySchema.parse('workspace-read');   // ✅ Returns 'workspace-read'
 * SandboxPolicySchema.parse('full-access');      // ✅ Returns 'full-access'
 * SandboxPolicySchema.parse('invalid');          // ❌ Throws ZodError
 * ```
 */
export const SandboxPolicySchema = z.enum([
  "workspace-read",
  "workspace-write",
  "cwd-read",
  "cwd-write",
  "full-access",
]);

/**
 * Type for sandbox policy levels.
 *
 * @example
 * ```typescript
 * const sandbox: SandboxPolicy = 'workspace-write';
 *
 * function getSandboxDescription(policy: SandboxPolicy): string {
 *   switch (policy) {
 *     case 'workspace-read':
 *       return 'Read-only in workspace';
 *     case 'workspace-write':
 *       return 'Read/write in workspace';
 *     case 'cwd-read':
 *       return 'Read-only in current directory';
 *     case 'cwd-write':
 *       return 'Read/write in current directory';
 *     case 'full-access':
 *       return 'Full system access (dangerous)';
 *   }
 * }
 * ```
 */
export type SandboxPolicy = z.infer<typeof SandboxPolicySchema>;

/**
 * All available sandbox policies as a readonly array.
 */
export const SANDBOX_POLICIES = SandboxPolicySchema.options;

// ============================================
// Policy Mappings
// ============================================

/**
 * Mapping from ApprovalPolicy to TrustPreset values.
 *
 * Used internally by policyToTrustPreset() for conversion.
 */
const APPROVAL_TO_TRUST_MAPPING: Record<ApprovalPolicy, TrustPreset> = {
  suggest: "cautious",
  "auto-edit": "default",
  "on-request": "default",
  "full-auto": "relaxed",
};

/**
 * Converts an ApprovalPolicy to the corresponding TrustPreset.
 *
 * Maps the approval level to the Phase 10 permission system's TrustPreset:
 * - `suggest` → `cautious` (conservative, most actions need approval)
 * - `auto-edit` → `default` (balanced, workspace auto, external needs approval)
 * - `on-request` → `default` (balanced, workspace auto, external needs approval)
 * - `full-auto` → `relaxed` (permissive, most actions auto-approved)
 *
 * @param policy - The approval policy to convert
 * @returns The corresponding TrustPreset value
 *
 * @example
 * ```typescript
 * const preset = policyToTrustPreset('suggest');
 * console.log(preset); // 'cautious'
 *
 * const relaxed = policyToTrustPreset('full-auto');
 * console.log(relaxed); // 'relaxed'
 * ```
 */
export function policyToTrustPreset(policy: ApprovalPolicy): TrustPreset {
  return APPROVAL_TO_TRUST_MAPPING[policy];
}

/**
 * Converts a SandboxPolicy to FileRestriction array.
 *
 * Generates the appropriate file access restrictions based on the sandbox policy:
 * - `workspace-read`: Read-only access to all workspace files
 * - `workspace-write`: Read/write access to all workspace files
 * - `cwd-read`: Read-only access to current working directory
 * - `cwd-write`: Read/write access to current working directory
 * - `full-access`: No restrictions (empty array)
 *
 * @param policy - The sandbox policy to convert
 * @param cwd - Optional current working directory path (used for cwd-* policies)
 * @returns Array of FileRestriction objects defining access rules
 *
 * @example
 * ```typescript
 * // Workspace read-only
 * const restrictions = sandboxToRestrictions('workspace-read');
 * // Returns: [{ pattern: '**\/*', access: 'read' }]
 *
 * // CWD write with specific directory
 * const cwdRestrictions = sandboxToRestrictions('cwd-write', '/project/src');
 * // Returns: [
 * //   { pattern: '**\/*', access: 'read' },
 * //   { pattern: '/project/src/**\/*', access: 'write' }
 * // ]
 *
 * // Full access (no restrictions)
 * const fullAccess = sandboxToRestrictions('full-access');
 * // Returns: []
 * ```
 */
export function sandboxToRestrictions(policy: SandboxPolicy, cwd?: string): FileRestriction[] {
  switch (policy) {
    case "workspace-read":
      return [{ pattern: "**/*", access: "read" }];

    case "workspace-write":
      return [{ pattern: "**/*", access: "write" }];

    case "cwd-read":
      if (cwd) {
        return [{ pattern: `${cwd}/**/*`, access: "read" }];
      }
      return [{ pattern: "**/*", access: "read" }];

    case "cwd-write":
      if (cwd) {
        return [
          { pattern: "**/*", access: "read" },
          { pattern: `${cwd}/**/*`, access: "write" },
        ];
      }
      return [{ pattern: "**/*", access: "write" }];

    case "full-access":
      return [];
  }
}

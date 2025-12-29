/**
 * Permission system types and schemas for Vellum
 *
 * Provides type definitions for:
 * - Permission levels (allow/deny/ask)
 * - Trust presets for quick configuration
 * - Permission configuration schemas
 * - Permission request/response types
 */

import { z } from "zod";

// ============================================
// Permission Level
// ============================================

/**
 * Three-level permission type
 * - allow: Automatically permit the action
 * - deny: Automatically reject the action
 * - ask: Prompt user for permission
 */
export const PermissionLevelSchema = z.enum(["allow", "deny", "ask"]);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

/** Permission levels as const array for iteration */
export const PERMISSION_LEVELS = ["allow", "deny", "ask"] as const;

// ============================================
// Trust Presets
// ============================================

/**
 * Trust level presets for quick configuration
 * - paranoid: Most restrictive, all actions need approval
 * - cautious: Conservative, most actions need approval
 * - default: Balanced, workspace auto, external needs approval
 * - relaxed: Permissive, most actions auto-approved
 * - yolo: No safety checks (dangerous)
 */
export const TrustPresetSchema = z.enum(["paranoid", "cautious", "default", "relaxed", "yolo"]);
export type TrustPreset = z.infer<typeof TrustPresetSchema>;

/** Trust presets as const array for iteration */
export const TRUST_PRESETS = ["paranoid", "cautious", "default", "relaxed", "yolo"] as const;

// ============================================
// Pattern Permission (for wildcard matching)
// ============================================

/**
 * Permission configuration that supports pattern matching
 * Can be a simple level or a record of pattern -> level mappings
 */
export const PatternPermissionSchema = z.union([
  PermissionLevelSchema,
  z.record(z.string(), PermissionLevelSchema),
]);
export type PatternPermission = z.infer<typeof PatternPermissionSchema>;

// ============================================
// Permission Configuration
// ============================================

/**
 * Complete permission configuration schema
 * Defines permissions for all operation types
 */
export const PermissionConfigSchema = z.object({
  /** Trust preset (optional, used as base configuration) */
  preset: TrustPresetSchema.optional(),

  /** File editing permission */
  edit: PermissionLevelSchema.optional(),

  /** Bash command permission (supports wildcard patterns) */
  bash: PatternPermissionSchema.optional(),

  /** Web fetch permission */
  webfetch: PermissionLevelSchema.optional(),

  /** External directory access permission */
  external_directory: PermissionLevelSchema.optional(),

  /** Doom loop detection permission */
  doom_loop: PermissionLevelSchema.optional(),

  /** MCP tool permissions (server -> pattern permissions) */
  mcp: z.record(z.string(), PatternPermissionSchema).optional(),
});
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;

// ============================================
// Permission Info
// ============================================

/**
 * Information about a permission request
 * Contains all context needed to display and process the request
 */
export const PermissionInfoSchema = z.object({
  /** Unique identifier for this permission request */
  id: z.string(),

  /** Type of permission (edit, bash, webfetch, etc.) */
  type: z.string(),

  /** Pattern(s) being requested (e.g., file paths, commands) */
  pattern: z.union([z.string(), z.array(z.string())]).optional(),

  /** Session this request belongs to */
  sessionId: z.string(),

  /** Message that triggered this request */
  messageId: z.string(),

  /** Tool call ID if applicable */
  callId: z.string().optional(),

  /** Human-readable title for the permission request */
  title: z.string(),

  /** Additional metadata about the request */
  metadata: z.record(z.string(), z.unknown()).optional(),

  /** Timing information */
  time: z.object({
    /** When the request was created */
    created: z.number(),
    /** When the request was resolved (if resolved) */
    resolved: z.number().optional(),
  }),
});
export type PermissionInfo = z.infer<typeof PermissionInfoSchema>;

// ============================================
// Permission Response
// ============================================

/**
 * User response to a permission prompt
 * - once: Allow this specific action only
 * - always: Allow this pattern for the session
 * - reject: Deny this action
 */
export const PermissionResponseSchema = z.enum(["once", "always", "reject"]);
export type PermissionResponse = z.infer<typeof PermissionResponseSchema>;

/** Permission responses as const array */
export const PERMISSION_RESPONSES = ["once", "always", "reject"] as const;

// ============================================
// Permission Decision Result
// ============================================

/**
 * Final permission decision with reasoning
 * Used as the output of permission checking with full context
 *
 * Note: The simple "allow" | "ask" | "deny" type is available
 * as PermissionDecision from @vellum/core/tool (for backward compat)
 */
export const PermissionDecisionResultSchema = z.object({
  /** The decision result */
  decision: PermissionLevelSchema,

  /** Reason for the decision */
  reason: z.string().optional(),

  /** Whether this was from a cached/remembered decision */
  cached: z.boolean().optional(),

  /** The pattern that matched (if pattern-based) */
  matchedPattern: z.string().optional(),

  /** Source of the decision (config, session, user) */
  source: z.enum(["config", "session", "user", "default"]).optional(),
});
export type PermissionDecisionResult = z.infer<typeof PermissionDecisionResultSchema>;

// ============================================
// Permission Record (for history)
// ============================================

/**
 * Record of a permission decision for history tracking
 */
export const PermissionRecordSchema = z.object({
  /** The permission info that was requested */
  info: PermissionInfoSchema,

  /** The user's response */
  response: PermissionResponseSchema,

  /** When this decision was made */
  timestamp: z.number(),
});
export type PermissionRecord = z.infer<typeof PermissionRecordSchema>;

// ============================================
// Trust Preset Configurations
// ============================================

/**
 * Default permission configurations for each trust preset
 */
export const TRUST_PRESET_CONFIGS: Record<TrustPreset, Omit<PermissionConfig, "preset">> = {
  paranoid: {
    edit: "deny",
    bash: "deny",
    webfetch: "deny",
    external_directory: "deny",
    doom_loop: "deny",
  },
  cautious: {
    edit: "ask",
    bash: "ask",
    webfetch: "ask",
    external_directory: "ask",
    doom_loop: "ask",
  },
  default: {
    edit: "allow",
    bash: {
      "git status": "allow",
      "git diff": "allow",
      "git log": "allow",
      "rm -rf": "deny",
      "*": "ask",
    },
    webfetch: "ask",
    external_directory: "ask",
    doom_loop: "ask",
  },
  relaxed: {
    edit: "allow",
    bash: {
      "rm -rf": "deny",
      sudo: "deny",
      "*": "allow",
    },
    webfetch: "allow",
    external_directory: "ask",
    doom_loop: "allow",
  },
  yolo: {
    edit: "allow",
    bash: "allow",
    webfetch: "allow",
    external_directory: "allow",
    doom_loop: "allow",
  },
};

// ============================================
// Trust Mode Display Info
// ============================================

/**
 * Display information for trust modes
 */
export interface TrustModeInfo {
  /** Human-readable name */
  name: string;
  /** Unicode icon for display */
  icon: string;
  /** Color for UI display */
  color: string;
  /** Keyboard shortcut */
  shortcut: string;
  /** Brief description */
  description: string;
}

/**
 * Display information for each trust preset
 */
export const TRUST_MODE_INFO: Record<TrustPreset, TrustModeInfo> = {
  paranoid: {
    name: "Paranoid",
    icon: "⊘",
    color: "red",
    shortcut: "Ctrl+Shift+1",
    description: "All actions blocked by default",
  },
  cautious: {
    name: "Cautious",
    icon: "◎",
    color: "yellow",
    shortcut: "Ctrl+Shift+2",
    description: "All actions require approval",
  },
  default: {
    name: "Default",
    icon: "●",
    color: "green",
    shortcut: "Ctrl+Shift+3",
    description: "Workspace auto, external needs approval",
  },
  relaxed: {
    name: "Relaxed",
    icon: "◆",
    color: "cyan",
    shortcut: "Ctrl+Shift+4",
    description: "Most actions auto-approved",
  },
  yolo: {
    name: "YOLO",
    icon: "▲",
    color: "magenta",
    shortcut: "Ctrl+Shift+5",
    description: "No safety checks (dangerous)",
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Resolve effective permission config from preset and overrides
 */
export function resolvePermissionConfig(
  config: PermissionConfig
): Omit<PermissionConfig, "preset"> {
  const preset = config.preset ?? "default";
  const baseConfig = TRUST_PRESET_CONFIGS[preset];

  return {
    edit: config.edit ?? baseConfig.edit,
    bash: config.bash ?? baseConfig.bash,
    webfetch: config.webfetch ?? baseConfig.webfetch,
    external_directory: config.external_directory ?? baseConfig.external_directory,
    doom_loop: config.doom_loop ?? baseConfig.doom_loop,
    mcp: config.mcp,
  };
}

/**
 * Check if a permission level allows the action
 */
export function isAllowed(level: PermissionLevel): boolean {
  return level === "allow";
}

/**
 * Check if a permission level denies the action
 */
export function isDenied(level: PermissionLevel): boolean {
  return level === "deny";
}

/**
 * Check if a permission level requires user confirmation
 */
export function requiresConfirmation(level: PermissionLevel): boolean {
  return level === "ask";
}

/**
 * Create a default permission info object
 */
export function createPermissionInfo(
  type: string,
  title: string,
  sessionId: string,
  messageId: string,
  options?: {
    pattern?: string | string[];
    callId?: string;
    metadata?: Record<string, unknown>;
  }
): PermissionInfo {
  return {
    id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    title,
    sessionId,
    messageId,
    pattern: options?.pattern,
    callId: options?.callId,
    metadata: options?.metadata,
    time: {
      created: Date.now(),
    },
  };
}

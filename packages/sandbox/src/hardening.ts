/**
 * Process hardening utilities.
 *
 * These functions are intentionally conservative and cross-platform.
 * Platform-specific hardening should be implemented in platform adapters.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDirResult {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary directory for sandbox execution.
 */
export async function createTempDir(prefix = "vellum-sandbox-"): Promise<TempDirResult> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Drop privileges if supported by the platform.
 * No-op by default for portability.
 */
export function dropPrivileges(): void {
  // Intentionally left as a no-op.
}

/**
 * Apply resource limits if supported by the platform.
 * No-op by default for portability.
 */
export function setResourceLimits(): void {
  // Intentionally left as a no-op.
}

/**
 * Explicit blocklist for high-risk environment variables.
 */
const BLOCKED_NAMES = new Set(["LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS"]);

/**
 * Whitelist for variables that may match sensitive name patterns but are safe.
 *
 * These variables are preserved even if they match sensitive name patterns like /KEY/i or /AUTH/i.
 * SSH_AUTH_SOCK is critical for git SSH operations!
 */
const ALLOWED_NAMES = new Set([
  // Basic shell environment
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "LANG",
  "TERM",
  "PWD",
  "COLORTERM",
  "EDITOR",
  "VISUAL",
  // SSH agent (matches /AUTH/i but required for git SSH)
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  // X11 display (XAUTHORITY matches /AUTH/i)
  "DISPLAY",
  "XAUTHORITY",
  // GPG agent (for signed commits)
  "GPG_AGENT_INFO",
  "GPG_TTY",
  // Keyboard settings (match /KEY/i but harmless)
  "KEYBOARD",
  "KEYMAP",
  "XKB_DEFAULT_LAYOUT",
  "XKB_DEFAULT_OPTIONS",
]);

/**
 * Name patterns that indicate sensitive variables (case-insensitive).
 */
const SENSITIVE_NAME_PATTERNS: RegExp[] = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /KEY/i,
  /AUTH/i,
  /CREDENTIAL/i,
  /PRIVATE/i,
  /CERT/i,
];

/**
 * Value patterns that indicate sensitive data (credentials, tokens, keys).
 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  // SSH/PGP private keys
  /-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/i,
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
  /(ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,}/i,
  // Google API keys
  /AIzaSy[a-zA-Z0-9_-]{33}/i,
  // AWS Access Key ID
  /AKIA[A-Z0-9]{16}/i,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/i,
  // Stripe API keys
  /(s|r)k_(live|test)_[0-9a-zA-Z]{24}/i,
];

/**
 * Check if a variable name matches any sensitive pattern.
 */
function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Check if a value contains sensitive data.
 */
function isSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Remove high-risk environment variables and return a sanitized map.
 *
 * Filters by:
 * 1. Explicit blocklist (LD_PRELOAD, NODE_OPTIONS, etc.)
 * 2. Sensitive name patterns (TOKEN, SECRET, KEY, etc.)
 * 3. Sensitive value patterns (JWT, AWS keys, GitHub tokens, etc.)
 *
 * Preserves whitelisted variables (PATH, HOME, etc.) regardless of name patterns.
 */
export function sanitizeEnvironment(
  env: Record<string, string | undefined>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Always block explicit high-risk variables
    if (BLOCKED_NAMES.has(key)) {
      continue;
    }

    // Whitelist takes precedence over name pattern filtering
    if (ALLOWED_NAMES.has(key)) {
      // Still check value for sensitive data even for whitelisted names
      if (!isSensitiveValue(value)) {
        sanitized[key] = value;
      }
      continue;
    }

    // Block variables with sensitive name patterns
    if (isSensitiveName(key)) {
      continue;
    }

    // Block variables with sensitive values
    if (isSensitiveValue(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

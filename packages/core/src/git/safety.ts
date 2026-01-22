/**
 * Git Safety Module
 *
 * Provides safety utilities for git operations including:
 * - Protected path checking to prevent modifications in sensitive locations
 * - Environment sanitization to prevent credential leaks
 * - GPG flags to disable signing for automated commits
 *
 * @module git/safety
 */

import * as os from "node:os";
import * as path from "node:path";
import type { VellumError } from "../errors/types.js";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import { gitProtectedPathError } from "./errors.js";

// =============================================================================
// T007: Safety Module
// =============================================================================

/**
 * List of protected directory names that should never be modified.
 * These are common system and user directories that could cause
 * significant issues if modified by automated tools.
 */
const PROTECTED_DIR_NAMES = new Set([
  "Desktop",
  "Documents",
  "Downloads",
  "Pictures",
  "Videos",
  "Music",
  "Library",
  "AppData",
  "Application Data",
  "Local Settings",
  "Program Files",
  "Program Files (x86)",
  "Windows",
  "System32",
  "ProgramData",
]);

/**
 * Environment variables that should be unset to prevent credential prompts
 * or leaks during git operations.
 */
const SENSITIVE_ENV_VARS = [
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GPG_AGENT_INFO",
  "GPG_TTY",
  "GIT_TERMINAL_PROMPT",
  "SSH_AUTH_SOCK",
] as const;

/**
 * Normalizes a path for comparison by resolving it and converting to lowercase
 * on case-insensitive systems (Windows).
 */
function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  // On Windows, paths are case-insensitive
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Checks if a path is within a protected location.
 *
 * Protected locations include:
 * - User home directory (root level)
 * - Desktop, Documents, Downloads, etc.
 * - System directories
 *
 * REQ-012: Reject git operations in protected locations
 *
 * @param targetPath - The path to check
 * @returns Ok(true) if path is safe, Err with gitProtectedPathError if protected
 *
 * @example
 * ```typescript
 * const result = checkProtectedPath("/Users/alice/Desktop");
 * if (!result.ok) {
 *   console.error("Protected path:", result.error.message);
 * }
 * ```
 */
export function checkProtectedPath(targetPath: string): Result<true, VellumError> {
  const normalizedTarget = normalizePath(targetPath);
  const homeDir = normalizePath(os.homedir());
  const tempDir = normalizePath(os.tmpdir());

  // Always allow temp directories on all platforms
  // On Windows: C:\Users\X\AppData\Local\Temp (under protected AppData)
  // On macOS: /var/folders/... (under protected /var)
  // On Linux: /tmp
  const isInTempDir =
    normalizedTarget === tempDir || normalizedTarget.startsWith(tempDir + path.sep);
  if (isInTempDir) {
    return Ok(true);
  }

  // Check if path is exactly the home directory
  if (normalizedTarget === homeDir) {
    return Err(gitProtectedPathError(targetPath));
  }

  // Parse path components
  const targetParts = normalizedTarget.split(path.sep).filter(Boolean);
  const homeParts = homeDir.split(path.sep).filter(Boolean);

  // Check if path is within home directory
  const isInHome =
    targetParts.length >= homeParts.length &&
    homeParts.every((part, idx) => {
      const targetPart =
        process.platform === "win32" ? targetParts[idx]?.toLowerCase() : targetParts[idx];
      const homePart = process.platform === "win32" ? part.toLowerCase() : part;
      return targetPart === homePart;
    });

  if (isInHome) {
    // Get the first directory after home
    const relativeToHome = targetParts.slice(homeParts.length);
    if (relativeToHome.length > 0) {
      const firstDir = relativeToHome[0];
      if (!firstDir) {
        return Err(gitProtectedPathError(targetPath));
      }
      // Check if it's a protected directory name (case-insensitive on Windows)
      const dirToCheck = process.platform === "win32" ? firstDir.toLowerCase() : firstDir;
      const protectedCheck = Array.from(PROTECTED_DIR_NAMES).some((name) => {
        const protectedName = process.platform === "win32" ? name.toLowerCase() : name;
        return dirToCheck === protectedName;
      });

      if (protectedCheck) {
        return Err(gitProtectedPathError(targetPath));
      }
    } else {
      // Path is exactly home directory (shouldn't reach here but safety check)
      return Err(gitProtectedPathError(targetPath));
    }
  }

  // Check for system directories (Windows-specific)
  if (process.platform === "win32") {
    const systemPaths = [
      "C:\\Windows",
      "C:\\Program Files",
      "C:\\Program Files (x86)",
      "C:\\ProgramData",
    ].map((p) => p.toLowerCase());

    for (const sysPath of systemPaths) {
      if (normalizedTarget === sysPath || normalizedTarget.startsWith(sysPath + path.sep)) {
        return Err(gitProtectedPathError(targetPath));
      }
    }
  }

  // Check for root-level operations on Unix
  if (process.platform !== "win32") {
    const rootProtected = ["/etc", "/usr", "/bin", "/sbin", "/var", "/root"];

    for (const rootPath of rootProtected) {
      if (normalizedTarget === rootPath || normalizedTarget.startsWith(rootPath + path.sep)) {
        return Err(gitProtectedPathError(targetPath));
      }
    }
  }

  return Ok(true);
}

/**
 * Returns a sanitized environment object with sensitive variables unset.
 *
 * This prevents git from prompting for credentials or leaking sensitive
 * information during automated operations.
 *
 * REQ-013: Sanitize environment for git operations
 *
 * @returns Environment object with GIT_ASKPASS, SSH_ASKPASS, GPG_AGENT_INFO unset
 *
 * @example
 * ```typescript
 * const env = getSanitizedEnv();
 * await exec("git", ["commit", "-m", "message"], { env });
 * ```
 */
export function getSanitizedEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  // Unset sensitive environment variables
  for (const varName of SENSITIVE_ENV_VARS) {
    delete env[varName];
  }

  // Set GIT_TERMINAL_PROMPT to 0 to disable credential prompts
  env.GIT_TERMINAL_PROMPT = "0";

  return env;
}

/**
 * Returns git command-line flags to disable GPG signing.
 *
 * GPG signing can cause git operations to hang waiting for a passphrase
 * in automated environments. These flags ensure commits proceed without
 * signing.
 *
 * REQ-014: Disable GPG signing for automated commits
 *
 * @returns Array of git flags to disable GPG signing
 *
 * @example
 * ```typescript
 * const flags = getNoGpgFlags();
 * await git.commit([...flags, "-m", "automated commit"]);
 * // flags = ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"]
 * ```
 */
export function getNoGpgFlags(): string[] {
  return [
    "-c",
    "commit.gpgsign=false",
    "-c",
    "tag.gpgsign=false",
    "-c",
    "user.name=Vellum Agent",
    "-c",
    "user.email=agent@vellum.local",
  ];
}

/**
 * Combines sanitized environment with no-GPG flags for fully safe git execution.
 *
 * @returns Object containing sanitized env and git flags
 *
 * @example
 * ```typescript
 * const { env, flags } = getGitSafetyConfig();
 * await exec("git", [...flags, "commit", "-m", "msg"], { env });
 * ```
 */
export function getGitSafetyConfig(): {
  env: Record<string, string | undefined>;
  flags: string[];
} {
  return {
    env: getSanitizedEnv(),
    flags: getNoGpgFlags(),
  };
}

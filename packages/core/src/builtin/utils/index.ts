/**
 * Builtin Utilities
 *
 * Common utilities for builtin tool implementations.
 *
 * @module builtin/utils
 */

export {
  isWithinWorkingDir,
  isWithinWorkingDirSecure,
  isWithinWorkingDirSecureSync,
  type PathSecurityResult,
  sanitizePath,
  validatePath,
} from "./path-security.js";

export {
  detectShell,
  executeShell,
  getSandboxOptions,
  isShellSuccess,
  type ShellOptions,
  type ShellResult,
} from "./shell-helpers.js";

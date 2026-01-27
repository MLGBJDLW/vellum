/**
 * Path Security Utilities
 *
 * Provides path validation and sanitization to prevent
 * path traversal attacks and ensure safe file operations.
 *
 * @module builtin/utils/path-security
 */

import { lstatSync, realpathSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

/**
 * Result of secure path validation that resolves symlinks.
 */
export interface PathSecurityResult {
  /** Whether the path is safely within the working directory */
  safe: boolean;
  /** The real (symlink-resolved) absolute path */
  realPath: string;
  /** Whether the original path was a symbolic link or junction */
  isSymlink: boolean;
}

/**
 * Sanitizes and normalizes a file path.
 *
 * - Resolves relative paths (., ..)
 * - Normalizes path separators
 * - Removes redundant separators
 * - Handles both Windows and Unix path formats
 *
 * @param filePath - The path to sanitize
 * @returns The normalized, sanitized path
 *
 * @example
 * ```typescript
 * sanitizePath('./foo/../bar/./baz')  // '/absolute/path/to/bar/baz'
 * sanitizePath('foo//bar')             // '/absolute/path/to/foo/bar'
 * sanitizePath('C:\\Users\\..\\foo')   // 'C:\\foo' (Windows)
 * ```
 */
export function sanitizePath(filePath: string): string {
  // Normalize the path (resolves . and .. and normalizes separators)
  const normalized = normalize(filePath);

  // If the path is absolute, just return the normalized version
  if (isAbsolute(normalized)) {
    return normalized;
  }

  // For relative paths, resolve against CWD to get absolute path
  return resolve(normalized);
}

/**
 * Checks if a path is safely within the specified working directory.
 *
 * Prevents path traversal attacks by ensuring the resolved path
 * doesn't escape the working directory boundary.
 *
 * @deprecated Use `isWithinWorkingDirSecure()` or `isWithinWorkingDirSecureSync()` instead.
 * This function only performs lexical path resolution and does NOT resolve symbolic links
 * or Windows junctions, making it vulnerable to symlink-based path traversal attacks.
 *
 * @param filePath - The path to check (can be relative or absolute)
 * @param workingDir - The working directory boundary
 * @returns `true` if path is within workingDir, `false` otherwise
 *
 * @example
 * ```typescript
 * isWithinWorkingDir('./src/file.ts', '/project')      // true
 * isWithinWorkingDir('../../../etc/passwd', '/project') // false
 * isWithinWorkingDir('/other/path', '/project')         // false
 * isWithinWorkingDir('/project/sub/file', '/project')   // true
 * ```
 */
export function isWithinWorkingDir(filePath: string, workingDir: string): boolean {
  // Normalize and resolve both paths to absolute forms
  const normalizedWorkingDir = normalize(resolve(workingDir));
  const resolvedPath = isAbsolute(filePath)
    ? normalize(filePath)
    : normalize(resolve(workingDir, filePath));

  // Ensure working directory ends with separator for accurate prefix check
  const workingDirWithSep = normalizedWorkingDir.endsWith(sep)
    ? normalizedWorkingDir
    : normalizedWorkingDir + sep;

  // The resolved path is within working dir if:
  // 1. It equals the working directory exactly, OR
  // 2. It starts with the working directory path + separator
  if (resolvedPath === normalizedWorkingDir) {
    return true;
  }

  // Check if resolved path starts with working directory
  if (resolvedPath.startsWith(workingDirWithSep)) {
    return true;
  }

  // Alternative: use relative() and check for ".." prefix
  const relativePath = relative(normalizedWorkingDir, resolvedPath);

  // If relative path starts with ".." or is absolute, it's outside
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return false;
  }

  return true;
}

/**
 * Helper to perform lexical path containment check (no symlink resolution).
 * Used as fallback when file doesn't exist yet.
 */
function isWithinWorkingDirLexical(resolvedPath: string, normalizedWorkingDir: string): boolean {
  const workingDirWithSep = normalizedWorkingDir.endsWith(sep)
    ? normalizedWorkingDir
    : normalizedWorkingDir + sep;

  if (resolvedPath === normalizedWorkingDir) {
    return true;
  }

  if (resolvedPath.startsWith(workingDirWithSep)) {
    return true;
  }

  const relativePath = relative(normalizedWorkingDir, resolvedPath);
  return !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

/**
 * Securely checks if a path is within the working directory by resolving symlinks.
 *
 * Unlike `isWithinWorkingDir`, this function uses `fs.realpath()` to resolve ALL
 * symbolic links (Unix) and junctions (Windows) recursively, preventing symlink-based
 * path traversal attacks.
 *
 * @param filePath - The path to check (can be relative or absolute)
 * @param workingDir - The working directory boundary
 * @returns Promise resolving to PathSecurityResult with safety status, real path, and symlink info
 *
 * @example
 * ```typescript
 * // Safe regular file
 * await isWithinWorkingDirSecure('./src/file.ts', '/project')
 * // { safe: true, realPath: '/project/src/file.ts', isSymlink: false }
 *
 * // Malicious symlink pointing outside workspace
 * // ln -s /etc/passwd /project/link
 * await isWithinWorkingDirSecure('./link', '/project')
 * // { safe: false, realPath: '/etc/passwd', isSymlink: true }
 *
 * // Non-existent file (falls back to lexical check)
 * await isWithinWorkingDirSecure('./new-file.ts', '/project')
 * // { safe: true, realPath: '/project/new-file.ts', isSymlink: false }
 * ```
 */
export async function isWithinWorkingDirSecure(
  filePath: string,
  workingDir: string
): Promise<PathSecurityResult> {
  // Resolve working directory to real path (also handles symlinked workspaces)
  let realWorkingDir: string;
  try {
    realWorkingDir = await realpath(workingDir);
  } catch {
    // If working dir doesn't exist, use normalized version
    realWorkingDir = normalize(resolve(workingDir));
  }

  // Get the lexical resolved path first
  const lexicalPath = isAbsolute(filePath)
    ? normalize(filePath)
    : normalize(resolve(workingDir, filePath));

  // Try to check if path is a symlink and resolve it
  let isSymlink = false;
  let realPath: string;

  try {
    // Check if it's a symlink/junction
    const stats = await lstat(lexicalPath);
    isSymlink = stats.isSymbolicLink();

    // Resolve to real path (follows all symlinks recursively)
    realPath = await realpath(lexicalPath);
  } catch (error: unknown) {
    // Handle file not found - fall back to lexical check
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // File doesn't exist yet, use lexical path
      realPath = lexicalPath;
      isSymlink = false;
    } else if (error instanceof Error && "code" in error && error.code === "EACCES") {
      // Permission denied - treat as unsafe
      return {
        safe: false,
        realPath: lexicalPath,
        isSymlink: false,
      };
    } else {
      // Other errors - treat as unsafe
      return {
        safe: false,
        realPath: lexicalPath,
        isSymlink: false,
      };
    }
  }

  // Check if real path is within real working directory
  const safe = isWithinWorkingDirLexical(realPath, realWorkingDir);

  return {
    safe,
    realPath,
    isSymlink,
  };
}

/**
 * Synchronously checks if a path is within the working directory by resolving symlinks.
 *
 * This is the synchronous version of `isWithinWorkingDirSecure()` for performance-critical
 * code paths where async/await overhead is unacceptable.
 *
 * @param filePath - The path to check (can be relative or absolute)
 * @param workingDir - The working directory boundary
 * @returns PathSecurityResult with safety status, real path, and symlink info
 *
 * @example
 * ```typescript
 * // Synchronous check for hot paths
 * const result = isWithinWorkingDirSecureSync('./file.ts', '/project');
 * if (!result.safe) {
 *   throw new Error(`Path traversal blocked: ${result.realPath}`);
 * }
 * ```
 */
export function isWithinWorkingDirSecureSync(
  filePath: string,
  workingDir: string
): PathSecurityResult {
  // Resolve working directory to real path
  let realWorkingDir: string;
  try {
    realWorkingDir = realpathSync(workingDir);
  } catch {
    realWorkingDir = normalize(resolve(workingDir));
  }

  // Get the lexical resolved path first
  const lexicalPath = isAbsolute(filePath)
    ? normalize(filePath)
    : normalize(resolve(workingDir, filePath));

  // Try to check if path is a symlink and resolve it
  let isSymlink = false;
  let realPath: string;

  try {
    // Check if it's a symlink/junction
    const stats = lstatSync(lexicalPath);
    isSymlink = stats.isSymbolicLink();

    // Resolve to real path
    realPath = realpathSync(lexicalPath);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      realPath = lexicalPath;
      isSymlink = false;
    } else if (error instanceof Error && "code" in error && error.code === "EACCES") {
      return {
        safe: false,
        realPath: lexicalPath,
        isSymlink: false,
      };
    } else {
      return {
        safe: false,
        realPath: lexicalPath,
        isSymlink: false,
      };
    }
  }

  const safe = isWithinWorkingDirLexical(realPath, realWorkingDir);

  return {
    safe,
    realPath,
    isSymlink,
  };
}

/**
 * Validates a path for security concerns and returns the sanitized version.
 *
 * @param filePath - The path to validate
 * @param workingDir - The working directory boundary
 * @returns Object with validation result and sanitized path
 *
 * @example
 * ```typescript
 * const result = validatePath('./src/file.ts', '/project');
 * if (result.valid) {
 *   // Use result.sanitizedPath safely
 * }
 * ```
 */
export function validatePath(
  filePath: string,
  workingDir: string
): {
  valid: boolean;
  sanitizedPath: string;
  error?: string;
} {
  const sanitizedPath = isAbsolute(filePath)
    ? sanitizePath(filePath)
    : sanitizePath(resolve(workingDir, filePath));

  if (!isWithinWorkingDir(sanitizedPath, workingDir)) {
    return {
      valid: false,
      sanitizedPath,
      error: `Path "${filePath}" escapes working directory "${workingDir}"`,
    };
  }

  return {
    valid: true,
    sanitizedPath,
  };
}

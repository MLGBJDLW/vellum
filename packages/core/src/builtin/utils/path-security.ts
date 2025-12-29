/**
 * Path Security Utilities
 *
 * Provides path validation and sanitization to prevent
 * path traversal attacks and ensure safe file operations.
 *
 * @module builtin/utils/path-security
 */

import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

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

// ============================================
// Import Security Validator
// ============================================
// Security validation for import operations in AGENTS.md.
// Implements REQ-030: Path traversal prevention and URL allowlist.

import * as path from "node:path";
import { ImportSecurityError } from "../errors.js";

/**
 * Configuration for the import security validator.
 */
export interface ImportSecurityConfig {
  /** List of allowed URL patterns (glob-like). Empty = no URLs allowed. */
  urlAllowlist: string[];
  /** Whether to allow absolute paths (default: false) */
  allowAbsolutePaths: boolean;
  /** Maximum path depth from base directory (default: 10) */
  maxPathDepth: number;
}

/**
 * Default security configuration (restrictive).
 */
export const DEFAULT_SECURITY_CONFIG: ImportSecurityConfig = {
  urlAllowlist: [],
  allowAbsolutePaths: false,
  maxPathDepth: 10,
};

/**
 * Result of a path validation operation.
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;
  /** Normalized resolved path (if valid) */
  resolvedPath?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Result of a URL validation operation.
 */
export interface UrlValidationResult {
  /** Whether the URL is valid */
  valid: boolean;
  /** Normalized URL (if valid) */
  normalizedUrl?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Security validator for import operations.
 *
 * Validates paths and URLs to prevent:
 * - Directory traversal attacks (../)
 * - Access outside the base directory
 * - Unauthorized URL schemes
 * - URLs not in the allowlist
 *
 * @example
 * ```typescript
 * const validator = new ImportSecurityValidator();
 *
 * // Validate a file path
 * const result = validator.validatePath('/project', './rules/coding.md');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * // Validate a URL
 * const urlResult = validator.validateUrl('https://example.com/rules.md', ['example.com']);
 * ```
 */
export class ImportSecurityValidator {
  private readonly config: ImportSecurityConfig;

  constructor(config: Partial<ImportSecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
  }

  /**
   * Validates a path to ensure it doesn't escape the base directory.
   *
   * Checks for:
   * - Directory traversal sequences (..)
   * - Absolute paths (unless explicitly allowed)
   * - Paths that resolve outside basePath
   * - Excessive path depth
   *
   * @param basePath - The root directory for relative path resolution
   * @param targetPath - The path to validate (absolute or relative)
   * @returns Validation result with resolved path or error
   */
  validatePath(basePath: string, targetPath: string): PathValidationResult {
    // Check for empty path
    if (!targetPath || targetPath.trim() === "") {
      return {
        valid: false,
        error: "Import path cannot be empty",
      };
    }

    const trimmedPath = targetPath.trim();

    // Normalize the base path
    const normalizedBase = path.resolve(basePath);

    // Check if path is absolute
    if (path.isAbsolute(trimmedPath)) {
      if (!this.config.allowAbsolutePaths) {
        return {
          valid: false,
          error: "Absolute paths are not allowed in imports",
        };
      }
      // For allowed absolute paths, still check they're within base
      const normalizedTarget = path.normalize(trimmedPath);
      if (!this.isWithinBase(normalizedBase, normalizedTarget)) {
        return {
          valid: false,
          error: `Path escapes base directory: ${trimmedPath}`,
        };
      }
      return {
        valid: true,
        resolvedPath: normalizedTarget,
      };
    }

    // Check for explicit directory traversal patterns
    if (this.containsTraversal(trimmedPath)) {
      return {
        valid: false,
        error: `Directory traversal detected in path: ${trimmedPath}`,
      };
    }

    // Resolve the path relative to base
    const resolvedPath = path.resolve(normalizedBase, trimmedPath);
    const normalizedResolved = path.normalize(resolvedPath);

    // Check the resolved path is within the base directory
    if (!this.isWithinBase(normalizedBase, normalizedResolved)) {
      return {
        valid: false,
        error: `Path escapes base directory: ${trimmedPath}`,
      };
    }

    // Check path depth
    const relativePath = path.relative(normalizedBase, normalizedResolved);
    const depth = relativePath.split(path.sep).filter((p) => p && p !== ".").length;
    if (depth > this.config.maxPathDepth) {
      return {
        valid: false,
        error: `Path exceeds maximum depth of ${this.config.maxPathDepth}: ${trimmedPath}`,
      };
    }

    return {
      valid: true,
      resolvedPath: normalizedResolved,
    };
  }

  /**
   * Validates a URL against the allowlist.
   *
   * Checks for:
   * - Valid URL format
   * - HTTPS scheme (HTTP blocked by default)
   * - Domain in allowlist
   *
   * @param url - The URL to validate
   * @param allowlist - Optional override for URL allowlist. If not provided, uses config.
   * @returns Validation result with normalized URL or error
   */
  validateUrl(url: string, allowlist?: string[]): UrlValidationResult {
    const effectiveAllowlist = allowlist ?? this.config.urlAllowlist;

    // Check if URL imports are allowed at all
    if (effectiveAllowlist.length === 0) {
      return {
        valid: false,
        error: "URL imports are disabled (empty allowlist)",
      };
    }

    // Parse and validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        valid: false,
        error: `Invalid URL format: ${url}`,
      };
    }

    // Check scheme (only HTTPS allowed by default)
    if (parsedUrl.protocol !== "https:") {
      return {
        valid: false,
        error: `Only HTTPS URLs are allowed, got: ${parsedUrl.protocol}`,
      };
    }

    // Check against allowlist
    const hostname = parsedUrl.hostname.toLowerCase();
    const isAllowed = effectiveAllowlist.some((pattern) =>
      this.matchesUrlPattern(hostname, pattern)
    );

    if (!isAllowed) {
      return {
        valid: false,
        error: `URL domain not in allowlist: ${hostname}`,
      };
    }

    return {
      valid: true,
      normalizedUrl: parsedUrl.href,
    };
  }

  /**
   * Checks if a path contains directory traversal sequences.
   */
  private containsTraversal(targetPath: string): boolean {
    // Normalize path separators for consistent checking
    const normalized = targetPath.replace(/\\/g, "/");

    // Check for .. segments that could indicate traversal
    const segments = normalized.split("/");
    let depth = 0;

    for (const segment of segments) {
      if (segment === "..") {
        depth--;
        // If depth goes negative at any point, it's trying to escape
        if (depth < 0) {
          return true;
        }
      } else if (segment && segment !== ".") {
        depth++;
      }
    }

    return false;
  }

  /**
   * Checks if a resolved path is within the base directory.
   */
  private isWithinBase(basePath: string, resolvedPath: string): boolean {
    // Normalize both paths for comparison
    const normalizedBase = path.normalize(basePath);
    const normalizedTarget = path.normalize(resolvedPath);

    // The target should start with the base path
    // Use path.relative to check - if it starts with .., it's outside
    const relative = path.relative(normalizedBase, normalizedTarget);

    // If relative path starts with .. or is absolute, target is outside base
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  /**
   * Checks if a hostname matches a URL pattern.
   * Supports:
   * - Exact match: "example.com"
   * - Wildcard subdomain: "*.example.com"
   * - Full wildcard: "*" (matches any)
   */
  private matchesUrlPattern(hostname: string, pattern: string): boolean {
    const normalizedPattern = pattern.toLowerCase().trim();
    const normalizedHostname = hostname.toLowerCase();

    // Full wildcard
    if (normalizedPattern === "*") {
      return true;
    }

    // Wildcard subdomain pattern (*.example.com)
    if (normalizedPattern.startsWith("*.")) {
      const baseDomain = normalizedPattern.slice(2);
      return normalizedHostname === baseDomain || normalizedHostname.endsWith(`.${baseDomain}`);
    }

    // Exact match
    return normalizedHostname === normalizedPattern;
  }
}

/**
 * Creates and throws an ImportSecurityError for path violations.
 *
 * @param message - Error message describing the violation
 * @param attemptedPath - The path that caused the violation
 * @throws ImportSecurityError
 */
export function throwPathSecurityError(message: string, attemptedPath: string): never {
  throw new ImportSecurityError(message, attemptedPath);
}

/**
 * Creates and throws an ImportSecurityError for URL violations.
 *
 * @param message - Error message describing the violation
 * @param attemptedUrl - The URL that caused the violation
 * @throws ImportSecurityError
 */
export function throwUrlSecurityError(message: string, attemptedUrl: string): never {
  throw new ImportSecurityError(message, attemptedUrl);
}

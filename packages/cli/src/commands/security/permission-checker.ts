/**
 * Permission Checker
 *
 * Security module for validating command permissions against defined policies.
 * Provides file access, network access, and general resource permission checks.
 *
 * @module cli/commands/security/permission-checker
 */

import path from "node:path";

// =============================================================================
// T052: Types
// =============================================================================

/**
 * Security policy for command execution
 *
 * Defines what resources a command is allowed to access.
 * All fields are optional - if not specified, the resource type is unrestricted.
 *
 * @example
 * ```typescript
 * const policy: CommandSecurityPolicy = {
 *   allowedPaths: ['./src/**', './config/**'],
 *   deniedPaths: ['**\/.env', '**\/secrets/**'],
 *   allowedHosts: ['api.example.com', 'localhost'],
 *   deniedHosts: ['*.evil.com'],
 *   requiresAuth: true,
 *   maxExecutionTime: 30000,
 * };
 * ```
 */
export interface CommandSecurityPolicy {
  /** Allowed file paths (glob patterns or absolute paths) */
  readonly allowedPaths?: readonly string[];
  /** Blocked file paths (glob patterns or absolute paths) - takes precedence over allowedPaths */
  readonly deniedPaths?: readonly string[];
  /** Allowed network hosts (domain names or IP addresses, supports wildcards) */
  readonly allowedHosts?: readonly string[];
  /** Blocked network hosts - takes precedence over allowedHosts */
  readonly deniedHosts?: readonly string[];
  /** Whether the command requires an authenticated session */
  readonly requiresAuth?: boolean;
  /** Maximum execution time in milliseconds */
  readonly maxExecutionTime?: number;
}

/**
 * Result of a permission check
 *
 * Discriminated union that indicates whether access is allowed or denied.
 * When denied, includes the reason and optional suggestion for resolution.
 *
 * @example
 * ```typescript
 * const result = checker.checkFileAccess('/etc/passwd', policy);
 * if (!result.allowed) {
 *   console.error(`Denied: ${result.reason}`);
 *   if (result.suggestion) {
 *     console.log(`Suggestion: ${result.suggestion}`);
 *   }
 * }
 * ```
 */
export type PermissionResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly suggestion?: string };

// =============================================================================
// T052: PermissionChecker Class
// =============================================================================

/**
 * PermissionChecker - Validates command permissions against security policies
 *
 * Provides methods to check if a command is allowed to access specific resources
 * based on the defined security policy.
 *
 * @example
 * ```typescript
 * const checker = new PermissionChecker();
 *
 * const policy: CommandSecurityPolicy = {
 *   allowedPaths: ['./src/**'],
 *   deniedPaths: ['**\/.env'],
 * };
 *
 * const result = checker.checkFileAccess('./src/app.ts', policy);
 * if (result.allowed) {
 *   // Proceed with file access
 * } else {
 *   console.error(result.reason);
 * }
 * ```
 */
export class PermissionChecker {
  /**
   * The base directory for resolving relative paths
   */
  private readonly baseDir: string;

  /**
   * Create a new PermissionChecker
   *
   * @param baseDir - Base directory for resolving relative paths (defaults to cwd)
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.cwd();
  }

  /**
   * Check if file access is allowed by the policy
   *
   * Validates a file path against the allowed and denied path patterns
   * in the security policy.
   *
   * @param filePath - The file path to check (absolute or relative)
   * @param policy - The security policy to check against
   * @returns PermissionResult indicating if access is allowed
   *
   * @example
   * ```typescript
   * const result = checker.checkFileAccess('./config.json', {
   *   allowedPaths: ['./config/**'],
   *   deniedPaths: ['./config/secrets/**'],
   * });
   * ```
   */
  checkFileAccess(filePath: string, policy: CommandSecurityPolicy): PermissionResult {
    if (!filePath) {
      return {
        allowed: false,
        reason: "File path is required",
        suggestion: "Provide a valid file path",
      };
    }

    // Normalize the path for consistent matching
    const normalizedPath = this.normalizePath(filePath);

    // Check denied paths first (they take precedence)
    if (policy.deniedPaths && policy.deniedPaths.length > 0) {
      for (const pattern of policy.deniedPaths) {
        if (this.matchesPattern(normalizedPath, pattern)) {
          return {
            allowed: false,
            reason: `Path '${filePath}' is blocked by security policy`,
            suggestion: "Check the command's deniedPaths configuration",
          };
        }
      }
    }

    // If allowedPaths is defined, path must match at least one pattern
    if (policy.allowedPaths && policy.allowedPaths.length > 0) {
      const isAllowed = policy.allowedPaths.some((pattern) =>
        this.matchesPattern(normalizedPath, pattern)
      );

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Path '${filePath}' is not in allowed paths`,
          suggestion: `Allowed paths: ${policy.allowedPaths.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if network access is allowed by the policy
   *
   * Validates a host against the allowed and denied host patterns
   * in the security policy.
   *
   * @param host - The host to check (domain name or IP address)
   * @param policy - The security policy to check against
   * @returns PermissionResult indicating if access is allowed
   *
   * @example
   * ```typescript
   * const result = checker.checkNetworkAccess('api.example.com', {
   *   allowedHosts: ['*.example.com', 'localhost'],
   *   deniedHosts: ['internal.example.com'],
   * });
   * ```
   */
  checkNetworkAccess(host: string, policy: CommandSecurityPolicy): PermissionResult {
    if (!host) {
      return {
        allowed: false,
        reason: "Host is required",
        suggestion: "Provide a valid host name or IP address",
      };
    }

    // Normalize the host (lowercase, trim)
    const normalizedHost = host.toLowerCase().trim();

    // Check denied hosts first (they take precedence)
    if (policy.deniedHosts && policy.deniedHosts.length > 0) {
      for (const pattern of policy.deniedHosts) {
        if (this.matchesHostPattern(normalizedHost, pattern)) {
          return {
            allowed: false,
            reason: `Host '${host}' is blocked by security policy`,
            suggestion: "Check the command's deniedHosts configuration",
          };
        }
      }
    }

    // If allowedHosts is defined, host must match at least one pattern
    if (policy.allowedHosts && policy.allowedHosts.length > 0) {
      const isAllowed = policy.allowedHosts.some((pattern) =>
        this.matchesHostPattern(normalizedHost, pattern)
      );

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Host '${host}' is not in allowed hosts`,
          suggestion: `Allowed hosts: ${policy.allowedHosts.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if a general action on a resource is allowed
   *
   * Generic permission check for custom resource types not covered
   * by file or network access.
   *
   * @param action - The action being performed (e.g., 'read', 'write', 'execute')
   * @param resource - The resource identifier
   * @param policy - The security policy to check against
   * @returns PermissionResult indicating if the action is allowed
   *
   * @example
   * ```typescript
   * const result = checker.checkPolicy('execute', 'shell:rm', {
   *   requiresAuth: true,
   * });
   * ```
   */
  checkPolicy(action: string, resource: string, policy: CommandSecurityPolicy): PermissionResult {
    if (!action) {
      return {
        allowed: false,
        reason: "Action is required",
        suggestion: "Specify the action being performed",
      };
    }

    if (!resource) {
      return {
        allowed: false,
        reason: "Resource is required",
        suggestion: "Specify the resource being accessed",
      };
    }

    // Handle file-like resources
    if (resource.startsWith("file:")) {
      const filePath = resource.slice(5); // Remove 'file:' prefix
      return this.checkFileAccess(filePath, policy);
    }

    // Handle network-like resources
    if (resource.startsWith("http://") || resource.startsWith("https://")) {
      try {
        const url = new URL(resource);
        return this.checkNetworkAccess(url.host, policy);
      } catch {
        return {
          allowed: false,
          reason: `Invalid URL: ${resource}`,
          suggestion: "Provide a valid URL",
        };
      }
    }

    // Handle host-like resources
    if (resource.startsWith("host:")) {
      const host = resource.slice(5); // Remove 'host:' prefix
      return this.checkNetworkAccess(host, policy);
    }

    // For other resources, allow by default (specific checks should be added as needed)
    return { allowed: true };
  }

  /**
   * Normalize a file path for consistent matching
   *
   * @param filePath - The path to normalize
   * @returns Normalized path using forward slashes
   */
  private normalizePath(filePath: string): string {
    // Resolve relative paths against base directory
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.baseDir, filePath);

    // Normalize path separators to forward slashes for glob matching
    return absolutePath.replace(/\\/g, "/");
  }

  /**
   * Check if a path matches a glob pattern
   *
   * @param filePath - The normalized file path
   * @param pattern - The glob pattern to match against
   * @returns true if the path matches the pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Normalize the pattern path separators
    const normalizedPattern = pattern.replace(/\\/g, "/");

    // Handle patterns that start with ** (match from any point in the path)
    if (normalizedPattern.startsWith("**/")) {
      // For **/ patterns, we want to match from any point, not just the start
      return this.globMatch(filePath, normalizedPattern, process.platform === "win32");
    }

    // If pattern is not absolute and doesn't start with **, resolve it against base directory
    const resolvedPattern = path.isAbsolute(normalizedPattern)
      ? normalizedPattern
      : path.resolve(this.baseDir, normalizedPattern).replace(/\\/g, "/");

    // Use simple glob matching implementation
    return this.globMatch(filePath, resolvedPattern, process.platform === "win32");
  }

  /**
   * Simple glob pattern matching
   *
   * Supports:
   * - ** for matching any number of directories
   * - * for matching any characters within a path segment
   * - ? for matching a single character
   *
   * @param filePath - The file path to test
   * @param pattern - The glob pattern
   * @param ignoreCase - Whether to ignore case (for Windows)
   * @returns true if the path matches the pattern
   */
  private globMatch(filePath: string, pattern: string, ignoreCase: boolean): boolean {
    // Normalize case if needed
    const normalizedPath = ignoreCase ? filePath.toLowerCase() : filePath;
    const normalizedGlob = ignoreCase ? pattern.toLowerCase() : pattern;

    // Handle ** at the beginning specially - it should match from any point
    if (normalizedGlob.startsWith("**/")) {
      const suffix = normalizedGlob.slice(3); // Remove **/
      // Try matching from any position in the path
      const segments = normalizedPath.split("/");
      for (let i = 0; i < segments.length; i++) {
        const subPath = segments.slice(i).join("/");
        if (this.simpleGlobMatch(subPath, suffix, ignoreCase)) {
          return true;
        }
      }
      return false;
    }

    // Handle /** at the end - it should match the path and anything under it
    if (normalizedGlob.endsWith("/**")) {
      const prefix = normalizedGlob.slice(0, -3); // Remove /**
      // The path should start with the prefix (or equal it)
      if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
        return true;
      }
      // Also try the regular glob match
      return this.simpleGlobMatch(normalizedPath, normalizedGlob, ignoreCase);
    }

    return this.simpleGlobMatch(normalizedPath, normalizedGlob, ignoreCase);
  }

  /**
   * Simple glob to regex matching (non-recursive)
   *
   * @param filePath - The file path to test
   * @param pattern - The glob pattern
   * @param ignoreCase - Whether to ignore case
   * @returns true if the path matches the pattern
   */
  private simpleGlobMatch(filePath: string, pattern: string, ignoreCase: boolean): boolean {
    const normalizedPath = ignoreCase ? filePath.toLowerCase() : filePath;
    const normalizedGlob = ignoreCase ? pattern.toLowerCase() : pattern;

    // Convert glob pattern to regex
    const regexPattern = normalizedGlob
      // Escape regex special chars except * and ?
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      // ** matches any path (including slashes)
      .replace(/\*\*/g, "\0GLOBSTAR\0")
      // * matches anything except slash
      .replace(/\*/g, "[^/]*")
      // ? matches single char except slash
      .replace(/\?/g, "[^/]")
      // Restore globstar
      .replace(/\0GLOBSTAR\0/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  /**
   * Check if a host matches a wildcard pattern
   *
   * Supports:
   * - Exact match: 'example.com'
   * - Wildcard prefix: '*.example.com'
   * - Full wildcard: '*'
   *
   * @param host - The normalized host
   * @param pattern - The pattern to match against
   * @returns true if the host matches the pattern
   */
  private matchesHostPattern(host: string, pattern: string): boolean {
    const normalizedPattern = pattern.toLowerCase().trim();

    // Full wildcard matches everything
    if (normalizedPattern === "*") {
      return true;
    }

    // Wildcard prefix pattern (*.example.com)
    if (normalizedPattern.startsWith("*.")) {
      const suffix = normalizedPattern.slice(2); // Remove '*.'
      // Match the exact suffix or any subdomain
      return host === suffix || host.endsWith(`.${suffix}`);
    }

    // Exact match
    return host === normalizedPattern;
  }
}

/**
 * Create a PermissionChecker with default configuration
 *
 * @param baseDir - Optional base directory for path resolution
 * @returns Configured PermissionChecker instance
 */
export function createPermissionChecker(baseDir?: string): PermissionChecker {
  return new PermissionChecker(baseDir);
}

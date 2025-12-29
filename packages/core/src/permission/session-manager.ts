/**
 * Session Permission Manager for Vellum
 *
 * Manages in-memory session permissions with TTL support.
 * Permissions are granted for the duration of a session and
 * can optionally expire after a specified time.
 *
 * @module @vellum/core/permission
 */

import type { PermissionLevel } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * A session permission entry.
 */
export interface SessionPermission {
  /** The permission level */
  level: PermissionLevel;
  /** Type of permission (edit, bash, etc.) */
  type: string;
  /** Pattern that this permission applies to */
  pattern?: string;
  /** When this permission was granted */
  grantedAt: number;
  /** When this permission expires (undefined = session duration) */
  expiresAt?: number;
  /** Source of the grant (user, config, etc.) */
  source: "user" | "config" | "auto";
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Key for permission lookup.
 */
export interface PermissionKey {
  /** Type of permission */
  type: string;
  /** Optional pattern */
  pattern?: string;
}

/**
 * Options for granting a permission.
 */
export interface GrantOptions {
  /** Time-to-live in milliseconds (undefined = session duration) */
  ttl?: number;
  /** Source of the grant */
  source?: "user" | "config" | "auto";
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for SessionPermissionManager.
 */
export interface SessionPermissionManagerOptions {
  /** Default TTL for permissions in milliseconds */
  defaultTtl?: number;
  /** Enable concurrent access protection */
  enableConcurrencyProtection?: boolean;
}

/**
 * Result of checking a permission.
 */
export interface PermissionCheckResult {
  /** Whether the permission exists and is valid */
  hasPermission: boolean;
  /** The permission level if found */
  level?: PermissionLevel;
  /** The matching permission entry */
  entry?: SessionPermission;
  /** Whether the permission was expired (for debugging) */
  wasExpired?: boolean;
}

// ============================================
// SessionPermissionManager
// ============================================

/**
 * Manages in-memory session permissions.
 *
 * Features:
 * - Grant/revoke permissions per session
 * - TTL support for automatic expiration
 * - Pattern-based matching
 * - Concurrent access protection (EC-008)
 *
 * @example
 * ```typescript
 * const manager = new SessionPermissionManager();
 *
 * // Grant permission for duration of session
 * manager.grant({ type: 'bash', pattern: 'git *' }, 'allow');
 *
 * // Grant with TTL (expires in 5 minutes)
 * manager.grant({ type: 'edit' }, 'allow', { ttl: 5 * 60 * 1000 });
 *
 * // Check permission
 * const result = manager.has({ type: 'bash', pattern: 'git status' });
 * // { hasPermission: true, level: 'allow', ... }
 *
 * // Revoke permission
 * manager.revoke({ type: 'edit' });
 * ```
 */
export class SessionPermissionManager {
  readonly #permissions: Map<string, SessionPermission>;
  readonly #defaultTtl?: number;
  readonly #enableConcurrencyProtection: boolean;
  #operationLock: Promise<void> = Promise.resolve();

  /**
   * Creates a new SessionPermissionManager.
   *
   * @param options - Configuration options
   */
  constructor(options: SessionPermissionManagerOptions = {}) {
    this.#permissions = new Map();
    this.#defaultTtl = options.defaultTtl;
    this.#enableConcurrencyProtection = options.enableConcurrencyProtection ?? false;
  }

  /**
   * Generate a key string from a permission key object.
   */
  #makeKey(key: PermissionKey): string {
    if (key.pattern) {
      return `${key.type}:${key.pattern}`;
    }
    return key.type;
  }

  /**
   * Execute an operation with concurrency protection.
   */
  async #withLock<T>(operation: () => T): Promise<T> {
    if (!this.#enableConcurrencyProtection) {
      return operation();
    }

    // Wait for any pending operation
    await this.#operationLock;

    // Create a new lock
    let unlock: () => void = () => {};
    this.#operationLock = new Promise((resolve) => {
      unlock = resolve;
    });

    try {
      return operation();
    } finally {
      unlock();
    }
  }

  /**
   * Grant a permission.
   *
   * @param key - Permission key (type and optional pattern)
   * @param level - Permission level to grant
   * @param options - Grant options
   */
  grant(key: PermissionKey, level: PermissionLevel, options: GrantOptions = {}): void {
    const keyStr = this.#makeKey(key);
    const now = Date.now();
    const ttl = options.ttl ?? this.#defaultTtl;

    const entry: SessionPermission = {
      level,
      type: key.type,
      pattern: key.pattern,
      grantedAt: now,
      expiresAt: ttl ? now + ttl : undefined,
      source: options.source ?? "user",
      metadata: options.metadata,
    };

    this.#permissions.set(keyStr, entry);
  }

  /**
   * Grant a permission with concurrency protection (EC-008).
   *
   * @param key - Permission key
   * @param level - Permission level
   * @param options - Grant options
   */
  async grantAsync(
    key: PermissionKey,
    level: PermissionLevel,
    options: GrantOptions = {}
  ): Promise<void> {
    await this.#withLock(() => this.grant(key, level, options));
  }

  /**
   * Check if a permission is granted.
   *
   * @param key - Permission key to check
   * @returns Check result with permission details
   */
  has(key: PermissionKey): PermissionCheckResult {
    // First try exact match
    const exactResult = this.#checkExact(key);
    if (exactResult.hasPermission) {
      return exactResult;
    }

    // If pattern-based, try type-only match
    if (key.pattern) {
      const typeOnlyResult = this.#checkExact({ type: key.type });
      if (typeOnlyResult.hasPermission) {
        return typeOnlyResult;
      }

      // Try pattern matching
      return this.#checkPatternMatch(key);
    }

    return { hasPermission: false };
  }

  /**
   * Check permission with concurrency protection (EC-008).
   *
   * @param key - Permission key
   * @returns Check result
   */
  async hasAsync(key: PermissionKey): Promise<PermissionCheckResult> {
    return this.#withLock(() => this.has(key));
  }

  /**
   * Check exact key match.
   */
  #checkExact(key: PermissionKey): PermissionCheckResult {
    const keyStr = this.#makeKey(key);
    const entry = this.#permissions.get(keyStr);

    if (!entry) {
      return { hasPermission: false };
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      // Expired - remove and return
      this.#permissions.delete(keyStr);
      return { hasPermission: false, wasExpired: true };
    }

    return {
      hasPermission: true,
      level: entry.level,
      entry,
    };
  }

  /**
   * Check for pattern matching.
   */
  #checkPatternMatch(key: PermissionKey): PermissionCheckResult {
    const now = Date.now();

    for (const [, entry] of this.#permissions) {
      // Skip if different type
      if (entry.type !== key.type) continue;

      // Skip if no pattern or pattern doesn't match
      if (!entry.pattern || !key.pattern) continue;

      // Skip if expired
      if (entry.expiresAt && entry.expiresAt < now) continue;

      // Check if the stored pattern matches the requested pattern
      if (this.#patternMatches(entry.pattern, key.pattern)) {
        return {
          hasPermission: true,
          level: entry.level,
          entry,
        };
      }
    }

    return { hasPermission: false };
  }

  /**
   * Simple wildcard pattern matching.
   */
  #patternMatches(storedPattern: string, requestedPattern: string): boolean {
    // Exact match
    if (storedPattern === requestedPattern) {
      return true;
    }

    // Wildcard match (simple * at end)
    if (storedPattern.endsWith("*")) {
      const prefix = storedPattern.slice(0, -1);
      return requestedPattern.startsWith(prefix);
    }

    // Wildcard match (simple * at start)
    if (storedPattern.startsWith("*")) {
      const suffix = storedPattern.slice(1);
      return requestedPattern.endsWith(suffix);
    }

    return false;
  }

  /**
   * Revoke a permission.
   *
   * @param key - Permission key to revoke
   * @returns true if a permission was revoked
   */
  revoke(key: PermissionKey): boolean {
    const keyStr = this.#makeKey(key);
    return this.#permissions.delete(keyStr);
  }

  /**
   * Revoke with concurrency protection.
   */
  async revokeAsync(key: PermissionKey): Promise<boolean> {
    return this.#withLock(() => this.revoke(key));
  }

  /**
   * Clear all permissions.
   */
  clear(): void {
    this.#permissions.clear();
  }

  /**
   * Clear with concurrency protection.
   */
  async clearAsync(): Promise<void> {
    await this.#withLock(() => this.clear());
  }

  /**
   * Get all active permissions.
   *
   * Filters out expired permissions.
   *
   * @returns Array of active permissions
   */
  getAll(): SessionPermission[] {
    const now = Date.now();
    const active: SessionPermission[] = [];
    const expired: string[] = [];

    for (const [key, entry] of this.#permissions) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expired.push(key);
      } else {
        active.push(entry);
      }
    }

    // Clean up expired
    for (const key of expired) {
      this.#permissions.delete(key);
    }

    return active;
  }

  /**
   * Get permissions by type.
   *
   * @param type - Permission type to filter by
   * @returns Array of matching permissions
   */
  getByType(type: string): SessionPermission[] {
    return this.getAll().filter((p) => p.type === type);
  }

  /**
   * Get the count of active permissions.
   */
  get size(): number {
    return this.getAll().length;
  }

  /**
   * Clean up expired permissions.
   *
   * This is called automatically by getAll(), but can be
   * called explicitly if needed.
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.#permissions) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.#permissions.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Extend the TTL of a permission.
   *
   * @param key - Permission key
   * @param additionalTtl - Additional TTL in milliseconds
   * @returns true if the permission was extended
   */
  extendTtl(key: PermissionKey, additionalTtl: number): boolean {
    const keyStr = this.#makeKey(key);
    const entry = this.#permissions.get(keyStr);

    if (!entry) {
      return false;
    }

    // Check if not expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.#permissions.delete(keyStr);
      return false;
    }

    // Extend TTL
    if (entry.expiresAt) {
      entry.expiresAt += additionalTtl;
    } else {
      // If no TTL, set one
      entry.expiresAt = Date.now() + additionalTtl;
    }

    return true;
  }

  /**
   * Make a permission permanent (remove TTL).
   *
   * @param key - Permission key
   * @returns true if the permission was made permanent
   */
  makePermanent(key: PermissionKey): boolean {
    const keyStr = this.#makeKey(key);
    const entry = this.#permissions.get(keyStr);

    if (!entry) {
      return false;
    }

    // Check if not expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.#permissions.delete(keyStr);
      return false;
    }

    delete entry.expiresAt;
    return true;
  }
}

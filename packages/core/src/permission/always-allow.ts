/**
 * Always Allow Manager for Vellum
 *
 * Manages persistent "always allow" permissions that survive sessions.
 * Persists to ~/.vellum/permissions.json via PermissionStorage.
 *
 * @module @vellum/core/permission
 */

import type { PermissionKey, SessionPermissionManager } from "./session-manager.js";
import { PermissionStorage, type StoredPermissionData } from "./storage.js";

// ============================================
// Types
// ============================================

/**
 * An always-allowed permission entry.
 */
export interface AlwaysAllowEntry {
  /** Type of permission (edit, bash, etc.) */
  type: string;
  /** Optional pattern for the permission */
  pattern?: string;
  /** When this was added */
  addedAt: number;
  /** Optional description/reason */
  description?: string;
}

/**
 * Options for AlwaysAllowManager.
 */
export interface AlwaysAllowManagerOptions {
  /** Custom storage instance */
  storage?: PermissionStorage;
  /** Session manager to sync with */
  sessionManager?: SessionPermissionManager;
  /** Whether to auto-load on initialization */
  autoLoad?: boolean;
}

// ============================================
// AlwaysAllowManager
// ============================================

/**
 * Manages persistent "always allow" permissions.
 *
 * These permissions are stored on disk and survive between sessions.
 * When loaded, they are also synced to the session manager.
 *
 * Features:
 * - Persist to ~/.vellum/permissions.json
 * - Sync with SessionPermissionManager
 * - Add/remove always-allowed patterns
 * - List all always-allowed permissions
 *
 * @example
 * ```typescript
 * const storage = new PermissionStorage();
 * const sessionManager = new SessionPermissionManager();
 * const alwaysAllow = new AlwaysAllowManager({ storage, sessionManager });
 *
 * // Load persisted permissions
 * await alwaysAllow.load();
 *
 * // Add a new always-allow rule
 * await alwaysAllow.add({ type: 'bash', pattern: 'git *' });
 *
 * // Check if a permission is always allowed
 * const allowed = alwaysAllow.has({ type: 'bash', pattern: 'git status' });
 *
 * // Remove a rule
 * await alwaysAllow.remove({ type: 'bash', pattern: 'git *' });
 * ```
 */
export class AlwaysAllowManager {
  readonly #storage: PermissionStorage;
  readonly #sessionManager?: SessionPermissionManager;
  readonly #entries: Map<string, AlwaysAllowEntry>;
  #loaded: boolean = false;

  /**
   * Creates a new AlwaysAllowManager.
   *
   * @param options - Configuration options
   */
  constructor(options: AlwaysAllowManagerOptions = {}) {
    this.#storage = options.storage ?? new PermissionStorage();
    this.#sessionManager = options.sessionManager;
    this.#entries = new Map();

    // Auto-load is disabled by default - caller should explicitly call load()
    // This allows for async initialization patterns
  }

  /**
   * Generate a key string from a permission key.
   */
  #makeKey(key: PermissionKey): string {
    if (key.pattern) {
      return `${key.type}:${key.pattern}`;
    }
    return key.type;
  }

  /**
   * Load permissions from storage.
   *
   * This should be called during initialization.
   * Syncs loaded permissions to the session manager.
   */
  async load(): Promise<void> {
    const data = await this.#storage.load();

    // Load remembered permissions from storage
    this.#entries.clear();

    for (const [key, value] of Object.entries(data.rememberedPermissions)) {
      if (value.level === "allow") {
        // Parse key back to type:pattern
        const parts = key.split(":");
        const type = parts[0] ?? key;
        const pattern = parts.length > 1 ? parts.slice(1).join(":") : undefined;

        const entry: AlwaysAllowEntry = {
          type,
          pattern,
          addedAt: Date.now(), // We don't store this, so use now
        };

        this.#entries.set(key, entry);

        // Sync to session manager
        if (this.#sessionManager) {
          this.#sessionManager.grant({ type, pattern }, "allow", { source: "config" });
        }
      }
    }

    this.#loaded = true;
  }

  /**
   * Save permissions to storage.
   */
  async #save(): Promise<void> {
    const data = await this.#storage.load();

    // Update remembered permissions
    const rememberedPermissions: StoredPermissionData["rememberedPermissions"] = {};

    for (const key of this.#entries.keys()) {
      rememberedPermissions[key] = {
        level: "allow",
      };
    }

    // Merge with existing data (keep deny entries)
    for (const [key, value] of Object.entries(data.rememberedPermissions)) {
      if (value.level === "deny" && !rememberedPermissions[key]) {
        rememberedPermissions[key] = value;
      }
    }

    await this.#storage.save({
      ...data,
      rememberedPermissions,
    });
  }

  /**
   * Check if a permission is always allowed.
   *
   * @param key - Permission key to check
   * @returns true if the permission is always allowed
   */
  has(key: PermissionKey): boolean {
    const keyStr = this.#makeKey(key);

    // Check exact match
    if (this.#entries.has(keyStr)) {
      return true;
    }

    // Check pattern matches
    if (key.pattern) {
      // Check if there's a type-only entry that allows all patterns
      if (this.#entries.has(key.type)) {
        return true;
      }

      // Check wildcard patterns
      for (const entry of this.#entries.values()) {
        if (entry.type !== key.type) continue;
        if (!entry.pattern) continue;

        if (this.#patternMatches(entry.pattern, key.pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Simple wildcard pattern matching.
   */
  #patternMatches(storedPattern: string, requestedPattern: string): boolean {
    // Exact match
    if (storedPattern === requestedPattern) {
      return true;
    }

    // Wildcard at end
    if (storedPattern.endsWith("*")) {
      const prefix = storedPattern.slice(0, -1);
      return requestedPattern.startsWith(prefix);
    }

    // Wildcard at start
    if (storedPattern.startsWith("*")) {
      const suffix = storedPattern.slice(1);
      return requestedPattern.endsWith(suffix);
    }

    return false;
  }

  /**
   * Add an always-allow permission.
   *
   * @param key - Permission key to add
   * @param options - Optional description
   * @returns true if the permission was added (false if already exists)
   */
  async add(key: PermissionKey, options: { description?: string } = {}): Promise<boolean> {
    const keyStr = this.#makeKey(key);

    // Check if already exists
    if (this.#entries.has(keyStr)) {
      return false;
    }

    // Add entry
    const entry: AlwaysAllowEntry = {
      type: key.type,
      pattern: key.pattern,
      addedAt: Date.now(),
      description: options.description,
    };

    this.#entries.set(keyStr, entry);

    // Sync to session manager
    if (this.#sessionManager) {
      this.#sessionManager.grant(key, "allow", { source: "config" });
    }

    // Persist
    await this.#save();

    return true;
  }

  /**
   * Remove an always-allow permission.
   *
   * @param key - Permission key to remove
   * @returns true if the permission was removed
   */
  async remove(key: PermissionKey): Promise<boolean> {
    const keyStr = this.#makeKey(key);

    if (!this.#entries.has(keyStr)) {
      return false;
    }

    this.#entries.delete(keyStr);

    // Remove from session manager
    if (this.#sessionManager) {
      this.#sessionManager.revoke(key);
    }

    // Persist
    await this.#save();

    return true;
  }

  /**
   * Get all always-allowed permissions.
   *
   * @returns Array of always-allow entries
   */
  getAll(): AlwaysAllowEntry[] {
    return Array.from(this.#entries.values());
  }

  /**
   * Get always-allowed permissions by type.
   *
   * @param type - Permission type to filter by
   * @returns Array of matching entries
   */
  getByType(type: string): AlwaysAllowEntry[] {
    return this.getAll().filter((e) => e.type === type);
  }

  /**
   * Clear all always-allowed permissions.
   *
   * @param options - Options for clearing
   */
  async clear(options: { persist?: boolean } = {}): Promise<void> {
    const persist = options.persist ?? true;

    // Revoke from session manager
    if (this.#sessionManager) {
      for (const entry of this.#entries.values()) {
        this.#sessionManager.revoke({
          type: entry.type,
          pattern: entry.pattern,
        });
      }
    }

    this.#entries.clear();

    if (persist) {
      await this.#save();
    }
  }

  /**
   * Get the count of always-allowed permissions.
   */
  get size(): number {
    return this.#entries.size;
  }

  /**
   * Check if permissions have been loaded from storage.
   */
  get isLoaded(): boolean {
    return this.#loaded;
  }

  /**
   * Get the underlying storage instance.
   */
  get storage(): PermissionStorage {
    return this.#storage;
  }

  /**
   * Get the underlying session manager instance.
   */
  get sessionManager(): SessionPermissionManager | undefined {
    return this.#sessionManager;
  }
}

/**
 * TrustedPluginsManager - High-level manager for plugin trust and capability verification.
 *
 * Provides a convenient API for checking plugin trust status, verifying capabilities,
 * and managing trust lifecycle.
 *
 * @module trust/manager
 */

import type { TrustStore } from "./store.js";
import type { PluginCapability, TrustedPlugin, TrustLevel } from "./types.js";

/**
 * Manager for plugin trust and capability verification.
 *
 * Wraps the TrustStore with higher-level operations for checking trust status,
 * verifying capabilities, and detecting tampered plugins via hash comparison.
 *
 * @example
 * ```typescript
 * const store = new TrustStore();
 * await store.load();
 *
 * const manager = new TrustedPluginsManager(store);
 *
 * // Check if plugin is trusted
 * if (manager.isTrusted("my-plugin")) {
 *   // Check specific capability
 *   if (manager.hasCapability("my-plugin", "network-access")) {
 *     // Plugin can make network requests
 *   }
 * }
 *
 * // Verify integrity before executing
 * const currentHash = await computePluginHash("my-plugin");
 * if (!manager.verifyIntegrity("my-plugin", currentHash)) {
 *   console.error("Plugin has been tampered with!");
 * }
 * ```
 */
export class TrustedPluginsManager {
  /** Underlying trust store for persistence */
  private readonly store: TrustStore;

  /**
   * Creates a new TrustedPluginsManager instance.
   *
   * @param store - The TrustStore to use for persistence
   *
   * @example
   * ```typescript
   * const store = new TrustStore();
   * await store.load();
   * const manager = new TrustedPluginsManager(store);
   * ```
   */
  constructor(store: TrustStore) {
    this.store = store;
  }

  /**
   * Checks if a plugin is trusted.
   *
   * A plugin is considered trusted if it exists in the trust store
   * and has a trust level other than "none".
   *
   * @param pluginName - Name of the plugin to check
   * @returns true if the plugin is trusted, false otherwise
   *
   * @example
   * ```typescript
   * if (manager.isTrusted("my-plugin")) {
   *   console.log("Plugin is trusted");
   * }
   * ```
   */
  isTrusted(pluginName: string): boolean {
    const trust = this.store.get(pluginName);
    if (!trust) {
      return false;
    }
    return trust.trustLevel !== "none";
  }

  /**
   * Checks if a plugin has a specific capability.
   *
   * Returns false if:
   * - Plugin is not trusted
   * - Plugin does not have the requested capability
   *
   * Returns true only if the plugin is trusted AND has the capability.
   *
   * @param pluginName - Name of the plugin to check
   * @param capability - The capability to verify
   * @returns true if the plugin is trusted and has the capability
   *
   * @example
   * ```typescript
   * if (manager.hasCapability("my-plugin", "network-access")) {
   *   // Safe to allow network requests
   * }
   * ```
   */
  hasCapability(pluginName: string, capability: PluginCapability): boolean {
    // Return false if plugin not trusted
    if (!this.isTrusted(pluginName)) {
      return false;
    }

    const trust = this.store.get(pluginName);
    if (!trust) {
      return false;
    }

    // Return false if capability not granted
    return trust.capabilities.includes(capability);
  }

  /**
   * Grants trust to a plugin with specified capabilities.
   *
   * Creates a new trust entry for the plugin with the given capabilities
   * and content hash for integrity verification.
   *
   * @param pluginName - Name of the plugin to trust
   * @param capabilities - List of capabilities to grant
   * @param hash - SHA-256 content hash for integrity verification
   *
   * @example
   * ```typescript
   * const hash = await computePluginHash("my-plugin");
   * manager.trustPlugin("my-plugin", ["execute-hooks", "network-access"], hash);
   * await store.save(); // Persist changes
   * ```
   */
  trustPlugin(pluginName: string, capabilities: PluginCapability[], hash: string): void {
    const trustLevel = this.determineTrustLevel(capabilities);

    const trustEntry: TrustedPlugin = {
      pluginName,
      version: "1.0.0", // Default version, should be updated by caller if known
      trustedAt: new Date().toISOString(),
      capabilities,
      contentHash: hash,
      trustLevel,
    };

    this.store.set(pluginName, trustEntry);
  }

  /**
   * Revokes trust for a plugin.
   *
   * Removes the plugin from the trust store, effectively revoking all
   * capabilities and preventing it from being executed.
   *
   * @param pluginName - Name of the plugin to revoke trust for
   *
   * @example
   * ```typescript
   * manager.revokeTrust("suspicious-plugin");
   * await store.save(); // Persist changes
   * ```
   */
  revokeTrust(pluginName: string): void {
    this.store.delete(pluginName);
  }

  /**
   * Verifies the integrity of a plugin by comparing hashes.
   *
   * Compares the stored content hash with the current hash of the plugin.
   * This is used to detect if a plugin has been tampered with since it
   * was trusted.
   *
   * @param pluginName - Name of the plugin to verify
   * @param currentHash - Current SHA-256 hash of the plugin content
   * @returns true if hashes match, false if mismatch or plugin not found
   *
   * @example
   * ```typescript
   * const currentHash = await computePluginHash("my-plugin");
   * if (!manager.verifyIntegrity("my-plugin", currentHash)) {
   *   console.error("Plugin has been modified since trust was granted!");
   *   manager.revokeTrust("my-plugin");
   * }
   * ```
   */
  verifyIntegrity(pluginName: string, currentHash: string): boolean {
    const trust = this.store.get(pluginName);
    if (!trust) {
      return false;
    }

    // Compare stored contentHash with current hash
    return trust.contentHash === currentHash;
  }

  /**
   * Gets the trust level for a plugin.
   *
   * @param pluginName - Name of the plugin to check
   * @returns The trust level if plugin exists, undefined otherwise
   *
   * @example
   * ```typescript
   * const level = manager.getTrustLevel("my-plugin");
   * if (level === "full") {
   *   // Plugin has full trust
   * }
   * ```
   */
  getTrustLevel(pluginName: string): TrustLevel | undefined {
    const trust = this.store.get(pluginName);
    return trust?.trustLevel;
  }

  /**
   * Determines the trust level based on granted capabilities.
   *
   * @param capabilities - List of capabilities granted
   * @returns "full" if all capabilities granted, "limited" if partial, "none" if empty
   */
  private determineTrustLevel(capabilities: PluginCapability[]): TrustLevel {
    if (capabilities.length === 0) {
      return "none";
    }
    // Could be extended to check against PLUGIN_CAPABILITIES for "full"
    // For now, any non-empty capabilities list is "limited"
    // "full" would require all capabilities from PLUGIN_CAPABILITIES
    return "limited";
  }
}

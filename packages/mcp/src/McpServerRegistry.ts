// ============================================
// McpServerRegistry - Server UID Management
// ============================================

import { customAlphabet } from "nanoid";

/**
 * Generate a unique 6-character ID prefixed with 'c' for MCP servers.
 * Uses lowercase alphanumeric characters for readability.
 */
const generateUid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);

/**
 * Manages unique IDs for MCP servers.
 * Provides bidirectional mapping between server names and UIDs.
 *
 * UIDs are 7 characters: 'c' prefix + 6-char nanoid (e.g., "c1a2b3c")
 *
 * @example
 * ```typescript
 * const registry = new McpServerRegistry();
 * const uid = registry.getOrCreateUid("my-server");
 * const name = registry.getServerName(uid);
 * registry.dispose();
 * ```
 */
export class McpServerRegistry {
  /** Maps server names to their unique IDs (name → uid) */
  private readonly serverNameToUid = new Map<string, string>();

  /** Maps unique IDs back to server names (uid → name) */
  private readonly uidToServerName = new Map<string, string>();

  /**
   * Get or create a unique ID for a server.
   * Returns existing UID if server is already registered, otherwise generates new.
   *
   * @param serverName - The server name
   * @returns The unique ID (7 chars: 'c' prefix + 6 char nanoid)
   */
  getOrCreateUid(serverName: string): string {
    // Check if we already have a UID for this server
    const existingUid = this.serverNameToUid.get(serverName);
    if (existingUid) {
      return existingUid;
    }

    // Generate new UID with 'c' prefix
    const uid = `c${generateUid()}`;

    // Store in bidirectional maps
    this.serverNameToUid.set(serverName, uid);
    this.uidToServerName.set(uid, serverName);

    return uid;
  }

  /**
   * Look up a server name by its UID.
   *
   * @param uid - The unique ID
   * @returns The server name, or undefined if not found
   */
  getServerName(uid: string): string | undefined {
    return this.uidToServerName.get(uid);
  }

  /**
   * Get a read-only view of all server UIDs.
   *
   * @returns Map of server names to UIDs
   */
  getAllUids(): ReadonlyMap<string, string> {
    return this.serverNameToUid;
  }

  /**
   * Check if a UID is registered.
   *
   * @param uid - The unique ID to check
   * @returns True if the UID exists in the registry
   */
  hasUid(uid: string): boolean {
    return this.uidToServerName.has(uid);
  }

  /**
   * Remove a server from the registry.
   * Cleans up both name→uid and uid→name mappings.
   *
   * @param serverName - The server name to remove
   */
  remove(serverName: string): void {
    const uid = this.serverNameToUid.get(serverName);
    if (uid) {
      this.uidToServerName.delete(uid);
      this.serverNameToUid.delete(serverName);
    }
  }

  /**
   * Clear all mappings.
   * Call this when disposing the registry to prevent memory leaks.
   */
  dispose(): void {
    this.serverNameToUid.clear();
    this.uidToServerName.clear();
  }
}

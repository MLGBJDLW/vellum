/**
 * Process hardening utilities.
 *
 * These functions are intentionally conservative and cross-platform.
 * Platform-specific hardening should be implemented in platform adapters.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDirResult {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary directory for sandbox execution.
 */
export async function createTempDir(prefix = "vellum-sandbox-"): Promise<TempDirResult> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Drop privileges if supported by the platform.
 * No-op by default for portability.
 */
export function dropPrivileges(): void {
  // Intentionally left as a no-op.
}

/**
 * Apply resource limits if supported by the platform.
 * No-op by default for portability.
 */
export function setResourceLimits(): void {
  // Intentionally left as a no-op.
}

/**
 * Remove high-risk environment variables and return a sanitized map.
 */
export function sanitizeEnvironment(env: Record<string, string>): Record<string, string> {
  const blocked = new Set(["LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS"]);
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!blocked.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

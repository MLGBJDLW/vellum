/**
 * Shutdown cleanup state module
 * Extracted to break circular dependency between index.tsx and app.tsx
 */

/** Cleanup function to be called on shutdown */
type ShutdownCleanup = () => void | Promise<void>;
let shutdownCleanup: ShutdownCleanup | null = null;

/**
 * Set the shutdown cleanup function.
 * Called by App component when agent loop is created.
 */
export function setShutdownCleanup(cleanup: ShutdownCleanup | null): void {
  shutdownCleanup = cleanup;
}

/**
 * Get the current shutdown cleanup function
 */
export function getShutdownCleanup(): ShutdownCleanup | null {
  return shutdownCleanup;
}

/**
 * Execute shutdown cleanup if set.
 * Clears the cleanup function after execution.
 */
export async function executeShutdownCleanup(): Promise<void> {
  const cleanup = shutdownCleanup;
  shutdownCleanup = null;
  await cleanup?.();
}

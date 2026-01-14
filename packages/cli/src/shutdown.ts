/**
 * Shutdown cleanup state module
 * Extracted to break circular dependency between index.tsx and app.tsx
 */

/** Cleanup function to be called on shutdown */
let shutdownCleanup: (() => void) | null = null;

/**
 * Set the shutdown cleanup function.
 * Called by App component when agent loop is created.
 */
export function setShutdownCleanup(cleanup: (() => void) | null): void {
  shutdownCleanup = cleanup;
}

/**
 * Get the current shutdown cleanup function
 */
export function getShutdownCleanup(): (() => void) | null {
  return shutdownCleanup;
}

/**
 * Execute shutdown cleanup if set.
 * Clears the cleanup function after execution.
 */
export function executeShutdownCleanup(): void {
  if (shutdownCleanup) {
    shutdownCleanup();
    shutdownCleanup = null;
  }
}

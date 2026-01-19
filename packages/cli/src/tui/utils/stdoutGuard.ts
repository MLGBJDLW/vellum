/**
 * Stdout Guard Utilities (T002 Hardening)
 *
 * Development-time utilities for detecting unexpected stdout writes
 * that bypass Ink's rendering and could cause terminal overflow.
 *
 * IMPORTANT: This is for DEBUGGING ONLY. It must NOT block writes
 * or break Ink's stdout handling.
 *
 * @module tui/utils/stdoutGuard
 */

// Store the original stdout.write
let originalStdoutWrite: typeof process.stdout.write | null = null;
let guardActive = false;

/**
 * Enable stdout guard for debugging non-Ink writes.
 *
 * When enabled (via VELLUM_DEBUG_STDOUT env var), this will log
 * any writes to stdout that don't appear to come from Ink.
 *
 * SAFETY: All writes are allowed through - this only logs warnings.
 */
export function enableStdoutGuard(): void {
  // Only enable in debug mode
  if (!process.env.VELLUM_DEBUG_STDOUT) {
    return;
  }

  if (guardActive) {
    return; // Already active
  }

  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  guardActive = true;

  const guardedWrite = function (
    this: NodeJS.WriteStream,
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean {
    // Try to detect if this is an Ink write by checking the stack
    const stack = new Error().stack ?? "";
    const isInkWrite =
      stack.includes("ink") ||
      stack.includes("render") ||
      stack.includes("reconciler") ||
      stack.includes("yoga");

    if (!isInkWrite) {
      const chunkStr = typeof chunk === "string" ? chunk : chunk.toString();
      const preview = chunkStr.substring(0, 80).replace(/\n/g, "\\n");
      // Log to stderr to avoid recursion
      process.stderr.write(`[STDOUT GUARD] Non-Ink write detected: "${preview}"\n`);
    }

    // ALWAYS allow the write through - never block
    if (originalStdoutWrite) {
      if (typeof encodingOrCallback === "function") {
        return originalStdoutWrite(chunk, encodingOrCallback);
      }
      return originalStdoutWrite(chunk, encodingOrCallback, callback);
    }
    return true;
  };

  process.stdout.write = guardedWrite as typeof process.stdout.write;
}

/**
 * Disable the stdout guard and restore original stdout.write.
 */
export function disableStdoutGuard(): void {
  if (!guardActive || !originalStdoutWrite) {
    return;
  }

  process.stdout.write = originalStdoutWrite;
  originalStdoutWrite = null;
  guardActive = false;
}

/**
 * Check if the stdout guard is currently active.
 */
export function isStdoutGuardActive(): boolean {
  return guardActive;
}

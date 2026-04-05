/**
 * Synchronized Update - DEC 2026 protocol
 *
 * Prevents terminal flickering by batching output.
 * Supported in VS Code Terminal 1.85+, iTerm2, Kitty
 *
 * @module tui/utils/synchronized-update
 */

import { getActiveStdout } from "../buffered-stdout.js";
import { supportsSynchronizedOutput } from "./detectTerminal.js";

const BEGIN_SYNC = "\x1b[?2026h";
const END_SYNC = "\x1b[?2026l";

let syncDepth = 0;

// =============================================================================
// Frame Statistics
// =============================================================================

interface FrameStatsSnapshot {
  readonly fps: number;
  readonly avgFrameTime: number;
  readonly totalSyncCalls: number;
}

let totalSyncCalls = 0;
let frameTimestamps: number[] = [];
let frameDurations: number[] = [];
let currentFrameStart = 0;

/** Sliding window size for FPS calculation */
const FPS_WINDOW_MS = 1000;

/**
 * Execute a function with synchronized terminal updates.
 * All output within the callback will be batched and rendered atomically.
 *
 * @param fn - The function to execute within synchronized updates
 * @returns The return value of the function
 *
 * @example
 * ```ts
 * syncUpdate(() => {
 *   process.stdout.write('Line 1\n');
 *   process.stdout.write('Line 2\n');
 * });
 * // Both lines rendered atomically without flicker
 * ```
 */
export function syncUpdate<T>(fn: () => T): T {
  if (syncDepth === 0) {
    getActiveStdout().write(BEGIN_SYNC);
    currentFrameStart = performance.now();
  }
  syncDepth++;
  try {
    return fn();
  } finally {
    syncDepth--;
    if (syncDepth === 0) {
      getActiveStdout().write(END_SYNC);
      const now = performance.now();
      totalSyncCalls++;
      frameTimestamps.push(now);
      if (currentFrameStart > 0) {
        frameDurations.push(now - currentFrameStart);
      }
      // Trim old entries outside the sliding window
      const cutoff = now - FPS_WINDOW_MS;
      while (frameTimestamps.length > 0) {
        const ft = frameTimestamps[0];
        if (ft === undefined || ft >= cutoff) break;
        frameTimestamps.shift();
      }
      // Keep durations array bounded
      if (frameDurations.length > 120) {
        frameDurations = frameDurations.slice(-60);
      }
    }
  }
}

/**
 * Check if synchronized updates are supported by the current terminal.
 *
 * @returns true if DEC 2026 protocol is supported
 */
export function isSyncUpdateSupported(): boolean {
  return supportsSynchronizedOutput();
}

/**
 * Get frame statistics for debugging.
 * Lightweight — only computes when called.
 */
export function getFrameStats(): FrameStatsSnapshot {
  const fps = frameTimestamps.length; // timestamps within last 1s window
  const avgFrameTime =
    frameDurations.length > 0
      ? frameDurations.reduce((a, b) => a + b, 0) / frameDurations.length
      : 0;
  return { fps, avgFrameTime, totalSyncCalls };
}

/**
 * Reset frame statistics counters.
 */
export function resetFrameStats(): void {
  totalSyncCalls = 0;
  frameTimestamps = [];
  frameDurations = [];
  currentFrameStart = 0;
}

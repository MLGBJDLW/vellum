/**
 * useScreenReader Hook (T044)
 *
 * React hook for screen reader accessibility support.
 * Detects screen reader presence through environment variables and
 * provides an announce() function for status updates using live regions.
 *
 * Screen reader detection checks common environment indicators:
 * - SCREEN_READER: Explicit screen reader flag
 * - ACCESSIBILITY: General accessibility mode
 * - VT_ACCESSIBILITY: Windows Virtual Terminal accessibility
 * - NVDA/JAWS/VOICEOVER: Specific screen reader indicators
 * - CI: Continuous integration environments (treated as accessible)
 *
 * @module @vellum/cli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useScreenReader hook.
 */
export interface UseScreenReaderOptions {
  /** Force screen reader mode on/off (overrides auto-detection) */
  readonly forceEnabled?: boolean;
  /** Debounce time for announcements in ms (default: 150) */
  readonly debounceMs?: number;
  /** Enable verbose mode with additional context (default: false) */
  readonly verbose?: boolean;
}

/**
 * Return value of useScreenReader hook.
 */
export interface UseScreenReaderReturn {
  /** Whether screen reader mode is currently enabled */
  readonly isEnabled: boolean;
  /** Announce a message to screen reader users */
  readonly announce: (text: string, priority?: AnnouncementPriority) => void;
  /** Clear any pending announcements */
  readonly clearAnnouncements: () => void;
  /** Get the last announced message */
  readonly lastAnnouncement: string | null;
}

/**
 * Priority level for announcements.
 * - polite: Non-urgent, waits for current speech to finish
 * - assertive: Interrupts current speech immediately
 */
export type AnnouncementPriority = "polite" | "assertive";

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Environment variables that indicate screen reader presence.
 * These are commonly set by screen readers or accessibility tools.
 */
const SCREEN_READER_ENV_VARS = [
  "SCREEN_READER",
  "ACCESSIBILITY",
  "VT_ACCESSIBILITY",
  "NVDA",
  "JAWS",
  "VOICEOVER",
  "ORCA",
  "NARRATOR",
] as const;

/**
 * Environment variables that indicate reduced motion preference.
 * When these are set, we should also enable accessible mode.
 */
const ACCESSIBLE_ENV_VARS = ["REDUCE_MOTION", "PREFERS_REDUCED_MOTION"] as const;

/**
 * Detect if a screen reader or accessibility mode is likely active.
 * Checks environment variables commonly set by screen readers.
 */
function detectScreenReader(): boolean {
  // Check explicit screen reader environment variables
  for (const envVar of SCREEN_READER_ENV_VARS) {
    const value = process.env[envVar];
    if (value && value !== "0" && value.toLowerCase() !== "false") {
      return true;
    }
  }

  // Check accessibility preference environment variables
  for (const envVar of ACCESSIBLE_ENV_VARS) {
    const value = process.env[envVar];
    if (value && value !== "0" && value.toLowerCase() !== "false") {
      return true;
    }
  }

  // CI environments should use accessible mode for better output
  if (process.env.CI) {
    return true;
  }

  // Check if running in a non-TTY environment (likely piped/automated)
  if (!process.stdout.isTTY) {
    return true;
  }

  return false;
}

// =============================================================================
// Announcement Queue
// =============================================================================

/**
 * Queued announcement with priority and timestamp.
 */
interface QueuedAnnouncement {
  readonly text: string;
  readonly priority: AnnouncementPriority;
  readonly timestamp: number;
}

/**
 * Output an announcement to the terminal.
 * Uses ANSI sequences to create a "live region" effect where supported.
 *
 * Note: Terminal screen readers typically capture all terminal output,
 * but we use a consistent format to help users identify status updates.
 */
function outputAnnouncement(text: string, priority: AnnouncementPriority, verbose: boolean): void {
  // Format the announcement with optional prefix for verbose mode
  const prefix = verbose ? "[Status] " : "";
  const message = `${prefix}${text}`;

  // For assertive announcements, use stderr to ensure immediate output
  // For polite announcements, use stdout which may be buffered
  const stream = priority === "assertive" ? process.stderr : process.stdout;

  // Write the announcement followed by a newline
  // Screen readers will capture this as regular terminal output
  stream.write(`${message}\n`);
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for screen reader accessibility support.
 *
 * @param options - Configuration options
 * @returns Screen reader state and announcement functions
 *
 * @example
 * ```tsx
 * function StatusComponent() {
 *   const { isEnabled, announce } = useScreenReader();
 *
 *   useEffect(() => {
 *     announce("Application ready");
 *   }, [announce]);
 *
 *   if (isEnabled) {
 *     return <Text>Screen reader mode active</Text>;
 *   }
 *   return <VisualUI />;
 * }
 * ```
 */
export function useScreenReader(options: UseScreenReaderOptions = {}): UseScreenReaderReturn {
  const { forceEnabled, debounceMs = 150, verbose = false } = options;

  // Detect screen reader presence (memoized)
  const autoDetected = useMemo(() => detectScreenReader(), []);

  // Determine if screen reader mode is enabled
  const isEnabled = forceEnabled ?? autoDetected;

  // Track the last announcement for debugging/testing
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Announcement queue for batching rapid updates
  const queueRef = useRef<QueuedAnnouncement[]>([]);

  // Process queued announcements
  const processQueue = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) return;

    // Sort by priority (assertive first) then by timestamp
    queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === "assertive" ? -1 : 1;
      }
      return a.timestamp - b.timestamp;
    });

    // Combine similar announcements to reduce verbosity
    const seen = new Set<string>();
    const unique: QueuedAnnouncement[] = [];

    for (const item of queue) {
      const key = item.text.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    // Output each unique announcement
    for (const item of unique) {
      outputAnnouncement(item.text, item.priority, verbose);
    }

    // Update last announcement
    const lastItem = unique[unique.length - 1];
    if (lastItem) {
      setLastAnnouncement(lastItem.text);
    }

    // Clear the queue
    queueRef.current = [];
  }, [verbose]);

  // Announce a message to screen reader users
  const announce = useCallback(
    (text: string, priority: AnnouncementPriority = "polite") => {
      // Skip if screen reader mode is not enabled
      if (!isEnabled) return;

      // Skip empty announcements
      if (!text || text.trim().length === 0) return;

      // Add to queue
      queueRef.current.push({
        text: text.trim(),
        priority,
        timestamp: Date.now(),
      });

      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        processQueue();
        debounceTimerRef.current = null;
      }, debounceMs);
    },
    [isEnabled, debounceMs, processQueue]
  );

  // Clear all pending announcements
  const clearAnnouncements = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    queueRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    isEnabled,
    announce,
    clearAnnouncements,
    lastAnnouncement,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if screen reader mode is enabled (static check).
 * Useful for non-React contexts.
 */
export function isScreenReaderEnabled(): boolean {
  return detectScreenReader();
}

/**
 * Format a message for screen reader announcement.
 * Cleans up the text by removing ANSI codes and normalizing whitespace.
 */
export function formatForScreenReader(text: string): string {
  // Remove ANSI escape sequences
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required to strip ANSI codes
  const withoutAnsi = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");

  // Normalize whitespace
  const normalized = withoutAnsi.replace(/\s+/g, " ").trim();

  return normalized ?? "";
}

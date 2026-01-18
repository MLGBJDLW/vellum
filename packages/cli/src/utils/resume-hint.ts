/**
 * Resume Hint Utilities (T034)
 *
 * Provides exit resume hint formatting for the CLI.
 * Displays a cyan-colored message with short session ID
 * to help users resume their sessions.
 *
 * @module cli/utils/resume-hint
 */

import chalk from "chalk";

import { ICONS } from "./icons.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Number of characters in a short session ID.
 */
export const SHORT_ID_LENGTH = 8;

/**
 * Horizontal separator line for the hint box.
 */
const SEPARATOR = "━".repeat(39);

// =============================================================================
// Functions
// =============================================================================

/**
 * Extract short ID from a full session UUID.
 *
 * Takes the first 8 characters of the UUID for easy typing.
 *
 * @param sessionId - Full session UUID
 * @returns First 8 characters of the UUID
 *
 * @example
 * ```typescript
 * getShortId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
 * // Returns: 'a1b2c3d4'
 * ```
 */
export function getShortId(sessionId: string): string {
  return sessionId.slice(0, SHORT_ID_LENGTH);
}

/**
 * Format a resume hint message for display on exit.
 *
 * Creates a cyan-colored box with instructions for resuming
 * the session using the short ID.
 *
 * @param sessionId - Full session UUID
 * @returns Formatted cyan-colored hint message
 *
 * @example
 * ```typescript
 * formatResumeHint('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
 * // Returns:
 * // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * // Hint: To resume this session, run: vellum resume a1b2c3d4
 * // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ```
 */
export function formatResumeHint(sessionId: string): string {
  const shortId = getShortId(sessionId);
  const message = `${ICONS.hint} To resume this session, run: vellum resume ${shortId}`;

  return chalk.cyan(`${SEPARATOR}\n${message}\n${SEPARATOR}`);
}

/**
 * Check if a session should show resume hint on exit.
 *
 * Resume hint should only be shown for sessions with messages.
 *
 * @param messageCount - Number of messages in the session
 * @returns True if resume hint should be shown
 */
export function shouldShowResumeHint(messageCount: number): boolean {
  return messageCount > 0;
}

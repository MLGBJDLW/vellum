/**
 * Command System Utilities
 *
 * Shared utility functions for the command system.
 *
 * @module cli/commands/utils
 */

// =============================================================================
// T034B: isSlashCommand
// =============================================================================

/**
 * Check if input is a slash command
 *
 * Returns true if the input starts with a forward slash after trimming.
 * Handles edge cases:
 * - Empty string → false
 * - Whitespace only → false
 * - Just "/" → false (no command name)
 * - "/command" → true
 * - "  /command" → true (leading whitespace allowed)
 *
 * @param input - User input string to check
 * @returns True if input is a slash command
 *
 * @example
 * ```typescript
 * isSlashCommand('/help')        // true
 * isSlashCommand('  /login')     // true
 * isSlashCommand('/a')           // true
 * isSlashCommand('/')            // false (no command name)
 * isSlashCommand('')             // false
 * isSlashCommand('   ')          // false
 * isSlashCommand('hello')        // false
 * isSlashCommand('//comment')    // true (starts with /)
 * ```
 */
export function isSlashCommand(input: string): boolean {
  // Handle empty or whitespace-only
  if (!input || typeof input !== "string") {
    return false;
  }

  const trimmed = input.trim();

  // Must have at least 2 chars: "/" + command char
  if (trimmed.length < 2) {
    return false;
  }

  // Must start with "/"
  if (trimmed[0] !== "/") {
    return false;
  }

  // Second character must not be whitespace (ensures command name exists)
  const secondChar = trimmed[1];
  if (secondChar === " " || secondChar === "\t" || secondChar === "\n") {
    return false;
  }

  return true;
}

// =============================================================================
// Additional Utilities
// =============================================================================

/**
 * Extract command name from slash command input
 *
 * @param input - Slash command input (e.g., "/help topic")
 * @returns Command name without slash, or null if not a valid command
 *
 * @example
 * ```typescript
 * extractCommandName('/help topic')  // 'help'
 * extractCommandName('/login')       // 'login'
 * extractCommandName('hello')        // null
 * ```
 */
export function extractCommandName(input: string): string | null {
  if (!isSlashCommand(input)) {
    return null;
  }

  const trimmed = input.trim();
  // Remove leading slash and split by whitespace
  const parts = trimmed.slice(1).split(/\s+/);
  return parts[0]?.toLowerCase() ?? null;
}

/**
 * Split command input into command name and arguments
 *
 * @param input - Slash command input
 * @returns Object with command name and args array, or null if invalid
 *
 * @example
 * ```typescript
 * parseCommandInput('/login anthropic --store keychain')
 * // { command: 'login', args: ['anthropic', '--store', 'keychain'] }
 * ```
 */
export function parseCommandInput(input: string): { command: string; args: string[] } | null {
  if (!isSlashCommand(input)) {
    return null;
  }

  const trimmed = input.trim();
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Mask a sensitive value for display
 *
 * Shows first and last few characters with dots in between.
 *
 * @param value - Value to mask
 * @param visibleChars - Number of visible chars at start and end (default: 4)
 * @returns Masked string
 *
 * @example
 * ```typescript
 * maskValue('sk-1234567890abcdef')  // 'sk-1...cdef'
 * maskValue('short')                // '****'
 * ```
 */
export function maskValue(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars * 2) {
    return "*".repeat(Math.max(4, value.length));
  }

  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  return `${start}...${end}`;
}

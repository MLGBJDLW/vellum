/**
 * Slash Command Parsing Utilities
 *
 * Parsing functions for slash commands. Extracted from CommandInput
 * for reuse across input components.
 *
 * @module tui/components/Input/slash-command-utils
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a parsed slash command.
 */
export interface SlashCommand {
  /** Command name without the leading slash */
  readonly name: string;
  /** Parsed arguments (handles quoted strings) */
  readonly args: readonly string[];
  /** Original raw input string */
  readonly raw: string;
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse arguments from a command string, handling quoted strings.
 *
 * Supports:
 * - Space-separated arguments
 * - Double-quoted strings: "arg with spaces"
 * - Single-quoted strings: 'arg with spaces'
 * - Escaped quotes within strings: "say \"hello\""
 *
 * @param argsString - The argument portion of the command
 * @returns Array of parsed arguments
 */
function parseArguments(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let escaped = false;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      continue;
    }

    if (char === " " && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  // Add final argument if exists
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

/**
 * Parse a slash command string into a SlashCommand object.
 *
 * @param input - The raw input string starting with /
 * @returns Parsed SlashCommand object
 *
 * @example
 * parseSlashCommand('/help')
 * // => { name: 'help', args: [], raw: '/help' }
 *
 * @example
 * parseSlashCommand('/search "hello world" --limit 10')
 * // => { name: 'search', args: ['hello world', '--limit', '10'], raw: '...' }
 */
export function parseSlashCommand(input: string): SlashCommand {
  const trimmed = input.trim();

  // Remove leading slash
  const withoutSlash = trimmed.slice(1);

  // Find the command name (everything until first space)
  const spaceIndex = withoutSlash.indexOf(" ");

  if (spaceIndex === -1) {
    // Command with no arguments
    return {
      name: withoutSlash,
      args: [],
      raw: trimmed,
    };
  }

  const name = withoutSlash.slice(0, spaceIndex);
  const argsString = withoutSlash.slice(spaceIndex + 1).trim();
  const args = parseArguments(argsString);

  return {
    name,
    args,
    raw: trimmed,
  };
}

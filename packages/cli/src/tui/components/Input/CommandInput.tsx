/**
 * CommandInput Component (T010)
 *
 * A wrapper around TextInput that parses slash commands.
 * Regular text is passed through as messages, while `/command` inputs
 * are parsed and dispatched as commands.
 *
 * @module tui/components/Input/CommandInput
 */

import { Box, useInput } from "ink";
import { useCallback, useMemo, useRef, useState } from "react";
import { useInputHistory } from "../../hooks/useInputHistory.js";
import { Autocomplete } from "./Autocomplete.js";
import { TextInput } from "./TextInput.js";

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

/**
 * Props for the CommandInput component.
 */
export interface CommandInputProps {
  /** Callback when regular text message is submitted */
  readonly onMessage: (text: string) => void;
  /** Callback when a slash command is submitted */
  readonly onCommand: (command: SlashCommand) => void;
  /** Available command names for validation (without slash prefix) */
  readonly commands?: readonly string[];
  /** Placeholder text shown when input is empty */
  readonly placeholder?: string;
  /** Disable input interactions */
  readonly disabled?: boolean;
  /** Whether the input is focused (default: true) */
  readonly focused?: boolean;
  /** Enable multiline mode for regular messages */
  readonly multiline?: boolean;
  /** localStorage key for history persistence */
  readonly historyKey?: string;
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Check if input is a slash command.
 */
function isSlashCommand(input: string): boolean {
  return input.startsWith("/") && input.length > 1 && input[1] !== " ";
}

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

// =============================================================================
// Component
// =============================================================================

/**
 * CommandInput provides a text input that distinguishes between
 * regular messages and slash commands.
 *
 * Features:
 * - Slash command parsing with argument handling
 * - Quoted argument support
 * - Input history navigation (up/down arrows)
 * - Optional command validation
 *
 * @example
 * ```tsx
 * <CommandInput
 *   onMessage={(text) => sendChat(text)}
 *   onCommand={(cmd) => executeCommand(cmd)}
 *   commands={['help', 'clear', 'exit']}
 *   placeholder="Type a message or /command..."
 * />
 * ```
 */
export function CommandInput({
  onMessage,
  onCommand,
  commands,
  placeholder = "Type a message or /command...",
  disabled = false,
  focused = true,
  multiline = false,
  historyKey,
}: CommandInputProps): React.ReactElement {
  const [value, setValue] = useState("");

  // Ref for TextInput to manage focus
  const inputRef = useRef<{ focus: () => void } | null>(null);

  // Show autocomplete when typing slash commands
  const showAutocomplete = useMemo(
    () => value.startsWith("/") && value.length > 1 && !value.includes(" "),
    [value]
  );

  // Track if we're navigating history (to restore original input)
  const originalInputRef = useRef<string | null>(null);

  const { navigateHistory, addToHistory, currentIndex } = useInputHistory({
    maxItems: 100,
    persistKey: historyKey,
  });

  /**
   * Navigate up through history.
   */
  const handleHistoryUp = useCallback(() => {
    // Save original input when starting navigation
    if (originalInputRef.current === null) {
      originalInputRef.current = value;
    }
    const entry = navigateHistory("up");
    if (entry !== null) {
      setValue(entry);
    }
  }, [value, navigateHistory]);

  /**
   * Navigate down through history.
   */
  const handleHistoryDown = useCallback(() => {
    const entry = navigateHistory("down");
    if (entry !== null) {
      setValue(entry);
    } else if (originalInputRef.current !== null && currentIndex === -1) {
      // Restore original input when navigating past newest entry
      setValue(originalInputRef.current);
      originalInputRef.current = null;
    }
  }, [navigateHistory, currentIndex]);

  /**
   * Handle value changes from TextInput.
   */
  const handleChange = useCallback((newValue: string) => {
    // Reset history navigation when user types
    originalInputRef.current = null;
    setValue(newValue);
  }, []);

  /**
   * Handle submission of input.
   */
  const handleSubmit = useCallback(
    (submittedValue: string) => {
      const trimmed = submittedValue.trim();

      if (trimmed.length === 0) {
        return;
      }

      // Reset history navigation state
      originalInputRef.current = null;

      // Add to history
      addToHistory(trimmed);

      if (isSlashCommand(trimmed)) {
        // Parse and dispatch as command
        const command = parseSlashCommand(trimmed);

        // Optional: validate command exists
        if (commands && commands.length > 0 && !commands.includes(command.name)) {
          // Command not in allowed list - still dispatch, let handler deal with it
          // This allows for "unknown command" handling at a higher level
        }

        onCommand(command);
      } else {
        // Dispatch as regular message
        onMessage(trimmed);
      }

      // Clear input after submission
      setValue("");
    },
    [addToHistory, commands, onCommand, onMessage]
  );

  /**
   * Handle up/down arrow keys for history navigation.
   * Only active when not in multiline mode (multiline uses arrows for cursor movement).
   */
  useInput(
    (_input, key) => {
      if (key.upArrow) {
        handleHistoryUp();
      } else if (key.downArrow) {
        handleHistoryDown();
      }
    },
    { isActive: focused && !disabled && !multiline }
  );

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback((cmd: string) => {
    setValue(`/${cmd} `);
    inputRef.current?.focus();
  }, []);

  // Handle autocomplete cancel
  const handleAutocompleteCancel = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Box flexDirection="column">
      {/* Autocomplete dropdown - render above input */}
      {showAutocomplete && commands && commands.length > 0 && (
        <Autocomplete
          input={value.slice(1)}
          options={commands}
          onSelect={handleAutocompleteSelect}
          onCancel={handleAutocompleteCancel}
          visible={showAutocomplete}
        />
      )}
      <TextInput
        value={value}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        disabled={disabled}
        focused={focused && !showAutocomplete}
        multiline={multiline}
      />
    </Box>
  );
}

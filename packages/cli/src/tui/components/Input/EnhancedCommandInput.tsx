/**
 * EnhancedCommandInput Component
 *
 * An enhanced version of CommandInput that supports both slash commands
 * and @ mentions. This component adds @ mention autocomplete alongside
 * the existing slash command system.
 *
 * @module tui/components/Input/EnhancedCommandInput
 */

import { Box, useInput } from "ink";
import { useCallback, useMemo, useRef, useState } from "react";
import { useInputHistory } from "../../hooks/useInputHistory.js";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete.js";
import type { AutocompleteOption } from "./Autocomplete.js";
import { Autocomplete } from "./Autocomplete.js";
import { parseSlashCommand, type SlashCommand } from "./CommandInput.js";
import { MentionAutocomplete } from "./MentionAutocomplete.js";
import { TextInput } from "./TextInput.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the EnhancedCommandInput component.
 */
export interface EnhancedCommandInputProps {
  /** Callback when regular text message is submitted */
  readonly onMessage: (text: string) => void;
  /** Callback when a slash command is submitted */
  readonly onCommand: (command: SlashCommand) => void;
  /** Available command names for validation (without slash prefix) */
  readonly commands?: readonly string[] | readonly AutocompleteOption[];
  /** Get subcommands for a command (for two-level autocomplete) */
  readonly getSubcommands?: (commandName: string) => readonly AutocompleteOption[] | undefined;
  /** Enable grouped display with categories (default: false) */
  readonly groupedCommands?: boolean;
  /** Category display order for grouped mode */
  readonly categoryOrder?: readonly string[];
  /** Category labels for i18n */
  readonly categoryLabels?: Record<string, string>;
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
  /** Current working directory for @ mention file suggestions */
  readonly cwd?: string;
  /** Enable @ mention support (default: true) */
  readonly enableMentions?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if input is a slash command.
 */
function isSlashCommand(input: string): boolean {
  return input.startsWith("/") && input.length > 1 && input[1] !== " ";
}

// =============================================================================
// Component
// =============================================================================

/**
 * EnhancedCommandInput provides a text input with both slash command
 * and @ mention support.
 *
 * Features:
 * - Slash command parsing with argument handling
 * - @ mention autocomplete for files, folders, URLs, etc.
 * - Input history navigation (up/down arrows)
 * - Keyboard-driven autocomplete selection
 *
 * @example
 * ```tsx
 * <EnhancedCommandInput
 *   onMessage={(text) => sendChat(text)}
 *   onCommand={(cmd) => executeCommand(cmd)}
 *   commands={['help', 'clear', 'exit']}
 *   cwd="/project"
 *   placeholder="Type a message, /command, or @mention..."
 * />
 * ```
 */
export function EnhancedCommandInput({
  onMessage,
  onCommand,
  commands,
  getSubcommands,
  groupedCommands = false,
  categoryOrder,
  categoryLabels,
  placeholder = "Type a message, /command, or @mention...",
  disabled = false,
  focused = true,
  multiline = false,
  historyKey,
  cwd = process.cwd(),
  enableMentions = true,
}: EnhancedCommandInputProps): React.ReactElement {
  const [value, setValue] = useState("");

  // Track when autocomplete just completed (to suppress Enter and move cursor)
  const [autocompleteJustCompleted, setAutocompleteJustCompleted] = useState(false);

  // Ref for TextInput to manage focus
  const inputRef = useRef<{ focus: () => void } | null>(null);

  // Slash autocomplete state
  const slashAutocomplete = useMemo(() => {
    if (!value.startsWith("/")) {
      return { visible: false, active: false, query: "", level: 1 as const, commandName: "" };
    }

    const withoutSlash = value.slice(1);
    const spaceIndex = withoutSlash.indexOf(" ");

    if (spaceIndex === -1) {
      return {
        visible: true,
        active: true,
        query: withoutSlash,
        level: 1 as const,
        commandName: "",
      };
    }

    const commandName = withoutSlash.slice(0, spaceIndex);
    const afterSpace = withoutSlash.slice(spaceIndex + 1);
    const secondSpaceIndex = afterSpace.indexOf(" ");
    const subQuery = secondSpaceIndex === -1 ? afterSpace : afterSpace.slice(0, secondSpaceIndex);
    const isActive = secondSpaceIndex === -1;

    return {
      visible: true,
      active: isActive,
      query: subQuery,
      level: 2 as const,
      commandName,
    };
  }, [value]);

  // @ Mention autocomplete state
  const mentionAutocomplete = useMentionAutocomplete(value, { cwd });

  // Determine which autocomplete is active (priority: slash > mention)
  const activeAutocomplete = useMemo(() => {
    if (slashAutocomplete.visible && slashAutocomplete.active) {
      return "slash" as const;
    }
    if (enableMentions && mentionAutocomplete.state.visible && mentionAutocomplete.state.active) {
      return "mention" as const;
    }
    return null;
  }, [slashAutocomplete, mentionAutocomplete.state, enableMentions]);

  // History navigation
  const originalInputRef = useRef<string | null>(null);
  const { navigateHistory, addToHistory, currentIndex } = useInputHistory({
    maxItems: 100,
    persistKey: historyKey,
  });

  const handleHistoryUp = useCallback(() => {
    if (originalInputRef.current === null) {
      originalInputRef.current = value;
    }
    const entry = navigateHistory("up");
    if (entry !== null) {
      setValue(entry);
    }
  }, [value, navigateHistory]);

  const handleHistoryDown = useCallback(() => {
    const entry = navigateHistory("down");
    if (entry !== null) {
      setValue(entry);
    } else if (originalInputRef.current !== null && currentIndex === -1) {
      setValue(originalInputRef.current);
      originalInputRef.current = null;
    }
  }, [navigateHistory, currentIndex]);

  const handleChange = useCallback((newValue: string) => {
    originalInputRef.current = null;
    setValue(newValue);
  }, []);

  const handleSubmit = useCallback(
    (submittedValue: string) => {
      const trimmed = submittedValue.trim();

      if (trimmed.length === 0) {
        return;
      }

      originalInputRef.current = null;
      addToHistory(trimmed);

      if (isSlashCommand(trimmed)) {
        const command = parseSlashCommand(trimmed);
        onCommand(command);
      } else {
        onMessage(trimmed);
      }

      setValue("");
    },
    [addToHistory, onCommand, onMessage]
  );

  // History navigation only when no autocomplete is active
  useInput(
    (_input, key) => {
      if (key.upArrow) {
        handleHistoryUp();
      } else if (key.downArrow) {
        handleHistoryDown();
      }
    },
    { isActive: focused && !disabled && !multiline && activeAutocomplete === null }
  );

  // Slash autocomplete options
  const slashOptions = useMemo(() => {
    if (slashAutocomplete.level === 1) {
      return commands ?? [];
    }
    if (getSubcommands && slashAutocomplete.commandName) {
      return getSubcommands(slashAutocomplete.commandName) ?? [];
    }
    return [];
  }, [slashAutocomplete.level, slashAutocomplete.commandName, commands, getSubcommands]);

  // Handle slash autocomplete selection
  const handleSlashSelect = useCallback(
    (selected: string) => {
      if (slashAutocomplete.level === 1) {
        setValue(`/${selected} `);
      } else {
        setValue(`/${slashAutocomplete.commandName} ${selected} `);
      }
      setAutocompleteJustCompleted(true);
      inputRef.current?.focus();
    },
    [slashAutocomplete.level, slashAutocomplete.commandName]
  );

  // Handle @ mention autocomplete selection
  const handleMentionSelect = useCallback(
    (selectedValue: string, mode: "type" | "value") => {
      const newValue = mentionAutocomplete.handleSelect(selectedValue, mode);
      setValue(newValue);
      setAutocompleteJustCompleted(true);
      inputRef.current?.focus();
    },
    [mentionAutocomplete]
  );

  // Handle autocomplete cancel
  const handleAutocompleteCancel = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Callback when cursor has been moved to end
  const handleCursorMoved = useCallback(() => {
    setAutocompleteJustCompleted(false);
  }, []);

  // Determine what to show
  const showSlashAutocomplete = activeAutocomplete === "slash" && slashOptions.length > 0;
  const showMentionAutocomplete =
    activeAutocomplete === "mention" &&
    (mentionAutocomplete.state.mode === "type" ||
      mentionAutocomplete.fileSuggestions.suggestions.length > 0);

  return (
    <Box flexDirection="column">
      <TextInput
        value={value}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        disabled={disabled}
        focused={focused}
        multiline={multiline}
        suppressEnter={autocompleteJustCompleted}
        cursorToEnd={autocompleteJustCompleted}
        onCursorMoved={handleCursorMoved}
      />

      {/* Slash command autocomplete */}
      {showSlashAutocomplete && (
        <Autocomplete
          input={slashAutocomplete.query}
          options={slashOptions}
          onSelect={handleSlashSelect}
          onCancel={handleAutocompleteCancel}
          visible={slashAutocomplete.visible}
          active={slashAutocomplete.active}
          grouped={slashAutocomplete.level === 1 && groupedCommands}
          categoryOrder={slashAutocomplete.level === 1 ? categoryOrder : undefined}
          categoryLabels={slashAutocomplete.level === 1 ? categoryLabels : undefined}
        />
      )}

      {/* @ Mention autocomplete */}
      {showMentionAutocomplete && (
        <MentionAutocomplete
          input={mentionAutocomplete.state.filterText}
          mode={mentionAutocomplete.state.mode}
          mentionType={mentionAutocomplete.state.mentionType ?? undefined}
          fileSuggestions={mentionAutocomplete.fileSuggestions.suggestions}
          onSelect={handleMentionSelect}
          onCancel={handleAutocompleteCancel}
          visible={mentionAutocomplete.state.visible}
          active={mentionAutocomplete.state.active}
        />
      )}
    </Box>
  );
}

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
import { MentionAutocomplete } from "./MentionAutocomplete.js";
import { parseSlashCommand, type SlashCommand } from "./slash-command-utils.js";
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
  /** Get level 3 items for a command and subcommand (for three-level autocomplete) */
  readonly getLevel3Items?: (
    commandName: string,
    arg1: string,
    partial: string
  ) => readonly AutocompleteOption[] | undefined;
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
  getLevel3Items,
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

  // Refs to track current autocomplete selection (avoids state delay on Enter/Tab)
  const slashSelectionRef = useRef<{ index: number; hasOptions: boolean }>({
    index: 0,
    hasOptions: false,
  });
  const mentionSelectionRef = useRef<{ index: number; hasOptions: boolean }>({
    index: 0,
    hasOptions: false,
  });

  // Ref for TextInput to manage focus
  const inputRef = useRef<{ focus: () => void } | null>(null);

  // Slash autocomplete state
  const slashAutocomplete = useMemo(() => {
    if (!value.startsWith("/")) {
      return {
        visible: false,
        active: false,
        query: "",
        level: 1 as const,
        commandName: "",
        arg1: "",
      };
    }

    const withoutSlash = value.slice(1);
    const spaceIndex = withoutSlash.indexOf(" ");

    if (spaceIndex === -1) {
      // Level 1: command name completion
      return {
        visible: true,
        active: true,
        query: withoutSlash,
        level: 1 as const,
        commandName: "",
        arg1: "",
      };
    }

    // Level 2 or 3: subcommand/arg completion
    const commandName = withoutSlash.slice(0, spaceIndex);
    const afterSpace = withoutSlash.slice(spaceIndex + 1);
    // Check if there's a second space (potential level 3)
    const secondSpaceIndex = afterSpace.indexOf(" ");

    if (secondSpaceIndex === -1) {
      // Level 2: subcommand completion (only one space so far)
      return {
        visible: true,
        active: true,
        query: afterSpace,
        level: 2 as const,
        commandName,
        arg1: "",
      };
    }

    // Level 3: third-level completion (two spaces)
    const arg1 = afterSpace.slice(0, secondSpaceIndex);
    const afterSecondSpace = afterSpace.slice(secondSpaceIndex + 1);
    // Check if there's a third space (args after level 3)
    const thirdSpaceIndex = afterSecondSpace.indexOf(" ");
    const level3Query =
      thirdSpaceIndex === -1 ? afterSecondSpace : afterSecondSpace.slice(0, thirdSpaceIndex);
    // Only active if we're still typing the level 3 item (no third space yet)
    const isActive = thirdSpaceIndex === -1;

    return {
      visible: true,
      active: isActive,
      query: level3Query,
      level: 3 as const,
      commandName,
      arg1,
    };
  }, [value]);

  // @ Mention autocomplete state
  const mentionAutocomplete = useMentionAutocomplete(value, { cwd });

  // Slash autocomplete options (computed early for activeAutocomplete check)
  const slashOptions = useMemo(() => {
    if (slashAutocomplete.level === 1) {
      return commands ?? [];
    }
    // Level 2: get subcommands for the command
    if (slashAutocomplete.level === 2) {
      if (getSubcommands && slashAutocomplete.commandName) {
        return getSubcommands(slashAutocomplete.commandName) ?? [];
      }
      return [];
    }
    // Level 3: get third-level items (e.g., providers for auth set, models for model command)
    if (slashAutocomplete.level === 3) {
      if (getLevel3Items && slashAutocomplete.commandName && slashAutocomplete.arg1) {
        return (
          getLevel3Items(
            slashAutocomplete.commandName,
            slashAutocomplete.arg1,
            slashAutocomplete.query
          ) ?? []
        );
      }
      return [];
    }
    return [];
  }, [
    slashAutocomplete.level,
    slashAutocomplete.commandName,
    slashAutocomplete.arg1,
    slashAutocomplete.query,
    commands,
    getSubcommands,
    getLevel3Items,
  ]);

  // Determine which autocomplete is active (priority: slash > mention)
  const activeAutocomplete = useMemo(() => {
    // Only consider slash active if there are actually options to show
    if (slashAutocomplete.visible && slashAutocomplete.active) {
      // Level 1 always shows command list, level 2/3 need actual subcommands
      if (slashAutocomplete.level === 1 || slashOptions.length > 0) {
        return "slash" as const;
      }
    }
    if (enableMentions && mentionAutocomplete.state.visible && mentionAutocomplete.state.active) {
      return "mention" as const;
    }
    return null;
  }, [slashAutocomplete, slashOptions.length, mentionAutocomplete.state, enableMentions]);

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
    (input, key) => {
      // ↑ or Ctrl+P - previous history
      if (key.upArrow || (key.ctrl && input === "p")) {
        handleHistoryUp();
      }
      // ↓ or Ctrl+N - next history
      else if (key.downArrow || (key.ctrl && input === "n")) {
        handleHistoryDown();
      }
    },
    { isActive: focused && !disabled && !multiline && activeAutocomplete === null }
  );

  // Extract stable values for memoization to reduce unnecessary recomputation
  const slashQuery = slashAutocomplete.query;
  const slashActive = slashAutocomplete.active;

  // Compute filtered/sorted slash options for Enter/Tab selection
  const sortedSlashOptions = useMemo(() => {
    if (!slashActive || slashOptions.length === 0) return [];
    // Normalize to AutocompleteOption format
    const normalized = slashOptions.map((opt) => (typeof opt === "string" ? { name: opt } : opt));
    // Filter by prefix
    const query = slashQuery.toLowerCase();
    const filtered = query
      ? normalized.filter((opt) => opt.name.toLowerCase().startsWith(query))
      : normalized;
    // Sort alphabetically
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [slashActive, slashQuery, slashOptions]);

  // Handle slash autocomplete selection
  const handleSlashSelect = useCallback(
    (selected: string) => {
      if (slashAutocomplete.level === 1) {
        // Level 1: selected is command name
        setValue(`/${selected} `);
      } else if (slashAutocomplete.level === 2) {
        // Level 2: selected is subcommand name, preserve command
        setValue(`/${slashAutocomplete.commandName} ${selected} `);
      } else {
        // Level 3: selected is third-level item (e.g., provider), preserve command and arg1
        setValue(`/${slashAutocomplete.commandName} ${slashAutocomplete.arg1} ${selected} `);
      }
      setAutocompleteJustCompleted(true);
      inputRef.current?.focus();
    },
    [slashAutocomplete.level, slashAutocomplete.commandName, slashAutocomplete.arg1]
  );

  // Enter/Tab interception when autocomplete is active
  useInput(
    (_input, key) => {
      if (key.return || key.tab) {
        if (activeAutocomplete === "slash") {
          const { index, hasOptions } = slashSelectionRef.current;
          if (hasOptions && sortedSlashOptions[index]) {
            handleSlashSelect(sortedSlashOptions[index].name);
          }
        } else if (activeAutocomplete === "mention") {
          // Mention selection is handled internally by MentionAutocomplete
          // This is a fallback that shouldn't normally trigger
        }
      }
    },
    { isActive: focused && !disabled && activeAutocomplete !== null }
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

  // Track slash autocomplete selection state
  const handleSlashSelectionChange = useCallback((index: number, hasOptions: boolean) => {
    slashSelectionRef.current = { index, hasOptions };
  }, []);

  // Track mention autocomplete selection state
  const handleMentionSelectionChange = useCallback((index: number, hasOptions: boolean) => {
    mentionSelectionRef.current = { index, hasOptions };
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
        suppressEnter={autocompleteJustCompleted || activeAutocomplete !== null}
        suppressTab={activeAutocomplete !== null}
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
          onSelectionChange={handleSlashSelectionChange}
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
          onSelectionChange={handleMentionSelectionChange}
          visible={mentionAutocomplete.state.visible}
          active={mentionAutocomplete.state.active}
        />
      )}
    </Box>
  );
}

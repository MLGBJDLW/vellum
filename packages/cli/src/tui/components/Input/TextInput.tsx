/**
 * TextInput Component (T009)
 *
 * A React Ink-based text input component with multiline support.
 * Provides keyboard handling for text entry, navigation, and submission.
 *
 * @module tui/components/Input/TextInput
 */

import type { Key } from "ink";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the TextInput component.
 */
export interface TextInputProps {
  /** Current input value (controlled) */
  readonly value: string;
  /** Callback when value changes */
  readonly onChange: (value: string) => void;
  /** Callback when input is submitted */
  readonly onSubmit?: (value: string) => void;
  /** Placeholder text shown when value is empty */
  readonly placeholder?: string;
  /** Enable multiline input mode */
  readonly multiline?: boolean;
  /** Disable input interactions */
  readonly disabled?: boolean;
  /** Maximum character length */
  readonly maxLength?: number;
  /** Whether the input is focused (enables keyboard handling) */
  readonly focused?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Insert a character at a specific position in a string.
 */
function insertAt(str: string, index: number, char: string): string {
  return str.slice(0, index) + char + str.slice(index);
}

/**
 * Delete a character at a specific position in a string.
 */
function deleteAt(str: string, index: number): string {
  if (index <= 0 || index > str.length) return str;
  return str.slice(0, index - 1) + str.slice(index);
}

/**
 * Generate a stable key for multiline rendering.
 * Uses line start position as key since lines can be added/removed.
 */
function getLineKey(lineStartPos: number): string {
  return `line-${lineStartPos}`;
}

// =============================================================================
// Component
// =============================================================================

/**
 * TextInput provides a text input field for terminal UIs.
 *
 * Features:
 * - Single-line mode: Enter submits
 * - Multiline mode: Shift+Enter adds newline, Ctrl+Enter submits
 * - Cursor navigation with arrow keys
 * - Placeholder display when empty
 * - Theme-aware styling
 *
 * @example
 * ```tsx
 * // Single-line input
 * <TextInput
 *   value={text}
 *   onChange={setText}
 *   onSubmit={handleSubmit}
 *   placeholder="Type a message..."
 * />
 *
 * // Multiline input
 * <TextInput
 *   value={text}
 *   onChange={setText}
 *   onSubmit={handleSubmit}
 *   placeholder="Type a message..."
 *   multiline
 * />
 * ```
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  multiline = false,
  disabled = false,
  maxLength,
  focused = true,
}: TextInputProps) {
  const { theme } = useTheme();

  // Cursor position within the value
  const [cursorPosition, setCursorPosition] = useState(value.length);

  // Sync cursor position when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length);
    }
  }, [value, cursorPosition]);

  /**
   * Handle character input
   */
  const handleInput = useCallback(
    (char: string) => {
      if (disabled) return;

      // Check max length before inserting
      if (maxLength !== undefined && value.length >= maxLength) {
        return;
      }

      const newValue = insertAt(value, cursorPosition, char);

      // Check max length after insertion (handles paste)
      if (maxLength !== undefined && newValue.length > maxLength) {
        const truncated = newValue.slice(0, maxLength);
        onChange(truncated);
        setCursorPosition(Math.min(cursorPosition + char.length, maxLength));
        return;
      }

      onChange(newValue);
      setCursorPosition(cursorPosition + char.length);
    },
    [disabled, value, cursorPosition, maxLength, onChange]
  );

  /**
   * Handle backspace key
   */
  const handleBackspace = useCallback(() => {
    if (disabled || cursorPosition === 0) return;

    const newValue = deleteAt(value, cursorPosition);
    onChange(newValue);
    setCursorPosition(cursorPosition - 1);
  }, [disabled, value, cursorPosition, onChange]);

  /**
   * Handle delete key
   */
  const handleDelete = useCallback(() => {
    if (disabled || cursorPosition >= value.length) return;

    const newValue = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
    onChange(newValue);
  }, [disabled, value, cursorPosition, onChange]);

  /**
   * Handle left arrow navigation
   */
  const handleLeftArrow = useCallback(
    (ctrl: boolean) => {
      if (cursorPosition === 0) return;

      if (ctrl) {
        // Move to previous word boundary
        const beforeCursor = value.slice(0, cursorPosition);
        const match = beforeCursor.match(/\s*\S*$/);
        const jumpLength = match ? match[0].length : 1;
        setCursorPosition(Math.max(0, cursorPosition - jumpLength));
      } else {
        setCursorPosition(cursorPosition - 1);
      }
    },
    [value, cursorPosition]
  );

  /**
   * Handle right arrow navigation
   */
  const handleRightArrow = useCallback(
    (ctrl: boolean) => {
      if (cursorPosition >= value.length) return;

      if (ctrl) {
        // Move to next word boundary
        const afterCursor = value.slice(cursorPosition);
        const match = afterCursor.match(/^\S*\s*/);
        const jumpLength = match ? match[0].length : 1;
        setCursorPosition(Math.min(value.length, cursorPosition + jumpLength));
      } else {
        setCursorPosition(cursorPosition + 1);
      }
    },
    [value, cursorPosition]
  );

  /**
   * Handle up arrow in multiline mode
   */
  const handleUpArrow = useCallback(() => {
    if (!multiline) return;

    // Find the previous newline
    const beforeCursor = value.slice(0, cursorPosition);
    const lastNewline = beforeCursor.lastIndexOf("\n");

    if (lastNewline === -1) {
      // No previous line, move to start
      setCursorPosition(0);
      return;
    }

    // Find the newline before that to get line start
    const lineStart = beforeCursor.lastIndexOf("\n", lastNewline - 1) + 1;
    const columnInCurrentLine = cursorPosition - lastNewline - 1;
    const previousLineLength = lastNewline - lineStart;

    // Move to same column in previous line (or end of line if shorter)
    const newPosition = lineStart + Math.min(columnInCurrentLine, previousLineLength);
    setCursorPosition(newPosition);
  }, [multiline, value, cursorPosition]);

  /**
   * Handle down arrow in multiline mode
   */
  const handleDownArrow = useCallback(() => {
    if (!multiline) return;

    // Find the current line boundaries
    const beforeCursor = value.slice(0, cursorPosition);
    const afterCursor = value.slice(cursorPosition);

    const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
    const columnInCurrentLine = cursorPosition - currentLineStart;

    const nextNewline = afterCursor.indexOf("\n");
    if (nextNewline === -1) {
      // No next line, move to end
      setCursorPosition(value.length);
      return;
    }

    // Find the line after the next newline
    const nextLineStart = cursorPosition + nextNewline + 1;
    const restAfterNextLine = value.slice(nextLineStart);
    const nextLineEnd = restAfterNextLine.indexOf("\n");
    const nextLineLength = nextLineEnd === -1 ? restAfterNextLine.length : nextLineEnd;

    // Move to same column in next line (or end of line if shorter)
    const newPosition = nextLineStart + Math.min(columnInCurrentLine, nextLineLength);
    setCursorPosition(newPosition);
  }, [multiline, value, cursorPosition]);

  /**
   * Handle submission
   */
  const handleSubmit = useCallback(() => {
    if (disabled) return;
    onSubmit?.(value);
  }, [disabled, value, onSubmit]);

  /**
   * Handle newline in multiline mode
   */
  const handleNewline = useCallback(() => {
    if (disabled || !multiline) return;

    // Check max length before inserting newline
    if (maxLength !== undefined && value.length >= maxLength) {
      return;
    }

    const newValue = insertAt(value, cursorPosition, "\n");
    onChange(newValue);
    setCursorPosition(cursorPosition + 1);
  }, [disabled, multiline, value, cursorPosition, maxLength, onChange]);

  /**
   * Handle return/enter key based on mode
   */
  const handleReturn = useCallback(
    (ctrl: boolean) => {
      if (multiline && !ctrl) {
        handleNewline();
      } else {
        handleSubmit();
      }
    },
    [multiline, handleNewline, handleSubmit]
  );

  /**
   * Handle tab key (multiline only)
   */
  const handleTab = useCallback(() => {
    if (multiline) {
      handleInput("  ");
    }
  }, [multiline, handleInput]);

  /**
   * Process a key event and dispatch to appropriate handler.
   * Returns true if the key was handled.
   */
  const processKeyEvent = useCallback(
    (_input: string, key: Key): boolean => {
      // Navigation and editing keys
      if (key.backspace) {
        handleBackspace();
        return true;
      }
      if (key.delete) {
        handleDelete();
        return true;
      }
      if (key.leftArrow) {
        handleLeftArrow(key.ctrl);
        return true;
      }
      if (key.rightArrow) {
        handleRightArrow(key.ctrl);
        return true;
      }
      if (key.upArrow) {
        handleUpArrow();
        return true;
      }
      if (key.downArrow) {
        handleDownArrow();
        return true;
      }
      if (key.return) {
        handleReturn(key.ctrl);
        return true;
      }
      if (key.tab) {
        handleTab();
        return true;
      }
      if (key.escape) {
        return true;
      }
      return false;
    },
    [
      handleBackspace,
      handleDelete,
      handleLeftArrow,
      handleRightArrow,
      handleUpArrow,
      handleDownArrow,
      handleReturn,
      handleTab,
    ]
  );

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (disabled) return;

      // Try to process as a special key
      if (processKeyEvent(input, key)) {
        return;
      }

      // Handle regular character input (filter control characters)
      if (input && !key.ctrl && !key.meta) {
        handleInput(input);
      }
    },
    { isActive: focused && !disabled }
  );

  // ==========================================================================
  // Rendering
  // ==========================================================================

  const isEmpty = value.length === 0;
  const showPlaceholder = isEmpty && placeholder;

  // Split value into lines for multiline display
  const lines = multiline ? value.split("\n") : [value];

  // Pre-calculate line start positions for stable keys and rendering
  const lineData = useMemo(() => {
    let pos = 0;
    return lines.map((line, index) => {
      const startPos = pos;
      pos += line.length + 1; // +1 for newline
      return { line, index, startPos, key: getLineKey(startPos) };
    });
  }, [lines]);

  /**
   * Render a line with cursor indicator
   */
  const renderLineWithCursor = (line: string, lineStartPosition: number) => {
    const lineEndPosition = lineStartPosition + line.length;
    const cursorInLine = cursorPosition >= lineStartPosition && cursorPosition <= lineEndPosition;

    if (!cursorInLine || !focused) {
      return <Text>{line || " "}</Text>;
    }

    const cursorCol = cursorPosition - lineStartPosition;
    const beforeCursor = line.slice(0, cursorCol);
    const cursorChar = line[cursorCol] || " ";
    const afterCursor = line.slice(cursorCol + 1);

    return (
      <Text>
        {beforeCursor}
        <Text inverse>{cursorChar}</Text>
        {afterCursor}
      </Text>
    );
  };

  // Border color based on focus state
  const borderColor = focused ? theme.semantic.border.focus : theme.semantic.border.default;

  // Render placeholder
  if (showPlaceholder) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text color={theme.semantic.text.muted}>
          {focused ? (
            <>
              <Text inverse>{placeholder[0] || " "}</Text>
              {placeholder.slice(1)}
            </>
          ) : (
            placeholder
          )}
        </Text>
      </Box>
    );
  }

  // Render single-line
  if (!multiline) {
    return (
      <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
        {renderLineWithCursor(value, 0)}
      </Box>
    );
  }

  // Render multiline with stable keys based on line position
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      {lineData.map(({ line, startPos, key }) => (
        <Box key={key}>{renderLineWithCursor(line, startPos)}</Box>
      ))}
    </Box>
  );
}

export default TextInput;

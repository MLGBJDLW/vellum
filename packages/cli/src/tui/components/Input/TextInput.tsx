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
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimation } from "../../context/AnimationContext.js";
import { usePasteHandler } from "../../context/BracketedPasteContext.js";
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
  /** Minimum height in lines (default: 1 for single-line, 3 for multiline) */
  readonly minHeight?: number;
  /** Optional mask character for password-style input */
  readonly mask?: string;
  /** When true, suppress Enter from submitting (for autocomplete integration) */
  readonly suppressEnter?: boolean;
  /** When true, move cursor to end of value on next render */
  readonly cursorToEnd?: boolean;
  /** Callback when cursorToEnd is consumed */
  readonly onCursorMoved?: () => void;
  /** Whether to show border in single-line mode (default: true) */
  readonly showBorder?: boolean;
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
 * Strip common ANSI control sequences (e.g., bracketed paste wrappers).
 */
function stripAnsiSequences(input: string): string {
  const withoutCsi = input.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  return withoutCsi.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "");
}

/**
 * Normalize and sanitize input chunks for single-line or multiline fields.
 */
function normalizeInputValue(input: string, multiline: boolean): string {
  const sanitized = stripAnsiSequences(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n");

  const withoutControls = multiline
    ? sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x80-\x9f]/g, "")
    : sanitized.replace(/[\x00-\x1f\x7f\x80-\x9f]/g, "");

  return multiline ? withoutControls : withoutControls.replace(/\n/g, "");
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
function TextInputComponent({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  multiline = false,
  disabled = false,
  maxLength,
  focused = true,
  minHeight,
  mask,
  suppressEnter = false,
  cursorToEnd = false,
  onCursorMoved,
  showBorder = true,
}: TextInputProps) {
  const { theme } = useTheme();
  const { pauseAnimations, resumeAnimations, isVSCode } = useAnimation();

  // Pause animations when input is focused in VS Code to reduce flickering
  useEffect(() => {
    if (focused && isVSCode) {
      pauseAnimations();
      return () => resumeAnimations();
    }
  }, [focused, isVSCode, pauseAnimations, resumeAnimations]);

  // Calculate effective min height (default 5 for multiline, 1 for single-line)
  const effectiveMinHeight = minHeight ?? (multiline ? 5 : 1);

  // Rapid input buffering for paste fallback (when bracketed paste is not available)
  const inputBufferRef = useRef<string>("");
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use longer threshold for mask inputs (API keys) to smooth rapid character display
  // Increased from 50/100ms to 100/150ms to reduce rendering frequency and prevent flickering
  const RAPID_INPUT_THRESHOLD = mask ? 150 : 100; // ms - mask needs more buffer time

  // Refs to store latest value and cursorPosition for setTimeout callback
  // This avoids closure trap where setTimeout captures stale values
  const valueRef = useRef(value);
  const cursorPositionRef = useRef(0);

  // Cursor position within the value
  const [cursorPosition, setCursorPosition] = useState(value.length);

  // Sync cursor position when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursorPosition(value.length);
    }
  }, [value, cursorPosition]);

  // Keep valueRef in sync with latest value
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Keep cursorPositionRef in sync with latest cursorPosition
  useEffect(() => {
    cursorPositionRef.current = cursorPosition;
  }, [cursorPosition]);

  // Handle cursorToEnd prop - move cursor to end when requested
  useEffect(() => {
    if (cursorToEnd) {
      setCursorPosition(value.length);
      onCursorMoved?.();
    }
  }, [cursorToEnd, value.length, onCursorMoved]);

  // Cleanup input buffer timer on unmount
  useEffect(() => {
    return () => {
      if (inputTimerRef.current) {
        clearTimeout(inputTimerRef.current);
      }
    };
  }, []);

  /**
   * Handle bracketed paste events.
   * When a paste is detected via bracketed paste mode, the entire
   * pasted content arrives as a single event instead of character-by-character.
   */
  const handlePaste = useCallback(
    (pastedText: string) => {
      if (disabled || !focused) return;

      // Normalize the pasted text
      const normalizedPaste = normalizeInputValue(pastedText, multiline);
      if (normalizedPaste.length === 0) return;

      // Insert at cursor position
      let newValue = insertAt(value, cursorPosition, normalizedPaste);
      let newCursorPosition = cursorPosition + normalizedPaste.length;

      // Handle max length
      if (maxLength !== undefined && newValue.length > maxLength) {
        newValue = newValue.slice(0, maxLength);
        newCursorPosition = Math.min(newCursorPosition, maxLength);
      }

      onChange(newValue);
      setCursorPosition(newCursorPosition);
    },
    [disabled, focused, multiline, value, cursorPosition, maxLength, onChange]
  );

  // Subscribe to paste events from the BracketedPasteProvider
  usePasteHandler(handlePaste);

  /**
   * Handle character input
   */
  const handleInput = useCallback(
    (char: string) => {
      if (disabled) return;

      const normalizedInput = normalizeInputValue(char, multiline);
      if (normalizedInput.length === 0) {
        return;
      }

      // Check max length before inserting
      if (maxLength !== undefined && value.length >= maxLength) {
        return;
      }

      const newValue = insertAt(value, cursorPosition, normalizedInput);

      // Check max length after insertion (handles paste)
      if (maxLength !== undefined && newValue.length > maxLength) {
        const truncated = newValue.slice(0, maxLength);
        onChange(truncated);
        setCursorPosition(Math.min(cursorPosition + normalizedInput.length, maxLength));
        return;
      }

      onChange(newValue);
      setCursorPosition(cursorPosition + normalizedInput.length);
    },
    [disabled, value, cursorPosition, maxLength, onChange, multiline]
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
      // Skip if Enter should be suppressed (e.g., autocomplete is active)
      // Check prop directly for synchronous behavior - state-based check was racy
      if (suppressEnter) {
        return;
      }
      if (multiline && !ctrl) {
        handleNewline();
      } else {
        handleSubmit();
      }
    },
    [multiline, handleNewline, handleSubmit, suppressEnter]
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

  // Handle keyboard input with immediate display for single chars, buffering for paste
  useInput(
    (input, key) => {
      if (disabled) return;

      // Try to process as a special key
      if (processKeyEvent(input, key)) {
        return;
      }

      // Handle regular character input
      // Strategy: Single chars display immediately, multi-char inputs (paste) use buffering
      if (input && !key.ctrl && !key.meta) {
        const normalizedInput = normalizeInputValue(input, multiline);
        if (normalizedInput.length === 0) return;

        // Single character: process immediately for responsive typing
        const isSingleChar = normalizedInput.length === 1;

        if (isSingleChar && inputBufferRef.current.length === 0) {
          // Immediate processing - no buffering delay
          const currentValue = valueRef.current;
          const currentCursorPosition = cursorPositionRef.current;

          // Check max length before inserting
          if (maxLength !== undefined && currentValue.length >= maxLength) {
            return;
          }

          // Insert character at cursor position
          let newValue = insertAt(currentValue, currentCursorPosition, normalizedInput);

          // Handle max length after insertion
          if (maxLength !== undefined && newValue.length > maxLength) {
            newValue = newValue.slice(0, maxLength);
          }

          const newPosition = Math.min(currentCursorPosition + 1, newValue.length);
          // Update value first, then cursor position in low-priority transition
          // This batches both updates in React 18+ automatic batching
          onChange(newValue);
          startTransition(() => {
            setCursorPosition(newPosition);
          });
        } else {
          // Multi-character input (paste) or continuation of buffered input
          // Use buffering to batch paste operations
          inputBufferRef.current += normalizedInput;

          if (inputTimerRef.current) {
            clearTimeout(inputTimerRef.current);
          }

          inputTimerRef.current = setTimeout(() => {
            const buffered = inputBufferRef.current;
            inputBufferRef.current = "";

            if (buffered.length === 0) return;

            // Use refs to get latest values, avoiding closure trap
            const currentValue = valueRef.current;
            const currentCursorPosition = cursorPositionRef.current;

            // Check max length before inserting
            if (maxLength !== undefined && currentValue.length >= maxLength) {
              return;
            }

            // Insert buffered content at cursor position
            let newValue = insertAt(currentValue, currentCursorPosition, buffered);

            // Handle max length after insertion
            if (maxLength !== undefined && newValue.length > maxLength) {
              newValue = newValue.slice(0, maxLength);
            }

            const newPosition = Math.min(currentCursorPosition + buffered.length, newValue.length);
            // Use startTransition for cursor update to reduce flickering during paste
            startTransition(() => {
              setCursorPosition(newPosition);
            });
            onChange(newValue);
          }, RAPID_INPUT_THRESHOLD);
        }
      }
    },
    { isActive: focused && !disabled }
  );

  // ==========================================================================
  // Rendering
  // ==========================================================================

  const isEmpty = value.length === 0;
  const showPlaceholder = isEmpty && placeholder;
  const displayValue = mask ? value.replace(/[\s\S]/g, mask) : value;

  // Split value into lines for multiline display
  const lines = multiline ? displayValue.split("\n") : [displayValue];

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
        {beforeCursor || null}
        <Text inverse>{cursorChar}</Text>
        {afterCursor || null}
      </Text>
    );
  };

  // Border color based on focus state
  const borderColor = focused ? theme.semantic.border.focus : theme.semantic.border.default;

  // Calculate padding lines needed to meet minHeight
  const currentLineCount = lineData.length;
  const paddingLinesNeeded = Math.max(0, effectiveMinHeight - currentLineCount);

  // Render placeholder
  if (showPlaceholder) {
    // Calculate empty lines needed for placeholder (account for the placeholder line itself)
    const emptyLinesForPlaceholder = Math.max(0, effectiveMinHeight - 1);
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        minHeight={effectiveMinHeight + 2} // +2 for top/bottom border
      >
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
        {/* Add empty lines to maintain minHeight - these are static decorative elements */}
        {Array.from({ length: emptyLinesForPlaceholder }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static placeholder lines don't reorder
          <Text key={`empty-${i}`}> </Text>
        ))}
      </Box>
    );
  }

  // Render single-line
  if (!multiline) {
    const content = renderLineWithCursor(displayValue, 0);
    if (!showBorder) {
      return <Box flexDirection="row">{content}</Box>;
    }
    return (
      <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
        {content}
      </Box>
    );
  }

  // Render multiline with stable keys based on line position
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      minHeight={effectiveMinHeight + 2} // +2 for top/bottom border
    >
      {lineData.map(({ line, startPos, key }) => (
        <Box key={key}>{renderLineWithCursor(line, startPos)}</Box>
      ))}
      {/* Add empty lines to maintain minHeight - these are static decorative elements */}
      {Array.from({ length: paddingLinesNeeded }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Static padding lines don't reorder
        <Text key={`padding-${i}`}> </Text>
      ))}
    </Box>
  );
}

/**
 * Memoized TextInput to prevent unnecessary re-renders.
 * Custom comparison checks key props that affect visual output.
 */
export const TextInput = memo(TextInputComponent, (prevProps, nextProps) => {
  // Return true if props are equal (skip render)
  return (
    prevProps.value === nextProps.value &&
    prevProps.focused === nextProps.focused &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.mask === nextProps.mask &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.suppressEnter === nextProps.suppressEnter &&
    prevProps.cursorToEnd === nextProps.cursorToEnd &&
    prevProps.multiline === nextProps.multiline &&
    prevProps.maxLength === nextProps.maxLength &&
    prevProps.minHeight === nextProps.minHeight &&
    prevProps.showBorder === nextProps.showBorder
  );
});

export default TextInput;

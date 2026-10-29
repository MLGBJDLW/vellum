/**
 * TextInput Component (T009)
 *
 * A React Ink-based text input component with multiline support.
 * Provides keyboard handling for text entry, navigation, and submission.
 *
 * @module tui/components/Input/TextInput
 */

import type { Key } from "ink";
import { Box, Text, useStdin } from "ink";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import stripAnsi from "strip-ansi";
import { useAnimationControls } from "../../context/AnimationContext.js";
import { usePasteHandler } from "../../context/BracketedPasteContext.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTheme } from "../../theme/index.js";
import { getCurrentTerminalKey, subscribeTerminalInput } from "../../utils/terminal-input.js";
import { HighlightedText } from "./HighlightedText.js";

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
  /** When true, suppress Tab from inserting spaces (for autocomplete integration) */
  readonly suppressTab?: boolean;
  /** When true, move cursor to end of value on next render */
  readonly cursorToEnd?: boolean;
  /** Callback when cursorToEnd is consumed */
  readonly onCursorMoved?: () => void;
  /** Whether to show border in single-line mode (default: true) */
  readonly showBorder?: boolean;
  /** Enable syntax highlighting for @mentions, /commands, URLs, and `code` (default: false) */
  readonly enableHighlight?: boolean;
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
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function previousCharacter(str: string, index: number): number {
  return graphemes.segment(str).containing(Math.max(0, index - 1))?.index ?? 0;
}

function nextCharacter(str: string, index: number): number {
  const segment = graphemes.segment(str).containing(index);
  return segment ? segment.index + segment.segment.length : str.length;
}

/**
 * Normalize pasted and typed text while preventing embedded terminal controls.
 */
function normalizeInputValue(input: string, multiline: boolean): string {
  const sanitized = stripAnsi(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n");

  const withoutControls = multiline
    ? // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - stripping control chars except tab/newline/CR
      sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x80-\x9f]/g, "")
    : // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - stripping all control chars for single-line
      sanitized.replace(/[\x00-\x1f\x7f\x80-\x9f]/g, "");

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
  onChange: onValueChange,
  onSubmit,
  placeholder = "",
  multiline = false,
  disabled = false,
  maxLength,
  focused = true,
  minHeight,
  mask,
  suppressEnter = false,
  suppressTab = false,
  cursorToEnd = false,
  onCursorMoved,
  showBorder = true,
  enableHighlight = false,
}: TextInputProps) {
  const { theme } = useTheme();
  const { pauseAnimations, resumeAnimations, isVSCode } = useAnimationControls();

  // Pause animations when input is focused in VS Code to reduce flickering
  useEffect(() => {
    if (focused && isVSCode) {
      pauseAnimations();
      return () => resumeAnimations();
    }
  }, [focused, isVSCode, pauseAnimations, resumeAnimations]);

  // Calculate effective min height (default 5 for multiline, 1 for single-line)
  const effectiveMinHeight = minHeight ?? (multiline ? 5 : 1);

  // Refs advance synchronously: Ink can deliver several keys in one read loop
  // before React commits the controlled value or cursor state.
  const valueRef = useRef(value);
  const cursorPositionRef = useRef(value.length);
  const { stdin } = useStdin();
  useEffect(() => subscribeTerminalInput(stdin), [stdin]);
  const onChange = useCallback(
    (next: string) => {
      valueRef.current = next;
      onValueChange(next);
    },
    [onValueChange]
  );

  // Cursor position within the value
  const [cursorPosition, setCursorPosition] = useState(value.length);

  const setCursor = useCallback((position: number) => {
    cursorPositionRef.current = position;
    setCursorPosition(position);
  }, []);

  // Undo/Redo stacks for Ctrl+Z support
  const [undoStack, setUndoStack] = useState<Array<{ value: string; cursor: number }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ value: string; cursor: number }>>([]);
  const lastValueRef = useRef(value);

  // Sync cursor position when value changes externally
  useEffect(() => {
    if (cursorPosition > value.length) {
      setCursor(value.length);
    }
  }, [value, cursorPosition, setCursor]);

  // Reconcile every commit, including a parent that clears back to the same
  // prop value after typing and submission were batched in one input event.
  useLayoutEffect(() => {
    valueRef.current = value;
    cursorPositionRef.current = Math.min(cursorPosition, value.length);
  });

  // Track value changes for undo stack (debounced to group rapid typing)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (value !== lastValueRef.current) {
      // Debounce undo snapshots - group rapid typing into single undo entry
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      const prevValue = lastValueRef.current;
      const prevCursor = cursorPositionRef.current;
      undoTimerRef.current = setTimeout(() => {
        setUndoStack((prev) => [...prev.slice(-99), { value: prevValue, cursor: prevCursor }]);
        setRedoStack([]); // Clear redo on new changes
      }, 300);
      lastValueRef.current = value;
    }
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, [value]);

  // Handle cursorToEnd prop - move cursor to end when requested
  useEffect(() => {
    if (cursorToEnd) {
      setCursor(value.length);
      onCursorMoved?.();
    }
  }, [cursorToEnd, value.length, onCursorMoved, setCursor]);

  /**
   * Handle bracketed paste events.
   * When a paste is detected via bracketed paste mode, the entire
   * pasted content arrives as a single event instead of character-by-character.
   */
  const handlePaste = useCallback(
    (pastedText: string) => {
      const value = valueRef.current;
      const cursorPosition = cursorPositionRef.current;
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
      setCursor(newCursorPosition);
    },
    [disabled, focused, multiline, maxLength, onChange, setCursor]
  );

  // Subscribe to paste events from the BracketedPasteProvider
  usePasteHandler(handlePaste);

  /**
   * Handle character input
   */
  const handleInput = useCallback(
    (char: string) => {
      const value = valueRef.current;
      const cursorPosition = cursorPositionRef.current;
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
        setCursor(Math.min(cursorPosition + normalizedInput.length, maxLength));
        return;
      }

      onChange(newValue);
      setCursor(cursorPosition + normalizedInput.length);
    },
    [disabled, maxLength, onChange, multiline, setCursor]
  );

  /**
   * Handle backspace key
   */
  const handleBackspace = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    if (disabled || cursorPosition === 0) return;

    const previous = previousCharacter(value, cursorPosition);
    const newValue = value.slice(0, previous) + value.slice(cursorPosition);
    onChange(newValue);
    setCursor(previous);
  }, [disabled, onChange, setCursor]);

  /**
   * Handle delete key
   */
  const handleDelete = useCallback(
    (word = false) => {
      const value = valueRef.current;
      const cursorPosition = cursorPositionRef.current;
      if (disabled || cursorPosition >= value.length) return;

      const end = word
        ? cursorPosition + (value.slice(cursorPosition).match(/^\s*\S*/)?.[0].length ?? 0)
        : nextCharacter(value, cursorPosition);
      const newValue = value.slice(0, cursorPosition) + value.slice(end);
      onChange(newValue);
    },
    [disabled, onChange]
  );

  /**
   * Handle left arrow navigation
   */
  const handleLeftArrow = useCallback(
    (ctrl: boolean) => {
      const value = valueRef.current;
      const cursorPosition = cursorPositionRef.current;
      if (cursorPosition === 0) return;

      if (ctrl) {
        // Move to previous word boundary
        const beforeCursor = value.slice(0, cursorPosition);
        const match = beforeCursor.match(/\s*\S*$/);
        const jumpLength = match ? match[0].length : 1;
        setCursor(Math.max(0, cursorPosition - jumpLength));
      } else {
        setCursor(previousCharacter(value, cursorPosition));
      }
    },
    [setCursor]
  );

  /**
   * Handle right arrow navigation
   */
  const handleRightArrow = useCallback(
    (ctrl: boolean) => {
      const value = valueRef.current;
      const cursorPosition = cursorPositionRef.current;
      if (cursorPosition >= value.length) return;

      if (ctrl) {
        // Move to next word boundary
        const afterCursor = value.slice(cursorPosition);
        const match = afterCursor.match(/^\S*\s*/);
        const jumpLength = match ? match[0].length : 1;
        setCursor(Math.min(value.length, cursorPosition + jumpLength));
      } else {
        setCursor(nextCharacter(value, cursorPosition));
      }
    },
    [setCursor]
  );

  /**
   * Handle up arrow in multiline mode
   */
  const handleUpArrow = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    if (!multiline) return;

    // Find the previous newline
    const beforeCursor = value.slice(0, cursorPosition);
    const lastNewline = beforeCursor.lastIndexOf("\n");

    if (lastNewline === -1) {
      // No previous line, move to start
      setCursor(0);
      return;
    }

    // Find the newline before that to get line start
    const lineStart = beforeCursor.lastIndexOf("\n", lastNewline - 1) + 1;
    const columnInCurrentLine = cursorPosition - lastNewline - 1;
    const previousLineLength = lastNewline - lineStart;

    // Move to same column in previous line (or end of line if shorter)
    const newPosition = lineStart + Math.min(columnInCurrentLine, previousLineLength);
    setCursor(newPosition);
  }, [multiline, setCursor]);

  /**
   * Handle down arrow in multiline mode
   */
  const handleDownArrow = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    if (!multiline) return;

    // Find the current line boundaries
    const beforeCursor = value.slice(0, cursorPosition);
    const afterCursor = value.slice(cursorPosition);

    const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
    const columnInCurrentLine = cursorPosition - currentLineStart;

    const nextNewline = afterCursor.indexOf("\n");
    if (nextNewline === -1) {
      // No next line, move to end
      setCursor(value.length);
      return;
    }

    // Find the line after the next newline
    const nextLineStart = cursorPosition + nextNewline + 1;
    const restAfterNextLine = value.slice(nextLineStart);
    const nextLineEnd = restAfterNextLine.indexOf("\n");
    const nextLineLength = nextLineEnd === -1 ? restAfterNextLine.length : nextLineEnd;

    // Move to same column in next line (or end of line if shorter)
    const newPosition = nextLineStart + Math.min(columnInCurrentLine, nextLineLength);
    setCursor(newPosition);
  }, [multiline, setCursor]);

  /**
   * Handle Home key (Ctrl+A) - move to current line start
   */
  const handleHome = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const cursorRow = (value.slice(0, cursorPosition).match(/\n/g) || []).length;
    const lines = value.split("\n");
    let pos = 0;
    for (let i = 0; i < cursorRow; i++) {
      const line = lines[i];
      if (line !== undefined) {
        pos += line.length + 1;
      }
    }
    setCursor(pos);
  }, [setCursor]);

  /**
   * Handle End key (Ctrl+E) - move to current line end
   */
  const handleEnd = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const cursorRow = (value.slice(0, cursorPosition).match(/\n/g) || []).length;
    const lines = value.split("\n");
    let pos = 0;
    for (let i = 0; i <= cursorRow; i++) {
      const line = lines[i];
      if (line !== undefined) {
        pos += line.length + (i < cursorRow ? 1 : 0);
      }
    }
    setCursor(pos);
  }, [setCursor]);

  /**
   * Handle Ctrl+K - kill (delete) from cursor to end of line
   */
  const handleKillToEnd = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const cursorRow = (value.slice(0, cursorPosition).match(/\n/g) || []).length;
    if (disabled) return;
    const lines = value.split("\n");
    const currentLine = lines[cursorRow];
    if (currentLine === undefined) return;
    const lineStart = lines.slice(0, cursorRow).join("\n").length + (cursorRow > 0 ? 1 : 0);
    const lineEnd = lineStart + currentLine.length;
    const newValue = value.slice(0, cursorPosition) + value.slice(lineEnd);
    onChange(newValue);
  }, [disabled, onChange]);

  /**
   * Handle Ctrl+U - kill (delete) from cursor to start of line
   */
  const handleKillToStart = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const cursorRow = (value.slice(0, cursorPosition).match(/\n/g) || []).length;
    if (disabled) return;
    const lines = value.split("\n");
    const lineStart = lines.slice(0, cursorRow).join("\n").length + (cursorRow > 0 ? 1 : 0);
    const newValue = value.slice(0, lineStart) + value.slice(cursorPosition);
    onChange(newValue);
    setCursor(lineStart);
  }, [disabled, onChange, setCursor]);

  /**
   * Handle Ctrl+W - delete word backward
   */
  const handleDeleteWordBackward = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    if (disabled || cursorPosition === 0) return;

    // Find the start of the previous word
    let pos = cursorPosition - 1;
    // Skip whitespace
    while (pos > 0 && /\s/.test(value.charAt(pos))) pos--;
    // Skip word characters
    while (pos > 0 && !/\s/.test(value.charAt(pos - 1))) pos--;

    const newValue = value.slice(0, pos) + value.slice(cursorPosition);
    onChange(newValue);
    setCursor(pos);
  }, [disabled, onChange, setCursor]);

  /**
   * Handle Ctrl+Z - undo
   */
  const handleUndo = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, { value, cursor: cursorPosition }]);
    onChange(prev.value);
    setCursor(prev.cursor);
    lastValueRef.current = prev.value; // Prevent re-adding to undo stack
  }, [undoStack, onChange, setCursor]);

  /**
   * Handle Ctrl+Shift+Z / Ctrl+Y - redo
   */
  const handleRedo = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, { value, cursor: cursorPosition }]);
    onChange(next.value);
    setCursor(next.cursor);
    lastValueRef.current = next.value; // Prevent re-adding to undo stack
  }, [redoStack, onChange, setCursor]);

  /**
   * Handle submission
   */
  const handleSubmit = useCallback(() => {
    if (disabled) return;
    onSubmit?.(valueRef.current);
  }, [disabled, onSubmit]);

  /**
   * Handle newline in multiline mode
   */
  const handleNewline = useCallback(() => {
    const value = valueRef.current;
    const cursorPosition = cursorPositionRef.current;
    if (disabled || !multiline) return;

    // Check max length before inserting newline
    if (maxLength !== undefined && value.length >= maxLength) {
      return;
    }

    const newValue = insertAt(value, cursorPosition, "\n");
    onChange(newValue);
    setCursor(cursorPosition + 1);
  }, [disabled, multiline, maxLength, onChange, setCursor]);

  /**
   * Handle return/enter key based on mode
   * - Shift+Enter: Always inserts newline (even in single-line mode for multiline contexts)
   * - Enter (multiline): Inserts newline
   * - Ctrl+Enter (multiline): Submits
   * - Enter (single-line): Submits
   */
  const handleReturn = useCallback(
    (ctrl: boolean, shift: boolean): boolean => {
      // Skip if Enter should be suppressed (e.g., autocomplete is active)
      // Check prop directly for synchronous behavior - state-based check was racy
      if (suppressEnter) {
        return false; // Let parent handle it
      }
      // Shift+Enter always inserts newline (multiline mode required)
      if (shift && multiline) {
        handleNewline();
        return true;
      }
      if (multiline && !ctrl) {
        handleNewline();
      } else {
        handleSubmit();
      }
      return true;
    },
    [multiline, handleNewline, handleSubmit, suppressEnter]
  );

  /**
   * Handle tab key (multiline only)
   * Returns true if key was handled, false to pass through
   */
  const handleTab = useCallback((): boolean => {
    // Skip if Tab should be suppressed (e.g., autocomplete is active)
    if (suppressTab) {
      return false; // Let parent handle it
    }
    if (multiline) {
      handleInput("  ");
    }
    return true;
  }, [multiline, handleInput, suppressTab]);

  /**
   * Process a key event and dispatch to appropriate handler.
   * Returns true if the key was handled.
   */
  const processKeyEvent = useCallback(
    (input: string, key: Key): boolean => {
      // Navigation and editing keys
      if (key.backspace) {
        // Ctrl/Alt+Backspace: delete word backward
        if (key.ctrl || key.meta) {
          handleDeleteWordBackward();
        } else {
          handleBackspace();
        }
        return true;
      }
      if (key.delete) {
        handleDelete(key.ctrl || key.meta);
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
        return handleReturn(key.ctrl, key.shift);
      }
      if (key.tab) {
        return handleTab();
      }
      if (key.escape) {
        return true;
      }

      // Emacs-style keybindings (Ctrl+key)
      if (key.ctrl) {
        switch (input.toLowerCase()) {
          case "a": // Ctrl+A: Home (line start)
            handleHome();
            return true;
          case "e": // Ctrl+E: End (line end)
            handleEnd();
            return true;
          case "k": // Ctrl+K: Kill to end of line
            handleKillToEnd();
            return true;
          case "u": // Ctrl+U: Kill to start of line
            handleKillToStart();
            return true;
          case "w": // Ctrl+W: Delete word backward
            handleDeleteWordBackward();
            return true;
          case "z": // Ctrl+Z: Undo, Ctrl+Shift+Z: Redo
            if (key.shift) {
              handleRedo();
            } else {
              handleUndo();
            }
            return true;
          case "y": // Ctrl+Y: Redo (alternative)
            handleRedo();
            return true;
        }
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
      handleHome,
      handleEnd,
      handleKillToEnd,
      handleKillToStart,
      handleDeleteWordBackward,
      handleUndo,
      handleRedo,
    ]
  );

  // Each framed text chunk is one edit. No delayed paste timer can overtake a
  // subsequent Backspace, cursor movement or Enter.
  useInput(
    (input, key) => {
      if (disabled) return;
      const raw = getCurrentTerminalKey(stdin);
      if (raw && ["\x1b[H", "\x1b[1~", "\x1b[7~", "\x1bOH"].includes(raw)) {
        handleHome();
        return;
      }
      if (raw && ["\x1b[F", "\x1b[4~", "\x1b[8~", "\x1bOF"].includes(raw)) {
        handleEnd();
        return;
      }
      if (processKeyEvent(input, key)) return;
      if (input && !key.ctrl && !key.meta) handleInput(input);
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

  // Input highlighting (disabled when masking)
  const shouldHighlight = enableHighlight && !mask;

  /**
   * Render a line with cursor indicator (and optional highlighting)
   */
  const renderLineWithCursor = (line: string, lineStartPosition: number) => {
    const lineEndPosition = lineStartPosition + line.length;
    const cursorInLine = cursorPosition >= lineStartPosition && cursorPosition <= lineEndPosition;

    // Use HighlightedText when highlighting is enabled
    if (shouldHighlight) {
      return (
        <HighlightedText
          text={line || " "}
          cursorPosition={cursorPosition}
          showCursor={cursorInLine && focused}
          lineStartPosition={lineStartPosition}
        />
      );
    }

    // Default rendering without highlighting
    if (!cursorInLine || !focused) {
      return <Text>{line || " "}</Text>;
    }

    const cursorCol = cursorPosition - lineStartPosition;
    const beforeCursor = line.slice(0, cursorCol);
    const nextCol = nextCharacter(line, cursorCol);
    const cursorChar = line.slice(cursorCol, nextCol) || " ";
    const afterCursor = line.slice(nextCol);

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

  // Calculate visual line count considering terminal width wrapping
  const terminalWidth = process.stdout.columns || 80;
  const contentWidth = Math.max(1, terminalWidth - 4); // Account for border (2) + paddingX (1 each side)

  // Sum visual lines for each logical line (accounts for wrapping)
  const visualLineCount = lineData.reduce((total, { line }) => {
    if (!line) return total + 1;
    // Unicode-aware length for proper CJK/emoji handling
    const lineLength = [...line].length;
    const wrappedLines = Math.ceil(lineLength / contentWidth) || 1;
    return total + wrappedLines;
  }, 0);

  // Calculate padding lines needed to meet minHeight
  const paddingLinesNeeded = Math.max(0, effectiveMinHeight - visualLineCount);

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
        <Box flexDirection="row">
          <Text color={theme.semantic.text.primary}>{"❯ "}</Text>
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
      return (
        <Box flexDirection="row">
          <Text color={theme.semantic.text.primary}>{"❯ "}</Text>
          {content}
        </Box>
      );
    }
    return (
      <Box borderStyle="round" borderColor={borderColor} paddingX={1} flexDirection="row">
        <Text color={theme.semantic.text.primary}>{"❯ "}</Text>
        <Box flexGrow={1}>{content}</Box>
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
      {lineData.map(({ line, startPos, key }, index) => (
        <Box key={key} flexDirection="row">
          {/* Show prompt prefix on first line only */}
          {index === 0 ? (
            <Text color={theme.semantic.text.primary}>{"❯ "}</Text>
          ) : (
            <Text>{"  "}</Text>
          )}
          <Box flexGrow={1}>{renderLineWithCursor(line, startPos)}</Box>
        </Box>
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
export const TextInput = memo(TextInputComponent);

export default TextInput;

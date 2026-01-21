/**
 * useCopyMode Hook (T055)
 *
 * React hook for terminal text copy selection mode.
 * Provides visual selection mode with keyboard navigation and clipboard copy.
 *
 * @module @vellum/cli
 */

import { exec } from "node:child_process";
import { useCallback, useState } from "react";

import { getActiveStdout } from "../buffered-stdout.js";

/**
 * State for copy mode selection.
 */
export interface CopyModeState {
  /** Whether copy mode is active */
  active: boolean;
  /** Starting line of selection (0-indexed) */
  startLine: number;
  /** Ending line of selection (0-indexed) */
  endLine: number;
  /** Starting column of selection (0-indexed) */
  startCol: number;
  /** Ending column of selection (0-indexed) */
  endCol: number;
}

/**
 * Return value of useCopyMode hook.
 */
export interface UseCopyModeReturn {
  /** Current copy mode state */
  state: CopyModeState;
  /** Enter visual selection mode */
  enterCopyMode: () => void;
  /** Exit visual selection mode */
  exitCopyMode: () => void;
  /** Expand selection in a direction */
  expandSelection: (direction: "up" | "down" | "left" | "right") => void;
  /** Copy the selected content to clipboard */
  copySelection: (content: string[][]) => Promise<void>;
  /** Check if a position is within the selection */
  isInSelection: (line: number, col: number) => boolean;
}

/**
 * Initial state for copy mode.
 */
const initialState: CopyModeState = {
  active: false,
  startLine: 0,
  endLine: 0,
  startCol: 0,
  endCol: 0,
};

/**
 * Copy text to system clipboard using platform-specific methods.
 *
 * Supports:
 * - macOS: pbcopy
 * - Windows: clip (via PowerShell for Unicode support)
 * - Linux: xclip or xsel
 * - Fallback: OSC 52 escape sequence for terminal emulators
 *
 * @param text - Text to copy to clipboard
 * @returns Promise that resolves when copy is complete
 */
async function copyToClipboard(text: string): Promise<void> {
  if (!text) return;

  const platform = process.platform;

  return new Promise((resolve, reject) => {
    let command: string;
    const encoding: BufferEncoding = "utf8";

    switch (platform) {
      case "darwin":
        command = "pbcopy";
        break;
      case "win32":
        // Use PowerShell for proper Unicode support on Windows
        command = `powershell -NoProfile -Command "$input | Set-Clipboard"`;
        break;
      case "linux":
        // Try xclip first, fallback to xsel
        command = "xclip -selection clipboard";
        break;
      default:
        // For other platforms, try OSC 52 escape sequence
        try {
          const base64Text = Buffer.from(text, "utf8").toString("base64");
          getActiveStdout().write(`\x1b]52;c;${base64Text}\x07`);
          resolve();
          return;
        } catch {
          reject(new Error(`Unsupported platform: ${platform}`));
          return;
        }
    }

    const child = exec(command, { encoding }, (error) => {
      if (error) {
        // On Linux, try xsel as fallback
        if (platform === "linux") {
          const fallback = exec("xsel --clipboard --input", { encoding }, (fallbackError) => {
            if (fallbackError) {
              // Last resort: OSC 52
              try {
                const base64Text = Buffer.from(text, "utf8").toString("base64");
                getActiveStdout().write(`\x1b]52;c;${base64Text}\x07`);
                resolve();
              } catch {
                reject(fallbackError);
              }
            } else {
              resolve();
            }
          });
          fallback.stdin?.write(text);
          fallback.stdin?.end();
        } else {
          reject(error);
        }
      } else {
        resolve();
      }
    });

    child.stdin?.write(text);
    child.stdin?.end();
  });
}

/**
 * Extract selected text from 2D content array.
 *
 * @param content - 2D array of characters (content[line][col])
 * @param startLine - Starting line index
 * @param endLine - Ending line index
 * @param startCol - Starting column index
 * @param endCol - Ending column index
 * @returns Selected text as a string
 */
function extractSelection(
  content: string[][],
  startLine: number,
  endLine: number,
  startCol: number,
  endCol: number
): string {
  if (content.length === 0) return "";

  // Normalize bounds (ensure start <= end)
  const minLine = Math.min(startLine, endLine);
  const maxLine = Math.max(startLine, endLine);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);

  // Clamp to valid ranges
  const clampedMinLine = Math.max(0, Math.min(minLine, content.length - 1));
  const clampedMaxLine = Math.max(0, Math.min(maxLine, content.length - 1));

  const lines: string[] = [];

  for (let line = clampedMinLine; line <= clampedMaxLine; line++) {
    const lineContent = content[line] ?? [];
    if (lineContent.length === 0) {
      lines.push("");
      continue;
    }

    const lineMinCol = Math.max(0, Math.min(minCol, lineContent.length - 1));
    const lineMaxCol = Math.max(0, Math.min(maxCol, lineContent.length - 1));

    // For single line selection, use exact columns
    // For multi-line, first line uses startCol to end, middle lines use full line, last line uses start to endCol
    if (clampedMinLine === clampedMaxLine) {
      // Single line: exact column range
      lines.push(lineContent.slice(lineMinCol, lineMaxCol + 1).join(""));
    } else if (line === clampedMinLine) {
      // First line: from minCol to end
      lines.push(lineContent.slice(lineMinCol).join(""));
    } else if (line === clampedMaxLine) {
      // Last line: from start to maxCol
      lines.push(lineContent.slice(0, lineMaxCol + 1).join(""));
    } else {
      // Middle lines: full line
      lines.push(lineContent.join(""));
    }
  }

  return lines.join("\n");
}

/**
 * Hook for managing terminal text copy selection mode.
 *
 * Provides visual selection mode with keyboard navigation and clipboard copy.
 * Enter with 'v' key, extend with arrow keys, copy with 'y', exit with Escape.
 *
 * @returns Copy mode state and control functions
 *
 * @example
 * ```tsx
 * function TerminalOutput() {
 *   const { state, enterCopyMode, expandSelection, copySelection, isInSelection } = useCopyMode();
 *
 *   useInput((input, key) => {
 *     if (!state.active && input === 'v') {
 *       enterCopyMode();
 *     } else if (state.active) {
 *       if (key.upArrow) expandSelection('up');
 *       if (key.downArrow) expandSelection('down');
 *       if (key.leftArrow) expandSelection('left');
 *       if (key.rightArrow) expandSelection('right');
 *       if (input === 'y') {
 *         copySelection(content);
 *       }
 *     }
 *   });
 *
 *   return (
 *     <Box>
 *       {lines.map((line, lineNum) => (
 *         <Text key={lineNum}>
 *           {line.map((char, colNum) => (
 *             <Text
 *               key={colNum}
 *               inverse={state.active && isInSelection(lineNum, colNum)}
 *             >
 *               {char}
 *             </Text>
 *           ))}
 *         </Text>
 *       ))}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useCopyMode(): UseCopyModeReturn {
  const [state, setState] = useState<CopyModeState>(initialState);

  /**
   * Enter visual selection mode.
   * Selection starts at position (0, 0).
   */
  const enterCopyMode = useCallback(() => {
    setState({
      active: true,
      startLine: 0,
      endLine: 0,
      startCol: 0,
      endCol: 0,
    });
  }, []);

  /**
   * Exit visual selection mode.
   * Resets all selection state.
   */
  const exitCopyMode = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Expand selection in the specified direction.
   * Moves the end position while keeping start position fixed.
   */
  const expandSelection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (!state.active) return;

      setState((prev) => {
        const next = { ...prev };

        switch (direction) {
          case "up":
            next.endLine = Math.max(0, prev.endLine - 1);
            break;
          case "down":
            next.endLine = prev.endLine + 1;
            break;
          case "left":
            next.endCol = Math.max(0, prev.endCol - 1);
            break;
          case "right":
            next.endCol = prev.endCol + 1;
            break;
        }

        return next;
      });
    },
    [state.active]
  );

  /**
   * Copy the selected content to clipboard.
   * Automatically exits copy mode after successful copy.
   *
   * @param content - 2D array where content[line][col] is a character
   */
  const copySelection = useCallback(
    async (content: string[][]): Promise<void> => {
      if (!state.active) return;

      const selectedText = extractSelection(
        content,
        state.startLine,
        state.endLine,
        state.startCol,
        state.endCol
      );

      if (selectedText) {
        await copyToClipboard(selectedText);
      }

      // Exit copy mode after copy
      setState(initialState);
    },
    [state]
  );

  /**
   * Check if a position is within the current selection.
   * Handles both forward and backward selections.
   *
   * @param line - Line index to check
   * @param col - Column index to check
   * @returns True if the position is within the selection
   */
  const isInSelection = useCallback(
    (line: number, col: number): boolean => {
      if (!state.active) return false;

      // Normalize selection bounds
      const minLine = Math.min(state.startLine, state.endLine);
      const maxLine = Math.max(state.startLine, state.endLine);
      const minCol = Math.min(state.startCol, state.endCol);
      const maxCol = Math.max(state.startCol, state.endCol);

      // Check if line is in range
      if (line < minLine || line > maxLine) return false;

      // For single line selection, check exact column range
      if (minLine === maxLine) {
        return col >= minCol && col <= maxCol;
      }

      // For multi-line selection:
      // - First line: from minCol to end
      // - Middle lines: entire line
      // - Last line: from start to maxCol
      if (line === minLine) {
        return col >= minCol;
      }
      if (line === maxLine) {
        return col <= maxCol;
      }

      // Middle line: all columns are selected
      return true;
    },
    [state]
  );

  return {
    state,
    enterCopyMode,
    exitCopyMode,
    expandSelection,
    copySelection,
    isInSelection,
  };
}

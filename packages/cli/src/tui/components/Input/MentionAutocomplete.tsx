/**
 * MentionAutocomplete Component
 *
 * A dropdown component for @ mention suggestions with keyboard navigation.
 * Supports two modes:
 * - Type selection: Show available mention types (file, folder, url, etc.)
 * - Value completion: Show file/folder suggestions for path-based mentions
 *
 * @module tui/components/Input/MentionAutocomplete
 */

import { getAllMentionSuggestions, type MentionSuggestion, type MentionType } from "@vellum/shared";
import { Box, type DOMElement, Text } from "ink";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMouseInteractionEnabled } from "../../context/MouseContext.js";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTheme } from "../../theme/index.js";
import { Clickable, getVisibleClickBounds } from "../common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Mode of the mention autocomplete.
 */
export type MentionAutocompleteMode = "type" | "value";

/**
 * File/folder suggestion for value completion.
 */
export interface FileSuggestion {
  /** File/folder name */
  readonly name: string;
  /** Full path from input start */
  readonly path: string;
  /** Whether this is a directory */
  readonly isDirectory: boolean;
  /** File extension (if file) */
  readonly extension?: string;
}

/**
 * Props for the MentionAutocomplete component.
 */
export interface MentionAutocompleteProps {
  /** Current partial input to filter against */
  readonly input: string;
  /** Current mode: selecting type or completing value */
  readonly mode: MentionAutocompleteMode;
  /** The mention type when in value mode */
  readonly mentionType?: MentionType;
  /** File/folder suggestions for value mode */
  readonly fileSuggestions?: readonly FileSuggestion[];
  /** Callback when a type or value is selected */
  readonly onSelect: (value: string, mode: MentionAutocompleteMode) => void;
  /** Callback when autocomplete is cancelled */
  readonly onCancel: () => void;
  /** Callback when selection index changes (for parent to track selection state) */
  readonly onSelectionChange?: (index: number, hasOptions: boolean) => void;
  /** Whether the autocomplete is visible */
  readonly visible?: boolean;
  /** Whether autocomplete captures keyboard input */
  readonly active?: boolean;
  /** Maximum visible items */
  readonly maxVisible?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Filter mention suggestions by partial input.
 */
function filterMentionSuggestions(
  suggestions: readonly MentionSuggestion[],
  input: string
): MentionSuggestion[] {
  if (!input) return [...suggestions];
  const lower = input.toLowerCase();
  return suggestions.filter((s) => s.label.toLowerCase().startsWith(lower));
}

/**
 * Filter file suggestions by partial path.
 */
function filterFileSuggestions(
  suggestions: readonly FileSuggestion[],
  input: string
): FileSuggestion[] {
  if (!input) return [...suggestions];
  // Match complete paths when entering a directory. Besides showing nested
  // children, this hides stale suggestions while the next directory is loading.
  const lower = input.replace(/\\/g, "/").toLowerCase();
  return suggestions.filter((s) =>
    (lower.includes("/") ? s.path.replace(/\\/g, "/") : s.name).toLowerCase().startsWith(lower)
  );
}

/**
 * Get icon for a file based on extension.
 */
function getFileIcon(suggestion: FileSuggestion): string {
  if (suggestion.isDirectory) return "📁";

  const ext = suggestion.extension?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "🔷";
    case "js":
    case "jsx":
      return "🟡";
    case "json":
      return "📋";
    case "md":
      return "[f]";
    case "css":
    case "scss":
      return "🎨";
    case "html":
      return "🌐";
    case "py":
      return "🐍";
    case "rs":
      return "🦀";
    case "go":
      return "🐹";
    case "yaml":
    case "yml":
      return "[*]";
    default:
      return "📄";
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * MentionAutocomplete provides a dropdown for @ mention completion.
 *
 * Features:
 * - Two-mode operation: type selection and value completion
 * - Case-insensitive filtering
 * - Keyboard navigation (Up/Down)
 * - Selection via Tab or Enter
 * - Cancellation via Escape
 * - Icons for mention types and files
 *
 * @example
 * ```tsx
 * // Type selection mode
 * <MentionAutocomplete
 *   input="fi"
 *   mode="type"
 *   onSelect={(value, mode) => handleSelect(value, mode)}
 *   onCancel={() => setShowAutocomplete(false)}
 * />
 *
 * // Value completion mode
 * <MentionAutocomplete
 *   input="./src/"
 *   mode="value"
 *   mentionType="file"
 *   fileSuggestions={suggestions}
 *   onSelect={(value, mode) => handleSelect(value, mode)}
 *   onCancel={() => setShowAutocomplete(false)}
 * />
 * ```
 */
export function MentionAutocomplete({
  input,
  mode,
  mentionType,
  fileSuggestions = [],
  onSelect,
  onCancel,
  onSelectionChange,
  visible = true,
  active,
  maxVisible = 8,
}: MentionAutocompleteProps): React.ReactElement | null {
  const { theme } = useTheme();
  const mouseInteractionEnabled = useMouseInteractionEnabled();
  const menuRef = useRef<DOMElement>(null);
  const menuId = useId();
  const isActive = visible && (active ?? true);

  // Selected index
  const [selection, setSelection] = useState({ key: "", index: 0 });

  // Get filtered options based on mode
  const { items, total } = useMemo(() => {
    if (mode === "type") {
      const allSuggestions = getAllMentionSuggestions();
      const filtered = filterMentionSuggestions(allSuggestions, input);
      return { items: filtered, total: filtered.length };
    }
    // Value mode
    const filtered = filterFileSuggestions(fileSuggestions, input);
    return { items: filtered, total: filtered.length };
  }, [mode, input, fileSuggestions]);

  const selectionKey = JSON.stringify([
    mode,
    mentionType,
    input,
    visible,
    items.map((item) => ("path" in item ? item.path : item.label)),
  ]);
  const selectedIndex =
    selection.key === selectionKey ? Math.max(0, Math.min(selection.index, total - 1)) : 0;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  if (selection.key !== selectionKey) setSelection({ key: selectionKey, index: 0 });

  const selectIndex = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(index, total - 1));
      selectedIndexRef.current = next;
      setSelection({ key: selectionKey, index: next });
      onSelectionChange?.(next, total > 0);
    },
    [onSelectionChange, selectionKey, total]
  );

  const completeIndex = useCallback(
    (index: number) => {
      const selected = items[index];
      if (!selected) return;
      selectIndex(index);
      onSelect("path" in selected ? selected.path : selected.label, mode);
    },
    [items, mode, onSelect, selectIndex]
  );

  const getMenuBounds = useCallback(() => {
    const bounds = getVisibleClickBounds(menuRef.current);
    return bounds ? { ...bounds, top: bounds.top - 1, left: bounds.left - 1 } : null;
  }, []);
  useMouseScroll({
    enabled: isActive && mouseInteractionEnabled && total > 0,
    priority: 20,
    scrollSpeed: 1,
    bounds: getMenuBounds,
    onScroll: useCallback(
      (delta: number) => selectIndex(selectedIndexRef.current + delta),
      [selectIndex]
    ),
  });

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIndex, total > 0);
  }, [selectedIndex, total, onSelectionChange]);

  // Calculate visible window
  const windowStart = useMemo(() => {
    const halfWindow = Math.floor(maxVisible / 2);
    if (selectedIndex < halfWindow) return 0;
    if (selectedIndex >= total - halfWindow) return Math.max(0, total - maxVisible);
    return selectedIndex - halfWindow;
  }, [selectedIndex, total, maxVisible]);

  const visibleItems = items.slice(windowStart, windowStart + maxVisible);
  const overflowCount = total - (windowStart + visibleItems.length);

  // Handle keyboard input
  useInput(
    useCallback(
      (_input, key) => {
        // Arrow down - move selection down
        if (key.downArrow) {
          selectIndex(selectedIndexRef.current + 1);
          return;
        }

        // Arrow up - move selection up
        if (key.upArrow) {
          selectIndex(selectedIndexRef.current - 1);
          return;
        }

        // Tab or Enter - select current option
        if (key.tab || key.return) {
          completeIndex(selectedIndexRef.current);
          return;
        }

        // Escape - cancel autocomplete
        if (key.escape) {
          onCancel();
          return;
        }
      },
      [completeIndex, onCancel, selectIndex]
    ),
    { isActive: isActive && total > 0 }
  );

  // Don't render if not visible or no items
  if (!visible || total === 0) {
    return null;
  }

  // Theme colors
  const borderColor = theme.semantic.border.default;
  const highlightColor = theme.colors.primary;
  const normalColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const accentColor = theme.colors.accent;

  // Render header based on mode
  const header = mode === "type" ? "@ Mentions" : `@${mentionType}:`;

  return (
    <Box
      ref={menuRef}
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Header */}
      <Box marginBottom={0}>
        <Text color={accentColor} bold>
          {header}
        </Text>
      </Box>

      {/* Options */}
      {visibleItems.map((item, displayIdx) => {
        const actualIndex = windowStart + displayIdx;
        const isSelected = actualIndex === selectedIndex;

        if (mode === "type") {
          // Render mention type suggestion
          const suggestion = item as MentionSuggestion;
          return (
            <Clickable
              key={`${selectionKey}:${suggestion.type}`}
              id={`${menuId}:${selectionKey}:${suggestion.type}`}
              enabled={isActive}
              onClick={() => completeIndex(actualIndex)}
            >
              {isSelected ? (
                <Text inverse>
                  <Text color={highlightColor} bold>
                    {"› "}
                  </Text>
                  <Text>{suggestion.icon} </Text>
                  <Text color={normalColor} bold>
                    {suggestion.label}
                  </Text>
                  <Text color={mutedColor}> - {suggestion.description}</Text>
                </Text>
              ) : (
                <Text>
                  {"  "}
                  <Text>{suggestion.icon} </Text>
                  <Text color={normalColor}>{suggestion.label}</Text>
                  <Text color={mutedColor} dimColor>
                    {" "}
                    - {suggestion.description}
                  </Text>
                </Text>
              )}
            </Clickable>
          );
        }

        // Render file suggestion
        const fileSuggestion = item as FileSuggestion;
        const icon = getFileIcon(fileSuggestion);

        return (
          <Clickable
            key={`${selectionKey}:${fileSuggestion.path}`}
            id={`${menuId}:${selectionKey}:${fileSuggestion.path}`}
            enabled={isActive}
            onClick={() => completeIndex(actualIndex)}
          >
            {isSelected ? (
              <Text inverse>
                <Text color={highlightColor} bold>
                  {"› "}
                </Text>
                <Text>{icon} </Text>
                <Text color={normalColor} bold>
                  {fileSuggestion.name}
                </Text>
                {fileSuggestion.isDirectory && <Text color={mutedColor}>/</Text>}
              </Text>
            ) : (
              <Text>
                {"  "}
                <Text>{icon} </Text>
                <Text color={normalColor}>{fileSuggestion.name}</Text>
                {fileSuggestion.isDirectory && (
                  <Text color={mutedColor} dimColor>
                    /
                  </Text>
                )}
              </Text>
            )}
          </Clickable>
        );
      })}

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <Box paddingTop={0}>
          <Text color={mutedColor} dimColor>
            [{overflowCount} more]
          </Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={0} borderTop={false}>
        <Text color={mutedColor} dimColor>
          ↑↓ navigate • Tab/Enter select • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}

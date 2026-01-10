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
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";

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
  const lower = input.toLowerCase();
  return suggestions.filter((s) => s.name.toLowerCase().startsWith(lower));
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
      return "📝";
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
      return "⚙️";
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
  visible = true,
  active,
  maxVisible = 8,
}: MentionAutocompleteProps): React.ReactElement | null {
  const { theme } = useTheme();
  const isActive = active ?? visible;

  // Selected index
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  // Reset selection when options change
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset on items/input change is intentional
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, input]);

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
          setSelectedIndex((prev) => Math.min(prev + 1, total - 1));
          return;
        }

        // Arrow up - move selection up
        if (key.upArrow) {
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        // Tab or Enter - select current option
        if (key.tab || key.return) {
          const selected = items[selectedIndex];
          if (selected) {
            if (mode === "type") {
              onSelect((selected as MentionSuggestion).label, mode);
            } else {
              onSelect((selected as FileSuggestion).path, mode);
            }
          }
          return;
        }

        // Escape - cancel autocomplete
        if (key.escape) {
          onCancel();
          return;
        }
      },
      [items, selectedIndex, total, mode, onSelect, onCancel]
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
            <Box key={suggestion.type} flexDirection="row">
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
            </Box>
          );
        }

        // Render file suggestion
        const fileSuggestion = item as FileSuggestion;
        const icon = getFileIcon(fileSuggestion);

        return (
          <Box key={fileSuggestion.path} flexDirection="row">
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
          </Box>
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

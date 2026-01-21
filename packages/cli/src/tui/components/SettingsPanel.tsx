/**
 * SettingsPanel Component
 *
 * Interactive TUI component for viewing and modifying application settings.
 * Provides category-based navigation with keyboard controls.
 *
 * @module tui/components/SettingsPanel
 */

import type { CodingMode } from "@vellum/core";
import { loadConfig } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  type DiffViewMode,
  getAlternateBufferEnabled,
  getDiffViewMode,
  getModeFromSettings,
  getModelSettings,
  getSavedLanguage,
  getThemeFromSettings,
  getThinkingSettings,
  setAlternateBufferEnabled,
  setDiffViewMode,
  setModeInSettings,
  setThemeInSettings,
  setThinkingSettings,
  type ThinkingSettings,
} from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Settings category.
 */
export type SettingCategory = "general" | "model" | "mode" | "theme" | "diff" | "thinking";

/**
 * Setting item definition.
 */
export interface SettingItem {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly type: "string" | "number" | "boolean" | "select";
  readonly options?: readonly string[];
  readonly editable: boolean;
  readonly onChange?: (value: string | number | boolean) => void;
}

/**
 * Props for the SettingsPanel component.
 */
export interface SettingsPanelProps {
  /** Whether the panel is currently active/focused */
  readonly isActive?: boolean;
  /** Callback when user wants to close the panel */
  readonly onClose?: () => void;
  /** Initial category to display */
  readonly initialCategory?: SettingCategory;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Available categories.
 */
const CATEGORIES: readonly SettingCategory[] = [
  "general",
  "model",
  "mode",
  "theme",
  "diff",
  "thinking",
] as const;

/**
 * Category icons.
 */
const CATEGORY_ICONS: Record<SettingCategory, string> = {
  general: "⚙️",
  model: "🤖",
  mode: "📋",
  theme: "🎨",
  diff: "📄",
  thinking: "💭",
};

/**
 * Category labels.
 */
const CATEGORY_LABELS: Record<SettingCategory, string> = {
  general: "General",
  model: "Model",
  mode: "Coding Mode",
  theme: "Theme",
  diff: "Diff View",
  thinking: "Thinking",
};

// =============================================================================
// Helper Hooks
// =============================================================================

/**
 * Get settings items for a category.
 */
function useSettingsItems(category: SettingCategory): SettingItem[] {
  return useMemo(() => {
    // Load config
    const configResult = loadConfig({ suppressDeprecationWarnings: true });
    const config = configResult.ok ? configResult.value : null;

    // Get user settings
    const thinkingSettings = getThinkingSettings();
    const modelSettings = getModelSettings();
    const savedLanguage = getSavedLanguage();
    const diffViewMode = getDiffViewMode();
    const alternateBuffer = getAlternateBufferEnabled();
    const themeFromSettings = getThemeFromSettings();
    const modeFromSettings = getModeFromSettings();

    switch (category) {
      case "general":
        return [
          {
            key: "workingDir",
            label: "Working Directory",
            value: config?.workingDir ?? process.cwd(),
            type: "string",
            editable: false,
          },
          {
            key: "debug",
            label: "Debug Mode",
            value: config?.debug ?? false,
            type: "boolean",
            editable: false,
          },
          {
            key: "logLevel",
            label: "Log Level",
            value: config?.logLevel ?? "info",
            type: "select",
            options: ["debug", "info", "warn", "error"],
            editable: false,
          },
          {
            key: "alternateBuffer",
            label: "Alternate Buffer",
            value: alternateBuffer ?? true,
            type: "boolean",
            editable: true,
            onChange: (v) => setAlternateBufferEnabled(v as boolean),
          },
          {
            key: "language",
            label: "Language",
            value: savedLanguage ?? "auto",
            type: "string",
            editable: false,
          },
        ];

      case "model":
        return [
          {
            key: "provider",
            label: "Provider",
            value: modelSettings?.provider ?? config?.llm?.provider ?? "anthropic",
            type: "string",
            editable: false,
          },
          {
            key: "model",
            label: "Model",
            value: modelSettings?.modelId ?? config?.llm?.model ?? "claude-sonnet-4-20250514",
            type: "string",
            editable: false,
          },
          {
            key: "maxTokens",
            label: "Max Tokens",
            value: config?.llm?.maxTokens ?? 4096,
            type: "number",
            editable: false,
          },
          {
            key: "temperature",
            label: "Temperature",
            value: config?.llm?.temperature ?? 0.7,
            type: "number",
            editable: false,
          },
        ];

      case "mode":
        return [
          {
            key: "codingMode",
            label: "Coding Mode",
            value: modeFromSettings ?? "vibe",
            type: "select",
            options: ["vibe", "plan", "spec"],
            editable: true,
            onChange: (v) => setModeInSettings(v as CodingMode),
          },
        ];

      case "theme":
        return [
          {
            key: "theme",
            label: "Theme",
            value: themeFromSettings ?? config?.theme ?? "dark",
            type: "select",
            options: ["dark", "light", "parchment", "dracula", "solarized-dark", "solarized-light"],
            editable: true,
            onChange: (v) => setThemeInSettings(v as string),
          },
          {
            key: "vimMode",
            label: "Vim Mode",
            value: false, // Vim mode is managed via /vim command
            type: "boolean",
            editable: false,
          },
        ];

      case "diff":
        return [
          {
            key: "viewMode",
            label: "Diff View Mode",
            value: diffViewMode ?? config?.diffViewMode ?? "unified",
            type: "select",
            options: ["unified", "side-by-side"],
            editable: true,
            onChange: (v) => setDiffViewMode(v as DiffViewMode),
          },
        ];

      case "thinking":
        return [
          {
            key: "enabled",
            label: "Extended Thinking",
            value: thinkingSettings?.enabled ?? config?.thinking?.enabled ?? false,
            type: "boolean",
            editable: true,
            onChange: (v) => {
              const current = getThinkingSettings();
              setThinkingSettings({ ...current, enabled: v as boolean } as ThinkingSettings);
            },
          },
          {
            key: "budgetTokens",
            label: "Budget Tokens",
            value: thinkingSettings?.budgetTokens ?? config?.thinking?.budgetTokens ?? 10000,
            type: "number",
            editable: true,
            onChange: (v) => {
              const current = getThinkingSettings();
              setThinkingSettings({ ...current, budgetTokens: v as number } as ThinkingSettings);
            },
          },
          {
            key: "priority",
            label: "Priority",
            value: thinkingSettings?.priority ?? config?.thinking?.priority ?? "merge",
            type: "select",
            options: ["global", "mode", "merge"],
            editable: true,
            onChange: (v) => {
              const current = getThinkingSettings();
              setThinkingSettings({
                ...current,
                priority: v as "global" | "mode" | "merge",
              } as ThinkingSettings);
            },
          },
        ];

      default:
        return [];
    }
  }, [category]);
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Category tab component.
 */
function CategoryTab({
  category,
  isSelected,
}: {
  category: SettingCategory;
  isSelected: boolean;
}): React.ReactElement {
  const { theme } = useTheme();

  return (
    <Box paddingX={1}>
      <Text
        color={isSelected ? theme.colors.primary : theme.colors.muted}
        bold={isSelected}
        underline={isSelected}
      >
        {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
      </Text>
    </Box>
  );
}

/**
 * Setting row component.
 */
function SettingRow({
  item,
  isSelected,
  isEditing,
  editValue,
}: {
  item: SettingItem;
  isSelected: boolean;
  isEditing: boolean;
  editValue?: string;
}): React.ReactElement {
  const { theme } = useTheme();

  const displayValue = useMemo(() => {
    if (isEditing && editValue !== undefined) {
      return editValue;
    }

    if (typeof item.value === "boolean") {
      return item.value ? "✓ On" : "✗ Off";
    }

    return String(item.value);
  }, [item.value, isEditing, editValue]);

  const editableIndicator = item.editable ? " ✏️" : "";

  return (
    <Box paddingY={0}>
      <Box width={24}>
        <Text color={isSelected ? theme.colors.primary : theme.colors.muted} bold={isSelected}>
          {isSelected ? "▶ " : "  "}
          {item.label}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={isEditing ? theme.colors.info : theme.colors.muted} bold={isEditing}>
          {displayValue}
          {editableIndicator}
        </Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SettingsPanel - Interactive settings management component.
 *
 * Features:
 * - Category navigation with left/right arrows or Tab
 * - Setting navigation with up/down arrows or j/k
 * - Enter to edit (for editable settings)
 * - Esc to close panel or cancel edit
 * - Real-time setting updates
 *
 * @example
 * ```tsx
 * function App() {
 *   const [showSettings, setShowSettings] = useState(false);
 *
 *   return (
 *     <>
 *       {showSettings && (
 *         <SettingsPanel
 *           isActive
 *           onClose={() => setShowSettings(false)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function SettingsPanel({
  isActive = true,
  onClose,
  initialCategory = "general",
}: SettingsPanelProps): React.ReactElement {
  const { theme } = useTheme();

  // State
  const [categoryIndex, setCategoryIndex] = useState(() =>
    Math.max(0, CATEGORIES.indexOf(initialCategory))
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const currentCategory = CATEGORIES[categoryIndex] ?? "general";
  const items = useSettingsItems(currentCategory);

  // Navigation handlers
  const navigateCategory = useCallback((direction: 1 | -1) => {
    setCategoryIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return CATEGORIES.length - 1;
      if (next >= CATEGORIES.length) return 0;
      return next;
    });
    setSelectedIndex(0);
    setIsEditing(false);
  }, []);

  const navigateItem = useCallback(
    (direction: 1 | -1) => {
      setSelectedIndex((prev) => {
        const next = prev + direction;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
    },
    [items.length]
  );

  const startEdit = useCallback(() => {
    const item = items[selectedIndex];
    if (!item?.editable) return;

    setIsEditing(true);
    setEditValue(String(item.value));
  }, [items, selectedIndex]);

  const confirmEdit = useCallback(() => {
    const item = items[selectedIndex];
    if (!item?.editable || !item.onChange) {
      setIsEditing(false);
      return;
    }

    let newValue: string | number | boolean = editValue;

    // Convert based on type
    switch (item.type) {
      case "boolean":
        newValue =
          editValue.toLowerCase() === "true" ||
          editValue.toLowerCase() === "on" ||
          editValue === "1";
        break;
      case "number":
        newValue = parseFloat(editValue) || 0;
        break;
      case "select":
        // Validate against options
        if (item.options && !item.options.includes(editValue)) {
          // Find closest match or keep current
          const match = item.options.find((opt) =>
            opt.toLowerCase().startsWith(editValue.toLowerCase())
          );
          newValue = match ?? item.value;
        }
        break;
    }

    item.onChange(newValue);
    setIsEditing(false);
  }, [items, selectedIndex, editValue]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const cycleValue = useCallback(() => {
    const item = items[selectedIndex];
    if (!item?.editable || !item.onChange) return;

    if (item.type === "boolean") {
      item.onChange(!item.value);
    } else if (item.type === "select" && item.options) {
      const currentIdx = item.options.indexOf(String(item.value));
      const nextIdx = (currentIdx + 1) % item.options.length;
      item.onChange(item.options[nextIdx]!);
    }
  }, [items, selectedIndex]);

  // Keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        if (!isActive) return;

        if (isEditing) {
          // Editing mode
          if (key.escape) {
            cancelEdit();
            return;
          }
          if (key.return) {
            confirmEdit();
            return;
          }
          if (key.backspace || key.delete) {
            setEditValue((prev) => prev.slice(0, -1));
            return;
          }
          if (input && !key.ctrl && !key.meta) {
            setEditValue((prev) => prev + input);
          }
          return;
        }

        // Navigation mode
        if (key.escape) {
          onClose?.();
          return;
        }

        if (key.leftArrow || (key.shift && key.tab)) {
          navigateCategory(-1);
          return;
        }

        if (key.rightArrow || key.tab) {
          navigateCategory(1);
          return;
        }

        if (key.upArrow || input === "k") {
          navigateItem(-1);
          return;
        }

        if (key.downArrow || input === "j") {
          navigateItem(1);
          return;
        }

        if (key.return) {
          startEdit();
          return;
        }

        if (input === " ") {
          cycleValue();
          return;
        }
      },
      [
        isActive,
        isEditing,
        navigateCategory,
        navigateItem,
        startEdit,
        cycleValue,
        confirmEdit,
        cancelEdit,
        onClose,
      ]
    )
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.semantic.border.default}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          ⚙️ Settings
        </Text>
        <Box flexGrow={1} />
        <Text color={theme.colors.muted} dimColor>
          Esc to close
        </Text>
      </Box>

      {/* Category Tabs */}
      <Box flexDirection="row" marginBottom={1}>
        {CATEGORIES.map((cat, idx) => (
          <CategoryTab key={cat} category={cat} isSelected={idx === categoryIndex} />
        ))}
      </Box>

      {/* Settings List */}
      <Box flexDirection="column" paddingLeft={1}>
        {items.map((item, idx) => (
          <SettingRow
            key={item.key}
            item={item}
            isSelected={idx === selectedIndex}
            isEditing={isEditing && idx === selectedIndex}
            editValue={isEditing && idx === selectedIndex ? editValue : undefined}
          />
        ))}
      </Box>

      {/* Footer with hints */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.semantic.border.default}
      >
        <Text color={theme.colors.muted} dimColor>
          {isEditing
            ? "Enter: confirm | Esc: cancel"
            : "←/→: category | ↑/↓: navigate | Enter: edit | Space: toggle"}
        </Text>
      </Box>
    </Box>
  );
}

export default SettingsPanel;

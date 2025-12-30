/**
 * ToolParams Component (T028)
 *
 * Renders tool parameters as a collapsible JSON tree structure with
 * syntax highlighting for different value types and special formatting
 * for file paths and shell commands.
 *
 * @module tui/components/Tools/ToolParams
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ToolParams component.
 */
export interface ToolParamsProps {
  /** The parameters object to render */
  readonly params: Record<string, unknown>;
  /** Whether to show collapsed view (default: false) */
  readonly collapsed?: boolean;
  /** Maximum depth to render nested objects (default: 10) */
  readonly maxDepth?: number;
  /** Highlight file paths with special styling (default: false) */
  readonly highlightPaths?: boolean;
  /** Highlight shell commands with special styling (default: false) */
  readonly highlightCommands?: boolean;
}

/**
 * Internal props for recursive value rendering.
 */
interface ValueRenderProps {
  /** The value to render */
  readonly value: unknown;
  /** The key name (for detecting command keys) */
  readonly keyName?: string;
  /** Current depth in the tree */
  readonly depth: number;
  /** Maximum depth to render */
  readonly maxDepth: number;
  /** Whether to highlight file paths */
  readonly highlightPaths: boolean;
  /** Whether to highlight commands */
  readonly highlightCommands: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Base indentation per depth level */
const INDENT_SPACES = 2;

/** Keys that typically contain shell commands */
const COMMAND_KEYS = new Set(["command", "cmd", "shell", "script", "exec", "run", "execute"]);

/** File path patterns to detect */
const PATH_PATTERNS = [
  // Unix-style absolute paths
  /^\/[\w\-./]+$/,
  // Windows-style paths
  /^[A-Za-z]:[\\/][\w\-.\\/]+$/,
  // Relative paths starting with ./ or ../
  /^\.\.?\/[\w\-./]+$/,
  // Common file extensions
  /\.(ts|tsx|js|jsx|json|md|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|html|xml|yaml|yml|toml|sh|bash|zsh|ps1|cmd|bat)$/i,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a string looks like a file path.
 *
 * @param value - The string to check
 * @returns true if the string appears to be a file path
 */
function isFilePath(value: string): boolean {
  return PATH_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Check if a key name indicates a command.
 *
 * @param key - The key name to check
 * @returns true if the key likely contains a command
 */
function isCommandKey(key: string): boolean {
  return COMMAND_KEYS.has(key.toLowerCase());
}

/**
 * Get the type name of a value for display.
 *
 * @param value - The value to check
 * @returns The type name string
 */
function getTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Create indentation string for a given depth.
 *
 * @param depth - The current depth level
 * @returns Indentation string
 */
function indent(depth: number): string {
  return " ".repeat(depth * INDENT_SPACES);
}

// =============================================================================
// Value Renderer Components
// =============================================================================

/**
 * Renders a null value.
 */
function NullValue(): React.JSX.Element {
  const { theme } = useTheme();
  return <Text color={theme.semantic.text.muted}>null</Text>;
}

/**
 * Renders a boolean value.
 */
function BooleanValue({ value }: { readonly value: boolean }): React.JSX.Element {
  const { theme } = useTheme();
  return <Text color={theme.colors.warning}>{String(value)}</Text>;
}

/**
 * Renders a number value.
 */
function NumberValue({ value }: { readonly value: number }): React.JSX.Element {
  const { theme } = useTheme();
  return <Text color={theme.colors.info}>{String(value)}</Text>;
}

/**
 * Renders a string value with optional path/command highlighting.
 */
function StringValue({
  value,
  keyName,
  highlightPaths,
  highlightCommands,
}: {
  readonly value: string;
  readonly keyName?: string;
  readonly highlightPaths: boolean;
  readonly highlightCommands: boolean;
}): React.JSX.Element {
  const { theme } = useTheme();

  // Check for command highlighting
  if (highlightCommands && keyName && isCommandKey(keyName)) {
    return (
      <Text color={theme.colors.accent} italic>
        "{value}"
      </Text>
    );
  }

  // Check for path highlighting
  if (highlightPaths && isFilePath(value)) {
    return (
      <Text color={theme.semantic.syntax.function} underline>
        "{value}"
      </Text>
    );
  }

  // Default string rendering
  return <Text color={theme.colors.success}>"{value}"</Text>;
}

/**
 * Renders an array value with proper formatting.
 */
function ArrayValue({
  value,
  depth,
  maxDepth,
  highlightPaths,
  highlightCommands,
}: {
  readonly value: unknown[];
  readonly depth: number;
  readonly maxDepth: number;
  readonly highlightPaths: boolean;
  readonly highlightCommands: boolean;
}): React.JSX.Element {
  const { theme } = useTheme();
  const mutedColor = theme.semantic.text.muted;

  // Max depth reached - show collapsed
  if (depth >= maxDepth) {
    return <Text color={mutedColor}>[{value.length} items...]</Text>;
  }

  // Empty array
  if (value.length === 0) {
    return <Text color={mutedColor}>[]</Text>;
  }

  const childIndent = indent(depth + 1);
  const closeIndent = indent(depth);

  return (
    <Box flexDirection="column">
      <Text color={mutedColor}>[</Text>
      {value.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Array order is stable in JSON params
        <Box key={index}>
          <Text>{childIndent}</Text>
          <ValueRenderer
            value={item}
            depth={depth + 1}
            maxDepth={maxDepth}
            highlightPaths={highlightPaths}
            highlightCommands={highlightCommands}
          />
          {index < value.length - 1 && <Text color={mutedColor}>,</Text>}
        </Box>
      ))}
      <Text color={mutedColor}>{closeIndent}]</Text>
    </Box>
  );
}

/**
 * Renders an object value with proper formatting.
 */
function ObjectValue({
  value,
  depth,
  maxDepth,
  highlightPaths,
  highlightCommands,
}: {
  readonly value: Record<string, unknown>;
  readonly depth: number;
  readonly maxDepth: number;
  readonly highlightPaths: boolean;
  readonly highlightCommands: boolean;
}): React.JSX.Element {
  const { theme } = useTheme();
  const mutedColor = theme.semantic.text.muted;
  const keyColor = theme.semantic.text.primary;

  const entries = Object.entries(value);

  // Max depth reached - show collapsed
  if (depth >= maxDepth) {
    return (
      <Text color={mutedColor}>
        {"{"}...{entries.length} keys{"}"}
      </Text>
    );
  }

  // Empty object
  if (entries.length === 0) {
    return <Text color={mutedColor}>{"{}"}</Text>;
  }

  const childIndent = indent(depth + 1);
  const closeIndent = indent(depth);

  return (
    <Box flexDirection="column">
      <Text color={mutedColor}>{"{"}</Text>
      {entries.map(([key, val], index) => (
        <Box key={key}>
          <Text>{childIndent}</Text>
          <Text bold color={keyColor}>
            {key}
          </Text>
          <Text color={mutedColor}>: </Text>
          <ValueRenderer
            value={val}
            keyName={key}
            depth={depth + 1}
            maxDepth={maxDepth}
            highlightPaths={highlightPaths}
            highlightCommands={highlightCommands}
          />
          {index < entries.length - 1 && <Text color={mutedColor}>,</Text>}
        </Box>
      ))}
      <Text color={mutedColor}>
        {closeIndent}
        {"}"}
      </Text>
    </Box>
  );
}

/**
 * Main value renderer that dispatches to type-specific renderers.
 */
function ValueRenderer({
  value,
  keyName,
  depth,
  maxDepth,
  highlightPaths,
  highlightCommands,
}: ValueRenderProps): React.JSX.Element {
  const { theme } = useTheme();

  // Handle null
  if (value === null) {
    return <NullValue />;
  }

  // Handle undefined (treat as null)
  if (value === undefined) {
    return <Text color={theme.semantic.text.muted}>undefined</Text>;
  }

  // Handle primitive types
  const type = getTypeName(value);

  switch (type) {
    case "boolean":
      return <BooleanValue value={value as boolean} />;

    case "number":
      return <NumberValue value={value as number} />;

    case "string":
      return (
        <StringValue
          value={value as string}
          keyName={keyName}
          highlightPaths={highlightPaths}
          highlightCommands={highlightCommands}
        />
      );

    case "array":
      return (
        <ArrayValue
          value={value as unknown[]}
          depth={depth}
          maxDepth={maxDepth}
          highlightPaths={highlightPaths}
          highlightCommands={highlightCommands}
        />
      );

    case "object":
      return (
        <ObjectValue
          value={value as Record<string, unknown>}
          depth={depth}
          maxDepth={maxDepth}
          highlightPaths={highlightPaths}
          highlightCommands={highlightCommands}
        />
      );

    default:
      // For functions, symbols, etc.
      return <Text color={theme.semantic.text.muted}>[{type}]</Text>;
  }
}

// =============================================================================
// Collapsed View
// =============================================================================

/**
 * Renders a collapsed summary of the params object.
 */
function CollapsedView({
  params,
}: {
  readonly params: Record<string, unknown>;
}): React.JSX.Element {
  const { theme } = useTheme();
  const keys = Object.keys(params);
  const keyCount = keys.length;

  if (keyCount === 0) {
    return <Text color={theme.semantic.text.muted}>{"{}"}</Text>;
  }

  // Show first few keys as preview
  const previewKeys = keys.slice(0, 3);
  const hasMore = keyCount > 3;

  return (
    <Box>
      <Text color={theme.semantic.text.muted}>{"{ "}</Text>
      {previewKeys.map((key, index) => (
        <Box key={key}>
          <Text bold color={theme.semantic.text.primary}>
            {key}
          </Text>
          {index < previewKeys.length - 1 && <Text color={theme.semantic.text.muted}>, </Text>}
        </Box>
      ))}
      {hasMore && <Text color={theme.semantic.text.muted}>, ...+{keyCount - 3}</Text>}
      <Text color={theme.semantic.text.muted}>{" }"}</Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ToolParams displays tool parameters as a formatted JSON tree.
 *
 * Features:
 * - Collapsible tree structure for nested objects/arrays
 * - Type-specific color coding:
 *   - Keys: bold primary text
 *   - Strings: green
 *   - Numbers: cyan/info
 *   - Booleans: yellow/warning
 *   - Null: muted/dim
 * - Optional file path highlighting (underlined)
 * - Optional command highlighting (italic accent)
 * - Proper indentation for nested structures
 * - Collapsed mode shows key preview
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ToolParams params={{ name: "test", count: 42 }} />
 *
 * // With path highlighting
 * <ToolParams
 *   params={{ filePath: "/src/index.ts" }}
 *   highlightPaths
 * />
 *
 * // Collapsed view
 * <ToolParams params={largeObject} collapsed />
 *
 * // Limited depth
 * <ToolParams params={deepObject} maxDepth={3} />
 * ```
 */
export function ToolParams({
  params,
  collapsed = false,
  maxDepth = 10,
  highlightPaths = false,
  highlightCommands = false,
}: ToolParamsProps): React.JSX.Element {
  // Collapsed mode - show summary
  if (collapsed) {
    return <CollapsedView params={params} />;
  }

  // Full tree rendering
  return (
    <ObjectValue
      value={params}
      depth={0}
      maxDepth={maxDepth}
      highlightPaths={highlightPaths}
      highlightCommands={highlightCommands}
    />
  );
}

export default ToolParams;

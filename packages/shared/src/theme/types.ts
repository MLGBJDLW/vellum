/**
 * Theme Type Definitions
 *
 * Provides comprehensive type definitions for the Vellum theming system.
 * All theme interfaces are designed for TUI (Terminal UI) rendering with
 * support for dark/light modes, accessibility presets, and semantic colors.
 *
 * @module theme
 */

// =============================================================================
// Color Types
// =============================================================================

/**
 * Valid color formats for terminal rendering
 *
 * Supports:
 * - Named colors (e.g., 'red', 'cyan')
 * - Hex colors (e.g., '#ff5500', '#f50')
 * - RGB strings (e.g., 'rgb(255, 85, 0)')
 * - ANSI 256 colors (e.g., 'ansi256(214)')
 */
export type Color = string;

/**
 * Core color palette for the theme
 *
 * Defines the base color tokens used throughout the application.
 * Each color should have sufficient contrast for terminal readability.
 */
export interface ThemeColors {
  /** Primary brand color - used for highlights and key actions */
  readonly primary: Color;

  /** Secondary brand color - used for supporting elements */
  readonly secondary: Color;

  /** Success state color - used for confirmations and completions */
  readonly success: Color;

  /** Error state color - used for failures and critical warnings */
  readonly error: Color;

  /** Warning state color - used for cautions and non-critical alerts */
  readonly warning: Color;

  /** Informational color - used for neutral information */
  readonly info: Color;

  /** Muted color - used for disabled or de-emphasized content */
  readonly muted: Color;

  /** Accent color - used for interactive element highlights */
  readonly accent: Color;
}

// =============================================================================
// Semantic Color Types
// =============================================================================

/**
 * Role-specific text colors for different message types
 */
export interface TextRoleColors {
  /** Color for user-authored messages */
  readonly user: Color;

  /** Color for assistant/AI responses */
  readonly assistant: Color;

  /** Color for system messages and notifications */
  readonly system: Color;

  /** Color for tool execution output */
  readonly tool: Color;
}

/**
 * Semantic color mappings for contextual styling
 *
 * These colors are derived from ThemeColors but provide
 * semantic meaning for specific UI contexts.
 */
export interface SemanticColors {
  /** Text colors for various roles and states */
  readonly text: {
    /** Primary text color - main content */
    readonly primary: Color;

    /** Secondary text color - supporting content */
    readonly secondary: Color;

    /** Muted text color - de-emphasized content */
    readonly muted: Color;

    /** Inverted text color - for contrast backgrounds */
    readonly inverted: Color;

    /** Role-specific colors for message display */
    readonly role: TextRoleColors;
  };

  /** Background colors for various contexts */
  readonly background: {
    /** Primary background color */
    readonly primary: Color;

    /** Secondary background color - panels, cards */
    readonly secondary: Color;

    /** Elevated background color - dialogs, overlays */
    readonly elevated: Color;

    /** Code block background color */
    readonly code: Color;
  };

  /** Border colors for various contexts */
  readonly border: {
    /** Default border color */
    readonly default: Color;

    /** Focused element border color */
    readonly focus: Color;

    /** Muted border color */
    readonly muted: Color;
  };

  /** Status indicator colors */
  readonly status: {
    /** Pending/loading state color */
    readonly pending: Color;

    /** Running/active state color */
    readonly running: Color;

    /** Complete/success state color */
    readonly complete: Color;

    /** Error/failed state color */
    readonly error: Color;

    /** Approved state color */
    readonly approved: Color;

    /** Rejected state color */
    readonly rejected: Color;
  };

  /** Syntax highlighting colors for code blocks */
  readonly syntax: {
    /** Keywords (if, else, return, etc.) */
    readonly keyword: Color;

    /** String literals */
    readonly string: Color;

    /** Numeric literals */
    readonly number: Color;

    /** Comments */
    readonly comment: Color;

    /** Function names */
    readonly function: Color;

    /** Variable names */
    readonly variable: Color;

    /** Type annotations */
    readonly type: Color;

    /** Operators (+, -, =, etc.) */
    readonly operator: Color;

    /** Punctuation (brackets, semicolons) */
    readonly punctuation: Color;
  };

  /** Diff view colors */
  readonly diff: {
    /** Added line background */
    readonly added: Color;

    /** Removed line background */
    readonly removed: Color;

    /** Changed line background */
    readonly changed: Color;

    /** Unchanged context background */
    readonly context: Color;
  };
}

// =============================================================================
// Border Types
// =============================================================================

/**
 * Border radius values
 *
 * Note: Terminal UIs have limited border radius support.
 * These values are primarily for semantic purposes and
 * may be interpreted as character-based borders.
 */
export interface BorderRadius {
  /** No rounding */
  readonly none: number;

  /** Small rounding - subtle corners */
  readonly sm: number;

  /** Medium rounding - default for most elements */
  readonly md: number;

  /** Large rounding - pronounced curves */
  readonly lg: number;

  /** Full rounding - pill shapes */
  readonly full: number;
}

/**
 * Border width values in characters/pixels
 */
export interface BorderWidth {
  /** No border */
  readonly none: number;

  /** Thin border - 1 character */
  readonly thin: number;

  /** Medium border - 2 characters */
  readonly medium: number;

  /** Thick border - 3+ characters */
  readonly thick: number;
}

/**
 * Border character sets for different styles
 */
export interface BorderCharacters {
  /** Top-left corner character */
  readonly topLeft: string;

  /** Top-right corner character */
  readonly topRight: string;

  /** Bottom-left corner character */
  readonly bottomLeft: string;

  /** Bottom-right corner character */
  readonly bottomRight: string;

  /** Horizontal line character */
  readonly horizontal: string;

  /** Vertical line character */
  readonly vertical: string;
}

/**
 * Border style definitions
 *
 * Includes various border styles with their character sets
 * for box-drawing in terminal interfaces.
 */
export interface ThemeBorders {
  /** Border radius values */
  readonly radius: BorderRadius;

  /** Border width values */
  readonly width: BorderWidth;

  /** Single-line border characters */
  readonly single: BorderCharacters;

  /** Double-line border characters */
  readonly double: BorderCharacters;

  /** Rounded border characters */
  readonly rounded: BorderCharacters;

  /** Bold/heavy border characters */
  readonly bold: BorderCharacters;
}

// =============================================================================
// Spacing Types
// =============================================================================

/**
 * Spacing scale values
 *
 * Consistent spacing tokens for layout and composition.
 * Values represent character/cell counts in terminal context.
 */
export interface ThemeSpacing {
  /** No spacing */
  readonly none: number;

  /** Extra small spacing - 1 character */
  readonly xs: number;

  /** Small spacing - 2 characters */
  readonly sm: number;

  /** Medium spacing - 4 characters */
  readonly md: number;

  /** Large spacing - 8 characters */
  readonly lg: number;

  /** Extra large spacing - 16 characters */
  readonly xl: number;
}

// =============================================================================
// Animation Types
// =============================================================================

/**
 * Spinner frame sequences for loading indicators
 */
export interface SpinnerFrames {
  /** Dot spinner frames */
  readonly dots: readonly string[];

  /** Line spinner frames */
  readonly line: readonly string[];

  /** Arc spinner frames */
  readonly arc: readonly string[];

  /** Bounce spinner frames */
  readonly bounce: readonly string[];
}

/**
 * Animation timing configuration
 */
export interface ThemeAnimation {
  /** Spinner frame sequences */
  readonly spinner: SpinnerFrames;

  /** Frame interval in milliseconds */
  readonly frameInterval: number;

  /** Cursor blink interval in milliseconds */
  readonly cursorBlink: number;
}

// =============================================================================
// Icon Types
// =============================================================================

/**
 * Icon/symbol mappings for various UI elements
 *
 * Uses Unicode symbols that render well in most terminals.
 */
export interface ThemeIcons {
  /** Success indicator */
  readonly success: string;

  /** Error indicator */
  readonly error: string;

  /** Warning indicator */
  readonly warning: string;

  /** Info indicator */
  readonly info: string;

  /** Pending/loading indicator */
  readonly pending: string;

  /** Checkbox checked */
  readonly checked: string;

  /** Checkbox unchecked */
  readonly unchecked: string;

  /** Collapsed/right arrow */
  readonly collapsed: string;

  /** Expanded/down arrow */
  readonly expanded: string;

  /** User message indicator */
  readonly user: string;

  /** Assistant message indicator */
  readonly assistant: string;

  /** Tool indicator */
  readonly tool: string;

  /** Edit/pencil indicator */
  readonly edit: string;

  /** Copy indicator */
  readonly copy: string;
}

// =============================================================================
// Main Theme Interface
// =============================================================================

/**
 * Theme mode identifier
 */
export type ThemeMode = "dark" | "light";

/**
 * Built-in theme preset names
 */
export const THEME_PRESETS = [
  "dark",
  "light",
  "dracula",
  "github-dark",
  "github-light",
  "monokai",
  "nord",
  "solarized-dark",
  "solarized-light",
  "high-contrast",
] as const;

/**
 * Theme preset type derived from const array
 */
export type ThemePreset = (typeof THEME_PRESETS)[number];

/**
 * Main theme interface containing all theme properties
 *
 * This is the root theme object that provides complete styling
 * configuration for the Vellum TUI. Themes can be created from
 * presets or custom configurations.
 *
 * @example
 * ```typescript
 * const darkTheme: VellumTheme = {
 *   name: 'dark',
 *   mode: 'dark',
 *   colors: { primary: '#7c3aed', ... },
 *   semantic: { text: { primary: '#ffffff', ... }, ... },
 *   borders: { radius: { none: 0, ... }, ... },
 *   spacing: { none: 0, xs: 1, ... },
 *   animation: { spinner: { dots: [...] }, ... },
 *   icons: { success: '✓', error: '✗', ... },
 * };
 * ```
 */
export interface VellumTheme {
  /** Unique theme identifier */
  readonly name: string;

  /** Theme mode (affects system-level styling) */
  readonly mode: ThemeMode;

  /** Core color palette */
  readonly colors: ThemeColors;

  /** Semantic color mappings */
  readonly semantic: SemanticColors;

  /** Border style definitions */
  readonly borders: ThemeBorders;

  /** Spacing scale */
  readonly spacing: ThemeSpacing;

  /** Animation configuration */
  readonly animation: ThemeAnimation;

  /** Icon/symbol mappings */
  readonly icons: ThemeIcons;
}

// =============================================================================
// Theme Utilities
// =============================================================================

/**
 * Partial theme for creating theme overrides
 *
 * Allows specifying only the properties to override
 * when extending a base theme.
 */
export type PartialTheme = {
  readonly [K in keyof VellumTheme]?: VellumTheme[K] extends object
    ? Partial<VellumTheme[K]>
    : VellumTheme[K];
};

/**
 * Theme creation options
 */
export interface ThemeOptions {
  /** Base theme to extend */
  readonly base?: ThemePreset | VellumTheme;

  /** Overrides to apply */
  readonly overrides?: PartialTheme;
}

/**
 * Theme context value for React context
 */
export interface ThemeContextValue {
  /** Current active theme */
  readonly theme: VellumTheme;

  /** Current theme name */
  readonly themeName: string;

  /** Set theme by name or object */
  readonly setTheme: (theme: ThemePreset | VellumTheme) => void;

  /** Toggle between dark and light modes */
  readonly toggleMode: () => void;
}

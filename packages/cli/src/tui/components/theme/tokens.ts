/**
 * Design Tokens
 *
 * Core design tokens for the Vellum TUI component system.
 * These tokens provide a foundation for consistent styling
 * across all TUI components.
 *
 * Terminal-compatible colors and spacing values.
 *
 * @module tui/components/theme/tokens
 */

// =============================================================================
// Color Tokens
// =============================================================================

/**
 * Core color palette
 *
 * Terminal-compatible hex colors that work well in both
 * dark and light terminal backgrounds.
 */
export const colors = {
  /** Primary brand color - purple accent */
  primary: "#7C3AED",

  /** Secondary color - subtle gray */
  secondary: "#6B7280",

  /** Success state - green */
  success: "#10B981",

  /** Warning state - amber */
  warning: "#F59E0B",

  /** Error state - red */
  error: "#EF4444",

  /** Muted/disabled - light gray */
  muted: "#9CA3AF",

  /** Info state - blue */
  info: "#3B82F6",

  /** Accent highlight - indigo */
  accent: "#6366F1",
} as const;

/**
 * Semantic text colors
 */
export const textColors = {
  /** Primary text - high contrast */
  primary: "#FFFFFF",

  /** Secondary text - medium emphasis */
  secondary: "#D1D5DB",

  /** Muted text - low emphasis */
  muted: "#9CA3AF",

  /** Inverted text - for light backgrounds */
  inverted: "#111827",

  /** User message color */
  user: "#60A5FA",

  /** Assistant message color - bright white for readability */
  assistant: "#ffffff",

  /** System message color */
  system: "#9CA3AF",

  /** Tool output color */
  tool: "#34D399",
} as const;

/**
 * Background colors
 */
export const backgroundColors = {
  /** Primary background */
  primary: "#111827",

  /** Secondary background - panels */
  secondary: "#1F2937",

  /** Elevated background - dialogs */
  elevated: "#374151",

  /** Code block background */
  code: "#0D1117",
} as const;

/**
 * Border colors
 */
export const borderColors = {
  /** Default border */
  default: "#374151",

  /** Focused element border */
  focus: "#7C3AED",

  /** Muted border */
  muted: "#1F2937",
} as const;

/**
 * Status indicator colors
 */
export const statusColors = {
  /** Pending/loading state */
  pending: "#F59E0B",

  /** Running/active state */
  running: "#3B82F6",

  /** Complete/success state */
  complete: "#10B981",

  /** Error/failed state */
  error: "#EF4444",

  /** Approved state */
  approved: "#10B981",

  /** Rejected state */
  rejected: "#EF4444",
} as const;

// =============================================================================
// Spacing Tokens
// =============================================================================

/**
 * Spacing scale values
 *
 * Values represent character/cell counts in terminal context.
 * Used for padding, margins, and gaps.
 */
export const spacing = {
  /** No spacing (0) */
  none: 0,

  /** Extra small (1 character) */
  xs: 1,

  /** Small (2 characters) */
  sm: 2,

  /** Medium (4 characters) */
  md: 4,

  /** Large (8 characters) */
  lg: 8,

  /** Extra large (16 characters) */
  xl: 16,
} as const;

// =============================================================================
// Typography Tokens
// =============================================================================

/**
 * Font size scale
 *
 * In terminal context, "size" typically maps to
 * emphasis through styling rather than actual size.
 * These values can be used for responsive layouts.
 */
export const fontSizes = {
  /** Extra small - footnotes */
  xs: 10,

  /** Small - captions */
  sm: 12,

  /** Base size - body text */
  md: 14,

  /** Large - headings */
  lg: 16,

  /** Extra large - titles */
  xl: 20,

  /** Double extra large - hero text */
  xxl: 24,
} as const;

/**
 * Font weight scale
 *
 * Terminal support varies, but these semantic
 * values enable styling in supporting terminals.
 */
export const fontWeights = {
  /** Light weight (300) */
  light: 300,

  /** Normal weight (400) */
  normal: 400,

  /** Medium weight (500) */
  medium: 500,

  /** Semibold weight (600) */
  semibold: 600,

  /** Bold weight (700) */
  bold: 700,
} as const;

/**
 * Line height scale
 */
export const lineHeights = {
  /** Tight - compact text */
  tight: 1.25,

  /** Normal - body text */
  normal: 1.5,

  /** Relaxed - spacious text */
  relaxed: 1.75,
} as const;

// =============================================================================
// Border Tokens
// =============================================================================

/**
 * Border radius values
 *
 * In terminal, these map to character-based borders.
 */
export const borderRadius = {
  /** No rounding */
  none: 0,

  /** Small rounding */
  sm: 1,

  /** Medium rounding */
  md: 2,

  /** Large rounding */
  lg: 4,

  /** Full rounding - pill shapes */
  full: 999,
} as const;

/**
 * Border width values
 */
export const borderWidth = {
  /** No border */
  none: 0,

  /** Thin border (1 character) */
  thin: 1,

  /** Medium border (2 characters) */
  medium: 2,

  /** Thick border (3+ characters) */
  thick: 3,
} as const;

/**
 * Box-drawing characters for single-line borders
 */
export const borderCharsSingle = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
} as const;

/**
 * Box-drawing characters for double-line borders
 */
export const borderCharsDouble = {
  topLeft: "╔",
  topRight: "╗",
  bottomLeft: "╚",
  bottomRight: "╝",
  horizontal: "═",
  vertical: "║",
} as const;

/**
 * Box-drawing characters for rounded borders
 */
export const borderCharsRounded = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
} as const;

/**
 * Box-drawing characters for bold borders
 */
export const borderCharsBold = {
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  vertical: "┃",
} as const;

// =============================================================================
// Animation Tokens
// =============================================================================

/**
 * Spinner frame sequences
 */
export const spinnerFrames = {
  /** Braille dots spinner */
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],

  /** Simple line spinner */
  line: ["-", "\\", "|", "/"],

  /** Arc spinner */
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],

  /** Bounce spinner */
  bounce: ["⠁", "⠂", "⠄", "⠂"],
} as const;

/**
 * Animation timing values (milliseconds)
 */
export const animationTiming = {
  /** Spinner frame interval */
  frameInterval: 80,

  /** Cursor blink interval */
  cursorBlink: 530,

  /** Fast transition */
  fast: 150,

  /** Normal transition */
  normal: 300,

  /** Slow transition */
  slow: 500,
} as const;

// =============================================================================
// Icon Tokens
// =============================================================================

/**
 * Status and UI icons
 */
export const icons = {
  /** Success indicator */
  success: "✓",

  /** Error indicator */
  error: "✗",

  /** Warning indicator */
  warning: "⚠",

  /** Info indicator */
  info: "ℹ",

  /** Pending indicator */
  pending: "○",

  /** Checked checkbox */
  checked: "☑",

  /** Unchecked checkbox */
  unchecked: "☐",

  /** Collapsed/right arrow */
  collapsed: "▸",

  /** Expanded/down arrow */
  expanded: "▾",

  /** User icon */
  user: "@",

  /** Assistant/AI icon */
  assistant: "*",

  /** Tool icon */
  tool: ">",

  /** Edit/pencil icon */
  edit: "~",

  /** Copy icon */
  copy: "#",

  /** Loading/spinner placeholder */
  loading: "◌",

  /** Arrow right */
  arrowRight: "→",

  /** Arrow left */
  arrowLeft: "←",

  /** Arrow up */
  arrowUp: "↑",

  /** Arrow down */
  arrowDown: "↓",
} as const;

// =============================================================================
// TUI Configuration (ENV Overrides)
// =============================================================================

/**
 * Parse a numeric environment variable with fallback.
 * Returns the default value if ENV is not set, empty, or NaN.
 */
function parseEnvNumber(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = Number(envVar);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * TUI Configuration with environment variable overrides.
 *
 * Environment Variables:
 * - VELLUM_COMPACT_THRESHOLD: Columns threshold for compact mode (default: 60)
 * - VELLUM_SIDEBAR_WIDTH_PERCENT: Sidebar width percentage (default: 20)
 * - VELLUM_SIDEBAR_MIN_WIDTH: Minimum sidebar width in columns (default: 16)
 * - VELLUM_SIDEBAR_MAX_WIDTH: Maximum sidebar width in columns (default: 60)
 * - VELLUM_RESERVED_LINES: Lines reserved for UI elements (default: 10)
 * - VELLUM_DEFAULT_ROWS: Default terminal rows fallback (default: 24)
 * - VELLUM_PASTE_TIMEOUT: Paste timeout in milliseconds (default: 30000)
 */
export const tuiConfig = {
  layout: {
    compactThreshold: parseEnvNumber(process.env.VELLUM_COMPACT_THRESHOLD, 60),
    sidebarWidthPercent: parseEnvNumber(process.env.VELLUM_SIDEBAR_WIDTH_PERCENT, 20),
    sidebarMinWidth: parseEnvNumber(process.env.VELLUM_SIDEBAR_MIN_WIDTH, 16),
    sidebarMaxWidth: parseEnvNumber(process.env.VELLUM_SIDEBAR_MAX_WIDTH, 60),
  },
  virtualization: {
    reservedLines: parseEnvNumber(process.env.VELLUM_RESERVED_LINES, 10),
    defaultRows: parseEnvNumber(process.env.VELLUM_DEFAULT_ROWS, 24),
  },
  paste: {
    timeoutMs: parseEnvNumber(process.env.VELLUM_PASTE_TIMEOUT, 30_000),
  },
} as const;

export type TuiConfig = typeof tuiConfig;

// =============================================================================
// Type Exports
// =============================================================================

/** Color token keys */
export type ColorToken = keyof typeof colors;

/** Text color token keys */
export type TextColorToken = keyof typeof textColors;

/** Background color token keys */
export type BackgroundColorToken = keyof typeof backgroundColors;

/** Border color token keys */
export type BorderColorToken = keyof typeof borderColors;

/** Status color token keys */
export type StatusColorToken = keyof typeof statusColors;

/** Spacing token keys */
export type SpacingToken = keyof typeof spacing;

/** Font size token keys */
export type FontSizeToken = keyof typeof fontSizes;

/** Font weight token keys */
export type FontWeightToken = keyof typeof fontWeights;

/** Line height token keys */
export type LineHeightToken = keyof typeof lineHeights;

/** Icon token keys */
export type IconToken = keyof typeof icons;

/** All design tokens grouped */
export const tokens = {
  colors,
  textColors,
  backgroundColors,
  borderColors,
  statusColors,
  spacing,
  fontSizes,
  fontWeights,
  lineHeights,
  borderRadius,
  borderWidth,
  borderCharsSingle,
  borderCharsDouble,
  borderCharsRounded,
  borderCharsBold,
  spinnerFrames,
  animationTiming,
  icons,
} as const;

export type Tokens = typeof tokens;

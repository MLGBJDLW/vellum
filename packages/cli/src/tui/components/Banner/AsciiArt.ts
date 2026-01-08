/**
 * ASCII Art Definitions for Vellum Banner
 *
 * Block-style ASCII art with ancient parchment/scroll styling.
 * Multiple sizes for responsive terminal width adaptation.
 *
 * @module tui/components/Banner/AsciiArt
 */

// =============================================================================
// Large ASCII Art (80+ columns)
// =============================================================================

/**
 * Large VELLUM ASCII Art with scroll decorations.
 * Designed for terminals 80+ columns wide.
 */
export const VELLUM_LARGE = `
    ╭─────────────────────────────────────────────────────────────────────────╮
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │                                                                   │  │
    │  │  ██╗   ██╗ ███████╗ ██╗      ██╗      ██╗   ██╗ ███╗   ███╗       │  │
    │  │  ██║   ██║ ██╔════╝ ██║      ██║      ██║   ██║ ████╗ ████║       │  │
    │  │  ██║   ██║ █████╗   ██║      ██║      ██║   ██║ ██╔████╔██║       │  │
    │  │  ╚██╗ ██╔╝ ██╔══╝   ██║      ██║      ██║   ██║ ██║╚██╔╝██║       │  │
    │  │   ╚████╔╝  ███████╗ ███████╗ ███████╗ ╚██████╔╝ ██║ ╚═╝ ██║       │  │
    │  │    ╚═══╝   ╚══════╝ ╚══════╝ ╚══════╝  ╚═════╝  ╚═╝     ╚═╝       │  │
    │  │                                                                   │  │
    │  │           ~ Ancient Wisdom for Modern Code ~                      │  │
    │  │                                                                   │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    ╰─────────────────────────────────────────────────────────────────────────╯
`.trim();

// =============================================================================
// Medium ASCII Art (60-79 columns)
// =============================================================================

/**
 * Medium VELLUM ASCII Art.
 * Designed for terminals 60-79 columns wide.
 */
export const VELLUM_MEDIUM = `
  ╭───────────────────────────────────────────────────────╮
  │ ┌─────────────────────────────────────────────────┐   │
  │ │                                                 │   │
  │ │ ██╗   ██╗███████╗██╗     ██╗     ██╗   ██╗███╗  │   │
  │ │ ██║   ██║██╔════╝██║     ██║     ██║   ██║████╗ │   │
  │ │ ██║   ██║█████╗  ██║     ██║     ██║   ██║██╔█╗ │   │
  │ │ ╚██╗ ██╔╝██╔══╝  ██║     ██║     ██║   ██║██║╚╗ │   │
  │ │  ╚████╔╝ ███████╗███████╗███████╗╚██████╔╝██║ ╚╗│   │
  │ │   ╚═══╝  ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚│   │
  │ │                                                 │   │
  │ │       ~ Ancient Wisdom for Modern Code ~        │   │
  │ └─────────────────────────────────────────────────┘   │
  ╰───────────────────────────────────────────────────────╯
`.trim();

// =============================================================================
// Small ASCII Art (40-59 columns)
// =============================================================================

/**
 * Small VELLUM ASCII Art.
 * Designed for terminals 40-59 columns wide.
 */
export const VELLUM_SMALL = `
╭────────────────────────────────────╮
│ ╔════════════════════════════════╗ │
│ ║  ╦  ╦╔═╗╦  ╦  ╦ ╦╔╦╗           ║ │
│ ║  ╚╗╔╝║╣ ║  ║  ║ ║║║║           ║ │
│ ║   ╚╝ ╚═╝╩═╝╩═╝╚═╝╩ ╩           ║ │
│ ║                                ║ │
│ ║ ~ Ancient Wisdom, Modern Code ~║ │
│ ╚════════════════════════════════╝ │
╰────────────────────────────────────╯
`.trim();

// =============================================================================
// Minimal ASCII Art (<40 columns)
// =============================================================================

/**
 * Minimal VELLUM display.
 * For very narrow terminals.
 */
export const VELLUM_MINIMAL = `
╭────────────────────╮
│ ╔════════════════╗ │
│ ║  V E L L U M   ║ │
│ ╚════════════════╝ │
╰────────────────────╯
`.trim();

// =============================================================================
// Scroll Decorations
// =============================================================================

/**
 * Top scroll decoration for parchment effect.
 */
export const SCROLL_TOP = `
    ════╣ ◊ ╠═══════════════════════════════════════════════════════════╣ ◊ ╠════
    ╔═══════════════════════════════════════════════════════════════════════════╗
`.trim();

/**
 * Bottom scroll decoration for parchment effect.
 */
export const SCROLL_BOTTOM = `
    ╚═══════════════════════════════════════════════════════════════════════════╝
    ════╣ ◊ ╠═══════════════════════════════════════════════════════════╣ ◊ ╠════
`.trim();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Select appropriate ASCII art size based on terminal width.
 *
 * @param terminalWidth - Current terminal width in columns
 * @returns Appropriate ASCII art string
 */
export function selectAsciiArt(terminalWidth: number): string {
  if (terminalWidth >= 80) {
    return VELLUM_LARGE;
  } else if (terminalWidth >= 60) {
    return VELLUM_MEDIUM;
  } else if (terminalWidth >= 40) {
    return VELLUM_SMALL;
  } else {
    return VELLUM_MINIMAL;
  }
}

/**
 * Get all ASCII art variants.
 */
export const ASCII_VARIANTS = {
  large: VELLUM_LARGE,
  medium: VELLUM_MEDIUM,
  small: VELLUM_SMALL,
  minimal: VELLUM_MINIMAL,
} as const;

export type AsciiVariant = keyof typeof ASCII_VARIANTS;

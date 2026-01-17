/**
 * Vellum Icon System
 *
 * Centralized icon management with auto-detection of terminal capabilities.
 * - Detects Nerd Font support via NERD_FONT env or config
 * - Falls back to Unicode symbols for most modern terminals
 * - ASCII as final fallback for legacy terminals
 *
 * @module theme/icons
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Complete icon set for Vellum TUI.
 */
export type IconSet = {
  // Roles
  user: string;
  assistant: string;
  system: string;
  tool: string;

  // Status
  success: string;
  error: string;
  warning: string;
  info: string;
  pending: string;
  running: string;

  // Modes
  vibe: string;
  plan: string;
  spec: string;

  // UI
  logo: string;
  chevronRight: string;
  chevronDown: string;
  bullet: string;
  check: string;
  cross: string;
  gear: string;
  cost: string;
  memory: string;
  target: string;
  note: string;

  // Memory types
  context: string;
  preference: string;
  decision: string;
  summary: string;

  // Git/Workspace indicators
  folder: string;
  branch: string;
  dirty: string;

  // Thinking/Reasoning
  thinking: string;
};

/**
 * Icon support level.
 */
export type IconSupport = "nerd" | "unicode" | "ascii";

// =============================================================================
// Icon Sets
// =============================================================================

/**
 * Nerd Font icons (beautiful, requires font installation).
 * These provide the best visual experience when a Nerd Font is installed.
 */
export const nerdFontIcons: IconSet = {
  // Roles
  user: "\uf007", //
  assistant: "\udb80\udf4c", // 󰍌 robot
  system: "\uf013", //
  tool: "\uf0ad", //

  // Status
  success: "\uf00c", //
  error: "\uf00d", //
  warning: "\uf071", //
  info: "\uf05a", //
  pending: "\uf017", //
  running: "\uf0e7", //

  // Modes
  vibe: "\uf0e7", //
  plan: "\uf0cb", //
  spec: "\uf013", //

  // UI
  logo: "\uf4d4", //
  chevronRight: "\uf054", //
  chevronDown: "\uf078", //
  bullet: "\uf111", //
  check: "\uf00c", //
  cross: "\uf00d", //
  gear: "\uf013", //
  cost: "\uf155", //
  memory: "\uf0c5", //
  target: "\uf05b", //
  note: "\uf249", //

  // Memory types
  context: "\uf0c5", //
  preference: "\uf013", //
  decision: "\uf05b", //
  summary: "\uf249", //

  // Git/Workspace indicators
  folder: "\uf07b", // nf-fa-folder
  branch: "\ue725", // nf-dev-git_branch
  dirty: "\uf069", // nf-fa-asterisk

  // Thinking/Reasoning
  thinking: "\uf5dc", // nf-fa-brain
};

/**
 * Beautiful Unicode symbols (works on most terminals).
 * Provides a clean, professional look without font requirements.
 */
export const unicodeIcons: IconSet = {
  // Roles
  user: "◉", // Fisheye
  assistant: "◈", // Diamond with dot
  system: "▣", // Square with fill
  tool: "◆", // Black diamond

  // Status
  success: "✦", // Black four pointed star
  error: "✘", // Heavy ballot X
  warning: "⚠", // Warning sign
  info: "ℹ", // Information source
  pending: "◌", // Dotted circle
  running: "⟳", // Clockwise arrow

  // Modes
  vibe: "◐", // Circle left half black
  plan: "◑", // Circle right half black
  spec: "◒", // Circle lower half black

  // UI
  logo: "⬢", // Hexagon
  chevronRight: "›", // Single right guillemet
  chevronDown: "⌄", // Modifier down arrowhead
  bullet: "•", // Bullet
  check: "✔", // Heavy check mark
  cross: "✖", // Heavy multiplication X
  gear: "⚙", // Gear
  cost: "◇", // White diamond
  memory: "▤", // Square with horizontal fill
  target: "◎", // Bullseye
  note: "▪", // Black small square

  // Memory types
  context: "▤", // Square with horizontal fill
  preference: "⚙", // Gear
  decision: "◎", // Bullseye
  summary: "▪", // Black small square

  // Git/Workspace indicators
  folder: "▫", // White small square (folder)
  branch: "⎇", // Alternative key symbol (branch)
  dirty: "●", // Black circle (modified)

  // Thinking/Reasoning
  thinking: "◔", // Circle with upper right quadrant black
};

/**
 * ASCII fallback (100% compatible with all terminals).
 * Used when Unicode support is uncertain or disabled.
 */
export const asciiIcons: IconSet = {
  // Roles
  user: "*",
  assistant: ">",
  system: "#",
  tool: "+",

  // Status
  success: "+",
  error: "x",
  warning: "!",
  info: "i",
  pending: ".",
  running: "~",

  // Modes
  vibe: "*",
  plan: "-",
  spec: "=",

  // UI
  logo: "V",
  chevronRight: ">",
  chevronDown: "v",
  bullet: "-",
  check: "+",
  cross: "x",
  gear: "@",
  cost: "$",
  memory: "#",
  target: "o",
  note: "*",

  // Memory types
  context: "#",
  preference: "@",
  decision: "o",
  summary: "*",

  // Git/Workspace indicators
  folder: "[D]",
  branch: "[B]",
  dirty: "*",

  // Thinking/Reasoning
  thinking: "?",
};

// =============================================================================
// Detection
// =============================================================================

/**
 * Detect the best icon support level for the current environment.
 * Checks environment variables and terminal capabilities.
 */
function detectIconSupport(): IconSupport {
  // Check explicit config first
  const vellumIcons = process.env.VELLUM_ICONS;
  if (vellumIcons === "nerd") return "nerd";
  if (vellumIcons === "ascii") return "ascii";

  // Check for Nerd Font indicators
  const nerdFontEnvs = ["NERD_FONT", "NERDFONT", "NERD_FONTS"];
  if (nerdFontEnvs.some((env) => process.env[env])) return "nerd";

  // Check terminal capabilities
  const term = process.env.TERM || "";
  const termProgram = process.env.TERM_PROGRAM || "";

  // Modern terminals likely support Unicode
  if (
    termProgram.includes("iTerm") ||
    termProgram.includes("WezTerm") ||
    termProgram.includes("Alacritty") ||
    termProgram.includes("Kitty") ||
    termProgram === "vscode" ||
    term.includes("256color") ||
    term.includes("xterm")
  ) {
    return "unicode";
  }

  // Windows Terminal supports Unicode
  if (process.env.WT_SESSION) return "unicode";

  // Fallback based on platform
  const isWindows = process.platform === "win32";
  const isLegacyWindows = isWindows && !process.env.WT_SESSION && !process.env.TERM_PROGRAM;

  return isLegacyWindows ? "ascii" : "unicode";
}

// =============================================================================
// API
// =============================================================================

/** Cached icon set (lazily initialized) */
let currentIconSet: IconSet | null = null;

/** Cached support level */
let currentSupport: IconSupport | null = null;

/**
 * Get the current icon set based on auto-detection.
 * The result is cached after the first call.
 */
export function getIcons(): IconSet {
  if (!currentIconSet) {
    const support = detectIconSupport();
    currentSupport = support;
    switch (support) {
      case "nerd":
        currentIconSet = nerdFontIcons;
        break;
      case "ascii":
        currentIconSet = asciiIcons;
        break;
      default:
        currentIconSet = unicodeIcons;
    }
  }
  return currentIconSet;
}

/**
 * Get the current icon support level.
 */
export function getIconSupport(): IconSupport {
  if (!currentSupport) {
    getIcons(); // This will set currentSupport
  }
  // currentSupport is guaranteed to be set after getIcons() call
  return currentSupport as IconSupport;
}

/**
 * Force a specific icon set.
 * Useful for testing or user preferences.
 */
export function setIconSet(set: IconSupport): void {
  currentSupport = set;
  switch (set) {
    case "nerd":
      currentIconSet = nerdFontIcons;
      break;
    case "ascii":
      currentIconSet = asciiIcons;
      break;
    default:
      currentIconSet = unicodeIcons;
  }
}

/**
 * Reset icon detection (useful for testing).
 */
export function resetIconDetection(): void {
  currentIconSet = null;
  currentSupport = null;
}

/**
 * Default export for convenience.
 * Note: Use getIcons() if you need the result of detection at runtime,
 * as this export evaluates at module load time.
 */
export const icons = getIcons();

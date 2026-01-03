/**
 * Terminal Detection Utilities (T060)
 *
 * Detects terminal capabilities for optimal TUI rendering.
 * Supports various terminal emulators and gracefully degrades
 * for unsupported features.
 *
 * @module tui/utils/detectTerminal
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Terminal type enumeration.
 */
export type TerminalType =
  | "iterm2"
  | "kitty"
  | "wezterm"
  | "windows-terminal"
  | "vscode"
  | "alacritty"
  | "hyper"
  | "terminal-app" // macOS Terminal.app
  | "gnome-terminal"
  | "konsole"
  | "xterm"
  | "mintty" // Git Bash, Cygwin
  | "conemu"
  | "cmd"
  | "powershell"
  | "unknown";

/**
 * Terminal capabilities detected from the environment.
 */
export interface TerminalCapabilities {
  /** Terminal type/emulator name */
  readonly terminalType: TerminalType;
  /** Supports true color (24-bit) */
  readonly trueColor: boolean;
  /** Supports 256 colors */
  readonly color256: boolean;
  /** Supports Unicode characters */
  readonly unicode: boolean;
  /** Supports Sixel graphics */
  readonly sixel: boolean;
  /** Supports Kitty graphics protocol */
  readonly kittyGraphics: boolean;
  /** Supports iTerm2 inline images */
  readonly iterm2Images: boolean;
  /** Supports alternate screen buffer */
  readonly alternateBuffer: boolean;
  /** Supports mouse events */
  readonly mouseSupport: boolean;
  /** Supports bracketed paste mode */
  readonly bracketedPaste: boolean;
  /** Supports hyperlinks (OSC 8) */
  readonly hyperlinks: boolean;
  /** Supports styled underlines */
  readonly styledUnderlines: boolean;
  /** Terminal width in columns */
  readonly columns: number;
  /** Terminal height in rows */
  readonly rows: number;
  /** Whether running in CI environment */
  readonly isCI: boolean;
  /** Whether running in a TTY */
  readonly isTTY: boolean;
}

/**
 * Options for terminal detection.
 */
export interface DetectTerminalOptions {
  /** Force specific terminal type (for testing) */
  readonly forceTerminal?: TerminalType;
  /** Force specific color level (for testing) */
  readonly forceColorLevel?: 0 | 1 | 2 | 3;
  /** Override environment variables */
  readonly env?: Record<string, string | undefined>;
}

// =============================================================================
// Constants
// =============================================================================

/** Default capabilities for unknown terminals */
const DEFAULT_CAPABILITIES: TerminalCapabilities = {
  terminalType: "unknown",
  trueColor: false,
  color256: false,
  unicode: false,
  sixel: false,
  kittyGraphics: false,
  iterm2Images: false,
  alternateBuffer: true,
  mouseSupport: false,
  bracketedPaste: false,
  hyperlinks: false,
  styledUnderlines: false,
  columns: 80,
  rows: 24,
  isCI: false,
  isTTY: false,
};

/** CI environment variable names */
const CI_ENV_VARS = [
  "CI",
  "CONTINUOUS_INTEGRATION",
  "BUILD_NUMBER",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "JENKINS_URL",
  "TEAMCITY_VERSION",
  "BUILDKITE",
  "TF_BUILD", // Azure Pipelines
];

// =============================================================================
// Terminal Type Detection
// =============================================================================

interface TerminalEnvVars {
  termProgram: string;
  term: string;
  lcTerminal: string;
  wtSession: string | undefined;
  kitty: string | undefined;
  wezterm: string | undefined;
  alacritty: string | undefined;
  conemu: string | undefined;
  vscodeTerminal: boolean;
}

/** Extract terminal-related environment variables */
function extractTerminalEnvVars(env: Record<string, string | undefined>): TerminalEnvVars {
  return {
    termProgram: env.TERM_PROGRAM?.toLowerCase() ?? "",
    term: env.TERM?.toLowerCase() ?? "",
    lcTerminal: env.LC_TERMINAL?.toLowerCase() ?? "",
    wtSession: env.WT_SESSION,
    kitty: env.KITTY_WINDOW_ID,
    wezterm: env.WEZTERM_PANE,
    alacritty: env.ALACRITTY_WINDOW_ID,
    conemu: env.ConEmuANSI,
    vscodeTerminal: Boolean(env.VSCODE_INJECTION || env.TERM_PROGRAM === "vscode"),
  };
}

/** Detect modern GUI terminal emulators */
function detectModernTerminal(vars: TerminalEnvVars): TerminalType | null {
  if (vars.termProgram === "iterm.app" || vars.lcTerminal === "iterm2") return "iterm2";
  if (vars.kitty || vars.termProgram === "kitty" || vars.term === "xterm-kitty") return "kitty";
  if (vars.wezterm || vars.termProgram === "wezterm") return "wezterm";
  if (vars.wtSession) return "windows-terminal";
  if (vars.vscodeTerminal || vars.termProgram === "vscode") return "vscode";
  if (vars.alacritty || vars.termProgram === "alacritty") return "alacritty";
  if (vars.termProgram === "hyper") return "hyper";
  return null;
}

/** Detect platform-specific terminals */
function detectPlatformTerminal(
  vars: TerminalEnvVars,
  env: Record<string, string | undefined>
): TerminalType | null {
  if (vars.termProgram === "apple_terminal") return "terminal-app";
  if (env.GNOME_TERMINAL_SCREEN || env.VTE_VERSION) return "gnome-terminal";
  if (env.KONSOLE_VERSION) return "konsole";
  if (vars.conemu) return "conemu";
  if (vars.term.includes("mintty") || env.MSYSTEM) return "mintty";
  if (vars.term.includes("xterm")) return "xterm";
  if (env.PROMPT && !env.SHELL) return "cmd";
  if (env.PSModulePath && !vars.wtSession) return "powershell";
  return null;
}

/**
 * Detect the terminal type from environment variables.
 */
function detectTerminalType(env: Record<string, string | undefined>): TerminalType {
  const vars = extractTerminalEnvVars(env);

  const modernTerminal = detectModernTerminal(vars);
  if (modernTerminal) return modernTerminal;

  const platformTerminal = detectPlatformTerminal(vars, env);
  if (platformTerminal) return platformTerminal;

  return "unknown";
}

// =============================================================================
// Color Support Detection
// =============================================================================

/** Check forced color settings from environment */
function checkForcedColorLevel(env: Record<string, string | undefined>): 0 | 1 | 2 | 3 | null {
  if ("NO_COLOR" in env) return 0;

  const forceColor = env.FORCE_COLOR;
  if (forceColor === "0" || forceColor === "false") return 0;
  if (forceColor === "1" || forceColor === "true") return 1;
  if (forceColor === "2") return 2;
  if (forceColor === "3") return 3;

  const colorTerm = env.COLORTERM?.toLowerCase() ?? "";
  if (colorTerm === "truecolor" || colorTerm === "24bit") return 3;

  return null;
}

/** Get color level for specific terminal type */
function getTerminalColorLevel(
  terminalType: TerminalType,
  env: Record<string, string | undefined>
): 0 | 1 | 2 | 3 {
  // Modern terminals with true color
  const trueColorTerminals: TerminalType[] = [
    "iterm2",
    "kitty",
    "wezterm",
    "windows-terminal",
    "vscode",
    "alacritty",
    "hyper",
    "mintty",
    "conemu",
  ];
  if (trueColorTerminals.includes(terminalType)) return 3;

  // VTE-based terminals
  if (terminalType === "gnome-terminal" || terminalType === "konsole") {
    const vteVersion = parseInt(env.VTE_VERSION ?? "0", 10);
    return vteVersion >= 3600 ? 3 : 2;
  }

  if (terminalType === "terminal-app") return 2;

  if (terminalType === "xterm") {
    const term = env.TERM ?? "";
    if (term.includes("256color")) return 2;
    if (term.includes("truecolor") || term.includes("24bit")) return 3;
    return 1;
  }

  if (terminalType === "cmd" || terminalType === "powershell") {
    return process.platform === "win32" ? 2 : 1;
  }

  return 0;
}

/** Fallback color detection from TERM variable */
function detectColorFromTerm(env: Record<string, string | undefined>): 0 | 1 | 2 | 3 {
  const term = env.TERM ?? "";
  if (term.includes("256color")) return 2;
  if (term.includes("color")) return 1;
  return 0;
}

/**
 * Detect color support level.
 * Returns: 0 = no color, 1 = basic (16), 2 = 256, 3 = truecolor (16M)
 */
function detectColorLevel(
  env: Record<string, string | undefined>,
  terminalType: TerminalType
): 0 | 1 | 2 | 3 {
  const forcedLevel = checkForcedColorLevel(env);
  if (forcedLevel !== null) return forcedLevel;

  if (terminalType !== "unknown") {
    return getTerminalColorLevel(terminalType, env);
  }

  return detectColorFromTerm(env);
}

// =============================================================================
// Feature Detection
// =============================================================================

/**
 * Detect Unicode support.
 */
function detectUnicodeSupport(
  env: Record<string, string | undefined>,
  terminalType: TerminalType
): boolean {
  // Check locale settings
  const lang = env.LANG ?? "";
  const lcAll = env.LC_ALL ?? "";
  const lcCtype = env.LC_CTYPE ?? "";

  const hasUtf8Locale =
    lang.toLowerCase().includes("utf") ||
    lcAll.toLowerCase().includes("utf") ||
    lcCtype.toLowerCase().includes("utf");

  if (hasUtf8Locale) {
    return true;
  }

  // Modern terminals generally support Unicode
  const modernTerminals: TerminalType[] = [
    "iterm2",
    "kitty",
    "wezterm",
    "windows-terminal",
    "vscode",
    "alacritty",
    "hyper",
    "gnome-terminal",
    "konsole",
  ];

  return modernTerminals.includes(terminalType);
}

/**
 * Detect Sixel graphics support.
 */
function detectSixelSupport(terminalType: TerminalType): boolean {
  // Terminals known to support Sixel
  const sixelTerminals: TerminalType[] = [
    "kitty", // Optional
    "wezterm",
    "mintty",
  ];

  return sixelTerminals.includes(terminalType);
}

/**
 * Detect Kitty graphics protocol support.
 */
function detectKittyGraphicsSupport(terminalType: TerminalType): boolean {
  return terminalType === "kitty" || terminalType === "wezterm";
}

/**
 * Detect iTerm2 inline images support.
 */
function detectITerm2ImagesSupport(terminalType: TerminalType): boolean {
  return terminalType === "iterm2" || terminalType === "wezterm";
}

/**
 * Detect hyperlink (OSC 8) support.
 */
function detectHyperlinkSupport(terminalType: TerminalType): boolean {
  const hyperlinkTerminals: TerminalType[] = [
    "iterm2",
    "kitty",
    "wezterm",
    "windows-terminal",
    "vscode",
    "gnome-terminal",
    "konsole",
    "alacritty",
    "hyper",
  ];

  return hyperlinkTerminals.includes(terminalType);
}

/**
 * Detect styled underlines support.
 */
function detectStyledUnderlines(terminalType: TerminalType): boolean {
  const styledUnderlineTerminals: TerminalType[] = [
    "iterm2",
    "kitty",
    "wezterm",
    "vscode",
    "gnome-terminal", // VTE-based
    "konsole",
  ];

  return styledUnderlineTerminals.includes(terminalType);
}

/**
 * Detect if running in CI environment.
 */
function detectCI(env: Record<string, string | undefined>): boolean {
  return CI_ENV_VARS.some((varName) => varName in env);
}

// =============================================================================
// Main Detection Function
// =============================================================================

/**
 * Detect terminal capabilities.
 *
 * Analyzes the environment to determine what features the current
 * terminal supports. Use this to conditionally enable/disable
 * TUI features based on terminal capabilities.
 *
 * @example
 * ```tsx
 * const capabilities = detectTerminal();
 *
 * // Use true color if available
 * const color = capabilities.trueColor
 *   ? '#ff6b6b'
 *   : 'red';
 *
 * // Show fancy Unicode if supported
 * const bullet = capabilities.unicode ? '●' : '*';
 *
 * // Disable animations in CI
 * const animate = !capabilities.isCI;
 * ```
 */
export function detectTerminal(options: DetectTerminalOptions = {}): TerminalCapabilities {
  const { forceTerminal, forceColorLevel, env: envOverride } = options;

  // Use overrides or process.env
  const env = envOverride ?? (process.env as Record<string, string | undefined>);

  // Get terminal dimensions
  const columns = process.stdout.columns || DEFAULT_CAPABILITIES.columns;
  const rows = process.stdout.rows || DEFAULT_CAPABILITIES.rows;

  // Check if running in TTY
  const isTTY = process.stdout.isTTY ?? false;

  // Detect terminal type
  const terminalType = forceTerminal ?? detectTerminalType(env);

  // Detect color level
  const colorLevel = forceColorLevel ?? detectColorLevel(env, terminalType);

  // Detect other capabilities
  const isCI = detectCI(env);
  const unicode = detectUnicodeSupport(env, terminalType);
  const sixel = detectSixelSupport(terminalType);
  const kittyGraphics = detectKittyGraphicsSupport(terminalType);
  const iterm2Images = detectITerm2ImagesSupport(terminalType);
  const hyperlinks = detectHyperlinkSupport(terminalType);
  const styledUnderlines = detectStyledUnderlines(terminalType);

  return {
    terminalType,
    trueColor: colorLevel >= 3,
    color256: colorLevel >= 2,
    unicode,
    sixel,
    kittyGraphics,
    iterm2Images,
    alternateBuffer: isTTY && !isCI,
    mouseSupport: isTTY && !isCI,
    bracketedPaste: isTTY,
    hyperlinks,
    styledUnderlines,
    columns,
    rows,
    isCI,
    isTTY,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a human-readable name for the terminal type.
 */
export function getTerminalName(type: TerminalType): string {
  const names: Record<TerminalType, string> = {
    iterm2: "iTerm2",
    kitty: "Kitty",
    wezterm: "WezTerm",
    "windows-terminal": "Windows Terminal",
    vscode: "VS Code",
    alacritty: "Alacritty",
    hyper: "Hyper",
    "terminal-app": "Terminal.app",
    "gnome-terminal": "GNOME Terminal",
    konsole: "Konsole",
    xterm: "XTerm",
    mintty: "MinTTY",
    conemu: "ConEmu",
    cmd: "Command Prompt",
    powershell: "PowerShell",
    unknown: "Unknown Terminal",
  };

  return names[type];
}

/**
 * Create a degraded color based on capabilities.
 */
export function degradeColor(
  capabilities: TerminalCapabilities,
  trueColor: string,
  color256: number,
  basicColor: string
): string {
  if (capabilities.trueColor) {
    return trueColor;
  }
  if (capabilities.color256) {
    return `\x1b[38;5;${color256}m`;
  }
  return basicColor;
}

/**
 * Get appropriate symbol based on Unicode support.
 */
export function getSymbol(
  capabilities: TerminalCapabilities,
  unicode: string,
  ascii: string
): string {
  return capabilities.unicode ? unicode : ascii;
}

/**
 * Create a hyperlink if supported, otherwise return plain text.
 */
export function createHyperlink(
  capabilities: TerminalCapabilities,
  url: string,
  text: string
): string {
  if (capabilities.hyperlinks) {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
  }
  return text;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cachedCapabilities: TerminalCapabilities | null = null;

/**
 * Get cached terminal capabilities (singleton).
 * Use this for performance when you don't need to re-detect.
 */
export function getTerminalCapabilities(): TerminalCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectTerminal();
  }
  return cachedCapabilities;
}

/**
 * Clear the cached terminal capabilities.
 * Useful for testing or when terminal conditions change.
 */
export function clearTerminalCapabilitiesCache(): void {
  cachedCapabilities = null;
}

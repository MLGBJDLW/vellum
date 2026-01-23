// ============================================
// Vellum Shared Types
// ============================================

// Config Parser Module (AGENTS.md Protocol)
export * from "./config-parser/index.js";
// Error codes
export { ErrorCode, ErrorSeverity, inferSeverity } from "./errors/index.js";
// @ Mention System (Phase: TUI Context Mentions)
export {
  countMentions,
  countMentionsByType,
  extractTextWithoutMentions,
  getAllMentionSuggestions,
  getMentionFormat,
  getMentionSuggestions,
  hasMentions,
  MENTION_PARTIAL_REGEX,
  MENTION_REGEX,
  MENTION_TYPES,
  MENTION_TYPES_STANDALONE,
  MENTION_TYPES_WITH_VALUE,
  MENTION_VALUE_PARTIAL_REGEX,
  type Mention,
  type MentionSuggestion,
  type MentionType,
  mentionIsStandalone,
  mentionRequiresValue,
  parseMentions,
  stripMentions,
  validateMentionValue,
} from "./mentions.js";
// Theme types (Phase 33 - Visual Theme System)
// Theme utilities (Phase 33 - Visual Theme System)
export type {
  BorderCharacters,
  BorderRadius,
  BorderWidth,
  Color,
  ExtendedSemanticColors,
  IconSet,
  IconSupport,
  PartialTheme,
  SemanticColors,
  SpinnerFrames,
  TextRoleColors,
  ThemeAnimation,
  ThemeBorders,
  ThemeColors,
  ThemeContextValue,
  ThemeIcons,
  ThemeMode,
  ThemeName,
  ThemeOptions,
  ThemePreset,
  ThemeSpacing,
  VellumTheme,
} from "./theme/index.js";
export {
  adjustBrightness,
  ansiTheme,
  asciiIcons,
  catppuccinMochaTheme,
  createExtendedSemanticTokens,
  darkTheme,
  defaultTheme,
  draculaTheme,
  getContrastingTextColor,
  getIconSupport,
  getIcons,
  getLuminance,
  getRoleBorderColor,
  getRoleTextColor,
  getStatusColor,
  getSyntaxColor,
  getTheme,
  getThemeNames,
  getThemeOrDefault,
  githubTheme,
  hexToRgb,
  icons,
  isDarkColor,
  lightTheme,
  nerdFontIcons,
  nordTheme,
  parchmentTheme,
  resetIconDetection,
  rgbToHex,
  setIconSet,
  THEME_PRESETS,
  themes,
  tokyoNightTheme,
  unicodeIcons,
} from "./theme/index.js";
// Resilience interface (used by provider retry to avoid circular dep with core)
export type { ResilienceEventBusInterface } from "./types/resilience.js";
export type { Result } from "./types/result.js";
// Result type (shared to avoid circular deps between core and provider)
export {
  all,
  Err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  match,
  Ok,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
} from "./types/result.js";
// Token usage (shared to avoid circular deps between core and provider)
export type { TokenUsage } from "./types/token.js";
// Re-export common utilities
export { createId } from "./utils/id.js";

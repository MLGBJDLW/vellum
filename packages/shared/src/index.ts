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
/**
 * @deprecated Import AgentConfig from @vellum/core for orchestration hierarchy.
 * @deprecated Import AgentState events via Events.agentStateChange from @vellum/core.
 */
export type { AgentConfig, AgentState } from "./types/agent.js";
/**
 * @deprecated Import Message and Role from @vellum/core instead.
 * The new types support multi-part content (text, tool calls, files, etc.)
 */
export type { Message, MessageRole } from "./types/message.js";
/**
 * @deprecated Import ModelInfo from @vellum/provider instead.
 * @deprecated Import ProviderConfig from @vellum/core instead.
 */
export type { ModelInfo, ProviderConfig } from "./types/provider.js";
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
/**
 * @deprecated Import Tool and defineTool from @vellum/core instead.
 * The new Tool interface supports Zod validation, permissions, and typed results.
 */
export type { Tool, ToolResult } from "./types/tool.js";
// Re-export common utilities
export { createId } from "./utils/id.js";

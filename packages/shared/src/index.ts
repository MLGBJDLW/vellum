// ============================================
// Vellum Shared Types
// ============================================

// Config Parser Module (AGENTS.md Protocol)
export * from "./config-parser/index.js";
// Error codes
export { ErrorCode } from "./errors/index.js";
// Theme types (Phase 33 - Visual Theme System)
// Theme utilities (Phase 33 - Visual Theme System)
export type {
  BorderCharacters,
  BorderRadius,
  BorderWidth,
  Color,
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
  ansiTheme,
  darkTheme,
  defaultTheme,
  draculaTheme,
  getTheme,
  getThemeNames,
  getThemeOrDefault,
  githubTheme,
  lightTheme,
  THEME_PRESETS,
  themes,
} from "./theme/index.js";
export type { AgentConfig, AgentState } from "./types/agent.js";
export type { Message, MessageRole } from "./types/message.js";
export type { ModelInfo, ProviderConfig } from "./types/provider.js";
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
export type { Tool, ToolResult } from "./types/tool.js";
// Re-export common utilities
export { createId } from "./utils/id.js";

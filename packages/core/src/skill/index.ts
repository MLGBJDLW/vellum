// ============================================
// Skill Module Barrel Export
// ============================================

// Builtin Skills
export { BUILTIN_SKILL_NAMES, type BuiltinSkillName } from "./builtin/index.js";
// Discovery
export type {
  CombinedDiscoveryResult,
  ModeSkillDiscoveryOptions,
  ModeSkillLocation,
  SkillDiscoveryOptions,
  SkillDiscoveryResult,
  SkillNameValidation,
} from "./discovery.js";
export {
  discoverModeSkills,
  ROO_CODE_MODE_MAPPINGS,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MIN_LENGTH,
  SKILL_NAME_PATTERN,
  SkillDiscovery,
  skillDiscovery,
  validateSkillName,
} from "./discovery.js";
// Loader
export type { SkillCacheEntry, SkillLoaderOptions } from "./loader.js";
export { SkillLoader, skillLoader } from "./loader.js";
// Manager
export type { SkillManagerOptions, SkillPromptSection } from "./manager.js";
export { createSkillManager, SkillManager } from "./manager.js";
// Matcher
export type { MatchContext } from "./matcher.js";
export { SkillMatcher, skillMatcher } from "./matcher.js";
// Parser
export {
  SKILL_MANIFEST_FILENAME,
  SKILL_SECTION_NAMES,
  SkillParser,
  skillParser,
} from "./parser.js";
// Types
export type {
  Skill,
  SkillAccessed,
  SkillConfig,
  SkillExecutionResult,
  SkillFrontmatter,
  SkillLoaded,
  SkillLocation,
  SkillMatch,
  SkillParseResult,
  SkillPermission,
  SkillPermissionRule,
  SkillResource,
  SkillResultMetadata,
  SkillScan,
  SkillSource,
  SkillTrigger,
  SkillTriggerType,
} from "./types.js";
export { SKILL_SOURCE_PRIORITY, TRIGGER_TYPE_MULTIPLIERS } from "./types.js";
// Watcher
export type {
  SkillChangeEvent,
  SkillWatcherEvents,
  SkillWatcherOptions,
} from "./watcher.js";
export { SkillWatcher, skillWatcher } from "./watcher.js";

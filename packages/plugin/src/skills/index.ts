/**
 * Skills Module - Plugin skill loading and management
 *
 * @module plugin/skills
 */

// Adapter exports
export type { PluginSkillRegistry } from "./adapter.js";
export {
  adaptToSkillSource,
  createSkillLoaded,
  createSkillRegistry,
  createSkillScan,
} from "./adapter.js";
// Loader exports
export { loadAllSkills, loadSkill, SkillLoadError } from "./loader.js";

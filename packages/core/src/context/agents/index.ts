// ============================================
// Context Agents Module - Barrel Export
// ============================================
// AGENTS.md Protocol implementation for project-specific
// AI agent configuration, rules, and tool restrictions.

export * from "./automatic-instructions-matcher.js";
// Core Components
export * from "./discovery.js";
export * from "./errors.js";
// External Rules
export * from "./external-rules-loader.js";
// Loading & Watching
export * from "./loader.js";
// Rename MergeOptions to avoid conflict with session/switcher.ts
export type { MergedAgentsConfig, MergeOptions as AgentsMergeOptions } from "./merge.js";
export { mergeConfigs } from "./merge.js";
export * from "./parser.js";
// Prompt Building & Session Integration
export * from "./prompt-builder.js";
export * from "./session-integration.js";
// Tool Filtering
export * from "./tool-allowlist-filter.js";
// Types
export * from "./types.js";
export * from "./watcher.js";

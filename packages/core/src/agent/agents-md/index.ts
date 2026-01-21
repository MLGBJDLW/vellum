// ============================================
// AGENTS.md Directory Scoping - Barrel Export
// ============================================

/**
 * AGENTS.md directory scoping implementation.
 *
 * Implements the Codex pattern for directory-scoped agent instructions:
 * - Scans project for AGENTS.md files
 * - Builds hierarchy tree
 * - Resolves instructions for target files
 * - Supports PREPEND/APPEND/REPLACE merge markers
 *
 * @example
 * ```typescript
 * import { createAgentsMdLoader } from '@vellum/core/agent/agents-md';
 *
 * const loader = createAgentsMdLoader({ projectRoot: '/project' });
 *
 * // Scan project
 * const { files, tree } = await loader.scan();
 *
 * // Get instructions for a file
 * const instructions = await loader.getInstructionsFor('/project/src/utils.ts');
 * ```
 *
 * @module @vellum/core/agent/agents-md
 */

// Integration with PromptBuilder
export {
  AGENTS_MD_PRIORITY,
  AgentsMdIntegration,
  createAgentsMdIntegration,
  type IntegrationOptions,
  injectAgentsMd,
  MAX_AGENTS_MD_LENGTH,
} from "./integration.js";
// Loader (main entry point)
export { AgentsMdLoader, createAgentsMdLoader } from "./loader.js";

// Resolver
export { AgentsMdResolver, findApplicableFiles, mergeInstructions } from "./resolver.js";

// Scanner
export {
  AgentsMdScanner,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_PATTERNS,
  detectMergeMarker,
} from "./scanner.js";

// Types
export {
  type AgentsMdFile,
  type AgentsMdLoaderOptions,
  type AgentsMdScope,
  type AgentsMdTree,
  type AgentsMdTreeNode,
  type IAgentsMdLoader,
  MERGE_MARKER_PATTERNS,
  type MergeMarker,
  type ScanResult,
} from "./types.js";

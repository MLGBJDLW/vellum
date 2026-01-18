/**
 * CLI Utilities
 *
 * Shared utility functions for the Vellum CLI.
 *
 * @module cli/utils
 */

// For backward compatibility, also export ModelMetadata as an alias
export type { ModelInfo as ModelMetadata } from "@vellum/provider";

// Re-export model utilities from @vellum/provider (Single Source of Truth)
export {
  calculateCost,
  getContextWindow,
  getModelInfo,
  getProviderModels,
  getSupportedProviders,
  type ModelInfo,
} from "@vellum/provider";
export {
  getFileIcon,
  getModeIcon,
  getPhaseIcon,
  getProviderIcon,
  ICONS,
} from "./icons.js";
export {
  formatResumeHint,
  getShortId,
  SHORT_ID_LENGTH,
  shouldShowResumeHint,
} from "./resume-hint.js";

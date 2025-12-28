// ============================================
// AgentLoop - Re-export from agent module
// ============================================
//
// DEPRECATION NOTICE:
// This file is deprecated. Import from "./agent/index.js" instead.
//
// Migration:
//   Old: import { AgentLoop } from "@vellum/core/loop"
//   New: import { AgentLoop } from "@vellum/core/agent"
//
// Or use the barrel export:
//   import { AgentLoop } from "@vellum/core"

// Log deprecation warning once per process
let deprecationWarningShown = false;

function showDeprecationWarning(): void {
  if (!deprecationWarningShown) {
    deprecationWarningShown = true;
    console.warn(
      "[DEPRECATED] Importing from '@vellum/core/loop' is deprecated. " +
        "Please import from '@vellum/core/agent' or '@vellum/core' instead."
    );
  }
}

// Re-export everything from agent/loop.ts with deprecation warning
export {
  AgentLoop,
  type AgentLoopConfig,
  type AgentLoopEvents,
} from "./agent/loop.js";

// Show warning on module load
showDeprecationWarning();

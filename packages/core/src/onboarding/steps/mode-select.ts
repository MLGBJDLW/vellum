/**
 * Mode Selection Step (Phase 38)
 *
 * Allows user to select their preferred coding mode during onboarding.
 * Explains the differences between vibe, plan, and spec modes.
 *
 * @module onboarding/steps/mode-select
 */

import type { CodingMode } from "../../agent/coding-modes.js";
import { MODE_INFO, type ModeInfo, type OnboardingState, type StepResult } from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Mode selection result data
 */
export interface ModeSelectData {
  /** Selected mode */
  mode: CodingMode;
  /** Mode display info */
  modeInfo: ModeInfo;
}

/**
 * Mode select step handler interface
 */
export interface ModeSelectStepHandler {
  /** Get available modes */
  getModes(): ModeInfo[];
  /** Validate mode selection */
  validateSelection(mode: string): boolean;
  /** Get default mode */
  getDefault(): CodingMode;
  /** Execute mode selection step */
  execute(state: OnboardingState, selection: string): Promise<StepResult>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid coding modes
 */
const VALID_MODES: readonly CodingMode[] = ["vibe", "plan", "spec"] as const;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a mode selection step handler
 */
export function createModeSelectStep(): ModeSelectStepHandler {
  return {
    getModes(): ModeInfo[] {
      return VALID_MODES.map((id) => MODE_INFO[id]).filter((m): m is ModeInfo => m !== undefined);
    },

    validateSelection(mode: string): boolean {
      return VALID_MODES.includes(mode as CodingMode);
    },

    getDefault(): CodingMode {
      // Default to vibe mode for fastest experience
      return "vibe";
    },

    async execute(_state: OnboardingState, selection: string): Promise<StepResult> {
      // Handle back navigation
      if (selection === "back") {
        return {
          success: true,
          next: false,
          back: true,
          skip: false,
        };
      }

      // Handle skip
      if (selection === "skip") {
        const defaultMode = this.getDefault();
        const defaultModeInfo = MODE_INFO[defaultMode];
        if (!defaultModeInfo) {
          throw new Error(`Mode info not found for default mode: ${defaultMode}`);
        }
        return {
          success: true,
          next: true,
          back: false,
          skip: true,
          data: {
            mode: defaultMode,
            modeInfo: defaultModeInfo,
            skipped: true,
          },
        };
      }

      // Normalize selection (allow numbers)
      let normalizedSelection = selection.toLowerCase().trim();
      if (normalizedSelection === "1") normalizedSelection = "vibe";
      if (normalizedSelection === "2") normalizedSelection = "plan";
      if (normalizedSelection === "3") normalizedSelection = "spec";

      // Validate selection
      if (!this.validateSelection(normalizedSelection)) {
        return {
          success: false,
          next: false,
          back: false,
          skip: false,
          error: `Invalid mode: ${selection}. Choose from: ${VALID_MODES.join(", ")}`,
        };
      }

      const mode = normalizedSelection as CodingMode;
      const modeInfo = MODE_INFO[mode];
      if (!modeInfo) {
        return {
          success: false,
          next: false,
          back: false,
          skip: false,
          error: `Mode info not found for: ${mode}`,
        };
      }

      return {
        success: true,
        next: true,
        back: false,
        skip: false,
        data: {
          mode,
          modeInfo,
        } satisfies ModeSelectData,
      };
    },
  };
}

/**
 * Format mode list for display
 */
export function formatModeList(modes: ModeInfo[]): string {
  const lines: string[] = [
    "⚡ Choose Your Coding Mode:",
    "",
    ...modes.map((m, index) => {
      const num = index + 1;
      return [
        `  ${num}. ${m.icon} ${m.name}`,
        `     ${m.description}`,
        `     Best for: ${m.useCase}`,
        "",
      ].join("\n");
    }),
    "Enter number (1-3) or mode name:",
  ];

  return lines.join("\n");
}

/**
 * Get detailed mode explanation
 */
export function getModeExplanation(mode: CodingMode): string {
  const explanations: Record<CodingMode, string> = {
    vibe: `
⚡ VIBE MODE - Fast & Autonomous

How it works:
  • AI makes changes directly with minimal confirmation
  • Great for quick iterations and exploration
  • Lower friction, higher speed

Best for:
  • Bug fixes and small changes
  • Exploring new codebases
  • Rapid prototyping
  • When you trust the AI's judgment
`,
    plan: `
📋 PLAN MODE - Structured Approach

How it works:
  • AI creates a plan before making changes
  • You review and approve the plan
  • Then AI executes the approved plan

Best for:
  • New features of medium complexity
  • When you want to understand changes first
  • Teaching/learning scenarios
  • Code reviews
`,
    spec: `
🔧 SPEC MODE - Full Specification

How it works:
  • AI generates detailed technical specification
  • You review architecture and design decisions
  • Multi-phase implementation with checkpoints

Best for:
  • Complex features spanning multiple files
  • Architecture changes
  • When you need documentation
  • Team collaboration
`,
  };

  return explanations[mode] ?? "";
}

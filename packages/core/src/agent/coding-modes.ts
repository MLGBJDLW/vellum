// ============================================
// Coding Modes - Type Definitions
// ============================================

import { z } from "zod";
import { AgentLevel } from "./level.js";
import { type ExtendedModeConfig, ExtendedModeConfigSchema, type ModeConfig } from "./modes.js";
import {
  type ApprovalPolicy,
  ApprovalPolicySchema,
  type SandboxPolicy,
  SandboxPolicySchema,
} from "./policies.js";

/**
 * Schema for coding mode types.
 *
 * Defines the three primary coding modes:
 * - `vibe`: Fast autonomous coding with full tool access (worker level)
 * - `plan`: Plan-then-execute with one checkpoint (workflow level)
 * - `spec`: 6-phase structured workflow with checkpoints (orchestrator level)
 *
 * @example
 * ```typescript
 * // Validation
 * CodingModeSchema.parse('vibe');     // ✅ Returns 'vibe'
 * CodingModeSchema.parse('plan');     // ✅ Returns 'plan'
 * CodingModeSchema.parse('spec');     // ✅ Returns 'spec'
 * CodingModeSchema.parse('invalid');  // ❌ Throws ZodError
 *
 * // Safe parsing
 * const result = CodingModeSchema.safeParse(input);
 * if (result.success) {
 *   console.log(result.data); // 'vibe' | 'plan' | 'spec'
 * }
 * ```
 */
export const CodingModeSchema = z.enum(["vibe", "plan", "spec"]);

/**
 * Type for coding modes.
 *
 * Represents one of the three primary coding modes:
 * - `vibe`: Fast autonomous coding with full tool access
 * - `plan`: Plan-then-execute with one checkpoint
 * - `spec`: 6-phase structured workflow with checkpoints
 *
 * @example
 * ```typescript
 * const mode: CodingMode = 'vibe';
 *
 * function processMode(mode: CodingMode): void {
 *   switch (mode) {
 *     case 'vibe':
 *       // Fast autonomous execution
 *       break;
 *     case 'plan':
 *       // Plan first, then execute
 *       break;
 *     case 'spec':
 *       // 6-phase structured workflow
 *       break;
 *   }
 * }
 * ```
 */
export type CodingMode = z.infer<typeof CodingModeSchema>;

/**
 * All available coding modes as a readonly array.
 *
 * Useful for iteration and UI components.
 *
 * @example
 * ```typescript
 * CODING_MODES.forEach(mode => {
 *   console.log(`Mode: ${mode}`);
 * });
 * // Output: Mode: vibe, Mode: plan, Mode: spec
 * ```
 */
export const CODING_MODES = CodingModeSchema.options;

// ============================================
// CodingModeConfig Interface (T010)
// ============================================

/**
 * Extended configuration interface for coding modes.
 *
 * Combines ExtendedModeConfig with mode-specific settings for approval,
 * sandbox, and checkpoint policies. This interface supports all three
 * coding modes (vibe, plan, spec) with their distinct configurations.
 *
 * @example
 * ```typescript
 * const config: CodingModeConfig = {
 *   name: "code",
 *   codingMode: "vibe",
 *   description: "Fast autonomous coding",
 *   tools: { edit: true, bash: true },
 *   prompt: "Execute tasks quickly",
 *   level: AgentLevel.worker,
 *   approvalPolicy: "full-auto",
 *   sandboxPolicy: "workspace-write",
 *   checkpointsRequired: false,
 *   checkpointCount: 0,
 * };
 * ```
 */
export interface CodingModeConfig extends ExtendedModeConfig {
  /** The coding mode type (vibe, plan, spec) */
  codingMode: CodingMode;
  /** Approval policy for user confirmations */
  approvalPolicy: ApprovalPolicy;
  /** Sandbox policy for file system access */
  sandboxPolicy: SandboxPolicy;
  /** Whether checkpoints are required before proceeding */
  checkpointsRequired: boolean;
  /** Number of checkpoints in the workflow (0 for vibe, 1 for plan, 6 for spec) */
  checkpointCount: number;
  /** System prompt extension for mode-specific behavior */
  systemPromptExtension?: string;
}

// ============================================
// CodingModeConfigSchema (T011)
// ============================================

/**
 * Zod schema for validating CodingModeConfig objects.
 *
 * Extends ExtendedModeConfigSchema with coding-mode-specific fields:
 * - codingMode: The mode type (vibe, plan, spec)
 * - approvalPolicy: User confirmation requirements
 * - sandboxPolicy: File system access boundaries
 * - checkpointsRequired: Whether checkpoints are mandatory
 * - checkpointCount: Number of checkpoints (0-6)
 * - systemPromptExtension: Optional prompt additions
 *
 * @example
 * ```typescript
 * const result = CodingModeConfigSchema.safeParse({
 *   name: "code",
 *   codingMode: "vibe",
 *   description: "Fast mode",
 *   tools: { edit: true, bash: true },
 *   prompt: "Execute quickly",
 *   level: AgentLevel.worker,
 *   approvalPolicy: "full-auto",
 *   sandboxPolicy: "workspace-write",
 *   checkpointsRequired: false,
 *   checkpointCount: 0,
 * });
 *
 * if (result.success) {
 *   console.log(result.data.codingMode); // 'vibe'
 * }
 * ```
 */
export const CodingModeConfigSchema = ExtendedModeConfigSchema.extend({
  /** The coding mode type */
  codingMode: CodingModeSchema,
  /** Approval policy for user confirmations */
  approvalPolicy: ApprovalPolicySchema,
  /** Sandbox policy for file system access */
  sandboxPolicy: SandboxPolicySchema,
  /** Whether checkpoints are required */
  checkpointsRequired: z.boolean(),
  /** Number of checkpoints (0-6) */
  checkpointCount: z.number().int().min(0).max(6),
  /** System prompt extension for mode-specific behavior */
  systemPromptExtension: z.string().optional(),
});

// ============================================
// codingModeToCore Converter (T010b)
// ============================================

/**
 * Converts a CodingModeConfig to the core ModeConfig interface.
 *
 * AgentLoop expects the base ModeConfig interface, not the extended
 * CodingModeConfig. This function extracts only the fields needed by
 * the core agent loop, enabling compatibility with existing infrastructure.
 *
 * @param config - The CodingModeConfig to convert
 * @returns A ModeConfig object for AgentLoop consumption
 *
 * @example
 * ```typescript
 * const codingConfig = VIBE_MODE;
 * const coreConfig = codingModeToCore(codingConfig);
 *
 * // coreConfig contains only base ModeConfig fields:
 * // { name, description, tools, prompt, temperature, maxTokens, extendedThinking }
 * ```
 */
export function codingModeToCore(config: CodingModeConfig): ModeConfig {
  return {
    name: config.name,
    description: config.description,
    tools: config.tools,
    prompt: config.prompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    extendedThinking: config.extendedThinking,
  };
}

// ============================================
// Built-in Mode Constants (T012, T013, T014)
// ============================================

/**
 * Vibe mode configuration - fast autonomous coding.
 *
 * Characteristics:
 * - Level: worker (leaf-level executor)
 * - Approval: full-auto (no user confirmation)
 * - Sandbox: full-access (maximum file access)
 * - Checkpoints: 0 (no approval gates)
 *
 * Best for: Quick fixes, simple tasks, trusted environments
 *
 * @example
 * ```typescript
 * import { VIBE_MODE } from './coding-modes';
 *
 * const mode = VIBE_MODE;
 * console.log(mode.checkpointCount); // 0
 * console.log(mode.approvalPolicy);  // 'full-auto'
 * ```
 */
export const VIBE_MODE: CodingModeConfig = {
  name: "code",
  codingMode: "vibe",
  description: "Fast autonomous coding with full tool access",
  tools: { edit: true, bash: true, web: true, mcp: true },
  prompt: "Execute tasks quickly and autonomously. You have full access to all tools.",
  level: AgentLevel.worker,
  approvalPolicy: "full-auto",
  sandboxPolicy: "full-access",
  checkpointsRequired: false,
  checkpointCount: 0,
} as const;

/**
 * Plan mode configuration - plan-then-execute workflow.
 *
 * Characteristics:
 * - Level: workflow (mid-level manager)
 * - Approval: auto-edit (file edits auto, commands ask)
 * - Sandbox: workspace-write (read/write in workspace)
 * - Checkpoints: 1 (approval before execution)
 *
 * Best for: Complex tasks requiring planning, moderate oversight
 *
 * @example
 * ```typescript
 * import { PLAN_MODE } from './coding-modes';
 *
 * const mode = PLAN_MODE;
 * console.log(mode.checkpointCount); // 1
 * console.log(mode.approvalPolicy);  // 'auto-edit'
 * ```
 */
export const PLAN_MODE: CodingModeConfig = {
  name: "plan",
  codingMode: "plan",
  description: "Plan-then-execute with one checkpoint",
  tools: { edit: true, bash: "readonly", web: true, mcp: true },
  prompt: "First analyze and plan your approach, then execute after user approval.",
  level: AgentLevel.workflow,
  approvalPolicy: "auto-edit",
  sandboxPolicy: "workspace-write",
  checkpointsRequired: true,
  checkpointCount: 1,
} as const;

/**
 * Spec mode configuration - 6-phase structured workflow.
 *
 * Characteristics:
 * - Level: orchestrator (top-level coordinator)
 * - Approval: suggest (all actions require confirmation)
 * - Sandbox: workspace-read (read-only until implementation phase)
 * - Checkpoints: 6 (one per phase)
 * - Can spawn: spec-research, spec-impl, spec-validate agents
 *
 * The 6 phases are:
 * 1. Research - gather project context
 * 2. Requirements - define EARS requirements
 * 3. Design - create architecture decisions
 * 4. Tasks - break down into actionable items
 * 5. Implementation - execute with write access
 * 6. Validation - verify deliverables
 *
 * Best for: Large features, new projects, high-quality standards
 *
 * @example
 * ```typescript
 * import { SPEC_MODE } from './coding-modes';
 *
 * const mode = SPEC_MODE;
 * console.log(mode.checkpointCount);   // 6
 * console.log(mode.canSpawnAgents);    // ['spec-research', 'spec-impl', 'spec-validate']
 * ```
 */
export const SPEC_MODE: CodingModeConfig = {
  name: "plan",
  codingMode: "spec",
  description: "6-phase workflow with checkpoints at each phase",
  tools: { edit: false, bash: "readonly", web: true, mcp: true },
  prompt:
    "Follow the structured 6-phase specification workflow. Each phase requires checkpoint approval.",
  level: AgentLevel.orchestrator,
  approvalPolicy: "suggest",
  sandboxPolicy: "workspace-read",
  checkpointsRequired: true,
  checkpointCount: 6,
  canSpawnAgents: ["spec-research", "spec-impl", "spec-validate"],
} as const;

// ============================================
// BUILTIN_CODING_MODES Record (T015)
// ============================================

/**
 * Built-in coding mode configurations.
 *
 * Provides pre-defined, immutable configurations for all three coding modes.
 * Used as the default configurations and reference for mode managers.
 *
 * @example
 * ```typescript
 * import { BUILTIN_CODING_MODES } from './coding-modes';
 *
 * // Access by mode name
 * const vibeConfig = BUILTIN_CODING_MODES.vibe;
 * const planConfig = BUILTIN_CODING_MODES.plan;
 * const specConfig = BUILTIN_CODING_MODES.spec;
 *
 * // Iterate over all modes
 * Object.entries(BUILTIN_CODING_MODES).forEach(([name, config]) => {
 *   console.log(`${name}: ${config.checkpointCount} checkpoints`);
 * });
 * ```
 */
export const BUILTIN_CODING_MODES = {
  vibe: VIBE_MODE,
  plan: PLAN_MODE,
  spec: SPEC_MODE,
} as const satisfies Record<CodingMode, CodingModeConfig>;

// ============================================
// SpecPhase Types (T016)
// ============================================

/**
 * Schema for spec mode phases.
 *
 * The 6 sequential phases in spec mode workflow:
 * 1. research - Gather project context and dependencies
 * 2. requirements - Define EARS requirements
 * 3. design - Create architecture and design decisions
 * 4. tasks - Break down into actionable implementation tasks
 * 5. implementation - Execute tasks with full tool access
 * 6. validation - Verify all deliverables and requirements
 *
 * @example
 * ```typescript
 * SpecPhaseSchema.parse('research');    // ✅ Returns 'research'
 * SpecPhaseSchema.parse('invalid');     // ❌ Throws ZodError
 * ```
 */
export const SpecPhaseSchema = z.enum([
  "research",
  "requirements",
  "design",
  "tasks",
  "implementation",
  "validation",
]);

/**
 * Type for spec mode phases.
 */
export type SpecPhase = z.infer<typeof SpecPhaseSchema>;

/**
 * All available spec phases as a readonly array.
 */
export const SPEC_PHASES = SpecPhaseSchema.options;

/**
 * Tool access level for spec phases.
 */
export type SpecPhaseToolAccess = "read-only" | "read-write" | "full" | "read-test";

/**
 * Configuration for a single spec phase.
 */
export interface SpecPhaseConfig {
  /** Phase number (1-6) */
  phaseNumber: number;
  /** Human-readable phase name */
  name: string;
  /** Expected deliverables for this phase */
  deliverables: string[];
  /** Tool access level for this phase */
  toolAccess: SpecPhaseToolAccess;
}

/**
 * Configuration for all 6 spec phases.
 *
 * Each phase has:
 * - phaseNumber: Sequential number (1-6)
 * - name: Human-readable name
 * - deliverables: Expected output files
 * - toolAccess: Tool restrictions for the phase
 *
 * Tool Access Levels:
 * - read-only: Can read files, no writes
 * - read-write: Can read and write within sandbox
 * - full: All tools enabled
 * - read-test: Can read files and run tests
 *
 * @example
 * ```typescript
 * import { SPEC_PHASE_CONFIG } from './coding-modes';
 *
 * const researchPhase = SPEC_PHASE_CONFIG.research;
 * console.log(researchPhase.phaseNumber);  // 1
 * console.log(researchPhase.deliverables); // ['research.md']
 * console.log(researchPhase.toolAccess);   // 'read-only'
 *
 * // Check if phase allows writes
 * if (SPEC_PHASE_CONFIG.implementation.toolAccess === 'full') {
 *   // Enable write tools
 * }
 * ```
 */
export const SPEC_PHASE_CONFIG: Record<SpecPhase, SpecPhaseConfig> = {
  research: {
    phaseNumber: 1,
    name: "Research",
    deliverables: ["research.md"],
    toolAccess: "read-only",
  },
  requirements: {
    phaseNumber: 2,
    name: "Requirements",
    deliverables: ["requirements.md"],
    toolAccess: "read-only",
  },
  design: {
    phaseNumber: 3,
    name: "Design",
    deliverables: ["design.md"],
    toolAccess: "read-only",
  },
  tasks: {
    phaseNumber: 4,
    name: "Tasks",
    deliverables: ["tasks.md"],
    toolAccess: "read-only",
  },
  implementation: {
    phaseNumber: 5,
    name: "Implementation",
    deliverables: [],
    toolAccess: "full",
  },
  validation: {
    phaseNumber: 6,
    name: "Validation",
    deliverables: ["validation-report.md"],
    toolAccess: "read-test",
  },
} as const;

/**
 * AgentModeIndicator Component (T057)
 *
 * Displays the current agent mode for multi-agent orchestration.
 * Shows agent name, level depth, and agent-specific icons.
 *
 * @module tui/components/StatusBar/AgentModeIndicator
 */

import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Agent level depth in the orchestration hierarchy.
 * - 0: Master orchestrator (ouroboros)
 * - 1: Sub-orchestrators (init, spec, implement, archive)
 * - 2: Workers (coder, qa, writer, analyst, etc.)
 */
export type AgentLevel = 0 | 1 | 2;

/**
 * Known agent types in the multi-agent system.
 */
export type AgentType =
  | "orchestrator"
  | "coder"
  | "qa"
  | "writer"
  | "analyst"
  | "devops"
  | "security"
  | "architect"
  | "researcher"
  | "requirements"
  | "tasks"
  | "validator"
  | "init"
  | "spec"
  | "implement"
  | "archive";

/**
 * Props for the AgentModeIndicator component.
 */
export interface AgentModeIndicatorProps {
  /** Current agent name (e.g., 'orchestrator', 'coder', 'qa') */
  readonly agentName: string;
  /** Agent level depth (0=orchestrator, 1=sub-orchestrator, 2=worker) */
  readonly level?: AgentLevel;
  /** Compact display mode (icon only) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Get agent icons mapping.
 * Uses centralized icon system for consistent terminal display.
 */
function getAgentIcons(): Record<string, string> {
  const icons = getIcons();
  return {
    orchestrator: icons.assistant, // Robot/AI icon
    coder: "⌨", // Keyboard (Unicode)
    qa: "⚗", // Test tube (Unicode)
    writer: "✎", // Pencil (Unicode)
    analyst: "⊙", // Search/target (Unicode)
    devops: icons.tool, // Tool icon
    security: "⊗", // Lock-like (Unicode)
    architect: "⦿", // Diagram-like (Unicode)
    researcher: "⊞", // Book-like (Unicode)
    requirements: icons.plan, // Plan icon
    tasks: icons.note, // Note icon
    validator: icons.check, // Check icon
    init: "▶", // Play (Unicode)
    spec: icons.spec, // Spec icon
    implement: icons.gear, // Gear icon
    archive: "⊟", // Box-like (Unicode)
    default: icons.assistant, // Default robot
  };
}

/**
 * Agent display names mapping.
 */
const AGENT_NAMES: Record<string, string> = {
  orchestrator: "Orchestrator",
  coder: "Coder",
  qa: "QA",
  writer: "Writer",
  analyst: "Analyst",
  devops: "DevOps",
  security: "Security",
  architect: "Architect",
  researcher: "Researcher",
  requirements: "Requirements",
  tasks: "Tasks",
  validator: "Validator",
  init: "Init",
  spec: "Spec",
  implement: "Implement",
  archive: "Archive",
};

/**
 * Level indicator labels.
 */
const LEVEL_LABELS: Record<AgentLevel, string> = {
  0: "L0",
  1: "L1",
  2: "L2",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the icon for an agent type.
 * Falls back to default robot icon for unknown agents.
 */
function getAgentIcon(agentName: string): string {
  const agentIcons = getAgentIcons();
  const normalizedName = agentName.toLowerCase();
  return agentIcons[normalizedName] ?? agentIcons.default ?? getIcons().assistant;
}

/**
 * Gets the display name for an agent.
 * Falls back to capitalized agent name for unknown agents.
 */
function getAgentDisplayName(agentName: string): string {
  const normalizedName = agentName.toLowerCase();
  return AGENT_NAMES[normalizedName] ?? agentName.charAt(0).toUpperCase() + agentName.slice(1);
}

/**
 * Gets the color for an agent level.
 * - L0: Primary (orchestrator level)
 * - L1: Info (sub-orchestrator level)
 * - L2: Secondary (worker level)
 */
function getLevelColor(level: AgentLevel, theme: ReturnType<typeof useTheme>["theme"]): string {
  switch (level) {
    case 0:
      return theme.colors.primary;
    case 1:
      return theme.colors.info;
    case 2:
      return theme.semantic.text.secondary;
    default:
      return theme.semantic.text.muted;
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * AgentModeIndicator displays the current agent in the multi-agent system.
 *
 * Features:
 * - Agent-specific icon (emoji)
 * - Agent name display
 * - Level indicator (L0/L1/L2)
 * - Compact mode for space-constrained layouts
 * - Themed styling based on agent level
 *
 * Agent Levels:
 * - L0: Master orchestrator (ouroboros)
 * - L1: Sub-orchestrators (init, spec, implement, archive)
 * - L2: Workers (coder, qa, writer, analyst, devops, security, etc.)
 *
 * @example
 * ```tsx
 * // Master orchestrator
 * <AgentModeIndicator agentName="orchestrator" level={0} />
 *
 * // Coder worker
 * <AgentModeIndicator agentName="coder" level={2} />
 *
 * // Compact mode (icon only)
 * <AgentModeIndicator agentName="qa" level={2} compact />
 * ```
 */
export function AgentModeIndicator({
  agentName,
  level = 2,
  compact = false,
}: AgentModeIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  const icon = useMemo(() => getAgentIcon(agentName), [agentName]);
  const displayName = useMemo(() => getAgentDisplayName(agentName), [agentName]);
  const levelColor = useMemo(() => getLevelColor(level, theme), [level, theme]);
  const levelLabel = LEVEL_LABELS[level];

  if (compact) {
    return (
      <Box>
        <Text>{icon}</Text>
        <Text color={theme.semantic.text.muted}> </Text>
        <Text color={levelColor}>{levelLabel}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{icon}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={theme.semantic.text.primary}>{displayName}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={levelColor}>[{levelLabel}]</Text>
    </Box>
  );
}

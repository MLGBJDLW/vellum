/**
 * StatusBar Component (T034)
 *
 * Container component that renders all status indicators in a horizontal row.
 * Unified Footer layout: modes | model | context+cost
 *
 * @module tui/components/StatusBar/StatusBar
 */

import type { CodingMode, SandboxPolicy } from "@vellum/core";
import { Box, Text } from "ink";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import type { AgentLevel } from "./AgentModeIndicator.js";
import { ContextProgress, type ContextProgressProps } from "./ContextProgress.js";
import { ModelIndicator } from "./ModelIndicator.js";
import { SandboxIndicator } from "./SandboxIndicator.js";
import { ThinkingModeIndicator, type ThinkingModeIndicatorProps } from "./ThinkingModeIndicator.js";
import { TokenBreakdown, type TokenStats } from "./TokenBreakdown.js";
import { TrustModeIndicator, type TrustModeIndicatorProps } from "./TrustModeIndicator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Extended token usage with granular breakdown.
 * Extends ContextProgressProps with detailed token stats.
 */
export interface ExtendedTokenProps extends ContextProgressProps {
  /** Detailed breakdown of token usage */
  readonly breakdown?: TokenStats;
  /** Current turn's token usage (for per-turn display) */
  readonly turnUsage?: TokenStats;
  /** Whether to show granular breakdown (default: false) */
  readonly showBreakdown?: boolean;
}

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
  /** Current coding mode */
  readonly mode?: CodingMode;
  /** Agent name for display (e.g., 'orchestrator', 'coder') */
  readonly agentName?: string;
  /** Agent level for spec mode (0=orchestrator, 1=sub-orchestrator, 2=worker) */
  readonly agentLevel?: AgentLevel;
  /** Model name (e.g., 'claude-sonnet-4') */
  readonly modelName?: string;
  /** Token usage information (displayed with visual progress bar) */
  readonly tokens?: ExtendedTokenProps;
  /** Trust mode setting */
  readonly trustMode?: TrustModeIndicatorProps["mode"];
  /** Sandbox policy for file system access boundaries */
  readonly sandboxPolicy?: SandboxPolicy;
  /** Thinking mode status */
  readonly thinking?: ThinkingModeIndicatorProps;
  /** Current cost in dollars */
  readonly cost?: number;
  /** Whether to show a border (default: false for unified footer) */
  readonly showBorder?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Separator between status items */
const SEPARATOR = " │ ";

/** Mode display configuration */
const MODES_CONFIG: Array<{ mode: CodingMode; icon: string; label: string }> = [
  { mode: "vibe", icon: "◐", label: "vibe" },
  { mode: "plan", icon: "◇", label: "plan" },
  { mode: "spec", icon: "◈", label: "spec" },
];

/** Agent name to abbreviation mapping for status bar display */
const AGENT_ABBREVIATIONS: Record<string, string> = {
  // Core Agents
  "vibe-agent": "Vibe",
  "plan-agent": "Plan",
  "spec-orchestrator": "Spec",

  // Spec Workflow Workers
  researcher: "Rsrch",
  requirements: "Reqs",
  design: "Dsgn",
  tasks: "Tasks",
  validator: "Valid",

  // Builtin Workers
  coder: "Code",
  qa: "QA",
  writer: "Write",
  analyst: "Anlst",
  architect: "Arch",
  devops: "DevOp",
  security: "Secur",
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * Format cost as currency string.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(2)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * StatusBar displays all status indicators in a horizontal layout.
 *
 * Unified Footer Layout:
 * ```
 * ◐ vibe  ◇ planning  ◈ spec L1 │ claude-sonnet │ ▓▓▓░░ 45% │ $0.02
 * ```
 *
 * Features:
 * - All modes shown with active one highlighted
 * - Agent level indicator for spec mode (L0/L1/L2)
 * - Model name only (no provider prefix)
 * - Context progress with visual bar
 * - Cost display
 *
 * @example
 * ```tsx
 * <StatusBar
 *   mode="vibe"
 *   modelName="claude-sonnet-4"
 *   tokens={{ current: 5000, max: 100000 }}
 *   cost={0.02}
 * />
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: StatusBar displays many dynamic UI elements
export function StatusBar({
  mode = "vibe",
  agentName,
  agentLevel,
  modelName,
  tokens,
  trustMode,
  sandboxPolicy,
  thinking,
  cost,
  showBorder = false,
}: StatusBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Log deprecation warning for agentLevel prop (T017)
  if (agentLevel !== undefined && process.env.NODE_ENV !== "production") {
    console.warn(
      "DEPRECATION WARNING: The 'agentLevel' prop is deprecated in StatusBar. " +
        "Agent level is now derived from agent state in spec mode workflows."
    );
  }

  // Use primary/accent color for status bar border
  const borderColor = theme.colors.primary;

  // Get agent abbreviation for display (fallback: first 5 chars)
  const agentAbbrev = agentName
    ? (AGENT_ABBREVIATIONS[agentName] ?? agentName.slice(0, 5))
    : undefined;

  // Render mode selector (all modes shown, active highlighted)
  const modeSection = (
    <Box key="modes" flexDirection="row">
      {MODES_CONFIG.map((modeConfig, index) => {
        const isActive = modeConfig.mode === mode;
        return (
          <Text key={modeConfig.mode}>
            {index > 0 && "  "}
            <Text
              color={isActive ? theme.brand.primary : theme.semantic.text.muted}
              bold={isActive}
              dimColor={!isActive}
            >
              {modeConfig.icon} {modeConfig.label}
            </Text>
          </Text>
        );
      })}
      {/* Agent level indicator: │ Orch·L0 */}
      {agentAbbrev !== undefined && agentLevel !== undefined && (
        <Text>
          <Text color={theme.semantic.border.muted}> │ </Text>
          <Text color={theme.brand.primary} bold>
            {agentAbbrev}·L{agentLevel}
          </Text>
        </Text>
      )}
    </Box>
  );

  // Collect right-side indicators
  const rightIndicators: React.ReactNode[] = [];

  // Model indicator (compact, name only)
  if (modelName) {
    rightIndicators.push(<ModelIndicator key="model" model={modelName} compact />);
  }

  // Sandbox policy indicator (shows file access boundaries)
  if (sandboxPolicy) {
    rightIndicators.push(<SandboxIndicator key="sandbox" policy={sandboxPolicy} />);
  }

  // Context progress and/or token breakdown
  if (tokens) {
    // Show granular breakdown if requested and data available
    if (tokens.showBreakdown && tokens.breakdown) {
      rightIndicators.push(
        <TokenBreakdown
          key="token-breakdown"
          turn={tokens.turnUsage}
          total={tokens.breakdown}
          compact={true}
          showTurn={!!tokens.turnUsage}
        />
      );
    } else {
      // Default: show progress bar
      rightIndicators.push(
        <ContextProgress
          key="tokens"
          current={tokens.current}
          max={tokens.max}
          showLabel={false}
          barWidth={tokens.barWidth ?? 5}
        />
      );
    }
  }

  // Trust mode (if provided)
  if (trustMode) {
    rightIndicators.push(<TrustModeIndicator key="trust" mode={trustMode} />);
  }

  // Thinking mode (if provided)
  if (thinking) {
    rightIndicators.push(
      <ThinkingModeIndicator
        key="thinking"
        active={thinking.active}
        budget={thinking.budget}
        used={thinking.used}
      />
    );
  }

  // Cost display
  if (cost !== undefined && cost > 0) {
    rightIndicators.push(
      <Box key="cost">
        <Text color={theme.colors.success}>{formatCost(cost)}</Text>
      </Box>
    );
  }

  // Sidebar toggle hint (show only if there's room - not shown when many indicators present)
  // Skip when there are 4+ indicators to avoid terminal overflow
  if (rightIndicators.length < 4) {
    rightIndicators.push(
      <Box key="sidebar-hint">
        <Text color={theme.semantic.text.muted} dimColor>
          ^\ bar
        </Text>
      </Box>
    );
  }

  // Render right indicators with separators
  const renderedRightItems: React.ReactNode[] = [];
  for (let i = 0; i < rightIndicators.length; i++) {
    if (i > 0) {
      renderedRightItems.push(
        <Text key={`sep-${i}`} color={theme.semantic.border.muted}>
          {SEPARATOR}
        </Text>
      );
    }
    renderedRightItems.push(rightIndicators[i]);
  }

  // Empty state
  if (!modelName && !tokens && !cost) {
    return (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        {modeSection}
        <Text color={theme.semantic.text.muted}>{t("status.noInfo")}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      width="100%"
      paddingX={showBorder ? 1 : 0}
      borderStyle={showBorder ? "round" : undefined}
      borderColor={showBorder ? borderColor : undefined}
    >
      {/* Left: Mode selector */}
      {modeSection}

      {/* Right: Model, Context, Cost */}
      <Box flexDirection="row">{renderedRightItems}</Box>
    </Box>
  );
}

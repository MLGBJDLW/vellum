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
import { useMemo } from "react";
import { version } from "../../../version.js";
import { useResilienceOptional } from "../../context/ResilienceContext.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { GradientText } from "../common/GradientText.js";
import type { AgentLevel } from "./AgentModeIndicator.js";
import { ContextProgress, type ContextProgressProps } from "./ContextProgress.js";
import { ModelIndicator } from "./ModelIndicator.js";
import type { PersistenceStatusIndicatorProps } from "./PersistenceStatusIndicator.js";
import { ResilienceStatusSegment } from "./ResilienceIndicator.js";
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
  /** Whether to show all modes or only active (default: false) */
  readonly showAllModes?: boolean;
  /** Persistence status for session save indicator */
  readonly persistence?: Pick<
    PersistenceStatusIndicatorProps,
    "status" | "unsavedCount" | "lastSavedAt"
  >;
}

// =============================================================================
// Constants
// =============================================================================

/** Separator between status items (compact, no extra spaces) */
const SEPARATOR = "│";

/** Mode display configuration */
const MODES_CONFIG: Array<{ mode: CodingMode; icon: string; label: string }> = [
  { mode: "vibe", icon: "◐", label: "vibe" },
  { mode: "plan", icon: "◑", label: "plan" },
  { mode: "spec", icon: "◒", label: "spec" },
];

/** Agent name to abbreviation mapping for status bar display */
const AGENT_ABBREVIATIONS: Record<string, string> = {
  // Mode-based agents (fallback when no role override)
  "vibe-agent": "Vibe",
  "plan-agent": "Plan",
  "spec-orchestrator": "Orch",

  // Spec Workflow Workers
  researcher: "Rsrch",
  requirements: "Reqs",
  design: "Dsgn",
  tasks: "Tasks",
  validator: "Valid",

  // Role-based agents (direct role mappings)
  coder: "Code",
  qa: "QA",
  writer: "Write",
  analyst: "Anlst",
  architect: "Arch",
  devops: "DevOp",
  security: "Sec",
  orchestrator: "Orch",
  base: "Base",
};

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Wrapper that conditionally renders resilience segment with separator.
 * Uses the same context as ResilienceStatusSegment to determine visibility.
 * Returns null when inactive, avoiding double separators in the status bar.
 */
function ResilienceSegmentWithSeparator({
  hasFollowingItems,
}: {
  hasFollowingItems: boolean;
}): React.JSX.Element | null {
  const { theme } = useTheme();
  const context = useResilienceOptional();

  // Same visibility logic as ResilienceStatusSegment
  if (!context || !context.feedbackEnabled || context.status.type === "idle") {
    return null;
  }

  // Render segment with trailing separator when there are following items
  return (
    <>
      <ResilienceStatusSegment />
      {hasFollowingItems && <Text color={theme.semantic.border.muted}>{SEPARATOR}</Text>}
    </>
  );
}

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
  showAllModes = false,
  // NOTE: persistence prop kept for API compatibility but no longer rendered in footer
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  persistence: _persistence,
}: StatusBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Use primary/accent color for status bar border
  const borderColor = theme.colors.primary;

  // Get agent abbreviation for display (fallback: first 5 chars)
  const agentAbbrev = agentName
    ? (AGENT_ABBREVIATIONS[agentName] ?? agentName.slice(0, 5))
    : undefined;

  // Render mode selector (all modes shown, active highlighted)
  const visibleModes = showAllModes
    ? MODES_CONFIG
    : MODES_CONFIG.filter((modeConfig) => modeConfig.mode === mode);

  // Mode-specific gradient colors
  const modeGradients: Record<CodingMode, readonly string[]> = useMemo(
    () => ({
      vibe: [theme.colors.success, "#34d399", "#6ee7b7"], // Green gradient
      plan: [theme.colors.info, "#60a5fa", "#93c5fd"], // Blue gradient
      spec: [theme.colors.primary, "#8b5cf6", "#a78bfa"], // Purple gradient
    }),
    [theme.colors]
  );

  const modeSection = (
    <Box key="modes" flexDirection="row" alignItems="center">
      {visibleModes.map((modeConfig, index) => {
        const isActive = modeConfig.mode === mode;
        const modeText = `${modeConfig.icon} ${modeConfig.label}`;

        return (
          <Text key={modeConfig.mode}>
            {index > 0 && " "}
            {isActive ? (
              <GradientText text={modeText} colors={modeGradients[modeConfig.mode]} bold />
            ) : (
              <Text color={theme.semantic.text.muted} dimColor>
                {modeText}
              </Text>
            )}
          </Text>
        );
      })}
      {/* Agent level indicator: │Orch·L0 */}
      {agentAbbrev !== undefined && agentLevel !== undefined && (
        <Text>
          <Text color={theme.semantic.border.muted}>│</Text>
          <GradientText
            text={`${agentAbbrev}·L${agentLevel}`}
            colors={[theme.brand.primary, theme.brand.secondary]}
            bold
          />
        </Text>
      )}
    </Box>
  );

  // Collect right-side indicators
  // Note: We only push non-null indicators to avoid double separators
  const rightIndicators: React.ReactNode[] = [];

  // Resilience status (rate limiting, retry) - NOT pushed to rightIndicators
  // It's rendered separately with its own conditional separator to avoid double "||" when inactive

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

  // NOTE: Persistence status indicator moved to Sidebar's SystemStatusPanel (T034 UI cleanup)
  // The persistence prop is kept for API compatibility but no longer rendered in footer.

  // Version indicator (always visible)
  rightIndicators.push(
    <Box key="version">
      <Text color={theme.semantic.text.muted} dimColor>
        v{version}
      </Text>
    </Box>
  );

  // Sidebar toggle hint (show only if there's room - not shown when many indicators present)
  // Skip when there are 4+ indicators to avoid terminal overflow
  if (rightIndicators.length < 5) {
    rightIndicators.push(
      <Box key="sidebar-hint">
        <Text color={theme.semantic.text.muted} dimColor>
          Alt+K sidebar
        </Text>
      </Box>
    );
  }

  // Render right indicators with separators (compact layout)
  // ResilienceStatusSegment is rendered first with its own conditional separator
  const renderedRightItems: React.ReactNode[] = [
    <ResilienceSegmentWithSeparator
      key="resilience-with-sep"
      hasFollowingItems={rightIndicators.length > 0}
    />,
  ];
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

      {/* Right: Model, Context, Cost - with separator from mode section */}
      <Box flexDirection="row" alignItems="center">
        <Text color={theme.semantic.border.muted}>{SEPARATOR}</Text>
        {renderedRightItems}
      </Box>
    </Box>
  );
}

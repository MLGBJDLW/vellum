/**
 * SandboxIndicator Component
 *
 * Displays the current sandbox policy with an icon and label.
 * Sandbox policies control file system access boundaries.
 *
 * Trust Mode (approval) and Sandbox (file boundaries) are SEPARATE concepts:
 * - Trust Mode: When to ask user (ask/auto/full-auto)
 * - Sandbox: Where agent can access (workspace/cwd/system)
 *
 * @module tui/components/StatusBar/SandboxIndicator
 */

import type { SandboxPolicy } from "@vellum/core";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the SandboxIndicator component.
 */
export interface SandboxIndicatorProps {
  /** Current sandbox policy */
  readonly policy: SandboxPolicy;
  /** Whether to show compact label (default: true) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Sandbox policy display configuration.
 *
 * Maps technical policy names to user-friendly display:
 * - workspace-read: Read-only within workspace
 * - workspace-write: Read/write within workspace
 * - cwd-read: Read-only in current directory
 * - cwd-write: Read/write in current directory
 * - full-access: Full system-wide access (dangerous)
 */
interface SandboxDisplayConfig {
  readonly icon: string;
  readonly label: string;
  readonly compactLabel: string;
  readonly description: string;
  readonly severity: "safe" | "caution" | "danger";
}

const SANDBOX_DISPLAY: Record<SandboxPolicy, SandboxDisplayConfig> = {
  "workspace-read": {
    icon: "📖",
    label: "workspace (read)",
    compactLabel: "ws·r",
    description: "Read-only access within workspace",
    severity: "safe",
  },
  "workspace-write": {
    icon: "📁",
    label: "workspace",
    compactLabel: "ws",
    description: "Read/write access within workspace",
    severity: "caution",
  },
  "cwd-read": {
    icon: "📂",
    label: "cwd (read)",
    compactLabel: "cwd·r",
    description: "Read-only access in current directory",
    severity: "safe",
  },
  "cwd-write": {
    icon: "📂",
    label: "cwd",
    compactLabel: "cwd",
    description: "Read/write access in current directory",
    severity: "caution",
  },
  "full-access": {
    icon: "🌐",
    label: "system",
    compactLabel: "sys",
    description: "Full system-wide access",
    severity: "danger",
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the semantic color for a sandbox policy severity.
 * - safe: success (green) - limited access
 * - caution: warning (yellow) - workspace/cwd write access
 * - danger: error (red) - full system access
 */
function getSandboxColor(
  severity: SandboxDisplayConfig["severity"],
  theme: ReturnType<typeof useTheme>["theme"]
): string {
  switch (severity) {
    case "safe":
      return theme.colors.success;
    case "caution":
      return theme.colors.warning;
    case "danger":
      return theme.colors.error;
    default:
      return theme.semantic.text.secondary;
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * SandboxIndicator displays the current sandbox policy with visual cues.
 *
 * Features:
 * - Policy-specific icon
 * - Color-coded by access level severity
 * - Compact or full label display
 *
 * Sandbox Policies:
 * - workspace-read: 📖 Read-only within workspace (safe)
 * - workspace-write: 📁 Read/write within workspace (caution)
 * - cwd-read: 📂 Read-only in current directory (safe)
 * - cwd-write: 📂 Read/write in current directory (caution)
 * - full-access: 🌐 Full system access (danger)
 *
 * @example
 * ```tsx
 * // Compact mode (default)
 * <SandboxIndicator policy="workspace-write" />
 * // Output: 📁 ws
 *
 * // Full mode
 * <SandboxIndicator policy="workspace-write" compact={false} />
 * // Output: 📁 workspace
 * ```
 */
export function SandboxIndicator({
  policy,
  compact = true,
}: SandboxIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  const config = useMemo(() => SANDBOX_DISPLAY[policy], [policy]);
  const color = useMemo(() => getSandboxColor(config.severity, theme), [config.severity, theme]);

  const displayLabel = compact ? config.compactLabel : config.label;

  return (
    <Box flexDirection="row">
      <Text color={color}>
        {config.icon} {displayLabel}
      </Text>
    </Box>
  );
}

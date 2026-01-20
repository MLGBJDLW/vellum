/**
 * BacktrackControls Component (T058)
 *
 * UI component for displaying and controlling conversation backtracking.
 * Shows undo/redo status, current branch, and branch selector.
 *
 * @module tui/components/backtrack/BacktrackControls
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { memo, useCallback, useState } from "react";
import type { BacktrackState, Branch } from "../../hooks/useBacktrack.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the BacktrackControls component.
 */
export interface BacktrackControlsProps {
  /** Current backtrack state */
  readonly backtrackState: BacktrackState;
  /** Available branches */
  readonly branches: ReadonlyArray<Branch<unknown>>;
  /** Handler for undo action */
  readonly onUndo: () => void;
  /** Handler for redo action */
  readonly onRedo: () => void;
  /** Handler for creating a new branch */
  readonly onCreateBranch: () => void;
  /** Handler for switching branches */
  readonly onSwitchBranch: (branchId: string) => void;
  /** Whether the component is focused for input */
  readonly isFocused?: boolean;
  /** Whether to show in compact mode */
  readonly compact?: boolean;
  /** Whether to show keyboard hints */
  readonly showHints?: boolean;
}

/**
 * Props for the BranchSelector sub-component.
 */
interface BranchSelectorProps {
  readonly branches: ReadonlyArray<Branch<unknown>>;
  readonly currentBranch: string;
  readonly onSelect: (branchId: string) => void;
  readonly onClose: () => void;
  readonly isFocused: boolean;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Branch selector popup for choosing between branches.
 */
function BranchSelector({
  branches,
  currentBranch,
  onSelect,
  onClose,
  isFocused,
}: BranchSelectorProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = branches.findIndex((b) => b.name === currentBranch);
    return index >= 0 ? index : 0;
  });

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(branches.length - 1, prev + 1));
      } else if (key.return) {
        const branch = branches[selectedIndex];
        if (branch) {
          onSelect(branch.id);
        }
        onClose();
      } else if (key.escape || input === "q") {
        onClose();
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.muted} paddingX={1}>
      <Text bold color={theme.colors.primary}>
        {t("backtrack.selectBranch")}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {branches.map((branch, index) => {
          const isSelected = index === selectedIndex;
          const isCurrent = branch.name === currentBranch;

          return (
            <Box key={branch.id}>
              <Text color={isSelected ? theme.colors.primary : undefined} inverse={isSelected}>
                {isSelected ? "▸ " : "  "}
                {branch.name}
                {isCurrent ? ` ${t("backtrack.current")}` : ""}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{t("backtrack.keybindings")}</Text>
      </Box>
    </Box>
  );
}

/**
 * Status indicator showing undo/redo availability.
 */
function StatusIndicator({
  canUndo,
  canRedo,
  compact,
  t,
}: {
  canUndo: boolean;
  canRedo: boolean;
  compact: boolean;
  t: (key: string) => string;
}): React.JSX.Element {
  const { theme } = useTheme();

  if (compact) {
    return (
      <Box>
        <Text color={canUndo ? theme.colors.success : theme.colors.muted}>◀</Text>
        <Text color={canRedo ? theme.colors.success : theme.colors.muted}>▶</Text>
      </Box>
    );
  }

  return (
    <Box gap={1}>
      <Text color={canUndo ? theme.colors.success : theme.colors.muted}>
        {"[<]"} {t("backtrack.undo")} {canUndo ? "+" : "x"}
      </Text>
      <Text color={canRedo ? theme.colors.success : theme.colors.muted}>
        {"[>]"} {t("backtrack.redo")} {canRedo ? "+" : "x"}
      </Text>
    </Box>
  );
}

/**
 * Branch indicator showing current branch and fork count.
 */
function BranchIndicator({
  currentBranch,
  forkCount,
  compact,
  t,
}: {
  currentBranch: string;
  forkCount: number;
  compact: boolean;
  onClick?: () => void;
  t: (key: string) => string;
}): React.JSX.Element {
  const { theme } = useTheme();

  if (compact) {
    return (
      <Box>
        <Text color={theme.colors.info}>⎇{forkCount > 0 ? `+${forkCount}` : ""}</Text>
      </Box>
    );
  }

  return (
    <Box gap={1}>
      <Text color={theme.colors.info}>⎇ {currentBranch}</Text>
      {forkCount > 0 && (
        <Text dimColor>
          ({forkCount} {forkCount !== 1 ? t("backtrack.forks") : t("backtrack.fork")})
        </Text>
      )}
    </Box>
  );
}

/**
 * History position indicator.
 */
function HistoryIndicator({
  currentIndex,
  historyLength,
}: {
  currentIndex: number;
  historyLength: number;
}): React.JSX.Element {
  const position = currentIndex + 1;

  return (
    <Text dimColor>
      [{position}/{historyLength}]
    </Text>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * BacktrackControls displays undo/redo status and branch management UI.
 *
 * Features:
 * - Visual indicators for undo/redo availability
 * - Current branch display with fork count
 * - Branch selector popup (Ctrl+B to toggle)
 * - History position indicator
 * - Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y (redo), Ctrl+B (branch)
 *
 * @example
 * ```tsx
 * const {
 *   backtrackState,
 *   branches,
 *   undo,
 *   redo,
 *   createBranch,
 *   switchBranch,
 * } = useBacktrack({ initialState: messages });
 *
 * <BacktrackControls
 *   backtrackState={backtrackState}
 *   branches={branches}
 *   onUndo={undo}
 *   onRedo={redo}
 *   onCreateBranch={() => createBranch()}
 *   onSwitchBranch={switchBranch}
 *   isFocused={true}
 *   showHints={true}
 * />
 * ```
 */
export const BacktrackControls = memo(function BacktrackControls({
  backtrackState,
  branches,
  onUndo,
  onRedo,
  onCreateBranch,
  onSwitchBranch,
  isFocused = false,
  compact = false,
  showHints = true,
}: BacktrackControlsProps): React.JSX.Element {
  const { t } = useTUITranslation();
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const { canUndo, canRedo, forkCount, currentBranch, currentIndex, historyLength } =
    backtrackState;

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused || showBranchSelector) return;

      // Ctrl+Z for undo
      if (key.ctrl && input === "z") {
        onUndo();
        return;
      }

      // Ctrl+Y for redo
      if (key.ctrl && input === "y") {
        onRedo();
        return;
      }

      // Ctrl+B for branch selector or create branch
      if (key.ctrl && input === "b") {
        if (branches.length > 1) {
          setShowBranchSelector(true);
        } else {
          onCreateBranch();
        }
        return;
      }

      // Ctrl+Shift+B to always create new branch
      if (key.ctrl && key.shift && input === "B") {
        onCreateBranch();
        return;
      }
    },
    { isActive: isFocused && !showBranchSelector }
  );

  const handleBranchSelect = useCallback(
    (branchId: string) => {
      onSwitchBranch(branchId);
      setShowBranchSelector(false);
    },
    [onSwitchBranch]
  );

  const handleBranchClose = useCallback(() => {
    setShowBranchSelector(false);
  }, []);

  // Branch selector overlay
  if (showBranchSelector) {
    return (
      <BranchSelector
        branches={branches}
        currentBranch={currentBranch}
        onSelect={handleBranchSelect}
        onClose={handleBranchClose}
        isFocused={isFocused}
      />
    );
  }

  // Compact mode - single line
  if (compact) {
    return (
      <Box gap={1}>
        <StatusIndicator canUndo={canUndo} canRedo={canRedo} compact={true} t={t} />
        <BranchIndicator
          currentBranch={currentBranch}
          forkCount={forkCount}
          compact={true}
          onClick={() => setShowBranchSelector(true)}
          t={t}
        />
        <HistoryIndicator currentIndex={currentIndex} historyLength={historyLength} />
      </Box>
    );
  }

  // Full mode
  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <StatusIndicator canUndo={canUndo} canRedo={canRedo} compact={false} t={t} />
        <Text dimColor>│</Text>
        <BranchIndicator
          currentBranch={currentBranch}
          forkCount={forkCount}
          compact={false}
          onClick={() => setShowBranchSelector(true)}
          t={t}
        />
        <Text dimColor>│</Text>
        <HistoryIndicator currentIndex={currentIndex} historyLength={historyLength} />
      </Box>

      {showHints && (
        <Box marginTop={1}>
          <Text dimColor>
            ^Z {t("backtrack.undo").toLowerCase()} • ^Y {t("backtrack.redo").toLowerCase()} • ^B{" "}
            {branches.length > 1 ? t("backtrack.switchBranch") : t("backtrack.newBranch")}
          </Text>
        </Box>
      )}
    </Box>
  );
});

/**
 * Compact status bar variant of BacktrackControls.
 * Designed to fit in the status bar area.
 */
export function BacktrackStatusBar({
  backtrackState,
}: {
  backtrackState: BacktrackState;
}): React.JSX.Element {
  const { theme } = useTheme();
  const { canUndo, canRedo, currentBranch, currentIndex, historyLength } = backtrackState;

  return (
    <Box gap={1}>
      <Text color={canUndo ? theme.colors.info : theme.colors.muted}>◀</Text>
      <Text dimColor>
        {currentIndex + 1}/{historyLength}
      </Text>
      <Text color={canRedo ? theme.colors.info : theme.colors.muted}>▶</Text>
      {currentBranch !== "Main" && <Text color={theme.colors.warning}>⎇ {currentBranch}</Text>}
    </Box>
  );
}

/**
 * AgentProgress Component (T046)
 *
 * TUI component for displaying agent task progress with a visual task tree
 * and progress bar. Shows task status with icons and completion percentage.
 *
 * @module tui/components/AgentProgress
 */

import type { TaskChain, TaskChainNode } from "@vellum/core";
import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the AgentProgress component.
 */
export interface AgentProgressProps {
  /** The task chain to display */
  readonly chain: TaskChain;
  /** ID of the currently executing task (for highlighting) */
  readonly currentTaskId?: string;
  /** Whether to show detailed task information */
  readonly showDetails?: boolean;
  /** Width of the progress bar in characters (default: 20) */
  readonly progressBarWidth?: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Status icons for task states.
 * Using Unicode symbols for terminal display.
 */
const STATUS_ICONS: Record<TaskChainNode["status"], string> = {
  pending: "○",
  running: "◐",
  completed: "●",
  failed: "✗",
} as const;

/**
 * Tree line characters for visual hierarchy.
 */
const TREE_CHARS = {
  branch: "├──",
  last: "└──",
  vertical: "│  ",
  space: "   ",
} as const;

/** Default progress bar width */
const DEFAULT_PROGRESS_BAR_WIDTH = 20;

/** Progress bar characters */
const PROGRESS_FILLED = "█";
const PROGRESS_EMPTY = "░";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the color for a task status.
 */
function getStatusColor(
  status: TaskChainNode["status"],
  isCurrent: boolean,
  theme: ReturnType<typeof useTheme>["theme"]
): string {
  if (isCurrent) {
    return theme.semantic.status.running;
  }

  switch (status) {
    case "completed":
      return theme.semantic.status.complete;
    case "failed":
      return theme.semantic.status.error;
    case "running":
      return theme.semantic.status.running;
    case "pending":
    default:
      return theme.semantic.text.muted;
  }
}

/**
 * Build a hierarchical tree structure from task chain nodes.
 * Returns nodes organized by parent-child relationships.
 */
interface TreeNode {
  node: TaskChainNode;
  children: TreeNode[];
}

function buildTree(chain: TaskChain): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create TreeNode wrappers
  for (const [, node] of chain.nodes) {
    nodeMap.set(node.taskId, { node, children: [] });
  }

  // Build parent-child relationships
  for (const [, treeNode] of nodeMap) {
    const parentId = treeNode.node.parentTaskId;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(treeNode);
    } else {
      // Root node (no parent)
      roots.push(treeNode);
    }
  }

  // Sort children by creation time
  for (const treeNode of nodeMap.values()) {
    treeNode.children.sort((a, b) => a.node.createdAt.getTime() - b.node.createdAt.getTime());
  }

  // Sort roots by creation time
  roots.sort((a, b) => a.node.createdAt.getTime() - b.node.createdAt.getTime());

  return roots;
}

/**
 * Flatten tree into display order with depth info for rendering.
 */
interface FlattenedNode {
  node: TaskChainNode;
  depth: number;
  isLast: boolean;
  parentIsLast: boolean[];
}

function flattenTree(
  roots: TreeNode[],
  depth: number = 0,
  parentIsLast: boolean[] = []
): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  for (let i = 0; i < roots.length; i++) {
    const treeNode = roots[i]!;
    const isLast = i === roots.length - 1;

    result.push({
      node: treeNode.node,
      depth,
      isLast,
      parentIsLast: [...parentIsLast],
    });

    if (treeNode.children.length > 0) {
      result.push(...flattenTree(treeNode.children, depth + 1, [...parentIsLast, isLast]));
    }
  }

  return result;
}

/**
 * Calculate progress statistics from the task chain.
 */
interface ProgressStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  percentage: number;
}

function calculateProgress(chain: TaskChain): ProgressStats {
  const stats: ProgressStats = {
    total: chain.nodes.size,
    completed: 0,
    failed: 0,
    running: 0,
    pending: 0,
    percentage: 0,
  };

  for (const node of chain.nodes.values()) {
    switch (node.status) {
      case "completed":
        stats.completed++;
        break;
      case "failed":
        stats.failed++;
        break;
      case "running":
        stats.running++;
        break;
      case "pending":
        stats.pending++;
        break;
    }
  }

  if (stats.total > 0) {
    stats.percentage = Math.round((stats.completed / stats.total) * 100);
  }

  return stats;
}

/**
 * Generate ASCII progress bar.
 */
function generateProgressBar(percentage: number, width: number): string {
  const filledCount = Math.round((percentage / 100) * width);
  const emptyCount = width - filledCount;

  return PROGRESS_FILLED.repeat(filledCount) + PROGRESS_EMPTY.repeat(emptyCount);
}

/**
 * Format task ID for display (truncate if needed).
 */
function formatTaskId(taskId: string, maxLength: number = 20): string {
  if (taskId.length <= maxLength) {
    return taskId;
  }
  return `${taskId.substring(0, maxLength - 3)}...`;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface TaskTreeItemProps {
  readonly flatNode: FlattenedNode;
  readonly isCurrent: boolean;
  readonly showDetails: boolean;
}

/**
 * Single task item in the tree view.
 */
function TaskTreeItem({ flatNode, isCurrent, showDetails }: TaskTreeItemProps): React.JSX.Element {
  const { theme } = useTheme();
  const { node, depth, isLast, parentIsLast } = flatNode;

  const statusIcon = STATUS_ICONS[node.status];
  const statusColor = getStatusColor(node.status, isCurrent, theme);

  // Build prefix for tree structure
  let prefix = "";
  for (let i = 0; i < depth; i++) {
    const parentLast = parentIsLast[i];
    prefix += parentLast ? TREE_CHARS.space : TREE_CHARS.vertical;
  }

  // Add branch character for non-root nodes
  if (depth > 0) {
    prefix = prefix.slice(0, -3) + (isLast ? TREE_CHARS.last : TREE_CHARS.branch);
  }

  // Format task display
  const taskDisplay = showDetails
    ? `${formatTaskId(node.taskId)} [${node.agentSlug}]`
    : formatTaskId(node.taskId);

  const currentMarker = isCurrent ? " (current)" : "";

  return (
    <Box>
      <Text color={theme.semantic.text.muted}>{prefix}</Text>
      <Text color={statusColor}>{statusIcon}</Text>
      <Text> </Text>
      <Text color={isCurrent ? theme.semantic.status.running : theme.semantic.text.primary}>
        {taskDisplay}
      </Text>
      {isCurrent && (
        <Text color={theme.semantic.status.running} italic>
          {currentMarker}
        </Text>
      )}
    </Box>
  );
}

interface ProgressBarDisplayProps {
  readonly stats: ProgressStats;
  readonly width: number;
}

/**
 * Progress bar with completion percentage.
 */
function ProgressBarDisplay({ stats, width }: ProgressBarDisplayProps): React.JSX.Element {
  const { theme } = useTheme();

  const progressBar = generateProgressBar(stats.percentage, width);

  // Determine progress bar color based on completion
  let barColor = theme.semantic.status.running;
  if (stats.failed > 0) {
    barColor = theme.semantic.status.error;
  } else if (stats.percentage === 100) {
    barColor = theme.semantic.status.complete;
  }

  return (
    <Box marginTop={1}>
      <Text color={theme.semantic.text.muted}>Progress: </Text>
      <Text color={theme.semantic.text.primary}>
        {stats.completed}/{stats.total}
      </Text>
      <Text color={theme.semantic.text.muted}> ({stats.percentage}%) </Text>
      <Text color={barColor}>{progressBar}</Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * AgentProgress displays a visual task tree with progress tracking.
 *
 * Features:
 * - Hierarchical task tree visualization
 * - Status icons (○ pending, ◐ running, ● completed, ✗ failed)
 * - ASCII progress bar with percentage
 * - Current task highlighting
 * - Optional detailed view with agent slugs
 *
 * @example
 * ```tsx
 * // Basic usage
 * <AgentProgress chain={taskChain} />
 *
 * // With current task highlighting
 * <AgentProgress
 *   chain={taskChain}
 *   currentTaskId="task-123"
 * />
 *
 * // With details and custom progress bar width
 * <AgentProgress
 *   chain={taskChain}
 *   currentTaskId="task-123"
 *   showDetails={true}
 *   progressBarWidth={30}
 * />
 * ```
 *
 * Display format:
 * ```
 * Task Chain: abc123
 * ├── ● T001 - Create schema
 * ├── ● T002 - Implement handler
 * ├── ◐ T003 - Write tests (current)
 * ├── ○ T004 - Documentation
 * └── ○ T005 - Integration
 *
 * Progress: 2/5 (40%) ████████░░░░░░░░░░░░
 * ```
 */
export function AgentProgress({
  chain,
  currentTaskId,
  showDetails = false,
  progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH,
}: AgentProgressProps): React.JSX.Element {
  const { theme } = useTheme();

  // Build tree structure and flatten for rendering
  const flattenedNodes = useMemo(() => {
    const tree = buildTree(chain);
    return flattenTree(tree);
  }, [chain]);

  // Calculate progress statistics
  const stats = useMemo(() => calculateProgress(chain), [chain]);

  // Empty state
  if (chain.nodes.size === 0) {
    return (
      <Box flexDirection="column">
        <Text color={theme.semantic.text.muted}>No tasks in chain</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Chain header */}
      <Box marginBottom={1}>
        <Text color={theme.semantic.text.muted}>Task Chain: </Text>
        <Text color={theme.semantic.text.primary} bold>
          {formatTaskId(chain.chainId, 30)}
        </Text>
      </Box>

      {/* Task tree */}
      <Box flexDirection="column">
        {flattenedNodes.map((flatNode) => (
          <TaskTreeItem
            key={flatNode.node.taskId}
            flatNode={flatNode}
            isCurrent={flatNode.node.taskId === currentTaskId}
            showDetails={showDetails}
          />
        ))}
      </Box>

      {/* Progress bar */}
      <ProgressBarDisplay stats={stats} width={progressBarWidth} />
    </Box>
  );
}

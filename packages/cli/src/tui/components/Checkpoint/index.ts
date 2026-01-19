/**
 * Checkpoint Components
 *
 * React Ink components for managing file state checkpoints.
 * Uses the Snapshot system (shadow Git repository) for tracking file states.
 *
 * @module tui/components/Checkpoint
 */

export type { CheckpointDiffViewProps } from "./CheckpointDiffView.js";
export {
  CheckpointDiffView,
  default as CheckpointDiffViewDefault,
} from "./CheckpointDiffView.js";
export type { SnapshotCheckpointPanelProps } from "./SnapshotCheckpointPanel.js";
export {
  default as SnapshotCheckpointPanelDefault,
  SnapshotCheckpointPanel,
} from "./SnapshotCheckpointPanel.js";

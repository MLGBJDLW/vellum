/**
 * Git Snapshot Module
 *
 * Provides automatic git-based snapshots for session state preservation.
 * Enables efficient undo/redo and session recovery through git commits.
 */

// T039 - Diff formatter
export {
  formatFileDiff,
  formatMultiFileDiff,
  getDiffStats,
  renderFormattedDiff,
} from "./diff-formatter.js";

// T006 - Git error factory functions
export {
  gitLockTimeoutError,
  gitNotInitializedError,
  gitOperationFailedError,
  gitProtectedPathError,
  gitSnapshotDisabledError,
} from "./errors.js";
// T008 - Exclusion patterns
export {
  getExclusionPatterns,
  getMinimalExclusionPatterns,
} from "./exclusions.js";
// T009 - Git snapshot lock
export {
  GitSnapshotLock,
  globalSnapshotLock,
} from "./lock.js";
// T011-T015 - Git operations
export { type DiffNameEntry, GitOperations } from "./operations.js";
// T007 - Safety module
export {
  checkProtectedPath,
  getGitSafetyConfig,
  getNoGpgFlags,
  getSanitizedEnv,
} from "./safety.js";
// T016-T022 - Git snapshot service
export {
  type CreateGitSnapshotServiceOptions,
  createGitSnapshotService,
  type GitSnapshotCreatedEvent,
  type GitSnapshotEventBus,
  type GitSnapshotRestoredEvent,
  type GitSnapshotRevertedEvent,
  GitSnapshotService,
} from "./service.js";
// T005 - Git types and schemas
export {
  type DiffHunk,
  DiffHunkSchema,
  type DiffLine,
  DiffLineSchema,
  type DiffLineType,
  DiffLineTypeSchema,
  type FileChangeType,
  FileChangeTypeSchema,
  type FormattedDiff,
  FormattedDiffSchema,
  type GitFileChange,
  GitFileChangeSchema,
  type GitFileDiff,
  GitFileDiffSchema,
  type GitPatch,
  GitPatchSchema,
  type GitSnapshotConfig,
  GitSnapshotConfigSchema,
  type GitSnapshotRecord,
  GitSnapshotRecordSchema,
  type IGitSnapshotService,
} from "./types.js";

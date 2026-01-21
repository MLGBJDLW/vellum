// ============================================
// File Memory Types (Phase 2a)
// ============================================

/**
 * Types for file-based memory management.
 *
 * Implements the Manus 3-file pattern:
 * - task_plan.md: Track phases and progress
 * - findings.md: Store research and findings
 * - progress.md: Session log and test results
 *
 * Philosophy: Context Window = RAM (volatile), Filesystem = Disk (persistent)
 *
 * @module @vellum/core/agent/memory/types
 */

import { z } from "zod";

// =============================================================================
// Memory Section Types
// =============================================================================

/**
 * Memory section identifiers (Manus 3-file pattern).
 *
 * - `plan`: Task phases, milestones, and overall progress tracking
 * - `findings`: Research notes, code analysis, and discovered patterns
 * - `progress`: Session logs, test results, and detailed activity
 */
export const MemorySectionSchema = z.enum(["plan", "findings", "progress"]);

export type MemorySection = z.infer<typeof MemorySectionSchema>;

/**
 * All available memory sections.
 */
export const MEMORY_SECTIONS: readonly MemorySection[] = ["plan", "findings", "progress"] as const;

/**
 * File names for each memory section.
 */
export const MEMORY_FILE_NAMES: Record<MemorySection, string> = {
  plan: "task_plan.md",
  findings: "findings.md",
  progress: "progress.md",
} as const;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for FileMemoryManager.
 */
export const FileMemoryConfigSchema = z.object({
  /** Size threshold to emit warning (default: 10KB) */
  warningSizeBytes: z
    .number()
    .int()
    .positive()
    .default(10 * 1024),
  /** Size threshold to trigger compaction (default: 20KB) */
  compactionSizeBytes: z
    .number()
    .int()
    .positive()
    .default(20 * 1024),
  /** Whether to auto-snapshot after writes (default: true) */
  autoSnapshot: z.boolean().default(true),
  /** Maximum lines to keep during compaction (default: 100) */
  compactionMaxLines: z.number().int().positive().default(100),
  /** Header marker for compacted sections */
  compactedMarker: z.string().default("[COMPACTED]"),
});

export type FileMemoryConfig = z.infer<typeof FileMemoryConfigSchema>;

/**
 * Default configuration for FileMemoryManager.
 */
export const DEFAULT_FILE_MEMORY_CONFIG: FileMemoryConfig = FileMemoryConfigSchema.parse({});

// =============================================================================
// Memory Status Types
// =============================================================================

/**
 * Size status of a memory section.
 */
export type MemorySizeStatus = "ok" | "warning" | "needs_compaction";

/**
 * Information about a memory section.
 */
export interface MemorySectionInfo {
  /** Section identifier */
  section: MemorySection;
  /** File path on disk */
  filePath: string;
  /** Current size in bytes */
  sizeBytes: number;
  /** Size status based on thresholds */
  status: MemorySizeStatus;
  /** Whether file exists */
  exists: boolean;
  /** Last modified timestamp */
  modifiedAt?: Date;
}

/**
 * Overall memory status.
 */
export interface MemoryStatus {
  /** Memory directory path */
  memoryPath: string;
  /** Whether memory is initialized */
  initialized: boolean;
  /** Status of each section */
  sections: Record<MemorySection, MemorySectionInfo>;
  /** Total size across all sections */
  totalSizeBytes: number;
  /** Last snapshot hash (if available) */
  lastSnapshotHash?: string;
}

// =============================================================================
// Compaction Types
// =============================================================================

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Section that was compacted */
  section: MemorySection;
  /** Size before compaction (bytes) */
  originalSize: number;
  /** Size after compaction (bytes) */
  compactedSize: number;
  /** Lines removed */
  linesRemoved: number;
  /** Timestamp of compaction */
  compactedAt: Date;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Events emitted by FileMemoryManager.
 */
export interface FileMemoryEvents {
  /** Emitted when a section reaches warning size */
  onWarning?: (section: MemorySection, sizeBytes: number) => void;
  /** Emitted after a section is compacted */
  onCompacted?: (result: CompactionResult) => void;
  /** Emitted after a snapshot is created */
  onSnapshot?: (hash: string) => void;
  /** Emitted on write errors */
  onError?: (error: Error, operation: string) => void;
}

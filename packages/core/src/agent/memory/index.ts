// ============================================
// Agent Memory Module - Barrel Export
// ============================================

/**
 * File-based memory management for persistent agent state.
 *
 * @module @vellum/core/agent/memory
 */

export {
  createFileMemoryManager,
  FileMemoryManager,
  type IFileMemoryManager,
} from "./file-memory-manager.js";
export {
  type CompactionResult,
  DEFAULT_FILE_MEMORY_CONFIG,
  type FileMemoryConfig,
  FileMemoryConfigSchema,
  type FileMemoryEvents,
  MEMORY_FILE_NAMES,
  MEMORY_SECTIONS,
  type MemorySection,
  type MemorySectionInfo,
  MemorySectionSchema,
  type MemorySizeStatus,
  type MemoryStatus,
} from "./types.js";

// ============================================
// File Memory Manager (Phase 2a)
// ============================================

/**
 * File-based memory manager for persistent state across sessions.
 *
 * Implements the Manus 3-file pattern for context persistence:
 * - task_plan.md: Track phases and progress
 * - findings.md: Store research and findings
 * - progress.md: Session log and test results
 *
 * Philosophy: "Context Window = RAM (volatile), Filesystem = Disk (persistent)"
 *
 * @module @vellum/core/agent/memory/file-memory-manager
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Snapshot } from "../../session/snapshot.js";
import {
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

// =============================================================================
// Constants
// =============================================================================

/** Base directory for vellum data */
const VELLUM_DIR = ".vellum";

/** Subdirectory for memory files */
const MEMORY_DIR = "memory";

/** Timestamp format for progress entries */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// =============================================================================
// FileMemoryManager Interface
// =============================================================================

/**
 * Interface for file-based memory management.
 */
export interface IFileMemoryManager {
  // Core operations
  write(section: MemorySection, content: string): Promise<void>;
  read(section: MemorySection): Promise<string | null>;
  append(section: "findings" | "progress", content: string): Promise<void>;

  // Memory management
  compact(section: MemorySection): Promise<CompactionResult>;
  snapshot(message?: string): Promise<string | null>;

  // Lifecycle
  initialize(workingDir: string, sessionId?: string): Promise<void>;
  getMemoryPath(): string;
  getStatus(): Promise<MemoryStatus>;

  // Configuration
  getConfig(): FileMemoryConfig;
  setEvents(events: FileMemoryEvents): void;
}

// =============================================================================
// FileMemoryManager Implementation
// =============================================================================

/**
 * File-based memory manager for persistent state.
 *
 * Creates and manages memory files in `.vellum/memory/`:
 * - task_plan.md - Phase tracking and milestones
 * - findings.md - Research notes and discoveries
 * - progress.md - Session activity log
 *
 * Integrates with Shadow Git for automatic snapshots after writes.
 *
 * @example
 * ```typescript
 * const memory = new FileMemoryManager();
 * await memory.initialize("/path/to/project", "session-123");
 *
 * // Write to plan
 * await memory.write("plan", "## Phase 1: Setup\n- [ ] Initialize project");
 *
 * // Append findings
 * await memory.append("findings", "Found existing API at /api/v1");
 *
 * // Read progress
 * const progress = await memory.read("progress");
 *
 * // Check status
 * const status = await memory.getStatus();
 * if (status.sections.findings.status === "needs_compaction") {
 *   await memory.compact("findings");
 * }
 * ```
 */
export class FileMemoryManager implements IFileMemoryManager {
  private config: FileMemoryConfig = DEFAULT_FILE_MEMORY_CONFIG;
  private events: FileMemoryEvents = {};
  private workingDir = "";
  private sessionId = "";
  private memoryPath = "";
  private initialized = false;
  private lastSnapshotHash?: string;

  /**
   * Creates a new FileMemoryManager instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<FileMemoryConfig>) {
    if (config) {
      this.config = FileMemoryConfigSchema.parse({
        ...DEFAULT_FILE_MEMORY_CONFIG,
        ...config,
      });
    }
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Initializes the memory manager for a project.
   *
   * Creates the memory directory structure and initializes Shadow Git
   * if not already done.
   *
   * @param workingDir - The project working directory
   * @param sessionId - Optional session ID for tracking
   */
  async initialize(workingDir: string, sessionId?: string): Promise<void> {
    this.workingDir = path.resolve(workingDir);
    this.sessionId = sessionId ?? `session-${Date.now()}`;
    this.memoryPath = path.join(this.workingDir, VELLUM_DIR, MEMORY_DIR);

    // Create memory directory
    await fs.mkdir(this.memoryPath, { recursive: true });

    // Initialize Shadow Git if configured for auto-snapshot
    if (this.config.autoSnapshot) {
      await Snapshot.init(this.workingDir);
    }

    // Create initial files if they don't exist
    await this.ensureMemoryFiles();

    this.initialized = true;
  }

  /**
   * Gets the path to the memory directory.
   *
   * @returns The absolute path to `.vellum/memory/`
   * @throws Error if not initialized
   */
  getMemoryPath(): string {
    this.ensureInitialized();
    return this.memoryPath;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The active configuration
   */
  getConfig(): FileMemoryConfig {
    return { ...this.config };
  }

  /**
   * Sets event handlers for memory operations.
   *
   * @param events - Event handlers to register
   */
  setEvents(events: FileMemoryEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Writes content to a memory section, replacing existing content.
   *
   * Triggers auto-snapshot if configured.
   *
   * @param section - The memory section to write to
   * @param content - The content to write
   */
  async write(section: MemorySection, content: string): Promise<void> {
    this.ensureInitialized();
    MemorySectionSchema.parse(section);

    const filePath = this.getSectionPath(section);

    try {
      await fs.writeFile(filePath, content, "utf-8");

      // Check size and emit warning if needed
      await this.checkSizeAndWarn(section);

      // Auto-snapshot after write
      if (this.config.autoSnapshot) {
        await this.snapshot(`memory: update ${section}`);
      }
    } catch (error) {
      this.events.onError?.(error as Error, `write:${section}`);
      throw error;
    }
  }

  /**
   * Reads content from a memory section.
   *
   * @param section - The memory section to read
   * @returns The content, or null if file doesn't exist
   */
  async read(section: MemorySection): Promise<string | null> {
    this.ensureInitialized();
    MemorySectionSchema.parse(section);

    const filePath = this.getSectionPath(section);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      this.events.onError?.(error as Error, `read:${section}`);
      throw error;
    }
  }

  /**
   * Appends content to a memory section (findings or progress only).
   *
   * Adds a timestamp prefix for progress entries.
   * Triggers auto-snapshot if configured.
   *
   * @param section - The memory section to append to (findings or progress)
   * @param content - The content to append
   */
  async append(section: "findings" | "progress", content: string): Promise<void> {
    this.ensureInitialized();

    // Validate section is appendable
    if (section !== "findings" && section !== "progress") {
      throw new Error(
        `Cannot append to section: ${section}. Only 'findings' and 'progress' support append.`
      );
    }

    const filePath = this.getSectionPath(section);
    let formattedContent = content;

    // Add timestamp prefix for progress entries
    if (section === "progress") {
      const timestamp = this.formatTimestamp(new Date());
      formattedContent = `\n[${timestamp}] ${content}`;
    } else {
      formattedContent = `\n${content}`;
    }

    try {
      await fs.appendFile(filePath, formattedContent, "utf-8");

      // Check size and emit warning if needed
      await this.checkSizeAndWarn(section);

      // Auto-snapshot after append
      if (this.config.autoSnapshot) {
        await this.snapshot(`memory: append ${section}`);
      }
    } catch (error) {
      this.events.onError?.(error as Error, `append:${section}`);
      throw error;
    }
  }

  // ===========================================================================
  // Memory Management
  // ===========================================================================

  /**
   * Compacts a memory section by summarizing old content.
   *
   * Keeps the most recent entries and adds a compaction marker.
   * Does NOT use LLM summarization - just truncates to configured max lines.
   *
   * @param section - The memory section to compact
   * @returns Result of the compaction operation
   */
  async compact(section: MemorySection): Promise<CompactionResult> {
    this.ensureInitialized();
    MemorySectionSchema.parse(section);

    const filePath = this.getSectionPath(section);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const originalSize = Buffer.byteLength(content, "utf-8");
      const lines = content.split("\n");
      const originalLineCount = lines.length;

      // If already small enough, no compaction needed
      if (lines.length <= this.config.compactionMaxLines) {
        return {
          section,
          originalSize,
          compactedSize: originalSize,
          linesRemoved: 0,
          compactedAt: new Date(),
        };
      }

      // Keep only the last N lines
      const keptLines = lines.slice(-this.config.compactionMaxLines);

      // Add compaction marker at the top
      const compactedAt = this.formatTimestamp(new Date());
      const compactionHeader = `${this.config.compactedMarker} Compacted at ${compactedAt}. Removed ${originalLineCount - keptLines.length} lines.\n\n---\n\n`;

      const compactedContent = compactionHeader + keptLines.join("\n");
      const compactedSize = Buffer.byteLength(compactedContent, "utf-8");

      await fs.writeFile(filePath, compactedContent, "utf-8");

      const result: CompactionResult = {
        section,
        originalSize,
        compactedSize,
        linesRemoved: originalLineCount - keptLines.length,
        compactedAt: new Date(),
      };

      this.events.onCompacted?.(result);

      // Snapshot after compaction
      if (this.config.autoSnapshot) {
        await this.snapshot(`memory: compact ${section}`);
      }

      return result;
    } catch (error) {
      this.events.onError?.(error as Error, `compact:${section}`);
      throw error;
    }
  }

  /**
   * Creates a snapshot of the current memory state.
   *
   * Uses Shadow Git to track memory file changes.
   *
   * @param message - Optional commit message
   * @returns The snapshot hash, or null if snapshot failed
   */
  async snapshot(message?: string): Promise<string | null> {
    if (!this.initialized) {
      return null;
    }

    try {
      // Get memory files relative to working directory
      const memoryFiles = MEMORY_SECTIONS.map((section) =>
        path.relative(this.workingDir, this.getSectionPath(section))
      );

      const result = await Snapshot.track(
        this.workingDir,
        memoryFiles,
        message ?? "memory snapshot"
      );

      if (result.ok) {
        this.lastSnapshotHash = result.value;
        this.events.onSnapshot?.(result.value);
        return result.value;
      }

      return null;
    } catch (error) {
      this.events.onError?.(error as Error, "snapshot");
      return null;
    }
  }

  // ===========================================================================
  // Status Methods
  // ===========================================================================

  /**
   * Gets the current status of all memory sections.
   *
   * @returns Status information including sizes and health
   */
  async getStatus(): Promise<MemoryStatus> {
    this.ensureInitialized();

    const sections = {} as Record<MemorySection, MemorySectionInfo>;
    let totalSizeBytes = 0;

    for (const section of MEMORY_SECTIONS) {
      const info = await this.getSectionInfo(section);
      sections[section] = info;
      totalSizeBytes += info.sizeBytes;
    }

    return {
      memoryPath: this.memoryPath,
      initialized: this.initialized,
      sections,
      totalSizeBytes,
      lastSnapshotHash: this.lastSnapshotHash,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Ensures the manager is initialized.
   *
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("FileMemoryManager not initialized. Call initialize() first.");
    }
  }

  /**
   * Gets the file path for a memory section.
   *
   * @param section - The memory section
   * @returns Absolute path to the section file
   */
  private getSectionPath(section: MemorySection): string {
    return path.join(this.memoryPath, MEMORY_FILE_NAMES[section]);
  }

  /**
   * Creates initial memory files if they don't exist.
   */
  private async ensureMemoryFiles(): Promise<void> {
    for (const section of MEMORY_SECTIONS) {
      const filePath = this.getSectionPath(section);
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        const header = this.getInitialContent(section);
        await fs.writeFile(filePath, header, "utf-8");
      }
    }
  }

  /**
   * Gets initial content for a new memory file.
   *
   * @param section - The memory section
   * @returns Initial markdown content
   */
  private getInitialContent(section: MemorySection): string {
    const timestamp = this.formatTimestamp(new Date());

    switch (section) {
      case "plan":
        return `# Task Plan\n\n> Created: ${timestamp}\n> Session: ${this.sessionId}\n\n## Phases\n\n## Progress Tracking\n\n`;
      case "findings":
        return `# Findings\n\n> Created: ${timestamp}\n> Session: ${this.sessionId}\n\n## Research Notes\n\n## Discoveries\n\n`;
      case "progress":
        return `# Progress Log\n\n> Created: ${timestamp}\n> Session: ${this.sessionId}\n\n## Activity\n\n`;
    }
  }

  /**
   * Gets information about a memory section.
   *
   * @param section - The memory section
   * @returns Section information
   */
  private async getSectionInfo(section: MemorySection): Promise<MemorySectionInfo> {
    const filePath = this.getSectionPath(section);

    try {
      const stats = await fs.stat(filePath);
      const sizeBytes = stats.size;

      return {
        section,
        filePath,
        sizeBytes,
        status: this.getSizeStatus(sizeBytes),
        exists: true,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          section,
          filePath,
          sizeBytes: 0,
          status: "ok",
          exists: false,
        };
      }
      throw error;
    }
  }

  /**
   * Determines the size status based on thresholds.
   *
   * @param sizeBytes - Current size in bytes
   * @returns Size status
   */
  private getSizeStatus(sizeBytes: number): MemorySizeStatus {
    if (sizeBytes >= this.config.compactionSizeBytes) {
      return "needs_compaction";
    }
    if (sizeBytes >= this.config.warningSizeBytes) {
      return "warning";
    }
    return "ok";
  }

  /**
   * Checks section size and emits warning if needed.
   *
   * @param section - The memory section to check
   */
  private async checkSizeAndWarn(section: MemorySection): Promise<void> {
    const info = await this.getSectionInfo(section);

    if (info.status === "warning" || info.status === "needs_compaction") {
      this.events.onWarning?.(section, info.sizeBytes);
    }
  }

  /**
   * Formats a timestamp for display.
   *
   * @param date - The date to format
   * @returns Formatted timestamp string
   */
  private formatTimestamp(date: Date): string {
    return TIMESTAMP_FORMAT.format(date);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a new FileMemoryManager instance.
 *
 * @param config - Optional configuration overrides
 * @returns A new FileMemoryManager instance
 */
export function createFileMemoryManager(config?: Partial<FileMemoryConfig>): FileMemoryManager {
  return new FileMemoryManager(config);
}

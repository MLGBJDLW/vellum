/**
 * Cross-Session Inheritance Resolver
 *
 * Provides context inheritance across sessions for knowledge continuity.
 * Addresses P1-1: Cross-Session Context Inheritance.
 *
 * Features:
 * - Summary persistence to disk on session end
 * - Automatic summary recovery on new session start
 * - Project-level context accumulation
 * - Configurable inheritance types and limits
 *
 * Storage Structure:
 * ```
 * .vellum/inheritance/
 * ├── index.json                    # Index of all sessions
 * ├── session-{id}.json            # Individual session summaries
 * └── project-context.json         # Project-level accumulated context
 * ```
 *
 * @module @vellum/core/context/improvements/cross-session-inheritance
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Message, MessageContent } from "../../types/message.js";
import type {
  InheritanceContentType,
  InheritedContext,
  InheritedSummary,
  SessionInheritanceConfig,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default storage directory relative to working directory */
const DEFAULT_STORAGE_DIR = ".vellum/inheritance";

/** Default maximum age for inherited data (7 days) */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Default maximum inherited summaries */
const DEFAULT_MAX_SUMMARIES = 3;

/** Index file name */
const INDEX_FILE = "index.json";

/** Project context file name */
const PROJECT_CONTEXT_FILE = "project-context.json";

// ============================================================================
// Types
// ============================================================================

/**
 * Session index entry for quick lookups
 */
interface SessionIndexEntry {
  /** Session ID */
  sessionId: string;
  /** Timestamp when session data was saved */
  savedAt: number;
  /** Project path associated with this session */
  projectPath?: string;
  /** Number of summaries stored */
  summaryCount: number;
}

/**
 * Session index structure
 */
interface SessionIndex {
  /** Version for future migrations */
  version: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Ordered list of sessions (most recent first) */
  sessions: SessionIndexEntry[];
}

/**
 * Stored session data
 */
interface StoredSessionData {
  /** Session ID */
  sessionId: string;
  /** Timestamp when saved */
  savedAt: number;
  /** Project path (if applicable) */
  projectPath?: string;
  /** Stored summaries */
  summaries: InheritedSummary[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Project-level accumulated context
 */
interface ProjectContext {
  /** Project path */
  projectPath: string;
  /** Last updated timestamp */
  updatedAt: number;
  /** Accumulated key decisions */
  decisions: string[];
  /** Important code patterns discovered */
  codePatterns: string[];
  /** Accumulated task summaries */
  taskSummaries: InheritedSummary[];
}

// ============================================================================
// CrossSessionInheritanceResolver
// ============================================================================

/**
 * Manages cross-session context inheritance.
 *
 * Provides persistent storage of session summaries and intelligent
 * restoration of context for new sessions.
 *
 * @example
 * ```typescript
 * const resolver = new CrossSessionInheritanceResolver(
 *   { enabled: true, source: 'last_session', maxInheritedSummaries: 3, inheritTypes: ['summary'] },
 *   '.vellum/inheritance'
 * );
 *
 * // On session end
 * await resolver.saveSummaries('session-123', summaries);
 *
 * // On new session start
 * const inherited = await resolver.resolveInheritance('/path/to/project');
 * if (inherited) {
 *   const message = resolver.formatAsMessage(inherited);
 *   // Prepend to conversation
 * }
 * ```
 */
export class CrossSessionInheritanceResolver {
  private readonly config: SessionInheritanceConfig;
  private readonly storageDir: string;

  /** Cached session index for performance */
  private indexCache: SessionIndex | null = null;

  constructor(config: SessionInheritanceConfig, storageDir: string = DEFAULT_STORAGE_DIR) {
    this.config = config;
    this.storageDir = storageDir;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Save summaries from current session for future inheritance.
   *
   * @param sessionId - Current session ID
   * @param summaries - Summaries to save
   * @param projectPath - Optional project path for project-level context
   */
  async saveSummaries(
    sessionId: string,
    summaries: InheritedSummary[],
    projectPath?: string
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Filter summaries by configured types
    const filteredSummaries = this.filterSummariesByType(summaries);
    if (filteredSummaries.length === 0) {
      return;
    }

    // Ensure storage directory exists
    await this.ensureStorageDir();

    // Save session data
    const sessionData: StoredSessionData = {
      sessionId,
      savedAt: Date.now(),
      projectPath,
      summaries: filteredSummaries.slice(0, this.config.maxInheritedSummaries),
      metadata: {},
    };

    const sessionFile = this.getSessionFilePath(sessionId);
    await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2), "utf-8");

    // Update index
    await this.updateIndex(sessionId, projectPath, filteredSummaries.length);

    // Update project context if applicable
    if (projectPath && this.config.inheritTypes.includes("decisions")) {
      await this.updateProjectContext(projectPath, filteredSummaries);
    }
  }

  /**
   * Resolve and load inherited context for a new session.
   *
   * @param projectPath - Optional project path for project-specific inheritance
   * @returns Inherited context or null if none available
   */
  async resolveInheritance(projectPath?: string): Promise<InheritedContext | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      switch (this.config.source) {
        case "last_session":
          return await this.resolveFromLastSession(projectPath);

        case "project_context":
          return projectPath ? await this.resolveFromProjectContext(projectPath) : null;

        case "manual":
          // Manual inheritance is handled externally
          return null;

        default:
          return null;
      }
    } catch (error) {
      // Gracefully handle missing or corrupted data
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      // Log but don't throw - inheritance is optional
      console.warn("[CrossSessionInheritance] Failed to resolve inheritance:", error);
      return null;
    }
  }

  /**
   * Format inherited context as a system message for the conversation.
   *
   * @param inherited - Inherited context to format
   * @returns Message suitable for prepending to conversation
   */
  formatAsMessage(inherited: InheritedContext): Message {
    const parts: string[] = [
      "## Inherited Context from Previous Session",
      "",
      `_Source: Session ${inherited.sourceSessionId}_`,
      `_Inherited at: ${new Date(inherited.inheritedAt).toISOString()}_`,
      "",
    ];

    // Group summaries by type
    const byType = new Map<string, InheritedSummary[]>();
    for (const summary of inherited.summaries) {
      const existing = byType.get(summary.type) ?? [];
      existing.push(summary);
      byType.set(summary.type, existing);
    }

    // Format each type
    for (const [type, summaries] of byType) {
      parts.push(`### ${this.formatSummaryType(type)}`);
      parts.push("");
      for (const summary of summaries) {
        parts.push(summary.content);
        parts.push("");
      }
    }

    const content: MessageContent[] = [
      {
        type: "text",
        content: parts.join("\n"),
      },
    ];

    return {
      id: `inherited-${inherited.sourceSessionId}`,
      role: "system",
      content,
      createdAt: new Date(inherited.inheritedAt).toISOString(),
      metadata: {
        isInherited: true,
        sourceSession: inherited.sourceSessionId,
      },
    };
  }

  /**
   * Get information about the last saved session.
   *
   * @returns Last session info or null if none exists
   */
  getLastSessionInfo(): { sessionId: string; timestamp: number } | null {
    if (!this.indexCache || this.indexCache.sessions.length === 0) {
      return null;
    }

    const last = this.indexCache.sessions[0];
    if (!last) {
      return null;
    }
    return {
      sessionId: last.sessionId,
      timestamp: last.savedAt,
    };
  }

  /**
   * Clean up expired inheritance data.
   *
   * @param maxAge - Maximum age in milliseconds (default: 7 days)
   * @returns Number of sessions cleaned up
   */
  async cleanup(maxAge: number = DEFAULT_MAX_AGE_MS): Promise<number> {
    const index = await this.loadIndex();
    if (!index || index.sessions.length === 0) {
      return 0;
    }

    const cutoff = Date.now() - maxAge;
    const toRemove: string[] = [];
    const toKeep: SessionIndexEntry[] = [];

    for (const entry of index.sessions) {
      if (entry.savedAt < cutoff) {
        toRemove.push(entry.sessionId);
      } else {
        toKeep.push(entry);
      }
    }

    if (toRemove.length === 0) {
      return 0;
    }

    // Remove session files
    for (const sessionId of toRemove) {
      const filePath = this.getSessionFilePath(sessionId);
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore missing files
      }
    }

    // Update index
    index.sessions = toKeep;
    index.updatedAt = Date.now();
    await this.saveIndex(index);

    return toRemove.length;
  }

  /**
   * Load the session index, creating if necessary.
   */
  async loadIndex(): Promise<SessionIndex | null> {
    if (this.indexCache) {
      return this.indexCache;
    }

    try {
      const indexPath = path.join(this.storageDir, INDEX_FILE);
      const content = await fs.readFile(indexPath, "utf-8");
      this.indexCache = JSON.parse(content) as SessionIndex;
      return this.indexCache;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensure storage directory exists.
   */
  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  /**
   * Get file path for a session's data.
   */
  private getSessionFilePath(sessionId: string): string {
    // Sanitize session ID for file system
    const safeId = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.storageDir, `session-${safeId}.json`);
  }

  /**
   * Filter summaries by configured inheritance types.
   */
  private filterSummariesByType(summaries: InheritedSummary[]): InheritedSummary[] {
    const typeMap: Record<InheritanceContentType, InheritedSummary["type"][]> = {
      summary: ["full", "task"],
      decisions: ["decisions"],
      code_state: ["code_changes"],
      pending_tasks: ["task"],
    };

    const allowedTypes = new Set<InheritedSummary["type"]>();
    for (const inheritType of this.config.inheritTypes) {
      const mappedTypes = typeMap[inheritType];
      if (mappedTypes) {
        for (const t of mappedTypes) {
          allowedTypes.add(t);
        }
      }
    }

    return summaries.filter((s) => allowedTypes.has(s.type));
  }

  /**
   * Update the session index with a new entry.
   */
  private async updateIndex(
    sessionId: string,
    projectPath: string | undefined,
    summaryCount: number
  ): Promise<void> {
    let index = await this.loadIndex();

    if (!index) {
      index = {
        version: 1,
        updatedAt: Date.now(),
        sessions: [],
      };
    }

    // Remove existing entry for this session if present
    index.sessions = index.sessions.filter((s) => s.sessionId !== sessionId);

    // Add new entry at the beginning (most recent first)
    index.sessions.unshift({
      sessionId,
      savedAt: Date.now(),
      projectPath,
      summaryCount,
    });

    // Keep only recent sessions (max 50)
    if (index.sessions.length > 50) {
      const removed = index.sessions.splice(50);
      // Clean up old session files
      for (const entry of removed) {
        try {
          await fs.unlink(this.getSessionFilePath(entry.sessionId));
        } catch {
          // Ignore
        }
      }
    }

    index.updatedAt = Date.now();
    await this.saveIndex(index);
  }

  /**
   * Save the session index to disk.
   */
  private async saveIndex(index: SessionIndex): Promise<void> {
    this.indexCache = index;
    const indexPath = path.join(this.storageDir, INDEX_FILE);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  /**
   * Resolve inheritance from the last session.
   */
  private async resolveFromLastSession(projectPath?: string): Promise<InheritedContext | null> {
    const index = await this.loadIndex();
    if (!index || index.sessions.length === 0) {
      return null;
    }

    // Find matching session (prefer same project if specified)
    let targetEntry: SessionIndexEntry | undefined;

    if (projectPath) {
      // Try to find a session for the same project
      targetEntry = index.sessions.find((s) => s.projectPath === projectPath);
    }

    // Fall back to most recent session
    if (!targetEntry) {
      targetEntry = index.sessions[0];
    }

    // Guard against empty sessions array
    if (!targetEntry) {
      return null;
    }

    // Load session data
    const sessionPath = this.getSessionFilePath(targetEntry.sessionId);
    const content = await fs.readFile(sessionPath, "utf-8");
    const sessionData = JSON.parse(content) as StoredSessionData;

    return {
      sourceSessionId: sessionData.sessionId,
      inheritedAt: Date.now(),
      summaries: sessionData.summaries.slice(0, this.config.maxInheritedSummaries),
      metadata: sessionData.metadata,
    };
  }

  /**
   * Resolve inheritance from project-level context.
   */
  private async resolveFromProjectContext(projectPath: string): Promise<InheritedContext | null> {
    const contextPath = path.join(this.storageDir, PROJECT_CONTEXT_FILE);

    try {
      const content = await fs.readFile(contextPath, "utf-8");
      const contexts = JSON.parse(content) as Record<string, ProjectContext>;
      const projectContext = contexts[projectPath];

      if (!projectContext || projectContext.taskSummaries.length === 0) {
        return null;
      }

      // Convert project context to inherited context
      const summaries: InheritedSummary[] = [];

      // Add decision summary if available
      if (projectContext.decisions.length > 0) {
        summaries.push({
          id: `project-decisions-${Date.now()}`,
          content: `## Project Decisions\n\n${projectContext.decisions.join("\n\n")}`,
          originalSession: "project-accumulated",
          createdAt: projectContext.updatedAt,
          type: "decisions",
        });
      }

      // Add recent task summaries
      summaries.push(
        ...projectContext.taskSummaries.slice(0, this.config.maxInheritedSummaries - 1)
      );

      return {
        sourceSessionId: "project-context",
        inheritedAt: Date.now(),
        summaries: summaries.slice(0, this.config.maxInheritedSummaries),
        metadata: {
          projectPath,
          codePatterns: projectContext.codePatterns,
        },
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update project-level accumulated context.
   */
  private async updateProjectContext(
    projectPath: string,
    summaries: InheritedSummary[]
  ): Promise<void> {
    const contextPath = path.join(this.storageDir, PROJECT_CONTEXT_FILE);
    let contexts: Record<string, ProjectContext> = {};

    try {
      const content = await fs.readFile(contextPath, "utf-8");
      contexts = JSON.parse(content) as Record<string, ProjectContext>;
    } catch {
      // Start fresh if file doesn't exist
    }

    const existing = contexts[projectPath] ?? {
      projectPath,
      updatedAt: Date.now(),
      decisions: [],
      codePatterns: [],
      taskSummaries: [],
    };

    // Extract decisions from summaries
    const decisionSummaries = summaries.filter((s) => s.type === "decisions");
    for (const ds of decisionSummaries) {
      if (!existing.decisions.includes(ds.content)) {
        existing.decisions.push(ds.content);
      }
    }

    // Keep only recent decisions (max 10)
    if (existing.decisions.length > 10) {
      existing.decisions = existing.decisions.slice(-10);
    }

    // Add task summaries (deduped by content hash)
    const existingContents = new Set(existing.taskSummaries.map((s) => s.content));
    const newTaskSummaries = summaries.filter(
      (s) => (s.type === "task" || s.type === "full") && !existingContents.has(s.content)
    );
    existing.taskSummaries.push(...newTaskSummaries);

    // Keep only recent task summaries (max 10)
    if (existing.taskSummaries.length > 10) {
      existing.taskSummaries = existing.taskSummaries.slice(-10);
    }

    existing.updatedAt = Date.now();
    contexts[projectPath] = existing;

    await fs.writeFile(contextPath, JSON.stringify(contexts, null, 2), "utf-8");
  }

  /**
   * Format summary type for display.
   */
  private formatSummaryType(type: string): string {
    const typeLabels: Record<string, string> = {
      task: "Task Summary",
      decisions: "Key Decisions",
      code_changes: "Code Changes",
      full: "Session Summary",
    };
    return typeLabels[type] ?? type;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a CrossSessionInheritanceResolver with the given configuration.
 *
 * @param config - Inheritance configuration
 * @param storageDir - Storage directory path
 * @returns Configured resolver instance
 */
export function createCrossSessionInheritanceResolver(
  config: Partial<SessionInheritanceConfig> = {},
  storageDir: string = DEFAULT_STORAGE_DIR
): CrossSessionInheritanceResolver {
  const fullConfig: SessionInheritanceConfig = {
    enabled: config.enabled ?? true,
    source: config.source ?? "last_session",
    maxInheritedSummaries: config.maxInheritedSummaries ?? DEFAULT_MAX_SUMMARIES,
    inheritTypes: config.inheritTypes ?? ["summary", "decisions"],
  };

  return new CrossSessionInheritanceResolver(fullConfig, storageDir);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Type guard for Node.js errors with code property.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

// ============================================
// Skill Watcher
// ============================================
// File watching for skill directory changes.
// Triggers cache invalidation on skill file modifications.
// @see REQ-006

import { EventEmitter } from "node:events";
import * as os from "node:os";
import * as path from "node:path";
import { type FSWatcher, watch } from "chokidar";

import type { Logger } from "../logger/logger.js";
import { SKILL_MANIFEST_FILENAME } from "./parser.js";

// ============================================
// Types
// ============================================

/**
 * Options for SkillWatcher.
 */
export interface SkillWatcherOptions {
  /** Workspace path for skill directories */
  workspacePath?: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Optional logger for debugging */
  logger?: Logger;
  /** Whether to watch user skills directory (default: true) */
  watchUserSkills?: boolean;
  /** Whether to watch global skills directory (default: true) */
  watchGlobalSkills?: boolean;
}

/**
 * Events emitted by SkillWatcher.
 */
export interface SkillWatcherEvents {
  /** Emitted when skill files change (after debounce) */
  change: [changedSkills: SkillChangeEvent[]];
  /** Emitted when a watcher error occurs */
  error: [error: Error];
  /** Emitted when watching starts */
  ready: [];
  /** Emitted when cache should be invalidated */
  invalidate: [skillNames: string[]];
}

/**
 * Information about a skill change event.
 */
export interface SkillChangeEvent {
  /** Name of the changed skill (directory name) */
  skillName: string;
  /** Type of change */
  eventType: "add" | "change" | "unlink";
  /** Full path to the changed file */
  filePath: string;
  /** Source directory (workspace, user, global) */
  source: "workspace" | "user" | "global";
  /** Timestamp of the change */
  timestamp: number;
}

// ============================================
// Constants
// ============================================

/** Default debounce delay: 300ms */
const DEFAULT_DEBOUNCE_MS = 300;

/** Glob pattern for SKILL.md files */
const SKILL_GLOB_PATTERN = `*/${SKILL_MANIFEST_FILENAME}`;

/** Mode-specific skill glob pattern */
const MODE_SKILL_GLOB_PATTERN = `skills-*/*/${SKILL_MANIFEST_FILENAME}`;

// ============================================
// SkillWatcher Class
// ============================================

/**
 * Watches skill directories for changes with debounced invalidation events.
 *
 * SkillWatcher monitors SKILL.md files across all skill source directories:
 * - .vellum/skills/ (workspace)
 * - ~/.vellum/skills/ (user)
 * - .github/skills/ (global)
 *
 * When changes are detected, it emits:
 * - 'change' event with details about what changed
 * - 'invalidate' event with skill names that should be removed from cache
 *
 * @example
 * ```typescript
 * const watcher = new SkillWatcher({
 *   workspacePath: '/project',
 *   debounceMs: 500,
 * });
 *
 * watcher.on('change', (events) => {
 *   console.log('Skills changed:', events);
 * });
 *
 * watcher.on('invalidate', (skillNames) => {
 *   for (const name of skillNames) {
 *     skillCache.delete(name);
 *   }
 * });
 *
 * await watcher.start();
 *
 * // Later...
 * await watcher.stop();
 * ```
 */
export class SkillWatcher extends EventEmitter<SkillWatcherEvents> {
  private readonly workspacePath?: string;
  private readonly debounceMs: number;
  private readonly logger?: Logger;
  private readonly watchUserSkills: boolean;
  private readonly watchGlobalSkills: boolean;

  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: Map<string, SkillChangeEvent> = new Map();
  private isRunning = false;

  /**
   * Creates a new SkillWatcher.
   *
   * @param options - Watcher configuration options
   */
  constructor(options: SkillWatcherOptions = {}) {
    super();
    this.workspacePath = options.workspacePath;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.logger = options.logger;
    this.watchUserSkills = options.watchUserSkills ?? true;
    this.watchGlobalSkills = options.watchGlobalSkills ?? true;
  }

  /**
   * Whether the watcher is currently running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Starts watching for skill file changes.
   *
   * Sets up chokidar watchers for SKILL.md files in:
   * - Workspace skills directory (.vellum/skills/)
   * - User skills directory (~/.vellum/skills/)
   * - Global skills directory (.github/skills/)
   *
   * @throws Error if already watching
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("SkillWatcher is already running");
    }

    const watchPaths = this.buildWatchPaths();

    if (watchPaths.length === 0) {
      this.logger?.warn("No skill directories configured to watch");
      this.isRunning = true;
      this.emit("ready");
      return;
    }

    this.logger?.debug("Starting skill watcher", { paths: watchPaths });

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      ignored: ["**/node_modules/**", "**/.git/**"],
    });

    // Set up event handlers
    this.watcher.on("add", (filePath) => this.handleFileEvent(filePath, "add"));
    this.watcher.on("change", (filePath) => this.handleFileEvent(filePath, "change"));
    this.watcher.on("unlink", (filePath) => this.handleFileEvent(filePath, "unlink"));
    this.watcher.on("error", (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error("Skill watcher error", { error: err });
      this.emit("error", err);
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.watcher?.removeListener("error", onError);
        this.isRunning = true;
        this.logger?.info("Skill watcher ready");
        this.emit("ready");
        resolve();
      };
      const onError = (err: unknown) => {
        this.watcher?.removeListener("ready", onReady);
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      this.watcher?.once("ready", onReady);
      this.watcher?.once("error", onError);
    });
  }

  /**
   * Stops watching for file changes.
   *
   * Cleans up all watchers and pending timers.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Clear pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isRunning = false;

    this.logger?.info("Skill watcher stopped");
  }

  /**
   * Build list of paths to watch.
   */
  private buildWatchPaths(): string[] {
    const paths: string[] = [];

    // Workspace skills
    if (this.workspacePath) {
      const workspaceSkills = path.join(this.workspacePath, ".vellum", "skills");
      paths.push(path.join(workspaceSkills, SKILL_GLOB_PATTERN));
      paths.push(path.join(this.workspacePath, ".vellum", MODE_SKILL_GLOB_PATTERN));
    }

    // User skills
    if (this.watchUserSkills) {
      const userSkills = path.join(os.homedir(), ".vellum", "skills");
      paths.push(path.join(userSkills, SKILL_GLOB_PATTERN));
      paths.push(path.join(os.homedir(), ".vellum", MODE_SKILL_GLOB_PATTERN));
    }

    // Global skills
    if (this.workspacePath && this.watchGlobalSkills) {
      const globalSkills = path.join(this.workspacePath, ".github", "skills");
      paths.push(path.join(globalSkills, SKILL_GLOB_PATTERN));
      paths.push(path.join(this.workspacePath, ".github", MODE_SKILL_GLOB_PATTERN));
    }

    return paths;
  }

  /**
   * Handle a file system event.
   */
  private handleFileEvent(filePath: string, eventType: "add" | "change" | "unlink"): void {
    // Only process SKILL.md files
    if (!filePath.endsWith(SKILL_MANIFEST_FILENAME)) {
      return;
    }

    const source = this.determineSource(filePath);
    const skillName = this.extractSkillName(filePath);

    if (!skillName) {
      this.logger?.warn("Could not extract skill name from path", { filePath });
      return;
    }

    this.logger?.debug("Skill file event", { skillName, eventType, source, filePath });

    // Add to pending changes (keyed by skill name to coalesce multiple events)
    const changeEvent: SkillChangeEvent = {
      skillName,
      eventType,
      filePath,
      source,
      timestamp: Date.now(),
    };
    this.pendingChanges.set(skillName, changeEvent);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.flushChanges(), this.debounceMs);
  }

  /**
   * Determine the source of a skill path.
   */
  private determineSource(filePath: string): "workspace" | "user" | "global" {
    const userDir = path.join(os.homedir(), ".vellum");
    if (filePath.startsWith(userDir)) {
      return "user";
    }

    if (this.workspacePath) {
      const globalDir = path.join(this.workspacePath, ".github");
      if (filePath.startsWith(globalDir)) {
        return "global";
      }
    }

    return "workspace";
  }

  /**
   * Extract skill name from file path.
   * The skill name is the parent directory of SKILL.md.
   */
  private extractSkillName(filePath: string): string | null {
    const dir = path.dirname(filePath);
    const name = path.basename(dir);

    // Validate it looks like a skill name (not empty, not a known directory)
    if (
      !name ||
      name === "skills" ||
      name.startsWith("skills-") ||
      name === ".vellum" ||
      name === ".github"
    ) {
      return null;
    }

    return name;
  }

  /**
   * Flush pending changes and emit events.
   */
  private flushChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    const skillNames = changes.map((c) => c.skillName);

    this.pendingChanges.clear();
    this.debounceTimer = null;

    this.logger?.info("Flushing skill changes", { count: changes.length, skills: skillNames });

    // Emit change event with all details
    this.emit("change", changes);

    // Emit invalidate event with skill names to clear from cache
    this.emit("invalidate", skillNames);
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default SkillWatcher instance for convenience.
 */
export const skillWatcher = new SkillWatcher();

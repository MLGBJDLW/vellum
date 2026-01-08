/**
 * Tutorial Storage
 *
 * Handles persistence of tutorial progress to disk.
 *
 * @module cli/onboarding/tutorial/storage
 */

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  INITIAL_LESSON_PROGRESS,
  INITIAL_TUTORIAL_PROGRESS,
  type LessonProgress,
  type TutorialProgress,
  TutorialProgressSchema,
  type TutorialStorage,
} from "./types.js";

// =============================================================================
// Paths
// =============================================================================

/**
 * Get Vellum config directory
 */
function getVellumDir(): string {
  const home = os.homedir();
  return path.join(home, ".vellum");
}

/**
 * Get tutorial progress file path
 */
function getTutorialProgressPath(): string {
  return path.join(getVellumDir(), "tutorial-progress.json");
}

// =============================================================================
// File Storage Implementation
// =============================================================================

/**
 * File-based tutorial storage
 */
export class FileTutorialStorage implements TutorialStorage {
  private progressPath: string;
  private cachedProgress: TutorialProgress | null = null;

  constructor(customPath?: string) {
    this.progressPath = customPath ?? getTutorialProgressPath();
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.progressPath);
    if (!fs.existsSync(dir)) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Load tutorial progress from file
   */
  async loadProgress(): Promise<TutorialProgress> {
    // Return cached if available
    if (this.cachedProgress) {
      return this.cachedProgress;
    }

    try {
      if (!fs.existsSync(this.progressPath)) {
        return { ...INITIAL_TUTORIAL_PROGRESS };
      }

      const content = await fsPromises.readFile(this.progressPath, "utf-8");
      const data = JSON.parse(content) as unknown;
      const parsed = TutorialProgressSchema.safeParse(data);

      if (parsed.success) {
        this.cachedProgress = parsed.data;
        return parsed.data;
      }

      // Invalid data, return initial state
      console.warn("[TutorialStorage] Invalid progress data, resetting");
      return { ...INITIAL_TUTORIAL_PROGRESS };
    } catch (error) {
      // File doesn't exist or parse error
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[TutorialStorage] Failed to load progress:", error);
      }
      return { ...INITIAL_TUTORIAL_PROGRESS };
    }
  }

  /**
   * Save tutorial progress to file
   */
  async saveProgress(progress: TutorialProgress): Promise<void> {
    try {
      await this.ensureDir();

      // Validate before saving
      const parsed = TutorialProgressSchema.safeParse(progress);
      if (!parsed.success) {
        throw new Error(`Invalid progress data: ${parsed.error.message}`);
      }

      // Update cache
      this.cachedProgress = parsed.data;

      // Write to file
      const content = JSON.stringify(parsed.data, null, 2);
      await fsPromises.writeFile(this.progressPath, content, "utf-8");
    } catch (error) {
      console.error("[TutorialStorage] Failed to save progress:", error);
      throw error;
    }
  }

  /**
   * Reset all progress
   */
  async resetProgress(): Promise<void> {
    try {
      this.cachedProgress = null;

      if (fs.existsSync(this.progressPath)) {
        await fsPromises.unlink(this.progressPath);
      }
    } catch (error) {
      console.error("[TutorialStorage] Failed to reset progress:", error);
      throw error;
    }
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(lessonId: string): Promise<LessonProgress | undefined> {
    const progress = await this.loadProgress();
    return progress.lessons[lessonId];
  }

  /**
   * Update progress for a specific lesson
   */
  async updateLessonProgress(lessonId: string, updates: Partial<LessonProgress>): Promise<void> {
    const progress = await this.loadProgress();

    // Get or create lesson progress
    const existing = progress.lessons[lessonId] ?? {
      ...INITIAL_LESSON_PROGRESS,
      lessonId,
    };

    // Merge updates
    progress.lessons[lessonId] = {
      ...existing,
      ...updates,
    };

    // Update last activity
    progress.lastActivityAt = new Date().toISOString();
    progress.lastActiveLessonId = lessonId;

    await this.saveProgress(progress);
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cachedProgress = null;
  }
}

// =============================================================================
// In-Memory Storage (for testing)
// =============================================================================

/**
 * In-memory tutorial storage for testing
 */
export class MemoryTutorialStorage implements TutorialStorage {
  private progress: TutorialProgress = { ...INITIAL_TUTORIAL_PROGRESS };

  async loadProgress(): Promise<TutorialProgress> {
    return { ...this.progress };
  }

  async saveProgress(progress: TutorialProgress): Promise<void> {
    this.progress = { ...progress };
  }

  async resetProgress(): Promise<void> {
    this.progress = { ...INITIAL_TUTORIAL_PROGRESS };
  }

  async getLessonProgress(lessonId: string): Promise<LessonProgress | undefined> {
    return this.progress.lessons[lessonId];
  }

  async updateLessonProgress(lessonId: string, updates: Partial<LessonProgress>): Promise<void> {
    const existing = this.progress.lessons[lessonId] ?? {
      ...INITIAL_LESSON_PROGRESS,
      lessonId,
    };

    this.progress.lessons[lessonId] = {
      ...existing,
      ...updates,
    };

    this.progress.lastActivityAt = new Date().toISOString();
    this.progress.lastActiveLessonId = lessonId;
  }

  /**
   * Get raw progress (for testing)
   */
  getRawProgress(): TutorialProgress {
    return this.progress;
  }

  /**
   * Set raw progress (for testing)
   */
  setRawProgress(progress: TutorialProgress): void {
    this.progress = progress;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a tutorial storage instance
 */
export function createTutorialStorage(customPath?: string): TutorialStorage {
  return new FileTutorialStorage(customPath);
}

/**
 * Test Fixtures - Temporary Directory Management
 *
 * @module cli/test/e2e/fixtures
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Options for temp directory creation
 */
export interface TempDirOptions {
  /** Prefix for temp directory name */
  prefix?: string;

  /** Initial files to create */
  files?: Record<string, string>;

  /** Cleanup on process exit */
  autoCleanup?: boolean;
}

/**
 * Temporary directory manager
 */
export class TempDir {
  private readonly path: string;
  private cleaned = false;

  private constructor(path: string) {
    this.path = path;
  }

  /**
   * Get the temp directory path
   */
  get dir(): string {
    return this.path;
  }

  /**
   * Create a new temp directory
   */
  static async create(options: TempDirOptions = {}): Promise<TempDir> {
    const prefix = options.prefix ?? "vellum-e2e-";
    const path = await mkdtemp(join(tmpdir(), prefix));
    const tempDir = new TempDir(path);

    // Create initial files
    if (options.files) {
      for (const [name, content] of Object.entries(options.files)) {
        await tempDir.writeFile(name, content);
      }
    }

    // Register cleanup on exit
    if (options.autoCleanup) {
      process.on("exit", () => {
        void tempDir.cleanup();
      });
    }

    return tempDir;
  }

  /**
   * Write a file to the temp directory
   */
  async writeFile(relativePath: string, content: string): Promise<string> {
    const fullPath = join(this.path, relativePath);
    const dir = join(fullPath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return fullPath;
  }

  /**
   * Read a file from the temp directory
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = join(this.path, relativePath);
    return readFile(fullPath, "utf-8");
  }

  /**
   * Check if a file exists
   */
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = join(this.path, relativePath);
    try {
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a subdirectory
   */
  async mkdir(relativePath: string): Promise<string> {
    const fullPath = join(this.path, relativePath);
    await mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  /**
   * Get full path for a relative path
   */
  resolve(relativePath: string): string {
    return join(this.path, relativePath);
  }

  /**
   * Clean up the temp directory
   */
  async cleanup(): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;

    try {
      await rm(this.path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Fixture manager for managing multiple fixtures
 */
export class FixtureManager {
  private readonly fixtures: TempDir[] = [];

  /**
   * Create a new temp directory
   */
  async createTempDir(options?: TempDirOptions): Promise<TempDir> {
    const tempDir = await TempDir.create(options);
    this.fixtures.push(tempDir);
    return tempDir;
  }

  /**
   * Clean up all managed fixtures
   */
  async cleanup(): Promise<void> {
    await Promise.all(this.fixtures.map((f) => f.cleanup()));
    this.fixtures.length = 0;
  }
}

/**
 * Create a fixture with a vellum project structure
 */
export async function createProjectFixture(): Promise<TempDir> {
  return TempDir.create({
    prefix: "vellum-project-",
    files: {
      "package.json": JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
          type: "module",
        },
        null,
        2
      ),
      ".vellum/config.json": JSON.stringify(
        {
          version: "1.0",
        },
        null,
        2
      ),
    },
  });
}

/**
 * Create fixture with git repository
 */
export async function createGitFixture(): Promise<TempDir> {
  const tempDir = await createProjectFixture();
  await tempDir.mkdir(".git");
  await tempDir.writeFile(".git/config", "[core]\n\trepositoryformatversion = 0\n");
  await tempDir.writeFile(".git/HEAD", "ref: refs/heads/main\n");
  return tempDir;
}

/**
 * Vitest-compatible fixture helpers
 */
export function useFixtures() {
  const manager = new FixtureManager();

  return {
    manager,
    createTempDir: (options?: TempDirOptions) => manager.createTempDir(options),
    cleanup: () => manager.cleanup(),
  };
}

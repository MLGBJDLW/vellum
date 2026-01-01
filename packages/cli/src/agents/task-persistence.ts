/**
 * Task Persistence for Resumable Workflows
 *
 * Enables saving and loading task chain state to support
 * pausing and resuming multi-agent workflows.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TaskChain } from "@vellum/core";

/**
 * Serializable version of TaskChain for JSON persistence
 */
interface SerializedTaskChain {
  chainId: string;
  rootTaskId: string;
  nodes: Array<{
    taskId: string;
    parentTaskId?: string;
    agentSlug: string;
    depth: number;
    createdAt: string;
    status: "pending" | "running" | "completed" | "failed";
  }>;
  maxDepth: number;
}

/**
 * Represents the persisted state of a task chain
 */
export interface PersistedTaskState {
  chainId: string;
  chain: TaskChain;
  status: "running" | "paused" | "completed" | "failed";
  lastTaskId: string;
  checkpoint: {
    completedTasks: string[];
    pendingTasks: string[];
    failedTasks: string[];
  };
  savedAt: Date;
}

/**
 * Serialized format for JSON storage
 */
interface SerializedPersistedTaskState {
  chainId: string;
  chain: SerializedTaskChain;
  status: "running" | "paused" | "completed" | "failed";
  lastTaskId: string;
  checkpoint: {
    completedTasks: string[];
    pendingTasks: string[];
    failedTasks: string[];
  };
  savedAt: string;
}

/**
 * Interface for task state persistence operations
 */
export interface TaskPersistence {
  /**
   * Save task chain state to persistent storage
   */
  saveTaskState(state: PersistedTaskState): Promise<void>;

  /**
   * Load task chain state from persistent storage
   * @returns The persisted state, or null if not found
   */
  loadTaskState(chainId: string): Promise<PersistedTaskState | null>;

  /**
   * List all resumable task states
   */
  listResumable(): Promise<{ chainId: string; savedAt: Date; status: string }[]>;

  /**
   * Delete a persisted task state
   * @returns true if deleted, false if not found
   */
  deleteTaskState(chainId: string): Promise<boolean>;
}

/**
 * Convert TaskChain to serializable format
 */
function serializeTaskChain(chain: TaskChain): SerializedTaskChain {
  const nodesArray = Array.from(chain.nodes.values()).map((node) => ({
    taskId: node.taskId,
    parentTaskId: node.parentTaskId,
    agentSlug: node.agentSlug,
    depth: node.depth,
    createdAt: node.createdAt.toISOString(),
    status: node.status,
  }));

  return {
    chainId: chain.chainId,
    rootTaskId: chain.rootTaskId,
    nodes: nodesArray,
    maxDepth: chain.maxDepth,
  };
}

/**
 * Convert serialized format back to TaskChain
 */
function deserializeTaskChain(serialized: SerializedTaskChain): TaskChain {
  const nodes = new Map(
    serialized.nodes.map((node) => [
      node.taskId,
      {
        taskId: node.taskId,
        parentTaskId: node.parentTaskId,
        agentSlug: node.agentSlug,
        depth: node.depth,
        createdAt: new Date(node.createdAt),
        status: node.status,
      },
    ])
  );

  return {
    chainId: serialized.chainId,
    rootTaskId: serialized.rootTaskId,
    nodes,
    maxDepth: serialized.maxDepth,
  };
}

/**
 * Convert PersistedTaskState to JSON-serializable format
 */
function serializeState(state: PersistedTaskState): SerializedPersistedTaskState {
  return {
    chainId: state.chainId,
    chain: serializeTaskChain(state.chain),
    status: state.status,
    lastTaskId: state.lastTaskId,
    checkpoint: state.checkpoint,
    savedAt: state.savedAt.toISOString(),
  };
}

/**
 * Convert JSON data back to PersistedTaskState
 */
function deserializeState(data: SerializedPersistedTaskState): PersistedTaskState {
  return {
    chainId: data.chainId,
    chain: deserializeTaskChain(data.chain),
    status: data.status,
    lastTaskId: data.lastTaskId,
    checkpoint: data.checkpoint,
    savedAt: new Date(data.savedAt),
  };
}

/**
 * Sanitize chainId to prevent path traversal attacks
 */
function sanitizeChainId(chainId: string): string {
  // Remove any path separators and dots that could cause traversal
  return chainId.replace(/[/\\.:]/g, "_");
}

/**
 * Create a TaskPersistence instance
 * @param baseDir Base directory for task storage (default: '.vellum/tasks/')
 */
export function createTaskPersistence(baseDir = ".vellum/tasks/"): TaskPersistence {
  const resolvedBaseDir = path.resolve(baseDir);

  /**
   * Ensure the storage directory exists
   */
  async function ensureDirectory(): Promise<void> {
    await fs.mkdir(resolvedBaseDir, { recursive: true });
  }

  /**
   * Get the file path for a chain ID
   */
  function getFilePath(chainId: string): string {
    const safeChainId = sanitizeChainId(chainId);
    return path.join(resolvedBaseDir, `${safeChainId}.json`);
  }

  return {
    async saveTaskState(state: PersistedTaskState): Promise<void> {
      await ensureDirectory();
      const filePath = getFilePath(state.chainId);
      const serialized = serializeState(state);
      await fs.writeFile(filePath, JSON.stringify(serialized, null, 2), "utf-8");
    },

    async loadTaskState(chainId: string): Promise<PersistedTaskState | null> {
      const filePath = getFilePath(chainId);

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(content) as SerializedPersistedTaskState;
        return deserializeState(data);
      } catch (error) {
        // Return null if file doesn't exist
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },

    async listResumable(): Promise<{ chainId: string; savedAt: Date; status: string }[]> {
      try {
        await ensureDirectory();
        const files = await fs.readdir(resolvedBaseDir);
        const jsonFiles = files.filter((f) => f.endsWith(".json"));

        const results: { chainId: string; savedAt: Date; status: string }[] = [];

        for (const file of jsonFiles) {
          try {
            const filePath = path.join(resolvedBaseDir, file);
            const content = await fs.readFile(filePath, "utf-8");
            const data = JSON.parse(content) as SerializedPersistedTaskState;

            // Only include resumable states (running or paused)
            if (data.status === "running" || data.status === "paused") {
              results.push({
                chainId: data.chainId,
                savedAt: new Date(data.savedAt),
                status: data.status,
              });
            }
          } catch {
            // Skip files that can't be parsed
          }
        }

        // Sort by savedAt descending (most recent first)
        results.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());

        return results;
      } catch (error) {
        // Return empty list if directory doesn't exist
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },

    async deleteTaskState(chainId: string): Promise<boolean> {
      const filePath = getFilePath(chainId);

      try {
        await fs.unlink(filePath);
        return true;
      } catch (error) {
        // Return false if file doesn't exist
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return false;
        }
        throw error;
      }
    },
  };
}

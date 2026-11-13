import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { hostname } from "node:os";
import * as path from "node:path";
import {
  type OrchestratorCheckpoint,
  OrchestratorCheckpointSchema,
  type OrchestratorPersistence,
} from "@vellum/core";

export interface TaskSummary {
  id: string;
  task: string;
  status: OrchestratorCheckpoint["status"];
  updatedAt: number;
  completed: number;
  total: number;
}

export interface TaskPersistence extends OrchestratorPersistence {
  acquire(id: string): Promise<() => Promise<void>>;
  listResumable(): Promise<TaskSummary[]>;
  delete(id: string): Promise<boolean>;
}

// Shared by store instances in one process. A failed write must not poison later saves.
const writes = new Map<string, Promise<void>>();

function fileName(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 180) {
    throw new Error("Invalid task ID. Use the exact ID shown by vellum resume.");
  }
  return `${id}.json`;
}

function parseCheckpoint(content: string, id: string): OrchestratorCheckpoint {
  const parsed = OrchestratorCheckpointSchema.safeParse(JSON.parse(content));
  if (!parsed.success || parsed.data.id !== id) {
    throw new Error(`Task ${id} has an invalid or legacy checkpoint; it cannot be resumed safely.`);
  }
  return parsed.data;
}

async function hasExited(lock: string): Promise<boolean> {
  try {
    const owner = JSON.parse(await fs.readFile(lock, "utf8")) as Record<string, unknown>;
    if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0)
      return false;
    try {
      process.kill(owner.pid as number, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH";
    }
  } catch {
    // An incomplete or inaccessible owner is not proof that its worker has stopped.
  }
  return false;
}

/** Atomic owner installation avoids anonymous locks after a crash during acquisition. */
async function acquireFileLease(lock: string, id: string): Promise<() => Promise<void>> {
  const token = randomUUID();
  const claim = async () => {
    const temporary = `${lock}.${token}.owner`;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Hard linking installs complete owner metadata only if the lock is absent.
      await fs.link(temporary, lock);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  };
  try {
    await claim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await hasExited(lock))) {
      throw new Error(`Task ${id} is already active or its lock owner cannot be verified.`);
    }
    // Recovery guards use the same owner protocol, so a crash while reclaiming
    // is itself recoverable. Every stale deletion is serialized by its guard.
    const releaseRecovery = await acquireFileLease(`${lock}.reclaim`, id);
    try {
      if (!(await hasExited(lock))) throw new Error(`Task ${id} has another active owner.`);
      await fs.unlink(lock);
      await claim();
    } finally {
      await releaseRecovery();
    }
  }
  return async () => {
    try {
      const owner = JSON.parse(await fs.readFile(lock, "utf8")) as Record<string, unknown>;
      if (owner.token === token) await fs.unlink(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}

/** The same workspace task store backs interactive delegation and CLI recovery. */
export function createTaskPersistence(baseDir = ".vellum/tasks"): TaskPersistence {
  const directory = path.resolve(baseDir);
  const filePath = (id: string) => path.join(directory, fileName(id));

  const store: TaskPersistence = {
    async acquire(id) {
      const lock = `${filePath(id)}.lock`;
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      return acquireFileLease(lock, id);
    },
    async save(checkpoint) {
      const target = filePath(checkpoint.id);
      // Snapshot now: a queued write must not observe a later mutation of the plan.
      const content = JSON.stringify(OrchestratorCheckpointSchema.parse(checkpoint));
      const previous = writes.get(target) ?? Promise.resolve();
      const pending = previous
        .catch(() => {})
        .then(async () => {
          await fs.mkdir(directory, { recursive: true, mode: 0o700 });
          const temporary = `${target}.${randomUUID()}.tmp`;
          try {
            const handle = await fs.open(temporary, "wx", 0o600);
            try {
              await handle.writeFile(content, "utf8");
              await handle.sync();
            } finally {
              await handle.close();
            }
            // Same-directory replacement leaves either the old or the complete new file.
            await fs.rename(temporary, target);
          } finally {
            await fs.rm(temporary, { force: true });
          }
        });
      writes.set(target, pending);
      try {
        await pending;
      } finally {
        if (writes.get(target) === pending) writes.delete(target);
      }
    },

    async load(id) {
      const target = filePath(id);
      await writes.get(target);
      try {
        return parseCheckpoint(await fs.readFile(target, "utf8"), id);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async listResumable() {
      let entries: string[];
      try {
        entries = await fs.readdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const summaries: TaskSummary[] = [];
      // Read sequentially to avoid opening every long transcript at once.
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        try {
          const checkpoint = await store.load(entry.slice(0, -5));
          if (!checkpoint || checkpoint.status === "completed") continue;
          summaries.push({
            id: checkpoint.id,
            task: checkpoint.task,
            status: checkpoint.status,
            updatedAt: checkpoint.updatedAt,
            completed: checkpoint.tasks.filter((task) => task.status === "completed").length,
            total: checkpoint.tasks.length,
          });
        } catch {
          // A damaged or pre-checkpoint file cannot hide other recoverable tasks.
        }
      }
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async delete(id) {
      const target = filePath(id);
      await writes.get(target);
      try {
        await fs.unlink(target);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
  };
  return store;
}

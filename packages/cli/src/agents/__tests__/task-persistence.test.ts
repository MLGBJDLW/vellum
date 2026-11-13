import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { OrchestratorCheckpoint } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskPersistence, type TaskPersistence } from "../task-persistence.js";

function checkpoint(overrides: Partial<OrchestratorCheckpoint> = {}): OrchestratorCheckpoint {
  return {
    version: 1,
    id: "delegate_123",
    task: "Review the workspace",
    level: 2,
    providerType: "anthropic",
    model: "test-model",
    cwd: process.cwd(),
    status: "running",
    tasks: [
      {
        id: "worker_1",
        agent: "analyst",
        task: "Review",
        status: overrides.status === "completed" ? "completed" : "running",
        ...(overrides.status === "completed"
          ? { result: { status: "success" as const, data: "Done", startedAt: 1, completedAt: 2 } }
          : {}),
        checkpoint: {
          messages: [
            {
              id: "message_1",
              role: "user",
              parts: [{ type: "text", text: "Review" }],
              metadata: { createdAt: 1 },
            },
          ],
          output: "Reviewed one file",
          iterations: 1,
          tokensUsed: 12,
        },
      },
    ],
    groups: [["worker_1"]],
    updatedAt: 1,
    ...overrides,
  };
}

describe("durable task storage", () => {
  let directory: string;
  let persistence: TaskPersistence;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "vellum-tasks-"));
    persistence = createTaskPersistence(directory);
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("restores actual worker history across store instances", async () => {
    const saved = checkpoint();
    await persistence.save(saved);
    expect(await createTaskPersistence(directory).load(saved.id)).toEqual(saved);
    expect(await fs.readdir(directory)).toEqual(["delegate_123.json"]);
  });

  it("serializes simultaneous saves without losing the latest snapshot", async () => {
    const saved = checkpoint();
    const pending = persistence.save(saved);
    const worker = saved.tasks[0]?.checkpoint;
    if (!worker) throw new Error("Missing test checkpoint");
    worker.output = "Finished";
    saved.status = "failed";
    const finalSave = createTaskPersistence(directory).save(saved);
    await Promise.all([pending, finalSave]);
    expect((await persistence.load(saved.id))?.status).toBe("failed");
    expect((await persistence.load(saved.id))?.tasks[0]?.checkpoint?.output).toBe("Finished");
    expect(await fs.readdir(directory)).toEqual(["delegate_123.json"]);
  });

  it("preserves the previous checkpoint after invalid save and accepts later writes", async () => {
    await persistence.save(checkpoint());
    await expect(persistence.save(checkpoint({ version: 2 as 1 }))).rejects.toThrow();
    expect((await persistence.load("delegate_123"))?.version).toBe(1);
    await persistence.save(checkpoint({ status: "cancelled" }));
    expect((await persistence.load("delegate_123"))?.status).toBe("cancelled");
  });

  it.each(["../outside", "a/b", "a\\b", "", "a:b", "x\u0000y"])(
    "rejects unsafe ID %j without filename collisions",
    async (id) => {
      await expect(persistence.save(checkpoint({ id }))).rejects.toThrow();
      await expect(persistence.load(id)).rejects.toThrow();
      await expect(persistence.delete(id)).rejects.toThrow();
      expect(await fs.readdir(directory)).toEqual([]);
    }
  );

  it("lists interrupted and failed tasks while skipping complete, legacy and damaged files", async () => {
    await persistence.save(checkpoint());
    await persistence.save(checkpoint({ id: "failed", status: "failed", updatedAt: 3 }));
    await persistence.save(checkpoint({ id: "complete", status: "completed", updatedAt: 4 }));
    await fs.writeFile(
      path.join(directory, "legacy.json"),
      JSON.stringify({ chainId: "legacy", status: "running" })
    );
    await fs.writeFile(path.join(directory, "broken.json"), "{");
    expect((await persistence.listResumable()).map((entry) => entry.id)).toEqual([
      "failed",
      "delegate_123",
    ]);
    await expect(persistence.load("legacy")).rejects.toThrow("legacy checkpoint");
    await fs.writeFile(path.join(directory, "wrong.json"), JSON.stringify(checkpoint()));
    await expect(persistence.load("wrong")).rejects.toThrow("invalid");
  });

  it("handles missing and deleted checkpoints", async () => {
    expect(await persistence.load("missing")).toBeNull();
    expect(await persistence.delete("missing")).toBe(false);
    await persistence.save(checkpoint());
    expect(await persistence.delete("delegate_123")).toBe(true);
    expect(await persistence.load("delegate_123")).toBeNull();
  });

  it("prevents overlapping workers across store instances and releases ownership", async () => {
    const release = await persistence.acquire("delegate_123");
    await expect(createTaskPersistence(directory).acquire("delegate_123")).rejects.toThrow(
      "already active"
    );
    await release();
    const releaseAgain = await persistence.acquire("delegate_123");
    await releaseAgain();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("recovers an exited local owner without stealing a foreign or incomplete lock", async () => {
    const lock = path.join(directory, "delegate_123.json.lock");
    await fs.writeFile(
      lock,
      JSON.stringify({ pid: 2147483647, host: os.hostname(), token: "old" })
    );
    await fs.writeFile(
      `${lock}.reclaim`,
      JSON.stringify({ pid: 2147483647, host: os.hostname(), token: "interrupted-recovery" })
    );
    const release = await persistence.acquire("delegate_123");
    await release();
    expect(await fs.readdir(directory)).toEqual([]);
    await fs.writeFile(
      lock,
      JSON.stringify({ pid: 2147483647, host: "another-machine", token: "foreign" })
    );
    await expect(persistence.acquire("delegate_123")).rejects.toThrow("cannot be verified");
    await fs.writeFile(lock, "");
    await expect(persistence.acquire("delegate_123")).rejects.toThrow("cannot be verified");
  });
});

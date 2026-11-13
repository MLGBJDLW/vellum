import { z } from "zod";
import { SessionMessageSchema } from "../../session/message.js";

/** Receipt-complete history. Never stores permissions or credentials. */
export const WorkerCheckpointSchema = z.object({
  messages: z.array(SessionMessageSchema),
  output: z.string(),
  iterations: z.number().int().nonnegative(),
  tokensUsed: z.number().nonnegative(),
});
export type WorkerCheckpoint = z.infer<typeof WorkerCheckpointSchema>;

export const OrchestratorCheckpointSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    parentSessionId: z.string().optional(),
    task: z.string().min(1),
    level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    providerType: z.string().optional(),
    model: z.string().optional(),
    maxIterations: z.number().int().positive().optional(),
    cwd: z.string().optional(),
    status: z.enum(["running", "completed", "failed", "cancelled"]),
    tasks: z.array(
      z.object({
        id: z.string().min(1),
        task: z.string().min(1),
        agent: z.string(),
        status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
        checkpoint: WorkerCheckpointSchema.optional(),
        result: z
          .object({
            status: z.enum(["success", "failure", "partial"]),
            data: z.unknown().optional(),
            error: z.string().optional(),
            startedAt: z.number(),
            completedAt: z.number(),
          })
          .optional(),
      })
    ),
    groups: z.array(z.array(z.string())),
    updatedAt: z.number(),
  })
  .superRefine((checkpoint, ctx) => {
    const ids = checkpoint.tasks.map((task) => task.id);
    const idSet = new Set(ids);
    const scheduled = checkpoint.groups.flat();
    if (
      ids.length === 0 ||
      idSet.size !== ids.length ||
      scheduled.length !== ids.length ||
      new Set(scheduled).size !== ids.length ||
      scheduled.some((id) => !idSet.has(id))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Checkpoint plan must schedule every task exactly once",
        path: ["groups"],
      });
    }
    if (
      checkpoint.status === "completed" &&
      checkpoint.tasks.some((task) => task.status !== "completed")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Completed plan contains unfinished tasks",
        path: ["status"],
      });
    }
    for (const [index, task] of checkpoint.tasks.entries()) {
      if (task.status === "completed" && task.result?.status !== "success") {
        ctx.addIssue({
          code: "custom",
          message: "Completed task requires its successful receipt",
          path: ["tasks", index, "result"],
        });
      }
    }
  });
export type OrchestratorCheckpoint = z.infer<typeof OrchestratorCheckpointSchema>;

export interface OrchestratorPersistence {
  /** Optional cross-process lease, acquired before loading a resume checkpoint. */
  acquire?(id: string): Promise<() => Promise<void>>;
  save(checkpoint: OrchestratorCheckpoint): Promise<void>;
  load(id: string): Promise<OrchestratorCheckpoint | null>;
}

/** Small progress events, independent from persisted conversation history. */
export interface WorkerProgress {
  id?: string;
  agent?: string;
  task?: string;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  error?: string;
  toolName?: string;
  text?: string;
  iterations?: number;
  tokensUsed?: number;
}

export interface DelegationUpdate {
  id: string;
  parentId?: string;
  agent: string;
  providerType?: string;
  model?: string;
  task: string;
  status: WorkerProgress["status"] | "completed" | "failed" | "cancelled" | "interrupted";
  toolName?: string;
  message?: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
  iterations?: number;
  tokensUsed?: number;
}

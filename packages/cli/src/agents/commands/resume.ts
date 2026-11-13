import * as path from "node:path";
import { getModelReplacement } from "@vellum/provider";
import type { Command } from "commander";
import { handleRun } from "../../commands/run.js";
import { createTaskPersistence } from "../task-persistence.js";

export interface ResumeCommandOptions {
  instruction?: string;
}

/** Recovery uses the same parent loop, tool permissions and worker engine as delegation. */
export function registerResumeCommand(program: Command): void {
  program
    .command("resume [taskId]")
    .description("List or resume saved subagent work in this workspace")
    .option("--instruction <text>", "Additional instructions for the resumed worker")
    .action(async (taskId: string | undefined, options: ResumeCommandOptions) => {
      try {
        const persistence = createTaskPersistence();
        if (!taskId) {
          const tasks = await persistence.listResumable();
          if (tasks.length === 0) console.log("No resumable subagent tasks in this workspace.");
          for (const task of tasks) {
            const status = task.status === "running" ? "interrupted" : task.status;
            console.log(`${task.id}  ${status}  ${task.completed}/${task.total} completed`);
            console.log(`  ${task.task.replace(/[\r\n\t]/g, " ").slice(0, 160)}`);
          }
          if (tasks.length) console.log("Resume with: vellum resume <taskId>");
          return;
        }
        const checkpoint = await persistence.load(taskId);
        if (!checkpoint) throw new Error(`Task ${taskId} was not found.`);
        if (checkpoint.status === "completed")
          throw new Error(`Task ${taskId} is already complete.`);
        if (!checkpoint.cwd || path.resolve(checkpoint.cwd) !== path.resolve(process.cwd())) {
          throw new Error("Resume this task from its original workspace directory.");
        }
        if (!checkpoint.providerType || !checkpoint.model) {
          throw new Error("This checkpoint does not contain a provider and model.");
        }
        const replacement = getModelReplacement(checkpoint.providerType, checkpoint.model);
        if (replacement) {
          throw new Error(
            `${checkpoint.model} has retired. Resume in chat with ${replacement} and resumeId ${taskId}.`
          );
        }
        await handleRun(
          options.instruction ?? "Continue the unfinished task from its saved receipts.",
          {
            provider: checkpoint.providerType,
            model: checkpoint.model,
            delegation: { resumeId: taskId },
          }
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}

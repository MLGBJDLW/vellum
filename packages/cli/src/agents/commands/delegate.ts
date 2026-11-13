import { getDefaultModelId, getModelReplacement, getSupportedProviders } from "@vellum/provider";
import type { Command } from "commander";
import { handleRun } from "../../commands/run.js";

export interface DelegateCommandOptions {
  files?: string;
  timeout?: string;
  model?: string;
  provider: string;
}

export function registerDelegateCommand(program: Command): void {
  program
    .command("delegate <agent> <task>")
    .description("Run a specialist with persistent progress and normal tool permissions")
    .option("--files <paths>", "Related files (comma-separated)")
    .option("--timeout <ms>", "Explicit deadline; omitted by default")
    .option("-m, --model <model>", "Model to use")
    .option("-p, --provider <provider>", "Provider to use", "anthropic")
    .action(async (agent: string, task: string, options: DelegateCommandOptions) => {
      try {
        if (agent.startsWith("custom:") || agent.startsWith("mcp:")) {
          throw new Error(
            "Use a registered specialist such as coder, analyst, researcher, or writer."
          );
        }
        if (!getSupportedProviders().includes(options.provider)) {
          throw new Error(`Unknown provider: ${options.provider}`);
        }
        const model = options.model ?? getDefaultModelId(options.provider);
        if (!model) throw new Error(`No default model for ${options.provider}; supply --model.`);
        const replacement = getModelReplacement(options.provider, model);
        if (replacement) throw new Error(`${model} has retired. Use ${replacement}.`);
        const timeout = options.timeout === undefined ? undefined : Number(options.timeout);
        if (
          timeout !== undefined &&
          (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)
        ) {
          throw new Error("Timeout must be an integer between 1 and 2147483647 milliseconds.");
        }
        const context = options.files
          ? `Related files: ${options.files
              .split(",")
              .map((file) => file.trim())
              .filter(Boolean)
              .join(", ")}`
          : undefined;
        await handleRun(task, {
          provider: options.provider,
          model,
          timeout,
          delegation: { targetAgent: agent, context },
        });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}

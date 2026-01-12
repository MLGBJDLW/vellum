import { resolve } from "node:path";
import type { CompletionItem } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const completionParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
});

export interface LspCompletionOutput {
  path: string;
  items: CompletionItem[];
  count: number;
}

export function createCompletionTool(hub: LspHub) {
  return defineTool<typeof completionParamsSchema, LspCompletionOutput>({
    name: "lsp_completion",
    description: "Get code completion suggestions at a position. Lines are 1-indexed.",
    parameters: completionParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const items = (await hub.completion(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as CompletionItem[];
        return ok({
          path: filePath,
          items,
          count: items.length,
        });
      } catch (error) {
        return fail(
          `Failed to get completions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

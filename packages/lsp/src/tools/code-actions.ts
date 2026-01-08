import { resolve } from "node:path";
import type { CodeAction } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const codeActionsParamsSchema = z.object({
  path: z.string().describe("File path"),
  startLine: z.number().int().positive().describe("Start line (1-indexed)"),
  startCharacter: z.number().int().positive().describe("Start character (1-indexed)"),
  endLine: z.number().int().positive().describe("End line (1-indexed)"),
  endCharacter: z.number().int().positive().describe("End character (1-indexed)"),
});

export interface LspCodeActionsOutput {
  path: string;
  actions: CodeAction[];
  count: number;
}

export function createCodeActionsTool(hub: LspHub) {
  return defineTool<typeof codeActionsParamsSchema, LspCodeActionsOutput>({
    name: "lsp_code_actions",
    description: "Fetch code actions for a range. Lines are 1-indexed.",
    parameters: codeActionsParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const actions = (await hub.codeActions(
          filePath,
          Math.max(0, input.startLine - 1),
          Math.max(0, input.startCharacter - 1),
          Math.max(0, input.endLine - 1),
          Math.max(0, input.endCharacter - 1)
        )) as CodeAction[];
        return ok({ path: filePath, actions, count: actions.length });
      } catch (error) {
        return fail(
          `Failed to get code actions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

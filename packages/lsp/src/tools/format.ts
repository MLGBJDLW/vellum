import { resolve } from "node:path";
import type { TextEdit } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const formatParamsSchema = z.object({
  path: z.string().describe("File path"),
});

export interface LspFormatOutput {
  path: string;
  edits: TextEdit[];
  count: number;
}

export function createFormatTool(hub: LspHub) {
  return defineTool<typeof formatParamsSchema, LspFormatOutput>({
    name: "lsp_format",
    description: "Format a document and return text edits.",
    parameters: formatParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const edits = (await hub.formatDocument(filePath)) as TextEdit[];
        return ok({ path: filePath, edits, count: edits.length });
      } catch (error) {
        return fail(
          `Failed to format document: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

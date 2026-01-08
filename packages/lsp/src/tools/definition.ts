import { resolve } from "node:path";
import type { Location } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const definitionParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
});

export interface LspDefinitionOutput {
  path: string;
  locations: Location[];
  count: number;
}

export function createDefinitionTool(hub: LspHub) {
  return defineTool<typeof definitionParamsSchema, LspDefinitionOutput>({
    name: "lsp_definition",
    description: "Find symbol definition at a position. Lines are 1-indexed.",
    parameters: definitionParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const locations = (await hub.definition(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as Location[];
        return ok({
          path: filePath,
          locations,
          count: locations.length,
        });
      } catch (error) {
        return fail(
          `Failed to get definition: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

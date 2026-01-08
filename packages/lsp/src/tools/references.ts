import { resolve } from "node:path";
import type { Location } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const referencesParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
  includeDeclaration: z.boolean().optional().default(false),
});

export interface LspReferencesOutput {
  path: string;
  references: Location[];
  count: number;
}

export function createReferencesTool(hub: LspHub) {
  return defineTool<typeof referencesParamsSchema, LspReferencesOutput>({
    name: "lsp_references",
    description: "Find symbol references at a position. Lines are 1-indexed.",
    parameters: referencesParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const references = (await hub.references(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1),
          input.includeDeclaration
        )) as Location[];
        return ok({
          path: filePath,
          references,
          count: references.length,
        });
      } catch (error) {
        return fail(
          `Failed to get references: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

import { resolve } from "node:path";
import type { Location, LocationLink } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const implementationParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
});

export interface LspImplementationOutput {
  path: string;
  locations: Array<Location | LocationLink>;
  count: number;
}

export function createImplementationTool(hub: LspHub) {
  return defineTool<typeof implementationParamsSchema, LspImplementationOutput>({
    name: "lsp_implementation",
    description:
      "Find implementations of an interface, abstract method, or type at a position. " +
      "Useful for finding concrete implementations of abstract types. Lines are 1-indexed.",
    parameters: implementationParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const locations = (await hub.implementation(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as Array<Location | LocationLink>;
        return ok({
          path: filePath,
          locations,
          count: locations.length,
        });
      } catch (error) {
        return fail(
          `Failed to get implementation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

import { resolve } from "node:path";
import type { Hover, MarkedString } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const hoverParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
});

export interface LspHoverOutput {
  path: string;
  content: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

function normalizeHover(hover: Hover): LspHoverOutput {
  const content = renderHoverContents(hover.contents);
  const range = hover.range
    ? {
        start: { line: hover.range.start.line + 1, character: hover.range.start.character + 1 },
        end: { line: hover.range.end.line + 1, character: hover.range.end.character + 1 },
      }
    : undefined;

  return { path: "", content, range };
}

function renderHoverContents(contents: Hover["contents"]): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents.map((item) => renderMarkedString(item)).join("\n");
  }
  if ("value" in contents) {
    return contents.value;
  }
  return "";
}

function renderMarkedString(input: MarkedString): string {
  if (typeof input === "string") return input;
  return input.value;
}

export function createHoverTool(hub: LspHub) {
  return defineTool<typeof hoverParamsSchema, LspHoverOutput | null>({
    name: "lsp_hover",
    description: "Fetch hover information at a position. Lines are 1-indexed.",
    parameters: hoverParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const hover = (await hub.hover(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as Hover | null;

        if (!hover) {
          return ok(null);
        }

        const normalized = normalizeHover(hover);
        normalized.path = filePath;
        return ok(normalized);
      } catch (error) {
        return fail(
          `Failed to get hover: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

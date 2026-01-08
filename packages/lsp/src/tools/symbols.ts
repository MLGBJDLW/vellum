import { resolve } from "node:path";
import type { DocumentSymbol, SymbolInformation } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const documentSymbolsParamsSchema = z.object({
  path: z.string().describe("File path"),
});

export interface LspDocumentSymbolsOutput {
  path: string;
  symbols: DocumentSymbol[];
  count: number;
}

export function createDocumentSymbolsTool(hub: LspHub) {
  return defineTool<typeof documentSymbolsParamsSchema, LspDocumentSymbolsOutput>({
    name: "lsp_symbols",
    description: "List document symbols for a file.",
    parameters: documentSymbolsParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const symbols = (await hub.documentSymbols(filePath)) as DocumentSymbol[];
        return ok({ path: filePath, symbols, count: symbols.length });
      } catch (error) {
        return fail(
          `Failed to get document symbols: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

export const workspaceSymbolsParamsSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().int().positive().optional(),
});

export interface LspWorkspaceSymbolsOutput {
  query: string;
  symbols: SymbolInformation[];
  count: number;
}

export function createWorkspaceSymbolsTool(hub: LspHub) {
  return defineTool<typeof workspaceSymbolsParamsSchema, LspWorkspaceSymbolsOutput>({
    name: "lsp_workspace_symbol",
    description: "Search workspace symbols by query.",
    parameters: workspaceSymbolsParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const symbols = (await hub.workspaceSymbols(input.query)) as SymbolInformation[];
        const limited = input.limit ? symbols.slice(0, input.limit) : symbols;
        return ok({ query: input.query, symbols: limited, count: limited.length });
      } catch (error) {
        return fail(
          `Failed to get workspace symbols: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

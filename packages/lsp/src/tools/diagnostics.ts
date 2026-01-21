import { resolve } from "node:path";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

const SeveritySchema = z.enum(["error", "warning", "info", "hint"]);

export const diagnosticsParamsSchema = z.object({
  path: z.string().describe("File path to analyze"),
  severity: SeveritySchema.optional().describe("Optional severity filter"),
});

export interface LspDiagnosticsOutput {
  path: string;
  diagnostics: Diagnostic[];
  count: number;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    hints: number;
  };
}

function severityName(value?: number): "error" | "warning" | "info" | "hint" | undefined {
  switch (value) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return undefined;
  }
}

function summarize(diagnostics: Diagnostic[]): LspDiagnosticsOutput["summary"] {
  const summary = { errors: 0, warnings: 0, infos: 0, hints: 0 };
  for (const diag of diagnostics) {
    const sev = severityName(diag.severity);
    if (sev === "error") summary.errors += 1;
    if (sev === "warning") summary.warnings += 1;
    if (sev === "info") summary.infos += 1;
    if (sev === "hint") summary.hints += 1;
  }
  return summary;
}

export function createDiagnosticsTool(hub: LspHub) {
  return defineTool<typeof diagnosticsParamsSchema, LspDiagnosticsOutput>({
    name: "lsp_diagnostics",
    description:
      "Fetch LSP diagnostics for a file. Line and character positions are 1-indexed in results.",
    parameters: diagnosticsParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const result = await hub.diagnostics(filePath);
        const diagnostics = result.diagnostics;
        const filtered = input.severity
          ? diagnostics.filter((diag) => severityName(diag.severity) === input.severity)
          : diagnostics;
        return ok({
          path: filePath,
          diagnostics: filtered,
          count: filtered.length,
          summary: summarize(filtered),
        });
      } catch (error) {
        return fail(
          `Failed to get diagnostics: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

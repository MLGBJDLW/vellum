import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TextEdit, WorkspaceEdit } from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

export const renameParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
  newName: z.string().describe("New name for the symbol"),
});

export interface FileChange {
  path: string;
  edits: Array<{
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    newText: string;
  }>;
}

export interface LspRenameOutput {
  changes: FileChange[];
  totalFiles: number;
  totalEdits: number;
}

function normalizeWorkspaceEdit(edit: WorkspaceEdit): FileChange[] {
  const result: FileChange[] = [];

  // Handle changes (map of uri -> TextEdit[])
  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const filePath = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
      result.push({
        path: filePath,
        edits: (edits as TextEdit[]).map((e) => ({
          range: e.range,
          newText: e.newText,
        })),
      });
    }
  }

  // Handle documentChanges (array of TextDocumentEdit or CreateFile/RenameFile/DeleteFile)
  if (edit.documentChanges) {
    for (const docChange of edit.documentChanges) {
      if ("textDocument" in docChange && "edits" in docChange) {
        const uri = docChange.textDocument.uri;
        const filePath = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
        result.push({
          path: filePath,
          edits: docChange.edits.map((e) => {
            // Handle both TextEdit and AnnotatedTextEdit
            const textEdit = "annotationId" in e ? e : e;
            return {
              range: textEdit.range,
              newText: textEdit.newText,
            };
          }),
        });
      }
    }
  }

  return result;
}

export function createRenameTool(hub: LspHub) {
  return defineTool<typeof renameParamsSchema, LspRenameOutput>({
    name: "lsp_rename",
    description:
      "Rename a symbol across the workspace using LSP. Returns the list of files and edits that would be made. Lines are 1-indexed.",
    parameters: renameParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const result = (await hub.rename(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1),
          input.newName
        )) as WorkspaceEdit | null;

        if (!result) {
          return ok({
            changes: [],
            totalFiles: 0,
            totalEdits: 0,
          });
        }

        const changes = normalizeWorkspaceEdit(result);
        const totalEdits = changes.reduce((sum, fc) => sum + fc.edits.length, 0);

        return ok({
          changes,
          totalFiles: changes.length,
          totalEdits,
        });
      } catch (error) {
        return fail(
          `Failed to rename symbol: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      // Rename is a potentially destructive operation
      return true;
    },
  });
}

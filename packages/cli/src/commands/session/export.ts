/**
 * Session Export Command
 * @module cli/commands/session/export
 */

import { resolve } from "node:path";

import {
  type ExportFormat,
  ExportService,
  type SessionListService,
  type StorageManager,
} from "@vellum/core";

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";
import { resolveSessionReference } from "./utils.js";

export type SessionExportFormat = "json" | "markdown" | "html";

export interface SessionExportOptions {
  format?: SessionExportFormat;
  output?: string;
  archived?: boolean;
}

function isSessionExportFormat(value: unknown): value is SessionExportFormat {
  return value === "json" || value === "markdown" || value === "html";
}

function sanitizeFileName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "session";
}

function getExtension(format: SessionExportFormat): string {
  switch (format) {
    case "json":
      return "json";
    case "html":
      return "html";
    default:
      return "md";
  }
}

function buildOutputPath(
  cwd: string,
  title: string,
  sessionId: string,
  format: SessionExportFormat,
  output?: string
): string {
  if (output) {
    return resolve(cwd, output);
  }

  return resolve(
    cwd,
    `${sanitizeFileName(title)}-${sessionId.slice(0, 8)}.${getExtension(format)}`
  );
}

export function createExportCommand(
  storage?: StorageManager,
  listService?: SessionListService
): SlashCommand {
  return {
    name: "export",
    description: "Export a saved session to a file",
    kind: "builtin",
    category: "session",
    positionalArgs: [
      {
        name: "session-id",
        type: "string",
        description: "Session ID or short ID",
        required: true,
      },
    ],
    namedArgs: [
      {
        name: "format",
        type: "string",
        description: "Export format: json, markdown, html",
        required: false,
        default: "markdown",
      },
      {
        name: "output",
        shorthand: "o",
        type: "path",
        description: "Output file path",
        required: false,
      },
      {
        name: "archived",
        type: "boolean",
        description: "Export an archived session instead of an active one",
        required: false,
      },
    ],
    examples: [
      "/session export abc12345                           - Export to markdown",
      "/session export abc12345 --format=json             - Export to JSON",
      "/session archived export abc12345 --output=./a.md  - Export an archived session",
    ],
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      if (!storage || !listService) {
        return error(
          "INTERNAL_ERROR",
          "Export command not initialized. Use createExportCommand with storage dependencies."
        );
      }

      const sessionId = ctx.parsedArgs.positional[0] as string | undefined;
      if (!sessionId) {
        return error("MISSING_ARGUMENT", "Please provide a session ID to export.", [
          "/session export <session-id>",
          "/session archived export <session-id>",
        ]);
      }

      const formatValue = (ctx.parsedArgs.named.format as string | undefined) ?? "markdown";
      if (!isSessionExportFormat(formatValue)) {
        return error("INVALID_ARGUMENT", `Unsupported export format: ${formatValue}`, [
          "json",
          "markdown",
          "html",
        ]);
      }

      const exportOptions: SessionExportOptions = {
        format: formatValue,
        output: ctx.parsedArgs.named.output as string | undefined,
        archived: ctx.parsedArgs.named.archived as boolean | undefined,
      };
      const exportFormat: SessionExportFormat = exportOptions.format ?? "markdown";

      const sessionResult = await resolveSessionReference({
        storage,
        listService,
        sessionId,
        archived: exportOptions.archived,
      });

      if (!sessionResult.ok || !sessionResult.session) {
        return error("RESOURCE_NOT_FOUND", sessionResult.error ?? "Session not found.");
      }

      const session = sessionResult.session;
      const filePath = buildOutputPath(
        ctx.session.cwd,
        session.metadata.title,
        session.metadata.id,
        exportFormat,
        exportOptions.output
      );

      try {
        const exportService = new ExportService();
        await exportService.exportToFile(
          session,
          {
            format: exportFormat as ExportFormat,
            includeMetadata: true,
            includeToolOutputs: true,
            includeTimestamps: true,
          },
          filePath
        );

        return success(
          [
            `📤 Exported session "${session.metadata.title}"`,
            "",
            `  Format: ${exportFormat}`,
            `  File: ${filePath}`,
          ].join("\n")
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return error("INTERNAL_ERROR", `Failed to export session: ${message}`, [
          "Check the output path permissions.",
          "Try a different --output location.",
        ]);
      }
    },
  };
}

export const exportCommand: SlashCommand = createExportCommand();

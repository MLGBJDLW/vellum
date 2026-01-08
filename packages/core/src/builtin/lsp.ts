/**
 * LSP Tool
 *
 * Provides Language Server Protocol integration for code intelligence.
 * Connects to running LSP servers to provide definition, references,
 * diagnostics, hover, and completion queries.
 *
 * @module builtin/lsp
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LspHub } from "@vellum/lsp";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";

/** LSP action types */
const LspActionSchema = z.enum(["definition", "references", "diagnostics", "hover", "completion"]);

/**
 * Schema for lsp tool parameters
 */
export const lspParamsSchema = z.object({
  /** Query type to perform */
  action: LspActionSchema.describe("The LSP query type to perform"),
  /** File path to query */
  file: z.string().describe("File path to query"),
  /** Line number (1-indexed) */
  line: z.number().int().positive().optional().describe("Line number (1-indexed)"),
  /** Column number (1-indexed) */
  column: z.number().int().positive().optional().describe("Column number (1-indexed)"),
});

/** Inferred type for lsp parameters */
export type LspParams = z.infer<typeof lspParamsSchema>;

/** Location in source code */
export interface LspLocation {
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line (1-indexed, optional) */
  endLine?: number;
  /** End column (1-indexed, optional) */
  endColumn?: number;
}

/** Diagnostic severity levels */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/** Diagnostic information */
export interface LspDiagnostic {
  /** Diagnostic message */
  message: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Source location */
  location: LspLocation;
  /** Diagnostic source (e.g., 'typescript', 'eslint') */
  source?: string;
  /** Diagnostic code */
  code?: string | number;
}

/** Hover information */
export interface LspHoverInfo {
  /** Hover content (markdown or plain text) */
  content: string;
  /** Content type */
  contentType: "markdown" | "plaintext";
  /** Range the hover applies to */
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/** Completion item */
export interface LspCompletionItem {
  /** Completion label */
  label: string;
  /** Kind of completion (function, variable, etc.) */
  kind: string;
  /** Detail information */
  detail?: string;
  /** Documentation */
  documentation?: string;
  /** Text to insert */
  insertText?: string;
}

/** Output type for lsp tool */
export interface LspOutput {
  /** Action that was performed */
  action: string;
  /** File that was queried */
  file: string;
  /** Definition locations (for definition action) */
  definitions?: LspLocation[];
  /** Reference locations (for references action) */
  references?: LspLocation[];
  /** Diagnostics (for diagnostics action) */
  diagnostics?: LspDiagnostic[];
  /** Hover information (for hover action) */
  hover?: LspHoverInfo;
  /** Completion items (for completion action) */
  completions?: LspCompletionItem[];
}

/** LSP connection interface (abstract for different implementations) */
interface LspConnection {
  isConnected(): boolean;
  definition(file: string, line: number, column: number): Promise<LspLocation[]>;
  references(file: string, line: number, column: number): Promise<LspLocation[]>;
  diagnostics(file: string): Promise<LspDiagnostic[]>;
  hover(file: string, line: number, column: number): Promise<LspHoverInfo | null>;
  completion(file: string, line: number, column: number): Promise<LspCompletionItem[]>;
}

/** Cached LSP connection */
let lspConnection: LspConnection | null = null;

/**
 * Get or create LSP connection
 *
 * Note: This is a placeholder implementation. In a real system, this would:
 * 1. Check for running LSP servers (TypeScript, Python, etc.)
 * 2. Connect via stdio, socket, or other transport
 * 3. Handle the LSP protocol handshake
 */
let lspHub: LspHub | null = null;

async function getLspHub(ctx: { workingDir: string }): Promise<LspHub> {
  if (!lspHub) {
    lspHub = LspHub.getInstance({
      getGlobalConfigPath: async () => join(homedir(), ".vellum", "lsp.json"),
      getProjectConfigPath: async () => join(ctx.workingDir, ".vellum", "lsp.json"),
    });
  }

  await lspHub.initialize();
  return lspHub;
}

async function getLspConnection(ctx: { workingDir: string }): Promise<LspConnection | null> {
  if (lspConnection) {
    return lspConnection;
  }

  try {
    const hub = await getLspHub(ctx);
    return {
      isConnected: () => true,
      definition: async (file, line, column) =>
        normalizeLocations(await hub.definition(file, line - 1, column - 1)),
      references: async (file, line, column) =>
        normalizeLocations(await hub.references(file, line - 1, column - 1)),
      diagnostics: async (file) => normalizeDiagnostics(await hub.diagnostics(file), file),
      hover: async (file, line, column) =>
        normalizeHover(await hub.hover(file, line - 1, column - 1)),
      completion: async (file, line, column) =>
        normalizeCompletions(await hub.completion(file, line - 1, column - 1)),
    };
  } catch {
    return null;
  }
}

function normalizeLocations(raw: unknown): LspLocation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const loc = entry as {
        uri?: string;
        range?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      };
      if (!loc.uri || !loc.range) return null;
      const filePath = loc.uri.startsWith("file://") ? fileURLToPath(loc.uri) : loc.uri;
      return {
        file: filePath,
        line: loc.range.start.line + 1,
        column: loc.range.start.character + 1,
        endLine: loc.range.end.line + 1,
        endColumn: loc.range.end.character + 1,
      } satisfies LspLocation;
    })
    .filter(Boolean) as LspLocation[];
}

function normalizeDiagnostics(raw: unknown, fallbackFile: string): LspDiagnostic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const diag = entry as {
        message?: string;
        severity?: number;
        range?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        source?: string;
        code?: string | number;
      };
      if (!diag.message || !diag.range) return null;
      return {
        message: diag.message,
        severity: mapDiagnosticSeverity(diag.severity),
        location: {
          file: fallbackFile,
          line: diag.range.start.line + 1,
          column: diag.range.start.character + 1,
          endLine: diag.range.end.line + 1,
          endColumn: diag.range.end.character + 1,
        },
        source: diag.source,
        code: diag.code,
      } satisfies LspDiagnostic;
    })
    .filter(Boolean) as LspDiagnostic[];
}

function normalizeHover(raw: unknown): LspHoverInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const hover = raw as {
    contents?: unknown;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  const content = renderHoverContents(hover.contents);
  if (!content) return null;
  return {
    content,
    contentType: "markdown",
    range: hover.range
      ? {
          start: { line: hover.range.start.line + 1, column: hover.range.start.character + 1 },
          end: { line: hover.range.end.line + 1, column: hover.range.end.character + 1 },
        }
      : undefined,
  };
}

function renderHoverContents(contents: unknown): string {
  if (!contents) return "";
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents.map((item) => renderHoverContents(item)).join("\n");
  }
  if (typeof contents === "object" && "value" in contents) {
    return String((contents as { value?: unknown }).value ?? "");
  }
  return "";
}

function normalizeCompletions(raw: unknown): LspCompletionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const completion = item as {
        label?: string;
        kind?: number | string;
        detail?: string;
        documentation?: string | { value?: string };
        insertText?: string;
      };
      if (!completion.label) return null;
      return {
        label: completion.label,
        kind: mapCompletionKind(completion.kind),
        detail: completion.detail,
        documentation:
          typeof completion.documentation === "string"
            ? completion.documentation
            : completion.documentation?.value,
        insertText: completion.insertText,
      } satisfies LspCompletionItem;
    })
    .filter(Boolean) as LspCompletionItem[];
}

function mapDiagnosticSeverity(severity?: number): DiagnosticSeverity {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "info";
  }
}

function mapCompletionKind(kind?: number | string): string {
  if (typeof kind === "string") return kind;
  const map = new Map<number, string>([
    [1, "text"],
    [2, "method"],
    [3, "function"],
    [4, "constructor"],
    [5, "field"],
    [6, "variable"],
    [7, "class"],
    [8, "interface"],
    [9, "module"],
    [10, "property"],
    [11, "unit"],
    [12, "value"],
    [13, "enum"],
    [14, "keyword"],
    [15, "snippet"],
    [16, "color"],
    [17, "file"],
    [18, "reference"],
    [19, "folder"],
    [20, "enumMember"],
    [21, "constant"],
    [22, "struct"],
    [23, "event"],
    [24, "operator"],
    [25, "typeParameter"],
  ]);
  return kind ? (map.get(kind) ?? "unknown") : "unknown";
}

/**
 * Check if position parameters are required for an action
 */
function requiresPosition(action: string): boolean {
  return ["definition", "references", "hover", "completion"].includes(action);
}

/**
 * LSP tool implementation
 *
 * Provides code intelligence by connecting to LSP servers.
 * Returns structured results or unavailable message if no LSP server is running.
 *
 * @example
 * ```typescript
 * // Get definition at position
 * const result = await lspTool.execute(
 *   { action: "definition", file: "src/index.ts", line: 10, column: 5 },
 *   ctx
 * );
 *
 * // Get diagnostics for file
 * const result = await lspTool.execute(
 *   { action: "diagnostics", file: "src/index.ts" },
 *   ctx
 * );
 *
 * // Get hover info
 * const result = await lspTool.execute(
 *   { action: "hover", file: "src/index.ts", line: 10, column: 15 },
 *   ctx
 * );
 * ```
 */
export const lspTool = defineTool<typeof lspParamsSchema, LspOutput>({
  name: "lsp",
  description:
    "Query Language Server Protocol for code intelligence. Supports definition lookup, references, diagnostics, hover info, and completions. Requires a running LSP server.",
  parameters: lspParamsSchema,
  kind: "lsp",
  category: "code",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Check permission for LSP operations
    const hasPermission = await ctx.checkPermission("lsp", input.action);
    if (!hasPermission) {
      return fail(`Permission denied: cannot perform LSP action '${input.action}'`);
    }

    // Resolve file path
    const filePath = resolve(ctx.workingDir, input.file);

    // Validate position for actions that require it
    const line = input.line;
    const column = input.column;
    if (requiresPosition(input.action)) {
      if (line === undefined || column === undefined) {
        return fail(`Line and column are required for '${input.action}' action`);
      }
    }

    // Try to get LSP connection
    const connection = await getLspConnection(ctx);
    if (!connection || !connection.isConnected()) {
      return fail(
        "LSP server is not available. No language server is currently running for this workspace. " +
          "Start your IDE or language server to enable LSP features."
      );
    }

    try {
      switch (input.action) {
        case "definition": {
          // Line and column validated above for position-requiring actions
          const definitions = await connection.definition(
            filePath,
            line as number,
            column as number
          );

          return ok<LspOutput>({
            action: "definition",
            file: filePath,
            definitions,
          });
        }

        case "references": {
          const references = await connection.references(
            filePath,
            line as number,
            column as number
          );

          return ok<LspOutput>({
            action: "references",
            file: filePath,
            references,
          });
        }

        case "diagnostics": {
          const diagnostics = await connection.diagnostics(filePath);

          return ok<LspOutput>({
            action: "diagnostics",
            file: filePath,
            diagnostics,
          });
        }

        case "hover": {
          const hover = await connection.hover(filePath, line as number, column as number);

          return ok<LspOutput>({
            action: "hover",
            file: filePath,
            hover: hover ?? undefined,
          });
        }

        case "completion": {
          const completions = await connection.completion(
            filePath,
            line as number,
            column as number
          );

          return ok<LspOutput>({
            action: "completion",
            file: filePath,
            completions,
          });
        }

        default:
          return fail(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        return fail(`LSP query failed: ${error.message}`);
      }

      return fail("Unknown error occurred during LSP query");
    }
  },

  shouldConfirm(_input, _ctx) {
    // LSP queries are read-only, no confirmation needed
    return false;
  },
});

/**
 * Set the LSP connection for testing or custom implementations
 * @param connection - LSP connection to use
 */
export function setLspConnection(connection: LspConnection | null): void {
  lspConnection = connection;
}

/**
 * Get the current LSP connection (for testing)
 */
export function getCurrentLspConnection(): LspConnection | null {
  return lspConnection;
}

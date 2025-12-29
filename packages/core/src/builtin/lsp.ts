/**
 * LSP Tool
 *
 * Provides Language Server Protocol integration for code intelligence.
 * Connects to running LSP servers to provide definition, references,
 * diagnostics, hover, and completion queries.
 *
 * @module builtin/lsp
 */

import { resolve } from "node:path";
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
async function getLspConnection(): Promise<LspConnection | null> {
  if (lspConnection) {
    return lspConnection;
  }

  // TODO: Implement actual LSP server discovery and connection
  // For now, return null to indicate LSP is not available
  return null;
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
  kind: "read",
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
    const connection = await getLspConnection();
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

import { resolve } from "node:path";
import type {
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from "vscode-languageserver-protocol";
import { z } from "zod";

import type { LspHub } from "../LspHub.js";
import { defineTool, fail, ok } from "./types.js";

const callHierarchyParamsSchema = z.object({
  path: z.string().describe("File path"),
  line: z.number().int().positive().describe("Line number (1-indexed)"),
  character: z.number().int().positive().describe("Character number (1-indexed)"),
});

export interface LspIncomingCallsOutput {
  path: string;
  calls: CallHierarchyIncomingCall[];
  count: number;
}

export interface LspOutgoingCallsOutput {
  path: string;
  calls: CallHierarchyOutgoingCall[];
  count: number;
}

export function createIncomingCallsTool(hub: LspHub) {
  return defineTool<typeof callHierarchyParamsSchema, LspIncomingCallsOutput>({
    name: "lsp_incoming_calls",
    description: "Find incoming calls to a symbol. Lines are 1-indexed.",
    parameters: callHierarchyParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const calls = (await hub.incomingCalls(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as CallHierarchyIncomingCall[];
        return ok({ path: filePath, calls, count: calls.length });
      } catch (error) {
        return fail(
          `Failed to get incoming calls: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

export function createOutgoingCallsTool(hub: LspHub) {
  return defineTool<typeof callHierarchyParamsSchema, LspOutgoingCallsOutput>({
    name: "lsp_outgoing_calls",
    description: "Find outgoing calls from a symbol. Lines are 1-indexed.",
    parameters: callHierarchyParamsSchema,
    kind: "lsp",
    category: "code",
    async execute(input, ctx) {
      if (ctx.abortSignal.aborted) {
        return fail("Operation was cancelled");
      }

      try {
        const filePath = resolve(ctx.workingDir, input.path);
        const calls = (await hub.outgoingCalls(
          filePath,
          Math.max(0, input.line - 1),
          Math.max(0, input.character - 1)
        )) as CallHierarchyOutgoingCall[];
        return ok({ path: filePath, calls, count: calls.length });
      } catch (error) {
        return fail(
          `Failed to get outgoing calls: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    shouldConfirm() {
      return false;
    },
  });
}

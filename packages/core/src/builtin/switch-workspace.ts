import { z } from "zod";
import { defineTool, fail, ok } from "../types/tool.js";

/** A workspace is a runtime boundary, not a shell-local `cd`. */
export const switchWorkspaceTool = defineTool({
  name: "switch_workspace",
  description:
    "Change the primary agent's workspace to an existing directory. Reloads project instructions, skills, tools and workspace UI. Call this tool alone after delegated work finishes; relative paths resolve from the current workspace. Subsequent tool paths use the new directory.",
  parameters: z.object({
    path: z.string().trim().min(1).describe("Existing directory to use as the workspace"),
  }),
  kind: "agent",
  category: "agent",
  async execute({ path }, ctx) {
    if (ctx.abortSignal.aborted) return fail("Workspace switch cancelled");
    if (ctx.parentAgentId || (ctx.agentLevel ?? 0) > 0)
      return fail("Only the primary agent can switch workspaces");
    if (!ctx.switchWorkspace) return fail("This runtime does not support workspace switching");
    try {
      return ok({ workingDirectory: await ctx.switchWorkspace(path, ctx.abortSignal) });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

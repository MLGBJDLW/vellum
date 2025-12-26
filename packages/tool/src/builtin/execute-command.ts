import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool } from "../define.js";

const execAsync = promisify(exec);

export const executeCommandTool = defineTool({
  name: "execute_command",
  description: "Execute a shell command and return the output",
  parameters: z.object({
    command: z.string().describe("The command to execute"),
    cwd: z.string().optional().describe("Working directory"),
  }),
  handler: async ({ command, cwd }) => {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return stdout || stderr;
  },
});

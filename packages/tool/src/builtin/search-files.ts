import { glob } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../define.js";

export const searchFilesTool = defineTool({
  name: "search_files",
  description: "Search for files matching a glob pattern",
  parameters: z.object({
    pattern: z.string().describe("Glob pattern to match files"),
    cwd: z.string().optional().describe("Working directory"),
  }),
  handler: async ({ pattern, cwd }) => {
    const files: string[] = [];
    for await (const file of glob(pattern, { cwd })) {
      files.push(file);
    }
    return files.join("\n");
  },
});

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "../define.js";

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Write content to a file at the specified path",
  parameters: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write"),
  }),
  handler: async ({ path, content }) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return `Successfully wrote to ${path}`;
  },
});

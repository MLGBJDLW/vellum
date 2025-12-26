import { readFile } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../define.js";

export const readFileTool = defineTool({
  name: "read_file",
  description: "Read the contents of a file at the specified path",
  parameters: z.object({
    path: z.string().describe("The path to the file to read"),
    encoding: z.string().optional().default("utf-8"),
  }),
  handler: async ({ path, encoding }) => {
    const content = await readFile(path, { encoding: encoding as BufferEncoding });
    return content;
  },
});

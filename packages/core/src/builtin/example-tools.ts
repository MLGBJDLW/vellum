/**
 * Example Builtin Tool
 *
 * Demonstrates the new tool pattern using `defineTool` with
 * `ok()` and `fail()` result helpers.
 *
 * @module builtin/example
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import { Err, Ok } from "../types/result.js";

/**
 * Example read file tool using the new pattern
 *
 * Demonstrates:
 * - Using `defineTool` factory
 * - Returning `ok()` for success
 * - Returning `fail()` for errors
 * - Using `ToolContext` for working directory and abort signal
 * - Using `kind` for tool categorization
 *
 * @example
 * ```typescript
 * const result = await exampleReadFileTool.execute(
 *   { path: "README.md" },
 *   {
 *     workingDir: process.cwd(),
 *     sessionId: "session-1",
 *     messageId: "msg-1",
 *     callId: "call-1",
 *     abortSignal: new AbortController().signal,
 *     checkPermission: async () => true,
 *   }
 * );
 *
 * if (result.success) {
 *   console.log(result.output.content);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export const exampleReadFileTool = defineTool({
  name: "example_read_file",
  description: "Read the contents of a file (example tool showing new pattern)",
  parameters: z.object({
    path: z.string().describe("The path to the file to read"),
    encoding: z
      .enum(["utf-8", "utf8", "ascii", "base64"])
      .optional()
      .default("utf-8")
      .describe("The file encoding"),
  }),
  kind: "read",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Check permission
    const hasPermission = await ctx.checkPermission("read", input.path);
    if (!hasPermission) {
      return fail(`Permission denied: cannot read ${input.path}`);
    }

    try {
      const content = await readFile(input.path, {
        encoding: input.encoding as BufferEncoding,
      });

      return ok({
        content,
        path: input.path,
        size: content.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return fail(`File not found: ${input.path}`);
        }
        if ((error as NodeJS.ErrnoException).code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        return fail(`Failed to read file: ${error.message}`);
      }
      return fail("Unknown error occurred");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations typically don't need confirmation
    return false;
  },
});

/**
 * Example write file tool using the new pattern
 *
 * Demonstrates:
 * - Write operations with `kind: "write"`
 * - Confirmation requirement via `shouldConfirm`
 * - Custom validation via `validate`
 */
export const exampleWriteFileTool = defineTool({
  name: "example_write_file",
  description: "Write content to a file (example tool showing new pattern)",
  parameters: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write"),
    createDirs: z
      .boolean()
      .optional()
      .default(true)
      .describe("Create parent directories if needed"),
  }),
  kind: "write",
  category: "filesystem",

  async execute(input, ctx) {
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const hasPermission = await ctx.checkPermission("write", input.path);
    if (!hasPermission) {
      return fail(`Permission denied: cannot write to ${input.path}`);
    }

    try {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");

      if (input.createDirs) {
        await mkdir(dirname(input.path), { recursive: true });
      }

      await writeFile(input.path, input.content, "utf-8");

      return ok({
        path: input.path,
        bytesWritten: Buffer.byteLength(input.content, "utf-8"),
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to write file: ${error.message}`);
      }
      return fail("Unknown error occurred");
    }
  },

  shouldConfirm(input, _ctx) {
    // Confirm writes to sensitive paths
    const sensitivePaths = ["/etc/", "/usr/", "/bin/", "C:\\Windows\\", "C:\\Program Files\\"];
    return sensitivePaths.some((p) => input.path.startsWith(p));
  },

  validate(input) {
    // Don't allow writing to hidden files
    if (basename(input.path).startsWith(".")) {
      return Err("Writing to hidden files is not allowed");
    }
    return Ok(undefined);
  },
});

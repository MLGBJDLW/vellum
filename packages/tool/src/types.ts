import type { z } from "zod";

/**
 * Legacy tool definition interface.
 *
 * @deprecated Use `defineTool` from `@vellum/core` instead.
 * The new tool system provides:
 * - Type-safe Result<T> returns with `ok()` and `fail()` helpers
 * - ToolContext with abort signals and permission checks
 * - Tool categorization via `kind` field
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * import { defineTool } from "@vellum/tool";
 *
 * // New way
 * import { defineTool, ok, fail } from "@vellum/core";
 *
 * const myTool = defineTool({
 *   name: "my_tool",
 *   description: "Does something",
 *   parameters: z.object({ input: z.string() }),
 *   kind: "read",
 *   async execute(input, ctx) {
 *     if (!input.input) return fail("Input required");
 *     return ok({ result: input.input });
 *   },
 * });
 * ```
 *
 * @see {@link https://github.com/your-org/vellum/docs/migration.md Migration Guide}
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  handler: ToolHandler<z.infer<T>>;
}

/**
 * Legacy tool handler type.
 *
 * @deprecated Use the new `execute` method in tool definitions from `@vellum/core`.
 * The new pattern returns `ToolResult<T>` instead of raw strings.
 */
export type ToolHandler<T> = (params: T) => Promise<string>;

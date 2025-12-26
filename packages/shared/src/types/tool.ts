/**
 * @deprecated Use `Tool` from `@vellum/core` instead.
 * The new Tool interface supports:
 * - Zod schema validation for parameters
 * - Tool kinds (builtin, mcp, user)
 * - Context injection (config, signal, events)
 * - Permission checking
 * - Typed results with Result<T, E> pattern
 *
 * @example
 * // Old (deprecated):
 * import { Tool } from '@vellum/shared';
 *
 * // New:
 * import { defineTool, ok, fail } from '@vellum/core';
 * import { z } from 'zod';
 *
 * const myTool = defineTool({
 *   name: 'my_tool',
 *   kind: 'user',
 *   description: 'Does something',
 *   parameters: z.object({ input: z.string() }),
 *   execute: async ({ input }) => ok({ result: input.toUpperCase() }),
 * });
 *
 * @see {@link https://github.com/vellum/docs/blob/main/MIGRATION.md} Migration Guide
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown) => Promise<ToolResult>;
}

/**
 * @deprecated Use `ToolResult` from `@vellum/core` instead.
 * The new ToolResult uses the Result<T, E> pattern for better type safety.
 *
 * @example
 * // Old (deprecated):
 * return { success: true, output: 'done' };
 * return { success: false, output: '', error: 'failed' };
 *
 * // New:
 * import { ok, fail } from '@vellum/core';
 * return ok({ data: 'done' });
 * return fail('failed');
 *
 * @see {@link https://github.com/vellum/docs/blob/main/MIGRATION.md} Migration Guide
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

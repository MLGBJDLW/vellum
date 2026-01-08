import type { z } from "zod";

export type ToolResult<T> = { success: true; output: T } | { success: false; error: string };

export interface ToolDefinition<TInput extends z.ZodType> {
  name: string;
  description: string;
  parameters: TInput;
  kind: string;
  category?: string;
  enabled?: boolean;
}

export interface ToolContextLike {
  workingDir: string;
  abortSignal: AbortSignal;
}

export interface Tool<TInput extends z.ZodType, TOutput> {
  definition: ToolDefinition<TInput>;
  execute(input: z.infer<TInput>, ctx: ToolContextLike): Promise<ToolResult<TOutput>>;
  shouldConfirm?: (input: z.infer<TInput>, ctx: ToolContextLike) => boolean;
}

export interface DefineToolConfig<TInput extends z.ZodType, TOutput> {
  name: string;
  description: string;
  parameters: TInput;
  kind: string;
  category?: string;
  enabled?: boolean;
  execute: (input: z.infer<TInput>, ctx: ToolContextLike) => Promise<ToolResult<TOutput>>;
  shouldConfirm?: (input: z.infer<TInput>, ctx: ToolContextLike) => boolean;
}

export function defineTool<TInput extends z.ZodType, TOutput>(
  config: DefineToolConfig<TInput, TOutput>
): Tool<TInput, TOutput> {
  const {
    name,
    description,
    parameters,
    kind,
    category,
    enabled = true,
    execute,
    shouldConfirm,
  } = config;

  return {
    definition: {
      name,
      description,
      parameters,
      kind,
      category,
      enabled,
    },
    execute,
    ...(shouldConfirm && { shouldConfirm }),
  };
}

export function ok<T>(output: T): ToolResult<T> {
  return { success: true, output };
}

export function fail(error: string): ToolResult<never> {
  return { success: false, error };
}

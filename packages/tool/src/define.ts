import type { z } from "zod";
import type { ToolDefinition, ToolHandler } from "./types.js";

export function defineTool<T extends z.ZodType>(config: {
  name: string;
  description: string;
  parameters: T;
  handler: ToolHandler<z.infer<T>>;
}): ToolDefinition<T> {
  return config;
}

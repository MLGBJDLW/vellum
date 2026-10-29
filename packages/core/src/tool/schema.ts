import { z } from "zod";
import type { ToolDefinition } from "../types/tool.js";

/**
 * Export the arguments a caller may supply, before defaults and transforms.
 * Providers accept JSON Schema, not OpenAPI 3.0's boolean exclusive bounds.
 * MCP schemas are already authoritative JSON Schema and must not be rebuilt
 * from the less expressive local validator.
 */
export function getToolInputSchema(
  definition: Pick<ToolDefinition<z.ZodType>, "parameters" | "inputSchema">
): Record<string, unknown> {
  if (definition.inputSchema) return structuredClone(definition.inputSchema);
  return z.toJSONSchema(definition.parameters, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
}

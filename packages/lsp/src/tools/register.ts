import type { LspHub } from "../LspHub.js";
import type { ToolRegistryLike } from "../types.js";
import { createLspTools } from "./factory.js";

export function registerLspTools(registry: ToolRegistryLike, hub: LspHub): number {
  const tools = createLspTools(hub);
  for (const tool of tools) {
    registry.register(tool);
  }
  return tools.length;
}

export function unregisterLspTools(registry: ToolRegistryLike): void {
  const lspToolNames = [
    "lsp_diagnostics",
    "lsp_hover",
    "lsp_definition",
    "lsp_references",
    "lsp_symbols",
    "lsp_workspace_symbol",
    "lsp_incoming_calls",
    "lsp_outgoing_calls",
    "lsp_code_actions",
    "lsp_format",
  ];

  for (const name of lspToolNames) {
    registry.unregister?.(name);
  }
}

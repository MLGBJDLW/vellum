export const LSP_TOOL_PERMISSIONS = {
  lsp_diagnostics: "read",
  lsp_hover: "read",
  lsp_definition: "read",
  lsp_references: "read",
  lsp_symbols: "read",
  lsp_workspace_symbol: "read",
  lsp_incoming_calls: "read",
  lsp_outgoing_calls: "read",
  lsp_code_actions: "read",
  lsp_format: "write",
} as const;

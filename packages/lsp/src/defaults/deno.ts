import type { LspServerConfig } from "../config.js";

export const denoServer: LspServerConfig = {
  name: "Deno Language Server",
  command: "deno",
  args: ["lsp"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["deno.json", "deno.jsonc"],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
  filePatterns: [],
  languageId: "typescript",
  install: {
    method: "system",
    package: "deno",
  },
};

import type { LspServerConfig } from "../config.js";

export const biomeServer: LspServerConfig = {
  name: "Biome Language Server",
  command: "biome",
  args: ["lsp-proxy", "--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["biome.json", "biome.jsonc"],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".css"],
  filePatterns: [],
  languageId: "typescript",
  install: {
    method: "npm",
    package: "@biomejs/biome",
    args: ["-g"],
  },
};

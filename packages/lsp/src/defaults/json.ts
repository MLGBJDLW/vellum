import type { LspServerConfig } from "../config.js";

export const jsonServer: LspServerConfig = {
  name: "JSON Language Server",
  command: "vscode-json-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["package.json", "tsconfig.json"],
  fileExtensions: [".json", ".jsonc"],
  filePatterns: [],
  languageId: "json",
  install: {
    method: "npm",
    package: "vscode-langservers-extracted",
    args: ["-g"],
  },
};

import type { LspServerConfig } from "../config.js";

export const htmlServer: LspServerConfig = {
  name: "HTML Language Server",
  command: "vscode-html-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["package.json", "index.html"],
  fileExtensions: [".html", ".htm"],
  filePatterns: [],
  languageId: "html",
  install: {
    method: "npm",
    package: "vscode-langservers-extracted",
    args: ["-g"],
  },
};

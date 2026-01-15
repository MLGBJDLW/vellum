import type { LspServerConfig } from "../config.js";

export const cssServer: LspServerConfig = {
  name: "CSS Language Server",
  command: "vscode-css-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["package.json", "tailwind.config.js", "tailwind.config.ts"],
  fileExtensions: [".css", ".scss", ".less"],
  filePatterns: [],
  languageId: "css",
  install: {
    method: "npm",
    package: "vscode-langservers-extracted",
    args: ["-g"],
  },
};

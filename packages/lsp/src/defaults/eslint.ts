import type { LspServerConfig } from "../config.js";

export const eslintServer: LspServerConfig = {
  name: "ESLint Language Server",
  command: "vscode-eslint-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"],
  filePatterns: [],
  languageId: "javascript",
  install: {
    method: "npm",
    package: "vscode-langservers-extracted",
    args: ["-g"],
  },
};

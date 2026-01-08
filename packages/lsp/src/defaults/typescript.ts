import type { LspServerConfig } from "../config.js";

export const typescriptServer: LspServerConfig = {
  name: "TypeScript Language Server",
  command: "typescript-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["tsconfig.json", "jsconfig.json", "package.json"],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"],
  filePatterns: [],
  languageId: "typescript",
  install: {
    method: "npm",
    package: "typescript-language-server",
    args: ["-g"],
  },
};

import type { LspServerConfig } from "../config.js";

export const goServer: LspServerConfig = {
  name: "Go Language Server",
  command: "gopls",
  args: ["-mode=stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["go.mod", "go.work"],
  fileExtensions: [".go"],
  filePatterns: [],
  languageId: "go",
  install: {
    method: "system",
    package: "gopls",
  },
};

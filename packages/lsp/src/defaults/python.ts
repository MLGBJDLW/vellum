import type { LspServerConfig } from "../config.js";

export const pythonServer: LspServerConfig = {
  name: "Pyright Language Server",
  command: "pyright-langserver",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["pyproject.toml", "pyrightconfig.json", "requirements.txt", "setup.py"],
  fileExtensions: [".py"],
  filePatterns: [],
  languageId: "python",
  install: {
    method: "npm",
    package: "pyright",
    args: ["-g"],
  },
};

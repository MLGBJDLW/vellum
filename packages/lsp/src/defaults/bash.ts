import type { LspServerConfig } from "../config.js";

export const bashServer: LspServerConfig = {
  name: "Bash Language Server",
  command: "bash-language-server",
  args: ["start"],
  enabled: true,
  transport: "stdio",
  rootPatterns: [".bashrc", ".bash_profile", ".zshrc", "package.json"],
  fileExtensions: [".sh", ".bash", ".zsh", ".ksh"],
  filePatterns: [],
  languageId: "shellscript",
  install: {
    method: "npm",
    package: "bash-language-server",
    args: ["-g"],
  },
};

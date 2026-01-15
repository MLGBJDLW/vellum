import type { LspServerConfig } from "../config.js";

export const yamlServer: LspServerConfig = {
  name: "YAML Language Server",
  command: "yaml-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: [
    "package.json",
    ".github",
    "docker-compose.yml",
    "docker-compose.yaml",
    "kubernetes",
    ".gitlab-ci.yml",
  ],
  fileExtensions: [".yaml", ".yml"],
  filePatterns: [],
  languageId: "yaml",
  install: {
    method: "npm",
    package: "yaml-language-server",
    args: ["-g"],
  },
};

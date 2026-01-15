import type { LspServerConfig } from "../config.js";

export const dockerfileServer: LspServerConfig = {
  name: "Dockerfile Language Server",
  command: "docker-langserver",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"],
  fileExtensions: [".dockerfile"],
  filePatterns: ["Dockerfile", "Dockerfile.*", "*.dockerfile"],
  languageId: "dockerfile",
  install: {
    method: "npm",
    package: "dockerfile-language-server-nodejs",
    args: ["-g"],
  },
};

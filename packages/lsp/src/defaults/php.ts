import type { LspServerConfig } from "../config.js";

export const phpServer: LspServerConfig = {
  name: "PHP Intelephense",
  command: "intelephense",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["composer.json", "composer.lock", ".php-version", "index.php"],
  fileExtensions: [".php"],
  filePatterns: [],
  languageId: "php",
  install: {
    method: "npm",
    package: "intelephense",
    args: ["-g"],
  },
};

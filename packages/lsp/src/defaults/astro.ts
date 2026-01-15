import type { LspServerConfig } from "../config.js";

export const astroServer: LspServerConfig = {
  name: "Astro Language Server",
  command: "astro-ls",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["astro.config.mjs", "astro.config.ts", "package.json"],
  fileExtensions: [".astro"],
  filePatterns: [],
  languageId: "astro",
  install: {
    method: "npm",
    package: "@astrojs/language-server",
    args: ["-g"],
  },
};

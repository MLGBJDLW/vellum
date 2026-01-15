import type { LspServerConfig } from "../config.js";

export const svelteServer: LspServerConfig = {
  name: "Svelte Language Server",
  command: "svelteserver",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["svelte.config.js", "svelte.config.ts", "package.json"],
  fileExtensions: [".svelte"],
  filePatterns: [],
  languageId: "svelte",
  install: {
    method: "npm",
    package: "svelte-language-server",
    args: ["-g"],
  },
};

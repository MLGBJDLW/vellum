import type { LspServerConfig } from "../config.js";

export const vueServer: LspServerConfig = {
  name: "Vue Language Server",
  command: "vue-language-server",
  args: ["--stdio"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["package.json", "vue.config.js", "vite.config.ts", "nuxt.config.ts"],
  fileExtensions: [".vue"],
  filePatterns: [],
  languageId: "vue",
  install: {
    method: "npm",
    package: "@vue/language-server",
    args: ["-g"],
  },
};

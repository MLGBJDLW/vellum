import type { LspServerConfig } from "../config.js";

export const kotlinServer: LspServerConfig = {
  name: "Kotlin Language Server",
  command: "kotlin-language-server",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["build.gradle", "build.gradle.kts", "pom.xml", "settings.gradle.kts"],
  fileExtensions: [".kt", ".kts"],
  filePatterns: [],
  languageId: "kotlin",
  install: {
    method: "system",
    package: "kotlin-language-server",
  },
};

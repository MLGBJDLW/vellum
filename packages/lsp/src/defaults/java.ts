import type { LspServerConfig } from "../config.js";

export const javaServer: LspServerConfig = {
  name: "Java Language Server (Eclipse JDTLS)",
  command: "jdtls",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["pom.xml", "build.gradle", "build.gradle.kts", ".project", ".classpath"],
  fileExtensions: [".java"],
  filePatterns: [],
  languageId: "java",
  install: {
    method: "system",
    package: "jdtls",
  },
};

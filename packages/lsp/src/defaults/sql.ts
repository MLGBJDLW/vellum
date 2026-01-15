import type { LspServerConfig } from "../config.js";

export const sqlServer: LspServerConfig = {
  name: "SQL Language Server",
  command: "sqls",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: [".sqls.yaml", ".sqls.yml", "sqls.yaml", "sqls.yml"],
  fileExtensions: [".sql"],
  filePatterns: [],
  languageId: "sql",
  install: {
    method: "system",
    package: "sqls",
  },
};

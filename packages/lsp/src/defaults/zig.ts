import type { LspServerConfig } from "../config.js";

export const zigServer: LspServerConfig = {
  name: "Zig Language Server",
  command: "zls",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["build.zig", "build.zig.zon"],
  fileExtensions: [".zig", ".zon"],
  filePatterns: [],
  languageId: "zig",
  install: {
    method: "system",
    package: "zls",
  },
};

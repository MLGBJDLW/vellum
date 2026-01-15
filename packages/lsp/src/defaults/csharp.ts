import type { LspServerConfig } from "../config.js";

export const csharpServer: LspServerConfig = {
  name: "C# Language Server",
  command: "csharp-ls",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: [".sln", ".csproj", "global.json"],
  fileExtensions: [".cs"],
  filePatterns: [],
  languageId: "csharp",
  install: {
    method: "system",
    package: "csharp-ls",
  },
};

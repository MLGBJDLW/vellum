import type { LspServerConfig } from "../config.js";

export const elixirServer: LspServerConfig = {
  name: "Elixir Language Server",
  command: "elixir-ls",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["mix.exs", "mix.lock"],
  fileExtensions: [".ex", ".exs"],
  filePatterns: [],
  languageId: "elixir",
  install: {
    method: "system",
    package: "elixir-ls",
  },
};

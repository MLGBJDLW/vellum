import type { LspServerConfig } from "../config.js";

export const rustServer: LspServerConfig = {
  name: "Rust Analyzer",
  command: "rust-analyzer",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["Cargo.toml"],
  fileExtensions: [".rs"],
  filePatterns: [],
  languageId: "rust",
  install: {
    method: "system",
    package: "rust-analyzer",
  },
};

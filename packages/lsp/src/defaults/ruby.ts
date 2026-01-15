import type { LspServerConfig } from "../config.js";

export const rubyServer: LspServerConfig = {
  name: "RuboCop Language Server",
  command: "rubocop",
  args: ["--lsp"],
  enabled: true,
  transport: "stdio",
  rootPatterns: ["Gemfile", ".rubocop.yml", "Rakefile"],
  fileExtensions: [".rb", ".rake", ".gemspec"],
  filePatterns: [],
  languageId: "ruby",
  install: {
    method: "system",
    package: "rubocop",
  },
};

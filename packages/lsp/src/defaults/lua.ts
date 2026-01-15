import type { LspServerConfig } from "../config.js";

export const luaServer: LspServerConfig = {
  name: "Lua Language Server",
  command: "lua-language-server",
  args: [],
  enabled: true,
  transport: "stdio",
  rootPatterns: [".luarc.json", ".luarc.jsonc", ".luacheckrc"],
  fileExtensions: [".lua"],
  filePatterns: [],
  languageId: "lua",
  install: {
    method: "system",
    package: "lua-language-server",
  },
};

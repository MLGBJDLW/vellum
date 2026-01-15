import type { LspServerConfig } from "../config.js";
import { astroServer } from "./astro.js";
import { bashServer } from "./bash.js";
import { biomeServer } from "./biome.js";
import { csharpServer } from "./csharp.js";
import { cssServer } from "./css.js";
import { denoServer } from "./deno.js";
import { dockerfileServer } from "./dockerfile.js";
import { elixirServer } from "./elixir.js";
import { eslintServer } from "./eslint.js";
import { goServer } from "./go.js";
import { htmlServer } from "./html.js";
import { javaServer } from "./java.js";
import { jsonServer } from "./json.js";
import { kotlinServer } from "./kotlin.js";
import { luaServer } from "./lua.js";
import { phpServer } from "./php.js";
import { pythonServer } from "./python.js";
import { rubyServer } from "./ruby.js";
import { rustServer } from "./rust.js";
import { sqlServer } from "./sql.js";
import { svelteServer } from "./svelte.js";
import { typescriptServer } from "./typescript.js";
import { vueServer } from "./vue.js";
import { yamlServer } from "./yaml.js";
import { zigServer } from "./zig.js";

export function getDefaultServers(): Record<string, LspServerConfig> {
  return {
    // Core languages
    typescript: typescriptServer,
    python: pythonServer,
    go: goServer,
    rust: rustServer,

    // JavaScript/TypeScript ecosystem
    vue: vueServer,
    svelte: svelteServer,
    astro: astroServer,
    deno: denoServer,

    // Linters/Formatters
    eslint: eslintServer,
    biome: biomeServer,

    // Web
    html: htmlServer,
    css: cssServer,
    json: jsonServer,

    // Backend
    java: javaServer,
    csharp: csharpServer,
    php: phpServer,
    ruby: rubyServer,
    elixir: elixirServer,
    kotlin: kotlinServer,

    // Systems
    zig: zigServer,

    // Scripting
    lua: luaServer,

    // DevOps
    yaml: yamlServer,
    bash: bashServer,
    dockerfile: dockerfileServer,

    // Data
    sql: sqlServer,
  };
}

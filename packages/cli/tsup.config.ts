import { cpSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "tsup";

// Read version from package.json at build time
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: false,
  minify: false,
  treeshake: true,
  shims: true,
  outExtension() {
    return { js: ".mjs" };
  },
  banner: {
    // Provide CJS compatibility for bundled dependencies that use require()
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`,
  },
  async onSuccess() {
    // Copy prompts from @vellum/core to dist/markdown for runtime discovery
    const promptsSrc = resolve(__dirname, "../core/src/prompts/markdown");
    const promptsDest = resolve(__dirname, "dist/markdown");
    cpSync(promptsSrc, promptsDest, { recursive: true });
    console.log("Copied prompts to dist/markdown");
  },

  // Bundle ALL workspace packages into the CLI
  noExternal: [
    "@vellum/core",
    "@vellum/lsp",
    "@vellum/mcp",
    "@vellum/plugin",
    "@vellum/provider",
    "@vellum/sandbox",
    "@vellum/shared",
  ],

  // Keep native modules and large SDKs external
  external: [
    // Native modules that require build
    "keytar",
    "fsevents",

    // Node built-ins - exclude ALL built-in modules
    /^node:/,
    "fs",
    "path",
    "os",
    "crypto",
    "stream",
    "util",
    "events",
    "buffer",
    "process",

    // React (peer dependency of ink)
    "react",
    "react-dom",

    // Ink TUI (has native deps)
    "ink",
    "ink-gradient",
    "ink-spinner",
    "ink-text-input",

    // Keep LLM SDKs external to reduce bundle size
    "@anthropic-ai/sdk",
    "openai",
    "@google/genai",

    // MCP SDK
    "@modelcontextprotocol/sdk",

    // Shiki (large, has wasm)
    "shiki",

    // Neo-blessed (large TUI lib)
    "neo-blessed",
  ],

  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "react";
    // Inject version from package.json at build time
    options.define = {
      ...options.define,
      __VERSION__: JSON.stringify(pkg.version),
    };
  },
});

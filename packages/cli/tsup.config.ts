import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["cjs"],
  dts: false,
  clean: true,
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: false,
  minify: false,
  treeshake: true,
  shims: false,
  outExtension() {
    return { js: ".cjs" };
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
  },
});

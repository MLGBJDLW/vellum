// Version is injected at build time from package.json via tsup.config.ts
declare const __VERSION__: string;

export const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev";

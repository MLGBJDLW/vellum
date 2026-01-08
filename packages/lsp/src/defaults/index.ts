import type { LspServerConfig } from "../config.js";
import { goServer } from "./go.js";
import { pythonServer } from "./python.js";
import { rustServer } from "./rust.js";
import { typescriptServer } from "./typescript.js";

export function getDefaultServers(): Record<string, LspServerConfig> {
  return {
    typescript: typescriptServer,
    python: pythonServer,
    go: goServer,
    rust: rustServer,
  };
}

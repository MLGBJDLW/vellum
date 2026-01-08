/**
 * Platform sandbox detection.
 */

import { platform } from "node:os";
import type { SandboxBackend } from "../types.js";
import { supportsDarwinSandbox } from "./darwin.js";
import { supportsLinuxSandbox } from "./linux.js";
import { supportsWindowsSandbox } from "./windows.js";

export function detectPlatformBackend(): SandboxBackend {
  const os = platform();

  if (os === "linux" && supportsLinuxSandbox()) {
    return "platform";
  }
  if (os === "darwin" && supportsDarwinSandbox()) {
    return "platform";
  }
  if (os === "win32" && supportsWindowsSandbox()) {
    return "platform";
  }

  return "subprocess";
}

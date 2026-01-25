import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

const useShell = process.platform === "win32";

// Build core first to avoid race condition
console.log("[dev] Building @vellum/core...");
const buildResult = spawnSync("pnpm", ["-F", "@vellum/core", "build"], {
  stdio: "inherit",
  shell: useShell,
});
if (buildResult.status !== 0) {
  console.error("[dev] Core build failed!");
  process.exit(buildResult.status ?? 1);
}
console.log("[dev] Core built, starting watchers...\n");

const coreLogsToFile = process.env.VELLUM_DEV_CORE_LOGS !== "1";
const coreLogDir = join(process.cwd(), ".vellum");
const coreLogPath = join(coreLogDir, "dev-core.log");

const core = spawn("pnpm", ["-F", "@vellum/core", "dev"], {
  stdio: coreLogsToFile ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  shell: useShell,
});

let coreLogStream = null;
if (coreLogsToFile) {
  fs.mkdirSync(coreLogDir, { recursive: true });
  coreLogStream = fs.createWriteStream(coreLogPath, { flags: "a" });
  core.stdout?.pipe(coreLogStream);
  core.stderr?.pipe(coreLogStream);
  console.log(`[dev] Core logs -> ${coreLogPath} (set VELLUM_DEV_CORE_LOGS=1 to show)`);
}

const cli = spawn("pnpm", ["-F", "@butlerw/vellum", "dev"], {
  stdio: "inherit",
  shell: useShell,
});

const shutdown = (signal) => {
  if (!core.killed) {
    core.kill(signal);
  }
  if (!cli.killed) {
    cli.kill(signal);
  }
  if (coreLogStream) {
    coreLogStream.end();
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

cli.on("exit", (code) => {
  shutdown("SIGTERM");
  process.exit(code ?? 0);
});

core.on("exit", (code) => {
  if (code && !cli.killed) {
    console.warn(`[dev] core exited with code ${code}`);
  }
});

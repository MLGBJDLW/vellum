import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

const useShell = process.platform === "win32";

// Build core and lsp first to avoid race condition
console.log("[dev] Building @vellum/core...");
const coreBuildResult = spawnSync("pnpm", ["-F", "@vellum/core", "build"], {
  stdio: "inherit",
  shell: useShell,
});
if (coreBuildResult.status !== 0) {
  console.error("[dev] Core build failed!");
  process.exit(coreBuildResult.status ?? 1);
}

console.log("[dev] Building @vellum/lsp...");
const lspBuildResult = spawnSync("pnpm", ["-F", "@vellum/lsp", "build"], {
  stdio: "inherit",
  shell: useShell,
});
if (lspBuildResult.status !== 0) {
  console.error("[dev] LSP build failed!");
  process.exit(lspBuildResult.status ?? 1);
}

console.log("[dev] Core + LSP built, starting watchers...\n");

const coreLogsToFile = process.env.VELLUM_DEV_CORE_LOGS !== "1";
const coreLogDir = join(process.cwd(), ".vellum");
const coreLogPath = join(coreLogDir, "dev-core.log");
const lspLogPath = join(coreLogDir, "dev-lsp.log");

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

const lsp = spawn("pnpm", ["-F", "@vellum/lsp", "dev"], {
  stdio: coreLogsToFile ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  shell: useShell,
});

let lspLogStream = null;
if (coreLogsToFile) {
  fs.mkdirSync(coreLogDir, { recursive: true });
  lspLogStream = fs.createWriteStream(lspLogPath, { flags: "a" });
  lsp.stdout?.pipe(lspLogStream);
  lsp.stderr?.pipe(lspLogStream);
  console.log(`[dev] LSP logs -> ${lspLogPath} (set VELLUM_DEV_CORE_LOGS=1 to show)`);
}

const cli = spawn("pnpm", ["-F", "@butlerw/vellum", "dev"], {
  stdio: "inherit",
  shell: useShell,
});

const shutdown = (signal) => {
  if (!core.killed) {
    core.kill(signal);
  }
  if (!lsp.killed) {
    lsp.kill(signal);
  }
  if (!cli.killed) {
    cli.kill(signal);
  }
  if (coreLogStream) {
    coreLogStream.end();
  }
  if (lspLogStream) {
    lspLogStream.end();
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

lsp.on("exit", (code) => {
  if (code && !cli.killed) {
    console.warn(`[dev] lsp exited with code ${code}`);
  }
});

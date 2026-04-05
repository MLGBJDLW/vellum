import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const useShell = process.platform === "win32";
const devPackages = [
  { name: "@vellum/core", dir: join(repoRoot, "packages", "core"), bins: ["tsup"] },
  { name: "@vellum/lsp", dir: join(repoRoot, "packages", "lsp"), bins: ["tsup"] },
  { name: "@butlerw/vellum", dir: join(repoRoot, "packages", "cli"), bins: ["tsx"] },
];

function hasPackageBin(packageDir, binName) {
  const binDir = join(packageDir, "node_modules", ".bin");
  return fs.existsSync(join(binDir, binName)) || fs.existsSync(join(binDir, `${binName}.cmd`));
}

function ensureWorkspaceInstall() {
  const missingPackages = devPackages
    .map((pkg) => ({
      ...pkg,
      missingBins: pkg.bins.filter((binName) => !hasPackageBin(pkg.dir, binName)),
    }))
    .filter((pkg) => pkg.missingBins.length > 0);

  if (missingPackages.length === 0) {
    return;
  }

  console.error("[dev] Workspace dependencies are not installed correctly.");
  for (const pkg of missingPackages) {
    console.error(`[dev] Missing ${pkg.missingBins.join(", ")} for ${pkg.name}.`);
  }
  console.error("[dev] Run `pnpm install` from the same shell you use to run Vellum.");
  if (useShell) {
    console.error(
      "[dev] If you previously installed from WSL or another environment, delete `node_modules` and reinstall from Windows to recreate the local .bin shims."
    );
  } else {
    console.error(
      "[dev] If you previously installed from another environment, delete `node_modules` and reinstall to recreate the workspace links."
    );
  }
  process.exit(1);
}

ensureWorkspaceInstall();

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
const coreLogDir = join(repoRoot, ".vellum");
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

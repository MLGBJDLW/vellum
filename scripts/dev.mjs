import { spawn } from "node:child_process";

const useShell = process.platform === "win32";

const core = spawn("pnpm", ["-F", "@vellum/core", "dev"], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: useShell,
});

const cli = spawn("pnpm", ["-F", "@vellum/cli", "dev"], {
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

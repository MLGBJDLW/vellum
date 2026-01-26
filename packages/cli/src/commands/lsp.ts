/**
 * LSP Command
 *
 * CLI command for managing LSP servers.
 *
 * @module cli/commands/lsp
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { LspHub, loadLspConfig, ServerInstaller } from "@vellum/lsp";
import chalk from "chalk";
import { Command } from "commander";
import { table } from "table";

function createHub(workspaceRoot: string): LspHub {
  return LspHub.getInstance({
    getGlobalConfigPath: async () => join(homedir(), ".vellum", "lsp.json"),
    getProjectConfigPath: async () => join(resolve(workspaceRoot), ".vellum", "lsp.json"),
  });
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    running: chalk.green("running"),
    starting: chalk.yellow("starting"),
    stopped: chalk.dim("stopped"),
    error: chalk.red("error"),
  };
  return statusMap[status] ?? chalk.dim(status);
}

async function initConfigFile(): Promise<void> {
  const configDir = join(process.cwd(), ".vellum");
  const configPath = join(configDir, "lsp.json");

  const template = {
    $schema: "https://vellum.dev/schemas/lsp-config.json",
    version: "1.0",
    servers: {},
    disabled: [],
    cache: { maxSize: 100, ttlSeconds: 300 },
    autoInstall: true,
    maxConcurrentServers: 5,
  };

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(template, null, 2));
  console.log(chalk.green(`✓ Config created: ${configPath}`));
}

export function createLspCommand(): Command {
  const lsp = new Command("lsp").description("Manage LSP language servers");

  lsp
    .command("status")
    .description("Show language server status")
    .option("-j, --json", "Output JSON")
    .action(async (options) => {
      const config = await loadLspConfig(process.cwd());
      const hub = createHub(process.cwd());
      await hub.initialize();

      const servers = Object.entries(config.servers).map(([language, cfg]) => {
        const server = hub.getServer(language);
        const status = server?.status?.status ?? "stopped";
        const pid =
          server && "pid" in server.status && server.status.status === "running"
            ? server.status.pid
            : "-";

        return {
          language,
          enabled: cfg.enabled,
          status,
          pid,
          command: cfg.command,
        };
      });

      if (options.json) {
        console.log(JSON.stringify(servers, null, 2));
        return;
      }

      const data = [
        ["Language", "Enabled", "Status", "PID", "Command"].map((h) => chalk.bold(h)),
        ...servers.map((server) => [
          server.language,
          server.enabled ? chalk.green("✓") : chalk.red("✗"),
          formatStatus(server.status),
          String(server.pid),
          server.command,
        ]),
      ];

      console.log(table(data));
    });

  lsp
    .command("start <language>")
    .description("Start a language server")
    .option("-w, --workspace <path>", "Workspace root", process.cwd())
    .action(async (language: string, options) => {
      const config = await loadLspConfig(options.workspace);
      const serverConfig = config.servers[language];

      if (!serverConfig) {
        console.error(chalk.red(`No server config found for ${language}`));
        process.exit(1);
      }

      console.log(chalk.blue(`Starting ${language} server...`));
      const hub = createHub(options.workspace);
      try {
        await hub.startServer(language, options.workspace);
        console.log(chalk.green(`✓ ${language} server started`));
      } catch (error) {
        console.error(
          chalk.red(
            `Failed to start ${language}: ${error instanceof Error ? error.message : error}`
          )
        );
        process.exit(1);
      }
    });

  lsp
    .command("stop <language>")
    .description("Stop a language server")
    .option("-a, --all", "Stop all servers", false)
    .action(async (language: string, options) => {
      const hub = createHub(process.cwd());
      await hub.initialize();

      if (options.all) {
        console.log(chalk.blue("Stopping all servers..."));
        await hub.dispose();
        console.log(chalk.green("✓ All servers stopped"));
        return;
      }

      console.log(chalk.blue(`Stopping ${language} server...`));
      await hub.stopServer(language);
      console.log(chalk.green(`✓ ${language} server stopped`));
    });

  lsp
    .command("install <language>")
    .description("Install a language server")
    .option("-g, --global", "Use global install", false)
    .action(async (language: string) => {
      const config = await loadLspConfig(process.cwd());
      const serverConfig = config.servers[language];

      if (!serverConfig?.install) {
        console.error(chalk.red(`No install config for ${language}. Install manually.`));
        process.exit(1);
      }

      console.log(chalk.blue(`Installing ${language} server...`));
      const installer = new ServerInstaller({ autoInstall: "auto" });

      try {
        await installer.install(language, serverConfig);
        console.log(chalk.green(`✓ ${language} server installed`));
      } catch (error) {
        console.error(
          chalk.red(`Install failed: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });

  lsp
    .command("config")
    .description("Show LSP configuration")
    .option("-p, --path", "Only show config paths")
    .option("--init", "Create a config file in the current project")
    .action(async (options) => {
      if (options.init) {
        await initConfigFile();
        return;
      }

      if (options.path) {
        console.log("Global:", join(homedir(), ".vellum", "lsp.json"));
        console.log("Project:", join(process.cwd(), ".vellum", "lsp.json"));
        return;
      }

      const config = await loadLspConfig(process.cwd());
      console.log(chalk.bold("Current LSP config:"));
      console.log(JSON.stringify(config, null, 2));
    });

  return lsp;
}

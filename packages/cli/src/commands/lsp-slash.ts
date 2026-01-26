/**
 * LSP Slash Commands (Phase 1)
 *
 * Provides slash commands for LSP server management:
 * - /lsp - Show help and quick actions
 * - /lsp status - Show all server status
 * - /lsp install <lang> - Install a language server
 * - /lsp detect - Detect project languages
 * - /lsp start <lang> - Start a language server
 * - /lsp stop <lang> - Stop a language server
 * - /lsp restart <lang> - Restart a language server
 * - /lsp config - Show configuration
 * - /lsp enable <lang> - Enable a language server
 * - /lsp disable <lang> - Disable a language server
 *
 * @module cli/commands/lsp-slash
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { LspHub, loadLspConfig, ServerInstaller } from "@vellum/lsp";
import chalk from "chalk";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, pending, success } from "./types.js";

const execAsync = promisify(exec);

// =============================================================================
// Types for Config Export/Import
// =============================================================================

interface ExportedConfig {
  version: string;
  exportedAt: string;
  servers: Record<
    string,
    {
      enabled: boolean;
      version?: string;
      package?: string;
      method?: string;
    }
  >;
}

// =============================================================================
// LSP Server Definitions (for detect/install)
// =============================================================================

/**
 * Known LSP servers with detection patterns and install info
 */
const LSP_SERVERS: Record<
  string,
  {
    name: string;
    package: string;
    method: "npm" | "pip" | "cargo" | "system";
    detectFiles: string[];
  }
> = {
  typescript: {
    name: "TypeScript",
    package: "typescript-language-server",
    method: "npm",
    detectFiles: ["tsconfig.json", "jsconfig.json", "package.json"],
  },
  python: {
    name: "Python",
    package: "pyright",
    method: "npm",
    detectFiles: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
  },
  go: {
    name: "Go",
    package: "gopls",
    method: "system",
    detectFiles: ["go.mod", "go.sum"],
  },
  rust: {
    name: "Rust",
    package: "rust-analyzer",
    method: "system",
    detectFiles: ["Cargo.toml"],
  },
  vue: {
    name: "Vue",
    package: "@vue/language-server",
    method: "npm",
    detectFiles: ["vue.config.js", "nuxt.config.ts", "nuxt.config.js"],
  },
  svelte: {
    name: "Svelte",
    package: "svelte-language-server",
    method: "npm",
    detectFiles: ["svelte.config.js"],
  },
  java: {
    name: "Java",
    package: "jdtls",
    method: "system",
    detectFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
  },
  csharp: {
    name: "C#",
    package: "omnisharp",
    method: "system",
    detectFiles: ["*.csproj", "*.sln"],
  },
  php: {
    name: "PHP",
    package: "intelephense",
    method: "npm",
    detectFiles: ["composer.json", "*.php"],
  },
  ruby: {
    name: "Ruby",
    package: "solargraph",
    method: "system",
    detectFiles: ["Gemfile", "*.rb"],
  },
  yaml: {
    name: "YAML",
    package: "yaml-language-server",
    method: "npm",
    detectFiles: ["*.yaml", "*.yml"],
  },
  json: {
    name: "JSON",
    package: "vscode-json-languageserver",
    method: "npm",
    detectFiles: ["*.json"],
  },
  html: {
    name: "HTML",
    package: "vscode-html-languageserver",
    method: "npm",
    detectFiles: ["*.html"],
  },
  css: {
    name: "CSS",
    package: "vscode-css-languageserver",
    method: "npm",
    detectFiles: ["*.css", "*.scss", "*.less"],
  },
  dockerfile: {
    name: "Dockerfile",
    package: "dockerfile-language-server-nodejs",
    method: "npm",
    detectFiles: ["Dockerfile", "*.dockerfile"],
  },
  bash: {
    name: "Bash",
    package: "bash-language-server",
    method: "npm",
    detectFiles: ["*.sh", ".bashrc", ".zshrc"],
  },
};

// =============================================================================
// Module State
// =============================================================================

let hubInstance: LspHub | null = null;

/**
 * Get or create LspHub instance
 */
function getHub(workspaceRoot?: string): LspHub {
  const root = workspaceRoot ?? process.cwd();
  if (!hubInstance) {
    hubInstance = LspHub.getInstance({
      getGlobalConfigPath: async () => join(homedir(), ".vellum", "lsp.json"),
      getProjectConfigPath: async () => join(resolve(root), ".vellum", "lsp.json"),
    });
  }
  return hubInstance;
}

// =============================================================================
// Status Formatting
// =============================================================================

/**
 * Format server status with color
 */
function formatStatus(status: string): string {
  switch (status) {
    case "running":
      return chalk.green("● running");
    case "starting":
      return chalk.yellow("◐ starting");
    case "error":
      return chalk.red("✗ error");
    default:
      return chalk.dim("○ stopped");
  }
}

/**
 * Format enabled status
 */
function formatEnabled(enabled: boolean): string {
  return enabled ? chalk.green("✓") : chalk.red("✗");
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * /lsp status - Show all server status in a table
 */
async function handleStatus(ctx: CommandContext): Promise<CommandResult> {
  try {
    const hub = getHub(ctx.session.cwd);
    await hub.initialize();
    const servers = hub.getServers();

    if (servers.length === 0) {
      return success(
        [
          chalk.bold("LSP Servers"),
          "",
          chalk.dim("No servers configured."),
          "",
          `Run ${chalk.cyan("/lsp detect")} to find recommended servers.`,
        ].join("\n")
      );
    }

    const lines: string[] = [chalk.bold("LSP Server Status"), ""];

    // Table header
    lines.push(
      `${chalk.dim("Language".padEnd(15))} ${chalk.dim("Status".padEnd(14))} ${chalk.dim("PID".padEnd(8))} ${chalk.dim("Enabled")}`
    );
    lines.push(chalk.dim("─".repeat(50)));

    // Table rows
    for (const server of servers) {
      const pid =
        server.status.status === "running" && "pid" in server.status
          ? String(server.status.pid)
          : "-";

      lines.push(
        `${server.id.padEnd(15)} ${formatStatus(server.status.status).padEnd(22)} ${pid.padEnd(8)} ${formatEnabled(!server.disabled)}`
      );
    }

    lines.push("");
    lines.push(
      chalk.dim(
        `Use ${chalk.cyan("/lsp start <lang>")} or ${chalk.cyan("/lsp stop <lang>")} to manage servers.`
      )
    );

    return success(lines.join("\n"));
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to get status: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp install <lang> - Install a language server
 */
async function handleInstall(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    // List available servers
    const lines = [
      chalk.bold("Available Language Servers"),
      "",
      ...Object.entries(LSP_SERVERS).map(
        ([id, info]) =>
          `  ${chalk.cyan(id.padEnd(12))} ${info.name.padEnd(15)} ${chalk.dim(`(${info.method}: ${info.package})`)}`
      ),
      "",
      `Usage: ${chalk.cyan("/lsp install <language>")}`,
    ];
    return success(lines.join("\n"));
  }

  const serverInfo = LSP_SERVERS[target.toLowerCase()];
  if (!serverInfo) {
    return error("INVALID_ARGUMENT", `Unknown language: "${target}"`, [
      `Available: ${Object.keys(LSP_SERVERS).join(", ")}`,
      `Use ${chalk.cyan("/lsp install")} to see all options.`,
    ]);
  }

  // Return pending with async operation
  return pending({
    message: `Installing ${serverInfo.name} language server...`,
    showProgress: true,
    promise: (async (): Promise<CommandResult> => {
      try {
        const lspConfig = await loadLspConfig(ctx.session.cwd);
        const serverConfig = lspConfig.servers[target.toLowerCase()];

        if (!serverConfig?.install) {
          // Use default install info
          const installer = new ServerInstaller({ autoInstall: "auto" });
          await installer.install(target.toLowerCase(), {
            name: serverInfo.name,
            command: serverInfo.package,
            args: ["--stdio"],
            enabled: true,
            transport: "stdio",
            rootPatterns: serverInfo.detectFiles,
            fileExtensions: [],
            filePatterns: [],
            install: {
              method: serverInfo.method,
              package: serverInfo.package,
              args: serverInfo.method === "npm" ? ["-g"] : [],
            },
          });
        } else {
          const installer = new ServerInstaller({ autoInstall: "auto" });
          await installer.install(target.toLowerCase(), serverConfig);
        }

        return success(
          [
            chalk.green(`✓ ${serverInfo.name} server installed successfully!`),
            "",
            `Run ${chalk.cyan(`/lsp start ${target}`)} to start the server.`,
          ].join("\n")
        );
      } catch (err) {
        return error(
          "INTERNAL_ERROR",
          `Install failed: ${err instanceof Error ? err.message : String(err)}`,
          [`Try manual install: ${chalk.dim(getManualInstallCmd(serverInfo))}`]
        );
      }
    })(),
  });
}

/**
 * Get manual install command hint
 */
function getManualInstallCmd(info: (typeof LSP_SERVERS)[string]): string {
  switch (info.method) {
    case "npm":
      return `npm install -g ${info.package}`;
    case "pip":
      return `pip install ${info.package}`;
    case "cargo":
      return `cargo install ${info.package}`;
    case "system":
      return `See ${info.package} documentation for installation`;
    default:
      return `See ${info.package} documentation`;
  }
}

/**
 * /lsp detect - Detect project languages
 */
async function handleDetect(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.session.cwd;
  const detected: { lang: string; reason: string }[] = [];

  for (const [lang, info] of Object.entries(LSP_SERVERS)) {
    for (const pattern of info.detectFiles) {
      // Check for exact file match or pattern
      if (pattern.includes("*")) {
        // Skip glob patterns for now - just check common ones
        continue;
      }
      const filePath = join(cwd, pattern);
      if (existsSync(filePath)) {
        detected.push({ lang, reason: pattern });
        break;
      }
    }
  }

  // Also check package.json for dependencies
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.vue || deps.nuxt) {
        if (!detected.find((d) => d.lang === "vue")) {
          detected.push({ lang: "vue", reason: "vue dependency" });
        }
      }
      if (deps.svelte || deps["@sveltejs/kit"]) {
        if (!detected.find((d) => d.lang === "svelte")) {
          detected.push({ lang: "svelte", reason: "svelte dependency" });
        }
      }
      if (deps.typescript) {
        if (!detected.find((d) => d.lang === "typescript")) {
          detected.push({ lang: "typescript", reason: "typescript dependency" });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (detected.length === 0) {
    return success(
      [
        chalk.bold("Language Detection"),
        "",
        chalk.dim("No supported languages detected in this directory."),
        "",
        `Supported: ${Object.keys(LSP_SERVERS).join(", ")}`,
      ].join("\n")
    );
  }

  const lines = [
    chalk.bold("Detected Languages"),
    "",
    ...detected.map(
      ({ lang, reason }) =>
        `  ${chalk.green("●")} ${chalk.cyan(lang.padEnd(12))} ${chalk.dim(`(found ${reason})`)}`
    ),
    "",
    chalk.dim("Recommended actions:"),
    ...detected.map(({ lang }) => `  ${chalk.cyan(`/lsp install ${lang}`)}`),
  ];

  return success(lines.join("\n"));
}

/**
 * /lsp start <lang> - Start a language server
 */
async function handleStart(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    return error("MISSING_ARGUMENT", "Please specify a language to start", [
      "Usage: /lsp start <language>",
      "Example: /lsp start typescript",
    ]);
  }

  try {
    const hub = getHub(ctx.session.cwd);
    await hub.initialize();
    await hub.startServer(target.toLowerCase(), ctx.session.cwd);
    return success(chalk.green(`✓ ${target} server started`));
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to start ${target}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp stop <lang> - Stop a language server
 */
async function handleStop(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    return error("MISSING_ARGUMENT", "Please specify a language to stop", [
      "Usage: /lsp stop <language>",
      'Use "/lsp stop all" to stop all servers',
    ]);
  }

  try {
    const hub = getHub(ctx.session.cwd);
    await hub.initialize();

    if (target.toLowerCase() === "all") {
      await hub.dispose();
      hubInstance = null;
      return success(chalk.green("✓ All servers stopped"));
    }

    await hub.stopServer(target.toLowerCase());
    return success(chalk.green(`✓ ${target} server stopped`));
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to stop ${target}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp restart <lang> - Restart a language server
 */
async function handleRestart(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    return error("MISSING_ARGUMENT", "Please specify a language to restart", [
      "Usage: /lsp restart <language>",
    ]);
  }

  try {
    const hub = getHub(ctx.session.cwd);
    await hub.initialize();
    await hub.stopServer(target.toLowerCase());
    await hub.startServer(target.toLowerCase(), ctx.session.cwd);
    return success(chalk.green(`✓ ${target} server restarted`));
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to restart ${target}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp config - Show configuration
 */
async function handleConfig(ctx: CommandContext): Promise<CommandResult> {
  try {
    const config = await loadLspConfig(ctx.session.cwd);
    const globalPath = join(homedir(), ".vellum", "lsp.json");
    const projectPath = join(ctx.session.cwd, ".vellum", "lsp.json");

    const lines = [
      chalk.bold("LSP Configuration"),
      "",
      chalk.dim("Config paths:"),
      `  Global:  ${globalPath}`,
      `  Project: ${projectPath}`,
      "",
      chalk.dim("Servers configured:"),
      ...Object.keys(config.servers).map((s) => `  • ${s}`),
      "",
      chalk.dim("Disabled:"),
      config.disabled.length > 0 ? config.disabled.map((d) => `  • ${d}`).join("\n") : "  (none)",
      "",
      chalk.dim(
        `Cache: max ${config.cache?.maxSize ?? 100} entries, ${config.cache?.ttlSeconds ?? 300}s TTL`
      ),
      chalk.dim(`Auto-install: ${config.autoInstall}`),
    ];

    return success(lines.join("\n"));
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to load config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp enable <lang> - Enable a language server
 */
async function handleEnable(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    return error("MISSING_ARGUMENT", "Please specify a language to enable", [
      "Usage: /lsp enable <language>",
    ]);
  }

  return pending({
    message: `Enabling ${target}...`,
    showProgress: true,
    promise: (async (): Promise<CommandResult> => {
      try {
        const hub = getHub(ctx.session.cwd);
        await hub.initialize();

        // Check if server exists in config
        const config = hub.getConfig();
        if (!config?.servers[target]) {
          return error("RESOURCE_NOT_FOUND", `No configuration found for server: ${target}`, [
            "Available servers:",
            ...Object.keys(config?.servers ?? {}).map((s) => `  - ${s}`),
          ]);
        }

        // Check if already enabled
        if (!config.disabled.includes(target)) {
          return success(
            [
              chalk.yellow(`Server "${target}" is already enabled.`),
              "",
              chalk.dim(`Use ${chalk.cyan(`/lsp start ${target}`)} to start it.`),
            ].join("\n")
          );
        }

        // Enable the server
        await hub.enableServer(target);

        return success(
          [
            chalk.green(`✓ Enabled server: ${target}`),
            "",
            chalk.dim(`Use ${chalk.cyan(`/lsp start ${target}`)} to start the server.`),
          ].join("\n")
        );
      } catch (err) {
        return error(
          "INTERNAL_ERROR",
          `Failed to enable server: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })(),
  });
}

/**
 * /lsp disable <lang> - Disable a language server
 */
async function handleDisable(ctx: CommandContext, target?: string): Promise<CommandResult> {
  if (!target) {
    return error("MISSING_ARGUMENT", "Please specify a language to disable", [
      "Usage: /lsp disable <language>",
    ]);
  }

  return pending({
    message: `Disabling ${target}...`,
    showProgress: true,
    promise: (async (): Promise<CommandResult> => {
      try {
        const hub = getHub(ctx.session.cwd);
        await hub.initialize();

        // Check if server exists in config
        const config = hub.getConfig();
        if (!config?.servers[target]) {
          return error("RESOURCE_NOT_FOUND", `No configuration found for server: ${target}`, [
            "Available servers:",
            ...Object.keys(config?.servers ?? {}).map((s) => `  - ${s}`),
          ]);
        }

        // Check if already disabled
        if (config.disabled.includes(target)) {
          return success(chalk.yellow(`Server "${target}" is already disabled.`));
        }

        // Disable the server
        await hub.disableServer(target);

        return success(
          [
            chalk.green(`✓ Disabled server: ${target}`),
            "",
            chalk.dim("The server has been stopped and will not start automatically."),
          ].join("\n")
        );
      } catch (err) {
        return error(
          "INTERNAL_ERROR",
          `Failed to disable server: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })(),
  });
}

// =============================================================================
// Phase 3: Update, Export, Import
// =============================================================================

/**
 * /lsp update - Check for server updates
 */
async function handleUpdate(ctx: CommandContext, _target?: string): Promise<CommandResult> {
  return pending({
    message: "Checking for updates...",
    showProgress: true,
    promise: (async (): Promise<CommandResult> => {
      try {
        const hub = getHub(ctx.session.cwd);
        await hub.initialize();
        const servers = hub.getServers();

        if (servers.length === 0) {
          return success(
            [
              chalk.bold("LSP Server Updates"),
              "",
              chalk.dim("No servers configured."),
              `Run ${chalk.cyan("/lsp detect")} to find recommended servers.`,
            ].join("\n")
          );
        }

        // Get npm packages to check
        const npmPackages = servers
          .map((s) => LSP_SERVERS[s.id]?.package)
          .filter(
            (p): p is string =>
              !!p &&
              LSP_SERVERS[servers.find((sv) => LSP_SERVERS[sv.id]?.package === p)?.id ?? ""]
                ?.method === "npm"
          );

        if (npmPackages.length === 0) {
          return success(
            [
              chalk.bold("LSP Server Updates"),
              "",
              chalk.dim("No npm-based servers to check for updates."),
            ].join("\n")
          );
        }

        // Run npm outdated to check versions
        let outdatedInfo: Record<string, { current?: string; wanted?: string; latest?: string }> =
          {};
        try {
          const { stdout } = await execAsync(`npm outdated --json -g ${npmPackages.join(" ")}`, {
            encoding: "utf-8",
          });
          if (stdout.trim()) {
            outdatedInfo = JSON.parse(stdout);
          }
        } catch (execErr) {
          // npm outdated returns exit code 1 if packages are outdated
          const execError = execErr as { stdout?: string; stderr?: string };
          if (execError.stdout) {
            try {
              outdatedInfo = JSON.parse(execError.stdout);
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Get current versions
        const versionResults: Array<{
          server: string;
          package: string;
          current: string;
          latest: string;
          outdated: boolean;
        }> = [];

        for (const server of servers) {
          const info = LSP_SERVERS[server.id];
          if (!info || info.method !== "npm") continue;

          const pkgName = info.package;
          const outdated = outdatedInfo[pkgName];

          // Try to get current version
          let currentVersion = outdated?.current ?? "unknown";
          if (currentVersion === "unknown") {
            try {
              const { stdout } = await execAsync(`npm list -g ${pkgName} --json`, {
                encoding: "utf-8",
              });
              const listData = JSON.parse(stdout);
              currentVersion = listData.dependencies?.[pkgName]?.version ?? "unknown";
            } catch {
              // Package might not be installed
              currentVersion = "not installed";
            }
          }

          const latestVersion = outdated?.latest ?? currentVersion;
          const isOutdated = outdated !== undefined && outdated.current !== outdated.latest;

          versionResults.push({
            server: server.id,
            package: pkgName,
            current: currentVersion,
            latest: latestVersion,
            outdated: isOutdated,
          });
        }

        // Build output table
        const lines: string[] = [chalk.bold("LSP Server Updates"), ""];

        // Table header
        lines.push(
          `${chalk.dim("Server".padEnd(15))} ${chalk.dim("Package".padEnd(35))} ${chalk.dim("Current".padEnd(12))} ${chalk.dim("Latest".padEnd(12))} ${chalk.dim("Outdated?")}`
        );
        lines.push(chalk.dim("─".repeat(90)));

        // Table rows
        let hasOutdated = false;
        for (const result of versionResults) {
          const outdatedMark = result.outdated ? chalk.yellow("⚠ Yes") : chalk.green("✓ No");
          if (result.outdated) hasOutdated = true;

          lines.push(
            `${result.server.padEnd(15)} ${result.package.padEnd(35)} ${result.current.padEnd(12)} ${result.latest.padEnd(12)} ${outdatedMark}`
          );
        }

        lines.push("");

        if (hasOutdated) {
          lines.push(chalk.yellow("Some servers have updates available."));
          lines.push(chalk.dim("To upgrade, run:"));
          for (const result of versionResults.filter((r) => r.outdated)) {
            lines.push(`  ${chalk.cyan(`npm install -g ${result.package}@latest`)}`);
          }
        } else {
          lines.push(chalk.green("✓ All servers are up to date!"));
        }

        return success(lines.join("\n"));
      } catch (err) {
        return error(
          "INTERNAL_ERROR",
          `Failed to check updates: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })(),
  });
}

/**
 * /lsp export - Export LSP configuration to JSON
 */
async function handleExport(ctx: CommandContext, outputPath?: string): Promise<CommandResult> {
  try {
    const hub = getHub(ctx.session.cwd);
    await hub.initialize();
    const servers = hub.getServers();
    const config = await loadLspConfig(ctx.session.cwd);

    const exportData: ExportedConfig = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      servers: {},
    };

    // Gather server info
    for (const server of servers) {
      const info = LSP_SERVERS[server.id];
      const isEnabled = !config.disabled.includes(server.id);

      exportData.servers[server.id] = {
        enabled: isEnabled,
        package: info?.package,
        method: info?.method,
      };

      // Try to get installed version for npm packages
      if (info?.method === "npm" && info.package) {
        try {
          const { stdout } = await execAsync(`npm list -g ${info.package} --json`, {
            encoding: "utf-8",
          });
          const listData = JSON.parse(stdout);
          const version = listData.dependencies?.[info.package]?.version;
          const serverEntry = exportData.servers[server.id];
          if (version && serverEntry) {
            serverEntry.version = version;
          }
        } catch {
          // Ignore - version will be undefined
        }
      }
    }

    const jsonOutput = JSON.stringify(exportData, null, 2);

    // If output path specified, write to file
    if (outputPath) {
      const resolvedPath = resolve(ctx.session.cwd, outputPath);
      writeFileSync(resolvedPath, jsonOutput, "utf-8");
      return success(
        [
          chalk.green(`✓ LSP configuration exported successfully!`),
          "",
          chalk.dim("Output file:"),
          `  ${resolvedPath}`,
          "",
          chalk.dim(`Exported ${Object.keys(exportData.servers).length} server(s).`),
        ].join("\n")
      );
    }

    // Otherwise output to console
    return success(
      [
        chalk.bold("LSP Configuration Export"),
        "",
        chalk.dim("Copy the following JSON:"),
        "",
        chalk.cyan(jsonOutput),
        "",
        chalk.dim(`Tip: Use ${chalk.cyan("/lsp export <file.json>")} to save to a file.`),
      ].join("\n")
    );
  } catch (err) {
    return error(
      "INTERNAL_ERROR",
      `Failed to export config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * /lsp import <file> - Import LSP configuration from JSON
 */
async function handleImport(ctx: CommandContext, filePath?: string): Promise<CommandResult> {
  if (!filePath) {
    return error("MISSING_ARGUMENT", "Please specify a JSON file to import", [
      "Usage: /lsp import <file.json>",
      "Example: /lsp import ./lsp-config.json",
    ]);
  }

  const resolvedPath = resolve(ctx.session.cwd, filePath);

  // Check file exists
  if (!existsSync(resolvedPath)) {
    return error("FILE_NOT_FOUND", `File not found: ${resolvedPath}`, [
      "Make sure the file path is correct.",
      "Use absolute path or path relative to current directory.",
    ]);
  }

  // Read and parse JSON
  let importData: ExportedConfig;
  try {
    const content = readFileSync(resolvedPath, "utf-8");
    importData = JSON.parse(content) as ExportedConfig;
  } catch (parseErr) {
    return error(
      "INVALID_ARGUMENT",
      `Failed to parse JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      ["Ensure the file contains valid JSON.", "The file should be exported with /lsp export."]
    );
  }

  // Validate structure
  if (!importData.version || !importData.servers) {
    return error("INVALID_ARGUMENT", "Invalid config format", [
      'Config must have "version" and "servers" fields.',
      "Use a config file exported with /lsp export.",
    ]);
  }

  // Get current servers
  const hub = getHub(ctx.session.cwd);
  await hub.initialize();
  const currentServers = new Set(hub.getServers().map((s) => s.id));

  // Compare and find missing servers
  const missingServers: Array<{ id: string; package?: string; method?: string }> = [];
  const existingServers: string[] = [];

  for (const [serverId, serverConfig] of Object.entries(importData.servers)) {
    if (!serverConfig.enabled) continue;

    if (currentServers.has(serverId)) {
      existingServers.push(serverId);
    } else {
      missingServers.push({
        id: serverId,
        package: serverConfig.package,
        method: serverConfig.method,
      });
    }
  }

  const lines: string[] = [chalk.bold("LSP Configuration Import"), ""];

  lines.push(chalk.dim(`Import from: ${resolvedPath}`));
  lines.push(chalk.dim(`Export version: ${importData.version}`));
  lines.push(chalk.dim(`Exported at: ${importData.exportedAt ?? "unknown"}`));
  lines.push("");

  if (existingServers.length > 0) {
    lines.push(chalk.green(`✓ Already configured (${existingServers.length}):`));
    for (const server of existingServers) {
      lines.push(`  • ${server}`);
    }
    lines.push("");
  }

  if (missingServers.length === 0) {
    lines.push(chalk.green("✓ All servers from the config are already installed!"));
    return success(lines.join("\n"));
  }

  lines.push(chalk.yellow(`⚠ Missing servers (${missingServers.length}):`));
  for (const server of missingServers) {
    const methodHint = server.method ? chalk.dim(` (${server.method})`) : "";
    lines.push(`  • ${server.id}${methodHint}`);
  }
  lines.push("");

  lines.push(chalk.dim("To install missing servers, run:"));
  for (const server of missingServers) {
    if (LSP_SERVERS[server.id]) {
      lines.push(`  ${chalk.cyan(`/lsp install ${server.id}`)}`);
    } else if (server.package && server.method === "npm") {
      lines.push(`  ${chalk.cyan(`npm install -g ${server.package}`)}`);
    } else {
      lines.push(`  ${chalk.dim(`# ${server.id}: Check documentation for install instructions`)}`);
    }
  }

  return success(lines.join("\n"));
}

/**
 * Show help for /lsp command
 */
function showHelp(): CommandResult {
  const lines = [
    chalk.bold("LSP Language Server Management"),
    "",
    chalk.dim("Quick actions:"),
    `  ${chalk.cyan("/lsp status")}             Show all server status`,
    `  ${chalk.cyan("/lsp detect")}             Detect project languages`,
    `  ${chalk.cyan("/lsp install <lang>")}     Install a language server`,
    "",
    chalk.dim("Server control:"),
    `  ${chalk.cyan("/lsp start <lang>")}       Start a language server`,
    `  ${chalk.cyan("/lsp stop <lang>")}        Stop a language server`,
    `  ${chalk.cyan("/lsp restart <lang>")}     Restart a language server`,
    "",
    chalk.dim("Configuration:"),
    `  ${chalk.cyan("/lsp config")}             Show configuration paths`,
    `  ${chalk.cyan("/lsp enable <lang>")}      Enable a language server`,
    `  ${chalk.cyan("/lsp disable <lang>")}     Disable a language server`,
    `  ${chalk.cyan("/lsp update")}             Check for server updates`,
    `  ${chalk.cyan("/lsp export [file]")}      Export config to JSON`,
    `  ${chalk.cyan("/lsp import <file>")}      Import config from JSON`,
    "",
    chalk.dim("Examples:"),
    `  /lsp install typescript`,
    `  /lsp start python`,
    `  /lsp stop all`,
    `  /lsp export ./lsp-config.json`,
  ];

  return success(lines.join("\n"));
}

// =============================================================================
// Main Command Export
// =============================================================================

/**
 * /lsp slash command for managing LSP servers
 */
export const lspSlashCommand: SlashCommand = {
  name: "lsp",
  description: "Manage LSP language servers",
  kind: "builtin",
  category: "tools",
  aliases: ["language-server", "langserver"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description:
        "Subcommand (status, install, detect, start, stop, restart, config, enable, disable)",
      required: false,
    },
    {
      name: "target",
      type: "string",
      description: "Target language or server",
      required: false,
    },
  ],
  examples: [
    "/lsp                    - Show help",
    "/lsp status             - Show all server status",
    "/lsp detect             - Detect project languages",
    "/lsp install typescript - Install TypeScript server",
    "/lsp start python       - Start Python server",
    "/lsp stop all           - Stop all servers",
    "/lsp update             - Check for server updates",
    "/lsp export config.json - Export config to file",
    "/lsp import config.json - Import config from file",
  ],
  subcommands: [
    { name: "status", description: "Show all server status" },
    { name: "install", description: "Install a language server" },
    { name: "detect", description: "Detect project languages" },
    { name: "start", description: "Start a language server" },
    { name: "stop", description: "Stop a language server" },
    { name: "restart", description: "Restart a language server" },
    { name: "config", description: "Show LSP configuration" },
    { name: "enable", description: "Enable a language server" },
    { name: "disable", description: "Disable a language server" },
    { name: "update", description: "Check for server updates" },
    { name: "export", description: "Export LSP configuration" },
    { name: "import", description: "Import LSP configuration" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;
    const target = ctx.parsedArgs.positional[1] as string | undefined;

    switch (subcommand?.toLowerCase()) {
      case "status":
        return handleStatus(ctx);
      case "install":
        return handleInstall(ctx, target);
      case "detect":
        return handleDetect(ctx);
      case "start":
        return handleStart(ctx, target);
      case "stop":
        return handleStop(ctx, target);
      case "restart":
        return handleRestart(ctx, target);
      case "config":
        return handleConfig(ctx);
      case "enable":
        return handleEnable(ctx, target);
      case "disable":
        return handleDisable(ctx, target);
      case "update":
        return handleUpdate(ctx, target);
      case "export":
        return handleExport(ctx, target);
      case "import":
        return handleImport(ctx, target);
      default:
        return showHelp();
    }
  },
};

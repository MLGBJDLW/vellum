#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import { registerDelegateCommand } from "./agents/commands/index.js";
import { App } from "./app.js";
import { handleAgentsGenerate } from "./commands/agents/generate.js";
import { handleAgentsShow } from "./commands/agents/show.js";
import { handleAgentsValidate } from "./commands/agents/validate.js";
import {
  renderCredentialsAdd,
  renderCredentialsList,
  renderCredentialsRemove,
} from "./commands/credentials.js";
import { executeInit } from "./commands/init.js";
import type { CommandResult } from "./commands/types.js";
import { initI18n } from "./tui/i18n/index.js";
import { version } from "./version.js";

// ============================================
// Helper: Get message from CommandResult
// ============================================

/**
 * Extract display message from CommandResult
 */
function getResultMessage(result: CommandResult): string {
  switch (result.kind) {
    case "success":
      return result.message ?? "";
    case "error":
      return result.message;
    case "interactive":
      return result.prompt.message;
    case "pending":
      return result.operation.message;
  }
}

// ============================================
// Graceful Shutdown Setup (T030)
// ============================================

/**
 * Global shutdown handler reference for cleanup.
 * Set by the chat command when an agent loop is active.
 */
let shutdownCleanup: (() => void) | null = null;

/**
 * Handle process signals for graceful shutdown.
 */
function setupGlobalShutdownHandlers(): void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`\n[CLI] Received ${signal}, shutting down gracefully...`);
      if (shutdownCleanup) {
        shutdownCleanup();
      }
      // Give time for cleanup, then exit
      setTimeout(() => process.exit(0), 100);
    });
  }
}

// Setup handlers early
setupGlobalShutdownHandlers();

/**
 * Sets the shutdown cleanup function.
 * Called by App component when agent loop is created.
 */
export function setShutdownCleanup(cleanup: (() => void) | null): void {
  shutdownCleanup = cleanup;
}

const program = new Command();

program.name("vellum").description("Next-generation AI coding agent").version(version);

program
  .command("chat", { isDefault: true })
  .description("Start interactive chat session")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-20250514")
  .option("-p, --provider <provider>", "Provider to use", "anthropic")
  .option("-l, --language <locale>", "Language/locale to use (e.g., en, zh)")
  .action((options) => {
    // Initialize i18n before rendering (T019)
    initI18n({ cliLanguage: options.language });
    render(<App model={options.model} provider={options.provider} />);
  });

program
  .command("run <prompt>")
  .description("Run a single prompt")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-20250514")
  .action(async (prompt, options) => {
    console.log(`Running: ${prompt} with model ${options.model}`);
    // TODO: Implement single run
  });

program
  .command("config")
  .description("Manage configuration")
  .action(() => {
    console.log("Config management coming soon");
  });

// =============================================================================
// Credentials Command (T022)
// =============================================================================

const credentialsCmd = program
  .command("credentials")
  .description("Manage API credentials for LLM providers");

credentialsCmd
  .command("list", { isDefault: true })
  .description("List all stored credentials (masked values)")
  .action(() => {
    renderCredentialsList();
  });

credentialsCmd
  .command("add <provider>")
  .description("Add or update credential for a provider")
  .action((provider: string) => {
    renderCredentialsAdd(provider);
  });

credentialsCmd
  .command("remove <provider>")
  .alias("rm")
  .description("Remove credential for a provider")
  .action((provider: string) => {
    renderCredentialsRemove(provider);
  });

// =============================================================================
// Init Command (T039-T041)
// =============================================================================

program
  .command("init")
  .description("Initialize AGENTS.md for your project")
  .option("-f, --force", "Overwrite existing AGENTS.md without prompting")
  .option("-m, --minimal", "Skip wizard prompts, use defaults")
  .action(async (options) => {
    const result = await executeInit({
      force: options.force,
      minimal: options.minimal,
      nonInteractive: false,
    });
    process.exit(result.exitCode);
  });

// =============================================================================
// Agents Command Group (T042-T046)
// =============================================================================

const agentsCmd = program.command("agents").description("Manage AGENTS.md configuration");

agentsCmd
  .command("show", { isDefault: true })
  .description("Display merged AGENTS.md configuration")
  .option("-j, --json", "Output as JSON")
  .option("-v, --verbose", "Show all details including sources")
  .option("-s, --scope <path>", "Show config for specific file/directory")
  .action(async (options) => {
    const result = await handleAgentsShow({
      json: options.json,
      verbose: options.verbose,
      scope: options.scope,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

agentsCmd
  .command("validate [file]")
  .description("Validate AGENTS.md syntax and structure")
  .option("-v, --verbose", "Show verbose output")
  .option("-j, --json", "Output as JSON")
  .action(async (file, options) => {
    const result = await handleAgentsValidate({
      file,
      verbose: options.verbose,
      json: options.json,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

agentsCmd
  .command("generate")
  .description("Generate AGENTS.md based on detected project stack")
  .option("-o, --output <path>", "Output file path (default: ./AGENTS.md)")
  .option("-m, --merge", "Merge with existing file")
  .option("--dry-run", "Preview generated content without writing")
  .action(async (options) => {
    const result = await handleAgentsGenerate({
      output: options.output,
      merge: options.merge,
      dryRun: options.dryRun,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

// =============================================================================
// Agent Commands (T044 - Multi-Agent Orchestration)
// =============================================================================

registerDelegateCommand(program);

program.parse();

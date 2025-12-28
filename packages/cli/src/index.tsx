#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import { App } from "./app.js";
import {
  renderCredentialsAdd,
  renderCredentialsList,
  renderCredentialsRemove,
} from "./commands/credentials.js";
import { version } from "./version.js";

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
  .action((options) => {
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

program.parse();

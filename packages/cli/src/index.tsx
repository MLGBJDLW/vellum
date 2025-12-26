#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import { App } from "./app.js";
import { version } from "./version.js";

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

program.parse();

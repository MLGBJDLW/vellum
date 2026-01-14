#!/usr/bin/env node
import {
  AgentLoop,
  APPROVAL_POLICIES,
  type ApprovalPolicy,
  BUILTIN_CODING_MODES,
  CODING_MODES,
  type CodingMode,
  OnboardingWizard as CoreOnboardingWizard,
  createAgentFactory,
  LLM,
  normalizeMode,
  SANDBOX_POLICIES,
  type SandboxPolicy,
} from "@vellum/core";
import { ProviderRegistry } from "@vellum/provider";
import { createId } from "@vellum/shared";
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
import { createLspCommand } from "./commands/lsp.js";
import {
  handleSkillCreate,
  handleSkillList,
  handleSkillShow,
  handleSkillValidate,
} from "./commands/skill.js";
import type { CommandResult } from "./commands/types.js";
import { getOrCreateOrchestrator } from "./orchestrator-singleton.js";
import { createCompatStdout } from "./tui/buffered-stdout.js";
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

import { executeShutdownCleanup, setShutdownCleanup } from "./shutdown.js";

// ============================================
// Graceful Shutdown Setup (T030)
// ============================================

/**
 * Handle process signals for graceful shutdown.
 */
function setupGlobalShutdownHandlers(): void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`\n[CLI] Received ${signal}, shutting down gracefully...`);
      executeShutdownCleanup();
      // Give time for cleanup, then exit
      setTimeout(() => process.exit(0), 100);
    });
  }
}

// Setup handlers early
setupGlobalShutdownHandlers();

// =============================================================================
// T037-T040: Mode CLI Flag Interfaces
// =============================================================================

/**
 * Chat command options including mode flags.
 */
export interface ChatOptions {
  /** Model to use for AI responses */
  model: string;
  /** Provider to use (anthropic, openai, etc.) */
  provider: string;
  /** Language/locale for UI */
  language?: string;
  /** Coding mode (vibe, plan, spec) */
  mode: CodingMode;
  /** Approval policy override */
  approval?: ApprovalPolicy;
  /** Sandbox policy override */
  sandbox?: SandboxPolicy;
  /** Full-auto shortcut flag */
  fullAuto?: boolean;
  /** UI theme (dark, parchment, dracula, etc.) */
  theme?: string;
  /** Force banner display on startup */
  banner?: boolean;
}

/**
 * Parse mode flag with validation.
 * Supports both new modes (vibe, plan, spec) and legacy modes (code, draft, debug, ask).
 * @param value - User input value
 * @returns Validated CodingMode
 */
function parseMode(value: string): CodingMode {
  const result = normalizeMode(value);
  return result.mode;
}

/**
 * Parse approval policy flag with validation.
 * @param value - User input value
 * @returns Validated ApprovalPolicy
 */
function parseApproval(value: string): ApprovalPolicy {
  const valid = APPROVAL_POLICIES as readonly string[];
  if (!valid.includes(value)) {
    throw new Error(`Invalid approval: ${value}. Valid options: ${valid.join(", ")}`);
  }
  return value as ApprovalPolicy;
}

/**
 * Parse sandbox policy flag with validation.
 * @param value - User input value
 * @returns Validated SandboxPolicy
 */
function parseSandbox(value: string): SandboxPolicy {
  const valid = SANDBOX_POLICIES as readonly string[];
  if (!valid.includes(value)) {
    throw new Error(`Invalid sandbox: ${value}. Valid options: ${valid.join(", ")}`);
  }
  return value as SandboxPolicy;
}

const program = new Command();

program.name("vellum").description("Next-generation AI coding agent").version(version);

// =============================================================================
// T037-T040: Chat Command with Mode Flags
// =============================================================================

program
  .command("chat", { isDefault: true })
  .description("Start interactive chat session")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-20250514")
  .option("-p, --provider <provider>", "Provider to use", "anthropic")
  .option("-l, --language <locale>", "Language/locale to use (e.g., en, zh)")
  // T037: --mode flag
  .option("--mode <mode>", `Set coding mode (${CODING_MODES.join("|")})`, parseMode, "vibe")
  // T038: --approval flag
  .option(
    "--approval <policy>",
    `Set approval policy (${APPROVAL_POLICIES.join("|")})`,
    parseApproval
  )
  // T039: --sandbox flag
  .option("--sandbox <policy>", `Set sandbox policy (${SANDBOX_POLICIES.join("|")})`, parseSandbox)
  // T040: --full-auto shortcut
  .option("--full-auto", "Shortcut for --mode=vibe --approval=full-auto", false)
  // Theme selection
  .option("--theme <theme>", "UI theme (dark|parchment|dracula|etc.)", "parchment")
  .option("--banner", "Show banner on startup", false)
  .action(async (options: ChatOptions) => {
    // T040: Apply --full-auto shortcut
    let effectiveMode = options.mode;
    let effectiveApproval = options.approval;

    if (options.fullAuto) {
      effectiveMode = "vibe";
      effectiveApproval = "full-auto";
    }

    // Initialize i18n before rendering (T019)
    initI18n({ cliLanguage: options.language });

    // Load user's saved configuration from onboarding
    // CLI flags override user config if explicitly provided
    let effectiveProvider = options.provider;
    let effectiveModel = options.model;

    try {
      const wizard = new CoreOnboardingWizard();
      const loadResult = await wizard.loadState();
      if (loadResult.ok) {
        const userConfig = wizard.generateConfig();
        if (userConfig.provider) {
          effectiveProvider = userConfig.provider;
        }
        if (userConfig.model) {
          effectiveModel = userConfig.model;
        }
      }
    } catch {
      // Use CLI defaults if config loading fails
    }

    // Create AgentLoop with real LLM provider
    let agentLoop: AgentLoop | undefined;
    try {
      // Initialize credential manager for secure credential resolution
      const { createCredentialManager } = await import("./commands/auth.js");
      const credentialManager = await createCredentialManager();

      // Initialize provider registry with credential manager
      const providerRegistry = new ProviderRegistry({
        credentialManager: credentialManager,
      });
      LLM.initialize(providerRegistry);

      // Get mode config for the selected coding mode
      const modeConfig = BUILTIN_CODING_MODES[effectiveMode];

      // Initialize orchestrator singleton for task delegation
      const orchestrator = getOrCreateOrchestrator();

      // Create PromptBuilder with MD prompts (REQ-001: Use MD prompts)
      const { promptBuilder, cleanup } = await createAgentFactory({
        cwd: process.cwd(),
        projectRoot: process.cwd(),
        role: "base", // Load base.md for identity
        mode: effectiveMode, // Load vibe.md/plan.md/spec.md
      });

      // Register cleanup for graceful shutdown
      setShutdownCleanup(cleanup);

      // Create AgentLoop with PromptBuilder
      agentLoop = new AgentLoop({
        sessionId: createId(),
        mode: modeConfig,
        providerType: effectiveProvider,
        model: effectiveModel,
        cwd: process.cwd(),
        projectRoot: process.cwd(),
        orchestrator,
        promptBuilder, // Use MD-loaded prompts
      });
    } catch (error) {
      console.error(
        "[CLI] Failed to initialize agent:",
        error instanceof Error ? error.message : String(error)
      );
      // Continue without agentLoop - App will fall back to echo mode
    }

    const isVSCodeTerminal =
      process.env.TERM_PROGRAM === "vscode" ||
      process.env.VSCODE_INJECTION === "1" ||
      Boolean(process.env.VSCODE_GIT_IPC_HANDLE);
    const inkRenderOptions = isVSCodeTerminal
      ? {
          stdout: createCompatStdout(),
          incrementalRendering: true,
          maxFps: 20,
        }
      : undefined;

    render(
      <App
        model={effectiveModel}
        provider={effectiveProvider}
        mode={effectiveMode}
        approval={effectiveApproval}
        sandbox={options.sandbox}
        theme={options.theme as import("./tui/theme/index.js").ThemeName}
        banner={options.banner}
        agentLoop={agentLoop}
      />,
      inkRenderOptions
    );
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
// Skill Command Group (T033-T037)
// =============================================================================

const skillCmd = program.command("skill").description("Manage skills for AI context");

skillCmd
  .command("list", { isDefault: true })
  .description("List all available skills")
  .option("-s, --source <source>", "Filter by source (workspace, user, global, builtin)")
  .option("-j, --json", "Output as JSON")
  .option("-v, --verbose", "Show full descriptions and triggers")
  .action(async (options) => {
    const result = await handleSkillList({
      source: options.source,
      json: options.json,
      verbose: options.verbose,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

skillCmd
  .command("show <name>")
  .description("Show details of a specific skill")
  .option("-c, --content", "Show full SKILL.md content")
  .option("-j, --json", "Output as JSON")
  .action(async (name, options) => {
    const result = await handleSkillShow(name, {
      content: options.content,
      json: options.json,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

skillCmd
  .command("create <name>")
  .description("Create a new skill from template")
  .option("-l, --location <location>", "Location: workspace, user, or global")
  .option("-f, --force", "Overwrite if skill already exists")
  .option("-n, --non-interactive", "Non-interactive mode (use defaults)")
  .action(async (name, options) => {
    const result = await handleSkillCreate(name, {
      location: options.location,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    process.exit(result.exitCode);
  });

skillCmd
  .command("validate")
  .description("Validate skill(s)")
  .option("-s, --skill <name>", "Validate single skill by name")
  .option("--strict", "Treat warnings as errors")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    const result = await handleSkillValidate({
      skill: options.skill,
      strict: options.strict,
      json: options.json,
    });
    console.log(getResultMessage(result));
    process.exit(result.kind === "success" ? 0 : 1);
  });

// =============================================================================
// Agent Commands (T044 - Multi-Agent Orchestration)
// =============================================================================

registerDelegateCommand(program);

// =============================================================================
// LSP Command (Phase 30)
// =============================================================================

program.addCommand(createLspCommand());

program.parse();

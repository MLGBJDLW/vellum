/**
 * Authentication Slash Commands
 *
 * Provides slash commands for credential management in TUI:
 * - /auth - Unified authentication command (set, delete, list)
 * - /credentials - Show credential status
 *
 * Supports both legacy interface (SlashCommandResult) and
 * enhanced interface (SlashCommand from types.ts) for backward compatibility.
 *
 * @module cli/commands/auth
 */

import {
  CredentialManager,
  type CredentialRef,
  EncryptedFileStore,
  EnvCredentialStore,
  KeychainStore,
} from "@vellum/core";

import type {
  CommandContext,
  CommandResult,
  SlashCommand as EnhancedSlashCommand,
} from "./types.js";
import { error, interactive, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a slash command execution
 * @deprecated Use CommandResult from ./types.ts for new commands
 */
export interface SlashCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Message to display to user */
  message: string;
  /** Additional data (for programmatic use) */
  data?: Record<string, unknown>;
  /** Whether to prompt for input */
  promptForInput?: {
    type: "api_key";
    provider: string;
    placeholder: string;
    onSubmit: (value: string) => Promise<SlashCommandResult>;
  };
}

/**
 * Slash command handler function type
 */
export type SlashCommandHandler = (
  args: string[],
  context: SlashCommandContext
) => Promise<SlashCommandResult>;

/**
 * Context provided to slash command handlers
 */
export interface SlashCommandContext {
  /** Current provider (from chat session) */
  currentProvider?: string;
  /** Credential manager instance */
  credentialManager: CredentialManager;
}

/**
 * Registered slash command
 */
export interface SlashCommand {
  /** Command name (without slash) */
  name: string;
  /** Command aliases */
  aliases?: string[];
  /** Command description */
  description: string;
  /** Usage pattern */
  usage: string;
  /** Handler function */
  handler: SlashCommandHandler;
}

// =============================================================================
// Credential Manager Factory
// =============================================================================

/**
 * Create a credential manager instance with default stores
 */
export async function createCredentialManager(): Promise<CredentialManager> {
  const stores = [
    new EnvCredentialStore(),
    new KeychainStore(),
    new EncryptedFileStore({
      filePath: `${process.env.HOME ?? process.env.USERPROFILE}/.vellum/credentials.enc`,
      password: process.env.VELLUM_CREDENTIAL_PASSWORD ?? "vellum-default-key",
    }),
  ];

  return new CredentialManager(stores, {
    preferredWriteStore: "keychain",
  });
}

// =============================================================================
// Slash Command Handlers
// =============================================================================

/**
 * /credentials command handler
 *
 * Shows credential status for all or a specific provider.
 * Usage: /credentials [provider]
 */
async function handleCredentials(
  args: string[],
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const filterProvider = args[0]?.toLowerCase();

  try {
    // Get store availability
    const availability = await context.credentialManager.getStoreAvailability();

    // List credentials
    const listResult = await context.credentialManager.list(filterProvider);

    if (!listResult.ok) {
      return {
        success: false,
        message: `❌ Failed to list credentials: ${listResult.error.message}`,
      };
    }

    const credentials = listResult.value;

    // Build message
    const lines: string[] = [];
    lines.push("🔐 Credential Status");
    lines.push("━".repeat(40));

    // Store availability
    lines.push("\n📦 Storage Backends:");
    for (const [store, available] of Object.entries(availability)) {
      lines.push(`   ${available ? "✓" : "✗"} ${store}`);
    }

    // Credentials
    lines.push("\n🔑 Credentials:");
    if (credentials.length === 0) {
      if (filterProvider) {
        lines.push(`   No credential found for ${filterProvider}`);
      } else {
        lines.push("   No credentials stored");
        lines.push("   Use /auth set <provider> to add one");
      }
    } else {
      for (const cred of credentials) {
        const maskedValue = cred.maskedHint ?? "***";
        lines.push(`   • ${cred.provider} (${cred.source}): ${maskedValue} [${cred.type}]`);
      }
    }

    lines.push("━".repeat(40));

    return {
      success: true,
      message: lines.join("\n"),
      data: {
        availability,
        credentials: credentials.map((c: CredentialRef) => ({
          provider: c.provider,
          source: c.source,
          type: c.type,
          maskedHint: c.maskedHint,
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// =============================================================================
// Command Registry
// =============================================================================

/**
 * All registered slash commands for authentication
 * @deprecated Use enhancedAuthCommands for new code
 */
export const authSlashCommands: SlashCommand[] = [
  {
    name: "credentials",
    aliases: ["creds", "keys"],
    description: "Show credential status",
    usage: "/credentials [provider]",
    handler: handleCredentials,
  },
];

// =============================================================================
// T034: Enhanced Auth Commands (New Interface)
// =============================================================================

/**
 * Credentials command with enhanced interface
 *
 * Displays available stores and credential status.
 *
 * @example
 * ```
 * /credentials              # Show all credentials
 * /credentials anthropic    # Show specific provider
 * ```
 */
export const credentialsCommand: EnhancedSlashCommand = {
  name: "credentials",
  description: "Show credential status and available stores",
  kind: "builtin",
  category: "auth",
  aliases: ["creds", "keys"],
  positionalArgs: [
    {
      name: "provider",
      type: "string",
      description: "Filter by provider name",
      required: false,
    },
  ],
  namedArgs: [],
  examples: ["/credentials", "/credentials anthropic", "/creds"],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const filterProvider = ctx.parsedArgs.positional[0] as string | undefined;
    const normalizedFilter = filterProvider?.toLowerCase();

    try {
      // Get store availability
      const availability = await ctx.credentials.getStoreAvailability();

      // List credentials
      const listResult = await ctx.credentials.list(normalizedFilter);

      if (!listResult.ok) {
        return error(
          "INTERNAL_ERROR",
          `❌ Failed to list credentials: ${listResult.error.message}`
        );
      }

      const credentials = listResult.value;

      // Build message
      const lines: string[] = [];
      lines.push("🔐 Credential Status");
      lines.push("━".repeat(40));

      // Store availability
      lines.push("\n📦 Storage Backends:");
      for (const [store, available] of Object.entries(availability)) {
        lines.push(`   ${available ? "✓" : "✗"} ${store}`);
      }

      // Credentials
      lines.push("\n🔑 Credentials:");
      if (credentials.length === 0) {
        if (normalizedFilter) {
          lines.push(`   No credential found for ${normalizedFilter}`);
        } else {
          lines.push("   No credentials stored");
          lines.push("   Use /auth set <provider> to add one");
        }
      } else {
        for (const cred of credentials) {
          const maskedValue = cred.maskedHint ?? "***";
          lines.push(`   • ${cred.provider} (${cred.source}): ${maskedValue} [${cred.type}]`);
        }
      }

      lines.push("━".repeat(40));

      return success(lines.join("\n"), {
        availability,
        credentials: credentials.map((c: CredentialRef) => ({
          provider: c.provider,
          source: c.source,
          type: c.type,
          maskedHint: c.maskedHint,
        })),
      });
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

// =============================================================================
// T035: Unified Auth Command
// =============================================================================

/**
 * Unified auth command with subcommands
 *
 * Provides a single entry point for all authentication operations:
 * - /auth (or /auth status) - Show authentication status
 * - /auth set [provider] - Add or update API credential
 * - /auth clear [provider] - Remove credential
 *
 * @example
 * ```
 * /auth                     # Show current auth status
 * /auth status              # Same as /auth
 * /auth set anthropic       # Add/update credential for anthropic
 * /auth clear openai        # Remove credential for openai
 * ```
 */
export const authCommand: EnhancedSlashCommand = {
  name: "auth",
  description: "Manage API credentials (status, set, clear)",
  kind: "builtin",
  category: "auth",
  aliases: [],
  subcommands: [
    {
      name: "status",
      description: "Show current authentication status (default)",
      aliases: ["st", "list"],
    },
    {
      name: "set",
      description: "Add or update API credential for a provider",
      aliases: ["add", "login"],
    },
    {
      name: "clear",
      description: "Remove credential for a provider",
      aliases: ["remove", "delete", "logout"],
    },
  ],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: status, set, clear (default: status)",
      required: false,
    },
    {
      name: "provider",
      type: "string",
      description: "Provider name (e.g., anthropic, openai)",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "store",
      shorthand: "s",
      type: "string",
      description: "Credential store to use (keychain, encrypted-file, env)",
      required: false,
      default: "keychain",
    },
    {
      name: "force",
      shorthand: "f",
      type: "boolean",
      description: "Skip confirmation prompt for clear",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/auth",
    "/auth status",
    "/auth set anthropic",
    "/auth set openai --store keychain",
    "/auth clear anthropic",
    "/auth clear openai --force",
  ],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const args = ctx.parsedArgs.positional;
    const subcommand = (args[0] as string | undefined)?.toLowerCase() ?? "status";
    const provider =
      (args[1] as string | undefined) ??
      // If subcommand is a provider name (not a known subcommand), treat it as provider
      (![
        "status",
        "st",
        "list",
        "set",
        "add",
        "login",
        "clear",
        "remove",
        "delete",
        "logout",
      ].includes(subcommand)
        ? subcommand
        : undefined);
    const store = ctx.parsedArgs.named.store as string | undefined;
    const force = ctx.parsedArgs.named.force === true;

    // Determine actual subcommand (handle case where provider was passed as first arg)
    const actualSubcommand = [
      "status",
      "st",
      "list",
      "set",
      "add",
      "login",
      "clear",
      "remove",
      "delete",
      "logout",
    ].includes(subcommand)
      ? subcommand
      : "status";

    // Route to appropriate handler
    switch (actualSubcommand) {
      case "set":
      case "add":
      case "login":
        return authSet(ctx.credentials, provider ?? ctx.session.provider, store);

      case "clear":
      case "remove":
      case "delete":
      case "logout":
        return authClear(ctx.credentials, provider ?? ctx.session.provider, force);

      case "status":
      case "st":
      case "list":
      default:
        return authStatus(ctx.credentials, provider);
    }
  },
};

/**
 * /auth status - Show authentication status
 */
async function authStatus(
  credentials: CredentialManager,
  filterProvider?: string
): Promise<CommandResult> {
  const normalizedFilter = filterProvider?.toLowerCase();

  try {
    // Get store availability
    const availability = await credentials.getStoreAvailability();

    // List credentials
    const listResult = await credentials.list(normalizedFilter);

    if (!listResult.ok) {
      return error("INTERNAL_ERROR", `❌ Failed to list credentials: ${listResult.error.message}`);
    }

    const credentialsList = listResult.value;

    // Build message
    const lines: string[] = [];
    lines.push("🔐 Authentication Status");
    lines.push("━".repeat(40));

    // Store availability
    lines.push("\n📦 Storage Backends:");
    for (const [store, available] of Object.entries(availability)) {
      lines.push(`   ${available ? "✓" : "✗"} ${store}`);
    }

    // Credentials
    lines.push("\n🔑 Configured Providers:");
    if (credentialsList.length === 0) {
      if (normalizedFilter) {
        lines.push(`   No credential found for ${normalizedFilter}`);
      } else {
        lines.push("   No credentials stored");
        lines.push("   Use /auth set <provider> to add one");
      }
    } else {
      for (const cred of credentialsList) {
        const maskedValue = cred.maskedHint ?? "***";
        lines.push(`   • ${cred.provider} (${cred.source}): ${maskedValue} [${cred.type}]`);
      }
    }

    lines.push("\n" + "━".repeat(40));
    lines.push("💡 Commands: /auth set <provider> | /auth clear <provider>");

    return success(lines.join("\n"), {
      availability,
      credentials: credentialsList.map((c: CredentialRef) => ({
        provider: c.provider,
        source: c.source,
        type: c.type,
        maskedHint: c.maskedHint,
      })),
    });
  } catch (err) {
    return error("INTERNAL_ERROR", `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Provider-specific API key format hints
 */
const PROVIDER_KEY_HINTS: Record<
  string,
  { formatHint: string; helpText: string; documentationUrl?: string }
> = {
  anthropic: {
    formatHint: "sk-ant-api03-...",
    helpText: "Your Anthropic key starts with sk-ant-",
    documentationUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    formatHint: "sk-proj-...",
    helpText: "Your OpenAI key starts with sk-proj- or sk-",
    documentationUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    formatHint: "AIza...",
    helpText: "Your Google AI key starts with AIza",
    documentationUrl: "https://aistudio.google.com/apikey",
  },
  gemini: {
    formatHint: "AIza...",
    helpText: "Your Gemini key starts with AIza",
    documentationUrl: "https://aistudio.google.com/apikey",
  },
  bedrock: {
    formatHint: "AKIA...",
    helpText: "Enter your AWS access key ID",
    documentationUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html",
  },
  cohere: {
    formatHint: "...",
    helpText: "Your Cohere API key",
    documentationUrl: "https://dashboard.cohere.com/api-keys",
  },
  mistral: {
    formatHint: "...",
    helpText: "Your Mistral API key",
    documentationUrl: "https://console.mistral.ai/api-keys",
  },
  groq: {
    formatHint: "gsk_...",
    helpText: "Your Groq key starts with gsk_",
    documentationUrl: "https://console.groq.com/keys",
  },
  fireworks: {
    formatHint: "fw_...",
    helpText: "Your Fireworks key starts with fw_",
    documentationUrl: "https://fireworks.ai/account/api-keys",
  },
  together: {
    formatHint: "...",
    helpText: "Your Together AI API key",
    documentationUrl: "https://api.together.xyz/settings/api-keys",
  },
  perplexity: {
    formatHint: "pplx-...",
    helpText: "Your Perplexity key starts with pplx-",
    documentationUrl: "https://www.perplexity.ai/settings/api",
  },
  deepseek: {
    formatHint: "sk-...",
    helpText: "Your DeepSeek API key",
    documentationUrl: "https://platform.deepseek.com/api_keys",
  },
  openrouter: {
    formatHint: "sk-or-...",
    helpText: "Your OpenRouter key starts with sk-or-",
    documentationUrl: "https://openrouter.ai/keys",
  },
  ollama: {
    formatHint: "(optional)",
    helpText: "Ollama typically runs locally without an API key",
  },
};

/**
 * Get provider-specific hints, with fallback for unknown providers
 */
function getProviderHints(provider: string): {
  formatHint: string;
  helpText: string;
  documentationUrl?: string;
} {
  return (
    PROVIDER_KEY_HINTS[provider] ?? {
      formatHint: "...",
      helpText: `Enter your ${provider} API key`,
    }
  );
}

/**
 * /auth set - Add or update API credential
 */
async function authSet(
  credentials: CredentialManager,
  provider: string | undefined,
  store?: string
): Promise<CommandResult> {
  if (!provider) {
    return error(
      "MISSING_ARGUMENT",
      "❌ Provider required. Usage: /auth set <provider>\n   Example: /auth set anthropic"
    );
  }

  const normalizedProvider = provider.toLowerCase();

  // Check if credential already exists
  const existsResult = await credentials.exists(normalizedProvider);
  const alreadyExists = existsResult.ok && existsResult.value;

  // Get provider-specific hints
  const hints = getProviderHints(normalizedProvider);

  // Capitalize provider name for display
  const displayName = normalizedProvider.charAt(0).toUpperCase() + normalizedProvider.slice(1);

  const title = alreadyExists
    ? `🔐 Update API Key for ${displayName}`
    : `🔐 Set API Key for ${displayName}`;

  const promptMessage = `${displayName} API Key:`;

  return interactive({
    inputType: "password",
    message: promptMessage,
    placeholder: hints.formatHint,
    provider: normalizedProvider,
    title,
    helpText: hints.helpText,
    formatHint: hints.formatHint,
    documentationUrl: hints.documentationUrl,
    handler: async (value: string): Promise<CommandResult> => {
      if (!value.trim()) {
        return error("INVALID_ARGUMENT", "❌ API key cannot be empty");
      }

      try {
        const result = await credentials.store(
          {
            provider: normalizedProvider,
            type: "api_key",
            value: value.trim(),
            metadata: {
              label: `${normalizedProvider} API Key`,
            },
          },
          store as "keychain" | "file" | undefined
        );

        if (!result.ok) {
          return error("INTERNAL_ERROR", `❌ Failed to save credential: ${result.error.message}`);
        }

        return success(`✅ Credential for ${normalizedProvider} saved to ${result.value.source}`, {
          provider: normalizedProvider,
          source: result.value.source,
        });
      } catch (err) {
        return error(
          "INTERNAL_ERROR",
          `❌ Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    onCancel: () => ({
      kind: "error" as const,
      code: "COMMAND_ABORTED" as const,
      message: "Credential setup cancelled",
    }),
  });
}

/**
 * /auth clear - Remove credential
 */
async function authClear(
  credentials: CredentialManager,
  provider: string | undefined,
  force: boolean
): Promise<CommandResult> {
  if (!provider) {
    return error(
      "MISSING_ARGUMENT",
      "❌ Provider required. Usage: /auth clear <provider>\n   Example: /auth clear anthropic"
    );
  }

  const normalizedProvider = provider.toLowerCase();

  // Check if credential exists
  const existsResult = await credentials.exists(normalizedProvider);
  if (!existsResult.ok || !existsResult.value) {
    return error("CREDENTIAL_NOT_FOUND", `⚠️ No credential found for ${normalizedProvider}`);
  }

  // If not forced, return confirmation prompt
  if (!force) {
    return interactive({
      inputType: "confirm",
      message: `Are you sure you want to remove credential for ${normalizedProvider}?`,
      handler: async (value: string): Promise<CommandResult> => {
        if (value.toLowerCase() !== "yes" && value.toLowerCase() !== "y") {
          return error("COMMAND_ABORTED", "Credential removal cancelled");
        }

        return performAuthClear(credentials, normalizedProvider);
      },
      onCancel: () => ({
        kind: "error" as const,
        code: "COMMAND_ABORTED" as const,
        message: "Credential removal cancelled",
      }),
    });
  }

  // Forced clear - delete immediately
  return performAuthClear(credentials, normalizedProvider);
}

/**
 * Perform the actual credential clear operation
 */
async function performAuthClear(
  credentials: CredentialManager,
  provider: string
): Promise<CommandResult> {
  try {
    const result = await credentials.delete(provider);

    if (!result.ok) {
      return error("INTERNAL_ERROR", `❌ Failed to remove credential: ${result.error.message}`);
    }

    if (result.value === 0) {
      return error("CREDENTIAL_NOT_FOUND", `⚠️ No credential found for ${provider}`);
    }

    return success(`✅ Credential for ${provider} removed from ${result.value} store(s)`, {
      provider,
      deletedCount: result.value,
    });
  } catch (err) {
    return error("INTERNAL_ERROR", `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * All enhanced auth commands using the new SlashCommand interface
 */
export const enhancedAuthCommands: EnhancedSlashCommand[] = [authCommand, credentialsCommand];

// =============================================================================
// Command Dispatcher
// =============================================================================

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

/**
 * Parse slash command input
 */
export function parseSlashCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Find a slash command by name or alias
 */
export function findSlashCommand(name: string): SlashCommand | undefined {
  const lowerName = name.toLowerCase();

  return authSlashCommands.find(
    (cmd) => cmd.name === lowerName || cmd.aliases?.includes(lowerName)
  );
}

/**
 * Execute a slash command
 */
export async function executeSlashCommand(
  input: string,
  context: Partial<SlashCommandContext> = {}
): Promise<SlashCommandResult> {
  const parsed = parseSlashCommand(input);

  if (!parsed) {
    return {
      success: false,
      message: "Invalid slash command format",
    };
  }

  const command = findSlashCommand(parsed.command);

  if (!command) {
    // Check if it's a help request
    if (parsed.command === "help" && parsed.args[0]) {
      const helpCmd = findSlashCommand(parsed.args[0]);
      if (helpCmd) {
        return {
          success: true,
          message: `📖 ${helpCmd.name}\n   ${helpCmd.description}\n   Usage: ${helpCmd.usage}`,
        };
      }
    }

    // Unknown command - show available commands
    const available = authSlashCommands.map((c) => `/${c.name}`).join(", ");
    return {
      success: false,
      message: `❓ Unknown command: /${parsed.command}\n   Available: ${available}`,
    };
  }

  // Create credential manager if not provided
  const credentialManager = context.credentialManager ?? (await createCredentialManager());

  const fullContext: SlashCommandContext = {
    currentProvider: context.currentProvider,
    credentialManager,
  };

  return command.handler(parsed.args, fullContext);
}

/**
 * Get help for all slash commands
 */
export function getSlashCommandHelp(): string {
  const lines: string[] = [];
  lines.push("📖 Available Commands:");
  lines.push("━".repeat(40));

  for (const cmd of authSlashCommands) {
    lines.push(`\n/${cmd.name}`);
    if (cmd.aliases?.length) {
      lines.push(`   Aliases: ${cmd.aliases.map((a) => `/${a}`).join(", ")}`);
    }
    lines.push(`   ${cmd.description}`);
    lines.push(`   Usage: ${cmd.usage}`);
  }

  lines.push("\n" + "━".repeat(40));
  lines.push("Tip: Use /help <command> for detailed help");

  return lines.join("\n");
}

// =============================================================================
// Exports
// =============================================================================

export { handleCredentials };

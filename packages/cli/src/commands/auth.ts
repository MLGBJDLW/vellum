/**
 * Authentication Slash Commands
 *
 * Provides slash commands for credential management in TUI:
 * - /login - Add credential interactively
 * - /logout - Remove credential for current/specified provider
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
 * /login command handler
 *
 * Adds a credential interactively for a provider.
 * Usage: /login [provider]
 */
async function handleLogin(
  args: string[],
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const provider = args[0] ?? context.currentProvider;

  if (!provider) {
    return {
      success: false,
      message: "❌ Provider required. Usage: /login <provider>\n" + "   Example: /login anthropic",
    };
  }

  const normalizedProvider = provider.toLowerCase();

  // Check if credential already exists
  const existsResult = await context.credentialManager.exists(normalizedProvider);
  const alreadyExists = existsResult.ok && existsResult.value;

  return {
    success: true,
    message: alreadyExists
      ? `🔐 Updating credential for ${normalizedProvider}. Enter your API key:`
      : `🔐 Adding credential for ${normalizedProvider}. Enter your API key:`,
    promptForInput: {
      type: "api_key",
      provider: normalizedProvider,
      placeholder: "sk-...",
      onSubmit: async (value: string): Promise<SlashCommandResult> => {
        if (!value.trim()) {
          return {
            success: false,
            message: "❌ API key cannot be empty",
          };
        }

        try {
          const result = await context.credentialManager.store({
            provider: normalizedProvider,
            type: "api_key",
            value: value.trim(),
            metadata: {
              label: `${normalizedProvider} API Key`,
            },
          });

          if (!result.ok) {
            return {
              success: false,
              message: `❌ Failed to save credential: ${result.error.message}`,
            };
          }

          return {
            success: true,
            message: `✅ Credential for ${normalizedProvider} saved to ${result.value.source}`,
            data: {
              provider: normalizedProvider,
              source: result.value.source,
            },
          };
        } catch (err) {
          return {
            success: false,
            message: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
  };
}

/**
 * /logout command handler
 *
 * Removes credential for a provider.
 * Usage: /logout [provider]
 */
async function handleLogout(
  args: string[],
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const provider = args[0] ?? context.currentProvider;

  if (!provider) {
    return {
      success: false,
      message:
        "❌ Provider required. Usage: /logout <provider>\n" + "   Example: /logout anthropic",
    };
  }

  const normalizedProvider = provider.toLowerCase();

  try {
    // Check if credential exists first
    const existsResult = await context.credentialManager.exists(normalizedProvider);

    if (!existsResult.ok || !existsResult.value) {
      return {
        success: false,
        message: `⚠️ No credential found for ${normalizedProvider}`,
      };
    }

    // Delete the credential
    const result = await context.credentialManager.delete(normalizedProvider);

    if (!result.ok) {
      return {
        success: false,
        message: `❌ Failed to remove credential: ${result.error.message}`,
      };
    }

    if (result.value === 0) {
      return {
        success: false,
        message: `⚠️ No credential found for ${normalizedProvider}`,
      };
    }

    return {
      success: true,
      message: `✅ Credential for ${normalizedProvider} removed from ${result.value} store(s)`,
      data: {
        provider: normalizedProvider,
        deletedCount: result.value,
      },
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
        lines.push("   Use /login <provider> to add one");
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
    name: "login",
    aliases: ["signin", "auth"],
    description: "Add or update API credential for a provider",
    usage: "/login [provider]",
    handler: handleLogin,
  },
  {
    name: "logout",
    aliases: ["signout", "deauth"],
    description: "Remove API credential for a provider",
    usage: "/logout [provider]",
    handler: handleLogout,
  },
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
 * Login command with enhanced interface
 *
 * Provides interactive API key input for credential storage.
 *
 * @example
 * ```
 * /login                    # Uses current provider
 * /login anthropic          # Specify provider
 * /login openai --store keychain  # Specify store
 * ```
 */
export const loginCommand: EnhancedSlashCommand = {
  name: "login",
  description: "Add or update API credential for a provider",
  kind: "builtin",
  category: "auth",
  aliases: ["signin", "auth"],
  positionalArgs: [
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
  ],
  examples: ["/login anthropic", "/login openai --store keychain", "/login"],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const provider = (ctx.parsedArgs.positional[0] as string | undefined) ?? ctx.session.provider;
    const store = ctx.parsedArgs.named.store as string | undefined;

    if (!provider) {
      return error(
        "MISSING_ARGUMENT",
        "❌ Provider required. Usage: /login <provider>\n   Example: /login anthropic"
      );
    }

    const normalizedProvider = provider.toLowerCase();

    // Check if credential already exists
    const existsResult = await ctx.credentials.exists(normalizedProvider);
    const alreadyExists = existsResult.ok && existsResult.value;

    const promptMessage = alreadyExists
      ? `🔐 Updating credential for ${normalizedProvider}. Enter your API key:`
      : `🔐 Adding credential for ${normalizedProvider}. Enter your API key:`;

    return interactive({
      inputType: "password",
      message: promptMessage,
      placeholder: "sk-...",
      provider: normalizedProvider,
      handler: async (value: string): Promise<CommandResult> => {
        if (!value.trim()) {
          return error("INVALID_ARGUMENT", "❌ API key cannot be empty");
        }

        try {
          const result = await ctx.credentials.store(
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

          return success(
            `✅ Credential for ${normalizedProvider} saved to ${result.value.source}`,
            { provider: normalizedProvider, source: result.value.source }
          );
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
        message: "Login cancelled",
      }),
    });
  },
};

/**
 * Logout command with enhanced interface
 *
 * Removes credential for a provider with optional force flag.
 *
 * @example
 * ```
 * /logout anthropic         # Prompts for confirmation
 * /logout anthropic --force # Skips confirmation
 * ```
 */
export const logoutCommand: EnhancedSlashCommand = {
  name: "logout",
  description: "Remove API credential for a provider",
  kind: "builtin",
  category: "auth",
  aliases: ["signout", "deauth"],
  positionalArgs: [
    {
      name: "provider",
      type: "string",
      description: "Provider name to remove credential for",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "force",
      shorthand: "f",
      type: "boolean",
      description: "Skip confirmation prompt",
      required: false,
      default: false,
    },
  ],
  examples: ["/logout anthropic", "/logout openai --force", "/logout -f"],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const provider = (ctx.parsedArgs.positional[0] as string | undefined) ?? ctx.session.provider;
    const force = ctx.parsedArgs.named.force === true;

    if (!provider) {
      return error(
        "MISSING_ARGUMENT",
        "❌ Provider required. Usage: /logout <provider>\n   Example: /logout anthropic"
      );
    }

    const normalizedProvider = provider.toLowerCase();

    // Check if credential exists
    const existsResult = await ctx.credentials.exists(normalizedProvider);
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
            return error("COMMAND_ABORTED", "Logout cancelled");
          }

          return performLogout(ctx.credentials, normalizedProvider);
        },
        onCancel: () => ({
          kind: "error" as const,
          code: "COMMAND_ABORTED" as const,
          message: "Logout cancelled",
        }),
      });
    }

    // Forced logout - delete immediately
    return performLogout(ctx.credentials, normalizedProvider);
  },
};

/**
 * Perform the actual logout operation
 */
async function performLogout(
  credentials: CommandContext["credentials"],
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
          lines.push("   Use /login <provider> to add one");
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

/**
 * All enhanced auth commands using the new SlashCommand interface
 */
export const enhancedAuthCommands: EnhancedSlashCommand[] = [
  loginCommand,
  logoutCommand,
  credentialsCommand,
];

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

  lines.push("\n━".repeat(40));
  lines.push("Tip: Use /help <command> for detailed help");

  return lines.join("\n");
}

// =============================================================================
// Exports
// =============================================================================

export { handleLogin, handleLogout, handleCredentials };

/**
 * Authentication Slash Commands
 *
 * Provides slash commands for credential management in TUI:
 * - /login - Add credential interactively
 * - /logout - Remove credential for current/specified provider
 * - /credentials - Show credential status
 *
 * @module cli/commands/auth
 */

import {
  CredentialManager,
  EncryptedFileStore,
  EnvCredentialStore,
  KeychainStore,
} from "@vellum/core";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a slash command execution
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
        credentials: credentials.map((c) => ({
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

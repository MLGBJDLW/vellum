/**
 * Web Search Slash Commands
 *
 * Provides slash commands for configuring web search settings:
 * - /websearch - Interactive configuration menu (when no args)
 * - /websearch engine <name> - Set default search engine
 * - /websearch key <provider> <key> - Set API key for search provider
 * - /websearch depth <level> - Set search depth
 * - /websearch test - Test current configuration
 * - /websearch show - Show current configuration
 *
 * @module cli/commands/web-search
 */

import { loadSettings, saveSettings } from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, interactive, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Search settings interface for web search configuration
 */
interface SearchSettings {
  engine?: "auto" | "tavily" | "duckduckgo" | "google" | "bing";
  tavilyApiKey?: string;
  serpApiKey?: string;
  defaultMaxResults?: number;
  searchDepth?: "basic" | "advanced";
}

// =============================================================================
// Constants
// =============================================================================

const VALID_ENGINES = ["auto", "tavily", "duckduckgo", "google", "bing"] as const;
const VALID_DEPTHS = ["basic", "advanced"] as const;
const VALID_KEY_PROVIDERS = ["tavily", "serpapi"] as const;

/**
 * Provider-specific API key format hints for search providers
 */
const SEARCH_PROVIDER_HINTS: Record<
  string,
  { formatHint: string; helpText: string; documentationUrl?: string }
> = {
  tavily: {
    formatHint: "tvly-...",
    helpText: "Your Tavily key starts with tvly-",
    documentationUrl: "https://tavily.com/",
  },
  serpapi: {
    formatHint: "...",
    helpText: "Your SerpAPI key",
    documentationUrl: "https://serpapi.com/dashboard",
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Mask an API key to show only last 4 characters
 */
function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  return `***${key.slice(-4)}`;
}

/**
 * Get search settings from loaded settings
 */
function getSearchSettings(settings: Record<string, unknown>): SearchSettings {
  return (settings as { search?: SearchSettings }).search || {};
}

// =============================================================================
// Command Implementation
// =============================================================================

export const webSearchCommand: SlashCommand = {
  name: "websearch",
  description: "Configure web search settings",
  kind: "builtin",
  category: "config",
  aliases: ["ws"],
  positionalArgs: [
    {
      name: "action",
      type: "string",
      description: "Action: show, engine, key, depth, test",
      required: false,
    },
    {
      name: "value",
      type: "string",
      description: "Value to set",
      required: false,
    },
  ],
  examples: [
    "/websearch                    - Interactive configuration menu",
    "/websearch show               - Show current search config",
    "/websearch engine tavily      - Set default engine",
    "/websearch key tavily <key>   - Set Tavily API key",
    "/websearch key serpapi <key>  - Set SerpAPI key",
    "/websearch depth advanced     - Set search depth",
    "/websearch test               - Test current configuration",
  ],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const positional = ctx.parsedArgs.positional as string[];
    const [action, ...args] = positional;
    const settings = loadSettings();
    const search = getSearchSettings(settings);

    // Interactive menu when no arguments provided
    if (!action) {
      return showMainMenu(settings, search);
    }

    // Show current configuration
    if (action === "show") {
      return showConfiguration(search);
    }

    // Set search engine
    if (action === "engine") {
      const engine = args[0];
      if (!engine) {
        return showEngineMenu(settings, search);
      }
      return setEngine(settings, search, engine);
    }

    // Set API key
    if (action === "key") {
      const provider = args[0];
      const key = args[1];
      if (!provider) {
        return showKeyProviderMenu(settings);
      }
      if (!key) {
        return showKeyInputPrompt(settings, provider);
      }
      return setApiKey(settings, search, provider, key);
    }

    // Set search depth
    if (action === "depth") {
      const depth = args[0];
      if (!depth) {
        return showDepthMenu(settings, search);
      }
      return setDepth(settings, search, depth);
    }

    // Test configuration
    if (action === "test") {
      return testConfiguration(search);
    }

    return error(
      "INVALID_ARGUMENT",
      `Unknown action: ${action}. Use: show, engine, key, depth, test`
    );
  },
};

// =============================================================================
// Interactive Menus
// =============================================================================

/**
 * Show main configuration menu
 */
function showMainMenu(settings: Record<string, unknown>, search: SearchSettings): CommandResult {
  return interactive({
    inputType: "select",
    message: "What would you like to configure?",
    title: "🔍 Web Search Configuration",
    options: [
      "Set search engine",
      "Set API key (secure)",
      "Set search depth",
      "Test configuration",
      "Show current settings",
    ],
    handler: async (choice: string): Promise<CommandResult> => {
      switch (choice) {
        case "Set search engine":
          return showEngineMenu(settings, search);
        case "Set API key (secure)":
          return showKeyProviderMenu(settings);
        case "Set search depth":
          return showDepthMenu(settings, search);
        case "Test configuration":
          return testConfiguration(search);
        case "Show current settings":
          return showConfiguration(search);
        default:
          return error("INVALID_ARGUMENT", `Unknown option: ${choice}`);
      }
    },
    onCancel: () => success("Configuration cancelled"),
  });
}

/**
 * Show search engine selection menu
 */
function showEngineMenu(settings: Record<string, unknown>, search: SearchSettings): CommandResult {
  const currentEngine = search.engine || "auto";
  return interactive({
    inputType: "select",
    message: `Select search engine (current: ${currentEngine})`,
    title: "🔍 Search Engine",
    options: VALID_ENGINES.map((e) => (e === currentEngine ? `${e} ✓` : e)),
    handler: async (choice: string): Promise<CommandResult> => {
      // Remove the checkmark if present
      const engine = choice.replace(" ✓", "");
      return setEngine(settings, search, engine);
    },
    onCancel: () => success("Engine selection cancelled"),
  });
}

/**
 * Show API key provider selection menu
 */
function showKeyProviderMenu(settings: Record<string, unknown>): CommandResult {
  return interactive({
    inputType: "select",
    message: "Select provider to configure API key",
    title: "🔑 API Key Provider",
    options: ["Tavily", "SerpAPI"],
    handler: async (choice: string): Promise<CommandResult> => {
      const provider = choice.toLowerCase();
      return showKeyInputPrompt(settings, provider);
    },
    onCancel: () => success("API key setup cancelled"),
  });
}

/**
 * Show API key input prompt (password masked)
 */
function showKeyInputPrompt(settings: Record<string, unknown>, provider: string): CommandResult {
  const normalizedProvider = provider.toLowerCase();

  if (!VALID_KEY_PROVIDERS.includes(normalizedProvider as (typeof VALID_KEY_PROVIDERS)[number])) {
    return error(
      "INVALID_ARGUMENT",
      `Unknown provider: ${provider}. Use: ${VALID_KEY_PROVIDERS.join(" or ")}`
    );
  }

  const hints = SEARCH_PROVIDER_HINTS[normalizedProvider];
  const displayName = normalizedProvider.charAt(0).toUpperCase() + normalizedProvider.slice(1);

  return interactive({
    inputType: "password",
    message: `${displayName} API Key:`,
    title: `🔑 Set ${displayName} API Key`,
    placeholder: hints?.formatHint,
    helpText: hints?.helpText,
    formatHint: hints?.formatHint,
    documentationUrl: hints?.documentationUrl,
    handler: async (value: string): Promise<CommandResult> => {
      if (!value.trim()) {
        return error("INVALID_ARGUMENT", "❌ API key cannot be empty");
      }

      const search = getSearchSettings(settings);
      if (normalizedProvider === "tavily") {
        search.tavilyApiKey = value.trim();
      } else if (normalizedProvider === "serpapi") {
        search.serpApiKey = value.trim();
      }
      saveSettings({ ...settings, search });
      return success(`✅ ${displayName} API key saved`);
    },
    onCancel: () => ({
      kind: "error" as const,
      code: "COMMAND_ABORTED" as const,
      message: "API key setup cancelled",
    }),
  });
}

/**
 * Show search depth selection menu
 */
function showDepthMenu(settings: Record<string, unknown>, search: SearchSettings): CommandResult {
  const currentDepth = search.searchDepth || "basic";
  return interactive({
    inputType: "select",
    message: `Select search depth (current: ${currentDepth})`,
    title: "📊 Search Depth",
    options: VALID_DEPTHS.map((d) => (d === currentDepth ? `${d} ✓` : d)),
    handler: async (choice: string): Promise<CommandResult> => {
      // Remove the checkmark if present
      const depth = choice.replace(" ✓", "");
      return setDepth(settings, search, depth);
    },
    onCancel: () => success("Depth selection cancelled"),
  });
}

// =============================================================================
// Direct Action Handlers
// =============================================================================

/**
 * Show current configuration
 */
function showConfiguration(search: SearchSettings): CommandResult {
  const display = {
    engine: search.engine || "auto",
    tavilyApiKey: maskKey(search.tavilyApiKey),
    serpApiKey: maskKey(search.serpApiKey),
    defaultMaxResults: search.defaultMaxResults || 10,
    searchDepth: search.searchDepth || "basic",
    envTavily: process.env.TAVILY_API_KEY ? "set" : "not set",
    envSerpApi: process.env.SERPAPI_KEY ? "set" : "not set",
  };
  return success(
    `**Search Configuration**\n\`\`\`json\n${JSON.stringify(display, null, 2)}\n\`\`\``
  );
}

/**
 * Set search engine
 */
function setEngine(
  settings: Record<string, unknown>,
  search: SearchSettings,
  engine: string
): CommandResult {
  if (!VALID_ENGINES.includes(engine as (typeof VALID_ENGINES)[number])) {
    return error(
      "INVALID_ARGUMENT",
      `Invalid engine: ${engine}. Valid: ${VALID_ENGINES.join(", ")}`
    );
  }
  search.engine = engine as SearchSettings["engine"];
  saveSettings({ ...settings, search });
  return success(`✅ Search engine set to: ${engine}`);
}

/**
 * Set API key directly (for backward compatibility)
 */
function setApiKey(
  settings: Record<string, unknown>,
  search: SearchSettings,
  provider: string,
  key: string
): CommandResult {
  if (provider === "tavily") {
    search.tavilyApiKey = key;
    // Ensure the web_search tool, which reads from environment variables,
    // can see this key immediately.
    process.env.TAVILY_API_KEY = key;
    saveSettings({ ...settings, search });
    return success("✅ Tavily API key saved");
  }
  if (provider === "serpapi") {
    search.serpApiKey = key;
    // Ensure the web_search tool, which reads from environment variables,
    // can see this key immediately.
    process.env.SERPAPI_KEY = key;
    saveSettings({ ...settings, search });
    return success("✅ SerpAPI key saved");
  }
  return error(
    "INVALID_ARGUMENT",
    `Unknown provider: ${provider}. Use: ${VALID_KEY_PROVIDERS.join(" or ")}`
  );
}

/**
 * Set search depth
 */
function setDepth(
  settings: Record<string, unknown>,
  search: SearchSettings,
  depth: string
): CommandResult {
  if (!VALID_DEPTHS.includes(depth as (typeof VALID_DEPTHS)[number])) {
    return error("INVALID_ARGUMENT", `Invalid depth: ${depth}. Valid: ${VALID_DEPTHS.join(", ")}`);
  }
  search.searchDepth = depth as "basic" | "advanced";
  saveSettings({ ...settings, search });
  return success(`✅ Search depth set to: ${depth}`);
}

/**
 * Test current configuration
 */
function testConfiguration(search: SearchSettings): CommandResult {
  const tavilyKey = search.tavilyApiKey || process.env.TAVILY_API_KEY;
  const serpApiKey = search.serpApiKey || process.env.SERPAPI_KEY;

  const engines: string[] = [];
  if (tavilyKey) {
    engines.push("✅ Tavily (key configured)");
  } else {
    engines.push("❌ Tavily (no key)");
  }
  if (serpApiKey) {
    engines.push("✅ SerpAPI (key configured)");
  } else {
    engines.push("❌ SerpAPI (no key)");
  }
  engines.push("✅ DuckDuckGo (always available, free)");

  const activeEngine = tavilyKey ? "Tavily" : serpApiKey ? "SerpAPI" : "DuckDuckGo";

  return success(
    `**Search Engine Status**\n${engines.join("\n")}\n\n**Active Engine (auto mode):** ${activeEngine}`
  );
}

// =============================================================================
// Export
// =============================================================================

export const webSearchSlashCommands: readonly SlashCommand[] = [webSearchCommand] as const;

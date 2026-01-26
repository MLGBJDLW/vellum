/**
 * Web Search Slash Commands
 *
 * Provides slash commands for configuring web search settings:
 * - /websearch - Show current search configuration
 * - /websearch engine <name> - Set default search engine
 * - /websearch key <provider> <key> - Set API key for search provider
 * - /websearch test - Test current configuration
 *
 * @module cli/commands/web-search
 */

import { loadSettings, saveSettings } from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

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
    "/websearch                    - Show current search config",
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

    // Show current configuration
    if (!action || action === "show") {
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

    // Set search engine
    if (action === "engine") {
      const engine = args[0];
      if (!engine) {
        return error("INVALID_ARGUMENT", `Usage: /websearch engine <${VALID_ENGINES.join("|")}>`);
      }
      if (!VALID_ENGINES.includes(engine as (typeof VALID_ENGINES)[number])) {
        return error(
          "INVALID_ARGUMENT",
          `Invalid engine: ${engine}. Valid: ${VALID_ENGINES.join(", ")}`
        );
      }
      search.engine = engine as SearchSettings["engine"];
      saveSettings({ ...settings, search });
      return success(`Search engine set to: ${engine}`);
    }

    // Set API key
    if (action === "key") {
      const provider = args[0];
      const key = args[1];
      if (!provider || !key) {
        return error(
          "MISSING_ARGUMENT",
          `Usage: /websearch key <${VALID_KEY_PROVIDERS.join("|")}> <api-key>`
        );
      }
      if (provider === "tavily") {
        search.tavilyApiKey = key;
        saveSettings({ ...settings, search });
        return success("Tavily API key saved");
      }
      if (provider === "serpapi") {
        search.serpApiKey = key;
        saveSettings({ ...settings, search });
        return success("SerpAPI key saved");
      }
      return error(
        "INVALID_ARGUMENT",
        `Unknown provider: ${provider}. Use: ${VALID_KEY_PROVIDERS.join(" or ")}`
      );
    }

    // Set search depth
    if (action === "depth") {
      const depth = args[0];
      if (!depth || !VALID_DEPTHS.includes(depth as (typeof VALID_DEPTHS)[number])) {
        return error("INVALID_ARGUMENT", `Usage: /websearch depth <${VALID_DEPTHS.join("|")}>`);
      }
      search.searchDepth = depth as "basic" | "advanced";
      saveSettings({ ...settings, search });
      return success(`Search depth set to: ${depth}`);
    }

    // Test configuration
    if (action === "test") {
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

    return error(
      "INVALID_ARGUMENT",
      `Unknown action: ${action}. Use: show, engine, key, depth, test`
    );
  },
};

// =============================================================================
// Export
// =============================================================================

export const webSearchSlashCommands: readonly SlashCommand[] = [webSearchCommand] as const;

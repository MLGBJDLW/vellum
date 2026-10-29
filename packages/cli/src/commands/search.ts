/** Live configuration for search_tool and fetch_tool; secrets use the credential store. */
import {
  resolveWebProvider,
  WEB_PROVIDER_IDS,
  type WebProviderId,
  type WebToolSettings,
} from "@vellum/core";
import { loadSettings, saveSettings } from "../tui/i18n/settings-integration.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, interactive, success } from "./types.js";
import { configureWebToolsForCli } from "./web-tools-runtime.js";

const SEARCH_ENGINES = [
  "auto",
  "deepseek",
  "tavily",
  "brave",
  "exa",
  "serper",
  "anysearch",
  "searxng",
  "google",
  "bing",
  "duckduckgo",
] as const;
const FETCH_PROVIDERS = ["auto", "deepseek", "jina", "firecrawl", "direct"] as const;
const KEY_PROVIDERS = WEB_PROVIDER_IDS.filter(
  (provider) => provider !== "direct" && provider !== "duckduckgo"
);

function updateSettings(update: (settings: WebToolSettings) => void): CommandResult {
  const settings = loadSettings();
  const search = structuredClone(settings.search ?? {});
  update(search);
  if (!saveSettings({ ...settings, search }))
    return error("INTERNAL_ERROR", "Could not save web tool settings.");
  return success("Web tool settings saved and active for the next request.");
}

function isProvider(value: string): value is WebProviderId {
  return WEB_PROVIDER_IDS.some((provider) => provider === value);
}

async function setKey(
  ctx: CommandContext,
  provider: string,
  value: string
): Promise<CommandResult> {
  if (!isProvider(provider) || provider === "direct" || provider === "duckduckgo")
    return error("INVALID_ARGUMENT", `Choose: ${KEY_PROVIDERS.join(", ")}`);
  if (!value.trim()) return error("INVALID_ARGUMENT", "API key cannot be empty.");
  const saved = await ctx.credentials.store({
    provider: `web:${provider}`,
    type: "api_key",
    value: value.trim(),
    metadata: {},
  });
  if (!saved.ok)
    return error("INTERNAL_ERROR", "Could not save the API key in the credential store.");
  const result = updateSettings((search) => {
    if (search.providers?.[provider]) delete search.providers[provider]?.apiKey;
    if (provider === "tavily") delete search.tavilyApiKey;
    if (provider === "serpapi") delete search.serpApiKey;
  });
  if (result.kind === "error") return result;
  return success(`${provider} web API key saved. Existing model credentials were not changed.`);
}

function keyPrompt(ctx: CommandContext, provider?: string): CommandResult {
  if (!provider)
    return interactive({
      inputType: "select",
      title: "Web API key",
      message: "Choose a provider",
      options: [...KEY_PROVIDERS],
      handler: async (choice) => keyPrompt(ctx, choice),
    });
  if (!isProvider(provider))
    return error("INVALID_ARGUMENT", `Choose: ${KEY_PROVIDERS.join(", ")}`);
  return interactive({
    inputType: "password",
    title: `${provider} web API key`,
    message: "API key:",
    helpText:
      provider === "deepseek"
        ? "Optional: an existing DeepSeek model key is reused automatically."
        : "Saved in the existing credential store.",
    handler: async (value) => setKey(ctx, provider, value),
  });
}

function selectSetting(setting: "engine" | "fetch" | "depth"): CommandResult {
  const options =
    setting === "engine"
      ? SEARCH_ENGINES
      : setting === "fetch"
        ? FETCH_PROVIDERS
        : ["basic", "advanced"];
  return interactive({
    inputType: "select",
    title: "Web tool settings",
    message: `Choose ${setting}`,
    options: [...options],
    handler: async (choice) => setChoice(setting, choice),
  });
}

function setChoice(setting: "engine" | "fetch" | "depth", value: string): CommandResult {
  if (setting === "engine" && SEARCH_ENGINES.some((item) => item === value)) {
    return updateSettings((search) => {
      search.engine = value as WebToolSettings["engine"];
    });
  }
  if (setting === "fetch" && FETCH_PROVIDERS.some((item) => item === value)) {
    return updateSettings((search) => {
      search.fetchProvider = value as WebToolSettings["fetchProvider"];
    });
  }
  if (setting === "depth" && (value === "basic" || value === "advanced")) {
    return updateSettings((search) => {
      search.searchDepth = value;
    });
  }
  return error(
    "INVALID_ARGUMENT",
    `Invalid ${setting}. Choose: ${(setting === "engine" ? SEARCH_ENGINES : setting === "fetch" ? FETCH_PROVIDERS : ["basic", "advanced"]).join(", ")}`
  );
}

async function showConfiguration(): Promise<CommandResult> {
  const search = loadSettings().search ?? {};
  const statuses = await Promise.all(
    KEY_PROVIDERS.map(async (provider) => {
      const resolved = await resolveWebProvider(provider);
      return `${provider}: ${!resolved.enabled ? "disabled" : resolved.apiKey ? "key configured" : provider === "searxng" && resolved.baseUrl ? "endpoint configured" : "no key configured"}`;
    })
  );
  return success(
    [
      "**Web tool configuration**",
      `Search: ${search.engine ?? "auto"}; fetch: ${search.fetchProvider ?? "auto"}`,
      `Results: ${search.defaultMaxResults ?? 10}; depth: ${search.searchDepth ?? "basic"}; timeout: ${search.timeout ? `${search.timeout} ms` : "tool default"}; auto fallback: ${search.fallback !== false ? "on" : "off"}`,
      ...statuses,
      "Auto mode prefers an available DeepSeek key, then configured alternatives. DuckDuckGo/direct fetch are available without a key unless disabled.",
      "Configuration checked only; no network probe was sent.",
    ].join("\n")
  );
}

function mainMenu(ctx: CommandContext): CommandResult {
  return interactive({
    inputType: "select",
    title: "Search & Fetch",
    message: "What would you like to configure?",
    options: ["Search provider", "Fetch provider", "API key", "Search depth", "Show configuration"],
    handler: async (choice) => {
      if (choice === "Search provider") return selectSetting("engine");
      if (choice === "Fetch provider") return selectSetting("fetch");
      if (choice === "API key") return keyPrompt(ctx);
      if (choice === "Search depth") return selectSetting("depth");
      return showConfiguration();
    },
  });
}

export const webSearchCommand: SlashCommand = {
  name: "websearch",
  aliases: ["ws", "webtools"],
  description: "Configure search_tool and fetch_tool providers, keys and defaults",
  kind: "builtin",
  category: "config",
  positionalArgs: [
    {
      name: "action",
      type: "string",
      description:
        "show, engine, fetch, key, endpoint, enable, disable, fallback, results, timeout, depth, test",
      required: false,
    },
    { name: "value", type: "string", description: "Setting value", required: false },
  ],
  examples: [
    "/websearch",
    "/websearch engine auto",
    "/websearch fetch deepseek",
    "/websearch key brave",
    "/websearch endpoint searxng https://search.example.com",
    "/websearch disable deepseek",
    "/websearch show",
  ],
  execute: async (ctx) => {
    configureWebToolsForCli(ctx.credentials);
    const [action, value, extra] = ctx.parsedArgs.positional.map((arg) =>
      arg === undefined ? undefined : String(arg)
    );
    if (!action) return mainMenu(ctx);
    if (action === "show" || action === "test") return showConfiguration();
    if (action === "engine" || action === "fetch" || action === "depth")
      return value ? setChoice(action, value) : selectSetting(action);
    if (action === "key") return value && extra ? setKey(ctx, value, extra) : keyPrompt(ctx, value);
    if (action === "endpoint") {
      if (!value || !isProvider(value) || !extra)
        return error(
          "INVALID_ARGUMENT",
          "Usage: /websearch endpoint <provider> <https://endpoint|default>"
        );
      if (extra !== "default") {
        try {
          const url = new URL(extra);
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
          )
            throw new Error("Invalid endpoint");
        } catch {
          return error(
            "INVALID_ARGUMENT",
            "Endpoint must be an HTTP(S) URL without credentials, query parameters, or fragment."
          );
        }
      }
      return updateSettings((search) => {
        search.providers ??= {};
        search.providers[value] = {
          ...search.providers[value],
          baseUrl: extra === "default" ? undefined : extra,
        };
      });
    }
    if (action === "enable" || action === "disable") {
      if (!value || !isProvider(value))
        return error("INVALID_ARGUMENT", "Choose a configured search/fetch provider.");
      return updateSettings((search) => {
        search.providers ??= {};
        search.providers[value] = { ...search.providers[value], enabled: action === "enable" };
      });
    }
    if (action === "fallback") {
      if (value !== "on" && value !== "off")
        return error("INVALID_ARGUMENT", "Usage: /websearch fallback on|off");
      return updateSettings((search) => {
        search.fallback = value === "on";
      });
    }
    if (action === "results" || action === "timeout") {
      const count = Number(value);
      const max = action === "results" ? 50 : 120000;
      if (!Number.isInteger(count) || count < 1 || count > max)
        return error("INVALID_ARGUMENT", `${action} must be an integer between 1 and ${max}.`);
      return updateSettings((search) => {
        if (action === "results") search.defaultMaxResults = count;
        else search.timeout = count;
      });
    }
    return error(
      "INVALID_ARGUMENT",
      "Use: show, engine, fetch, key, endpoint, enable, disable, fallback, results, timeout, depth, test"
    );
  },
};

export const webSearchSlashCommands: readonly SlashCommand[] = [webSearchCommand];

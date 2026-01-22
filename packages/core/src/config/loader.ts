import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import type { CredentialManager } from "../credentials/manager.js";
import type { Credential, CredentialInput, CredentialSource } from "../credentials/types.js";
import { Err, Ok, type Result } from "../types/result.js";
import { CONFIG_DEFAULTS } from "./defaults.js";
import { type Config, ConfigSchema, type PartialConfig, type ProviderName } from "./schema.js";

// ============================================
// T034-T038: Configuration Loader Module
// ============================================

/**
 * Error types for configuration loading operations
 */
export type ConfigErrorCode = "FILE_NOT_FOUND" | "PARSE_ERROR" | "VALIDATION_ERROR" | "READ_ERROR";

/**
 * Configuration error with code and context
 */
export interface ConfigError {
  code: ConfigErrorCode;
  message: string;
  path?: string;
  cause?: unknown;
}

/**
 * Options for loadConfig function
 */
export interface LoadConfigOptions {
  /** Working directory to search for config files (default: process.cwd()) */
  cwd?: string;
  /** Config overrides (highest priority) */
  overrides?: PartialConfig;
  /** Skip loading environment variables */
  skipEnv?: boolean;
  /** Skip loading project config file */
  skipProjectFile?: boolean;
  /** CredentialManager instance for credential resolution (T025) */
  credentialManager?: CredentialManager;
  /** Enable interactive credential wizard for missing credentials (T023) */
  interactive?: boolean;
  /** Callback to prompt user for credentials in interactive mode (T023) */
  promptCredential?: CredentialPromptCallback;
  /** Suppress deprecation warnings (default: false) */
  suppressDeprecationWarnings?: boolean;
}

// ============================================
// T023: Credential Wizard Types
// ============================================

/**
 * Callback type for prompting users for credentials in interactive mode
 *
 * @param provider - The provider requiring credentials (e.g., 'anthropic', 'openai')
 * @param options - Additional options for the prompt
 * @returns Promise resolving to credential input or null if cancelled
 */
export type CredentialPromptCallback = (
  provider: ProviderName,
  options: CredentialPromptOptions
) => Promise<CredentialInput | null>;

/**
 * Options passed to credential prompt callback
 */
export interface CredentialPromptOptions {
  /** Suggested credential type (default: 'api_key') */
  suggestedType?: "api_key" | "oauth_token" | "bearer_token";
  /** Human-readable provider name for display */
  displayName?: string;
  /** Whether this is the first run / initialization */
  isFirstRun?: boolean;
  /** Preferred store destination */
  preferredStore?: CredentialSource;
}

// ============================================
// T035: findProjectConfig
// ============================================

/** Config file names to search for in order */
const CONFIG_FILE_NAMES = ["vellum.toml", ".vellum.toml", ".config/vellum.toml"];

/**
 * Find project configuration file by searching up from startDir to root.
 *
 * @param startDir - Directory to start search from (default: process.cwd())
 * @returns Path to found config file, or undefined if not found
 *
 * @example
 * ```typescript
 * const configPath = findProjectConfig();
 * if (configPath) {
 *   console.log(`Found config at: ${configPath}`);
 * }
 * ```
 */
export function findProjectConfig(startDir?: string): string | undefined {
  let currentDir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(currentDir).root;

  while (true) {
    // Check each config file name in order
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, fileName);
      if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
        return configPath;
      }
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    // Stop if we've reached the root
    if (parentDir === currentDir || currentDir === root) {
      break;
    }

    currentDir = parentDir;
  }

  return undefined;
}

// ============================================
// T036: parseEnvConfig
// ============================================

/**
 * Environment variable to config path mappings
 */
const ENV_MAPPINGS: Record<string, string[]> = {
  VELLUM_LLM_PROVIDER: ["llm", "provider"],
  VELLUM_LLM_MODEL: ["llm", "model"],
  VELLUM_LLM_API_KEY: ["llm", "apiKey"],
  VELLUM_DEBUG: ["debug"],
  VELLUM_LOG_LEVEL: ["logLevel"],
  // Timeout mappings
  VELLUM_TIMEOUT_TOOL_DEFAULT: ["timeouts", "toolDefault"],
  VELLUM_TIMEOUT_SHELL: ["timeouts", "shell"],
  VELLUM_TIMEOUT_BASH: ["timeouts", "bashExecution"],
  VELLUM_TIMEOUT_WEB_FETCH: ["timeouts", "webFetch"],
  VELLUM_TIMEOUT_WEB_SEARCH: ["timeouts", "webSearch"],
  VELLUM_TIMEOUT_MCP_DEFAULT: ["timeouts", "mcpDefault"],
  VELLUM_TIMEOUT_MCP_SHUTDOWN: ["timeouts", "mcpShutdown"],
  VELLUM_TIMEOUT_DELEGATION: ["timeouts", "delegation"],
  VELLUM_TIMEOUT_LLM_STREAM: ["timeouts", "llmStream"],
  VELLUM_TIMEOUT_GIT_LOCAL: ["timeouts", "gitLocal"],
  VELLUM_TIMEOUT_GIT_NETWORK: ["timeouts", "gitNetwork"],
  VELLUM_TIMEOUT_PERMISSION_ASK: ["timeouts", "permissionAsk"],
  VELLUM_TIMEOUT_OAUTH: ["timeouts", "oauth"],
  // Limit mappings
  VELLUM_LIMIT_MAX_RETRIES: ["limits", "maxRetries"],
  VELLUM_LIMIT_MAX_CONCURRENT_AGENTS: ["limits", "maxConcurrentAgents"],
  VELLUM_LIMIT_AGENT_MAX_STEPS: ["limits", "agentMaxSteps"],
  VELLUM_LIMIT_AGENT_MAX_TOKENS: ["limits", "agentMaxTokens"],
  VELLUM_LIMIT_AGENT_MAX_TIME_MS: ["limits", "agentMaxTimeMs"],
  VELLUM_LIMIT_SESSION_MAX_TOKENS: ["limits", "sessionMaxTokens"],
  VELLUM_LIMIT_SESSION_MAX_DURATION_MS: ["limits", "sessionMaxDurationMs"],
  // Circuit breaker mappings
  VELLUM_CB_FAILURE_THRESHOLD: ["circuitBreaker", "failureThreshold"],
  VELLUM_CB_RESET_TIMEOUT: ["circuitBreaker", "resetTimeout"],
  VELLUM_CB_WINDOW_SIZE: ["circuitBreaker", "windowSize"],
};

/**
 * Coerce string value to appropriate type
 */
function coerceValue(value: string, path: string[]): unknown {
  // Boolean coercion for debug flag
  if (path[0] === "debug") {
    return value === "true" || value === "1";
  }
  // Number coercion for timeouts, limits, and circuit breaker values
  if (path[0] === "timeouts" || path[0] === "limits" || path[0] === "circuitBreaker") {
    const num = Number.parseInt(value, 10);
    return Number.isNaN(num) ? undefined : num;
  }
  return value;
}

/**
 * Set a nested value in an object using a path array
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (key === undefined) continue;
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
}

/**
 * Parse VELLUM_* environment variables into a partial config object.
 *
 * @returns Partial config with only values from environment variables
 *
 * @example
 * ```typescript
 * // With VELLUM_LLM_PROVIDER=anthropic set:
 * const config = parseEnvConfig();
 * // { llm: { provider: "anthropic" } }
 * ```
 */
export function parseEnvConfig(): Partial<PartialConfig> {
  const result: Record<string, unknown> = {};

  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined && value !== "") {
      setNestedValue(result, configPath, coerceValue(value, configPath));
    }
  }

  return result as Partial<PartialConfig>;
}

// ============================================
// T037: deepMerge
// ============================================

/**
 * Check if value is a plain object (not array, null, or other type)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Deep merge multiple objects. Later sources override earlier ones.
 * Arrays are replaced (not concatenated).
 * undefined values don't overwrite existing values.
 *
 * @param sources - Objects to merge
 * @returns Merged object
 *
 * @example
 * ```typescript
 * const result = deepMerge(
 *   { a: 1, b: { c: 2 } },
 *   { b: { d: 3 } }
 * );
 * // { a: 1, b: { c: 2, d: 3 } }
 * ```
 */
export function deepMerge<T extends object>(...sources: Partial<T>[]): T {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    if (!isPlainObject(source)) continue;

    for (const key of Object.keys(source)) {
      const sourceValue = (source as Record<string, unknown>)[key];

      // Skip undefined values - they don't overwrite
      if (sourceValue === undefined) continue;

      const targetValue = result[key];

      // Deep merge plain objects
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        // Arrays and other values are replaced
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}

// ============================================
// T024: Deprecation Warnings
// ============================================

/**
 * Deprecation warning context for tracking unique warnings
 */
const shownDeprecationWarnings = new Set<string>();

/**
 * Clear deprecation warnings cache (mainly for testing)
 */
export function clearDeprecationWarningsCache(): void {
  shownDeprecationWarnings.clear();
}

/**
 * Check config for deprecated apiKey usage and emit warnings
 *
 * @param config - The parsed configuration object
 * @param configPath - Optional path to config file for better error messages
 *
 * @example
 * ```typescript
 * checkDeprecatedApiKeyUsage(parsedConfig, '/path/to/vellum.toml');
 * // Console: ⚠️ DEPRECATION WARNING: 'apiKey' field is deprecated...
 * ```
 */
export function checkDeprecatedApiKeyUsage(
  config: Partial<PartialConfig>,
  configPath?: string
): void {
  const llmConfig = config.llm as Record<string, unknown> | undefined;

  if (llmConfig?.apiKey !== undefined) {
    const warningKey = `apiKey:${configPath ?? "unknown"}`;

    // Only show each warning once per session
    if (!shownDeprecationWarnings.has(warningKey)) {
      shownDeprecationWarnings.add(warningKey);

      const location = configPath ? ` in ${configPath}` : "";
      console.warn(
        `⚠️  DEPRECATION WARNING: 'apiKey' field${location} is deprecated and will be removed in a future version.\n` +
          `   Please migrate to the 'credential' field for secure credential management.\n` +
          `\n` +
          `   Before (deprecated):\n` +
          `     [llm]\n` +
          `     provider = "anthropic"\n` +
          `     apiKey = "sk-..."\n` +
          `\n` +
          `   After (recommended):\n` +
          `     [llm]\n` +
          `     provider = "anthropic"\n` +
          `\n` +
          `     [llm.credential]\n` +
          `     type = "api_key"\n` +
          `     source = "keychain"  # or "env", "file"\n` +
          `\n` +
          `   Run 'vellum credentials migrate' to migrate your credentials securely.\n`
      );
    }
  }
}

// ============================================
// T025: Credential Resolution
// ============================================

/**
 * Resolve credential for a provider using CredentialManager
 *
 * @param provider - Provider name (e.g., 'anthropic', 'openai')
 * @param credentialManager - CredentialManager instance
 * @returns The resolved credential or null if not found
 */
export async function resolveProviderCredential(
  provider: ProviderName,
  credentialManager: CredentialManager
): Promise<Credential | null> {
  const result = await credentialManager.resolve(provider);

  if (!result.ok) {
    console.warn(`⚠️  Failed to resolve credential for ${provider}: ${result.error.message}`);
    return null;
  }

  return result.value;
}

/**
 * Check if provider credentials are available
 *
 * @param provider - Provider name
 * @param config - Current config (may have apiKey or credential)
 * @param credentialManager - Optional CredentialManager instance
 * @returns Whether credentials are available
 */
export async function hasProviderCredentials(
  provider: ProviderName,
  config: PartialConfig,
  credentialManager?: CredentialManager
): Promise<boolean> {
  // Check for credential field
  if (config.llm?.credential) {
    return true;
  }

  // Check deprecated apiKey field
  if (config.llm?.apiKey) {
    return true;
  }

  // Check CredentialManager if available
  if (credentialManager) {
    const exists = await credentialManager.exists(provider);
    if (exists.ok && exists.value) {
      return true;
    }
  }

  // Check environment variable fallback
  const envKey = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  if (process.env[envKey]) {
    return true;
  }

  return false;
}

// ============================================
// T023: Credential Wizard
// ============================================

/**
 * Provider display names for user-friendly prompts
 */
const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  "azure-openai": "Azure OpenAI",
  google: "Google AI",
  gemini: "Google Gemini",
  "vertex-ai": "Google Vertex AI",
  cohere: "Cohere",
  mistral: "Mistral AI",
  groq: "Groq",
  fireworks: "Fireworks AI",
  together: "Together AI",
  perplexity: "Perplexity",
  bedrock: "AWS Bedrock",
  ollama: "Ollama (Local)",
  openrouter: "OpenRouter",
  // Chinese providers
  deepseek: "DeepSeek",
  qwen: "Qwen (通义千问)",
  moonshot: "Moonshot (Kimi)",
};

/**
 * Get display name for a provider
 */
export function getProviderDisplayName(provider: ProviderName): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}

/**
 * Prompt for missing credentials during config load (interactive mode)
 *
 * @param provider - The provider requiring credentials
 * @param options - Load config options including prompt callback
 * @returns Credential input or null if skipped/cancelled
 */
export async function promptForCredentials(
  provider: ProviderName,
  options: LoadConfigOptions
): Promise<CredentialInput | null> {
  if (!options.interactive || !options.promptCredential) {
    return null;
  }

  const promptOptions: CredentialPromptOptions = {
    suggestedType: "api_key",
    displayName: getProviderDisplayName(provider),
    isFirstRun: false,
    preferredStore: "keychain",
  };

  try {
    return await options.promptCredential(provider, promptOptions);
  } catch (error) {
    console.warn(
      `⚠️  Failed to prompt for ${provider} credentials: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Store credential using CredentialManager
 *
 * @param input - Credential input to store
 * @param credentialManager - CredentialManager instance
 * @returns Success status
 */
export async function storeCredential(
  input: CredentialInput,
  credentialManager: CredentialManager
): Promise<boolean> {
  const result = await credentialManager.store(input);

  if (!result.ok) {
    console.warn(`⚠️  Failed to store credential for ${input.provider}: ${result.error.message}`);
    return false;
  }

  console.log(`✅ Credential for ${input.provider} stored successfully to ${result.value.source}`);
  return true;
}

// ============================================
// T038: loadConfig
// ============================================

/**
 * Get path to global config file (~/.config/vellum/config.toml)
 */
function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "vellum", "config.toml");
}

/**
 * Read and parse a TOML config file
 */
function readTomlFile(filePath: string): Result<Record<string, unknown>, ConfigError> {
  try {
    if (!fs.existsSync(filePath)) {
      return Err({
        code: "FILE_NOT_FOUND",
        message: `Config file not found: ${filePath}`,
        path: filePath,
      });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = TOML.parse(content);
    return Ok(parsed as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.name === "TomlError") {
      return Err({
        code: "PARSE_ERROR",
        message: `Failed to parse TOML: ${error.message}`,
        path: filePath,
        cause: error,
      });
    }
    return Err({
      code: "READ_ERROR",
      message: `Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
      path: filePath,
      cause: error,
    });
  }
}

/**
 * Load configuration from multiple sources with cascading priority.
 *
 * Load order (later overrides earlier):
 * 1. Schema defaults
 * 2. Global config: ~/.config/vellum/config.toml
 * 3. Project config: findProjectConfig()
 * 4. Environment variables (unless skipEnv)
 * 5. CLI overrides (options.overrides)
 *
 * T023/T024/T025 Integration:
 * - Checks for deprecated apiKey usage and emits warnings
 * - Resolves credentials via CredentialManager if provided
 * - Supports interactive credential wizard for missing credentials
 *
 * @param options - Loading options
 * @returns Result with validated Config or ConfigError
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = loadConfig({ cwd: "/my/project" });
 * if (result.ok) {
 *   console.log(result.value.llm.provider);
 * }
 *
 * // With credential resolution
 * const result = loadConfig({
 *   cwd: "/my/project",
 *   credentialManager: myCredentialManager,
 *   interactive: true,
 *   promptCredential: async (provider, opts) => {
 *     // Custom prompt implementation
 *     return { provider, type: 'api_key', value: await askUser() };
 *   }
 * });
 * ```
 */
export function loadConfig(options: LoadConfigOptions = {}): Result<Config, ConfigError> {
  const {
    cwd,
    overrides,
    skipEnv = false,
    skipProjectFile = false,
    suppressDeprecationWarnings = false,
  } = options;

  // Start with empty object (schema defaults applied during validation)
  const configs: Partial<PartialConfig>[] = [];

  // 1. Global config (~/.config/vellum/config.toml)
  const globalPath = getGlobalConfigPath();
  const globalResult = readTomlFile(globalPath);
  if (globalResult.ok) {
    configs.push(globalResult.value as Partial<PartialConfig>);

    // T024: Check for deprecated apiKey usage in global config
    if (!suppressDeprecationWarnings) {
      checkDeprecatedApiKeyUsage(globalResult.value as Partial<PartialConfig>, globalPath);
    }
  }
  // Ignore FILE_NOT_FOUND for global config - it's optional

  // 2. Project config (unless skipProjectFile)
  if (!skipProjectFile) {
    const projectPath = findProjectConfig(cwd);
    if (projectPath) {
      const projectResult = readTomlFile(projectPath);
      if (!projectResult.ok) {
        // Only fail on parse errors, not missing file
        if (projectResult.error.code !== "FILE_NOT_FOUND") {
          return projectResult as Result<Config, ConfigError>;
        }
      } else {
        configs.push(projectResult.value as Partial<PartialConfig>);

        // T024: Check for deprecated apiKey usage in project config
        if (!suppressDeprecationWarnings) {
          checkDeprecatedApiKeyUsage(projectResult.value as Partial<PartialConfig>, projectPath);
        }
      }
    }
  }

  // 3. Environment variables (unless skipEnv)
  if (!skipEnv) {
    const envConfig = parseEnvConfig();
    if (Object.keys(envConfig).length > 0) {
      configs.push(envConfig);

      // T024: Check for deprecated apiKey usage via env var
      if (!suppressDeprecationWarnings && envConfig.llm?.apiKey) {
        checkDeprecatedApiKeyUsage(
          envConfig as Partial<PartialConfig>,
          "VELLUM_LLM_API_KEY env var"
        );
      }
    }
  }

  // 4. CLI overrides (highest priority)
  if (overrides) {
    configs.push(overrides);

    // T024: Check for deprecated apiKey usage in overrides
    if (!suppressDeprecationWarnings) {
      checkDeprecatedApiKeyUsage(overrides as Partial<PartialConfig>, "CLI overrides");
    }
  }

  // Merge all configs
  const merged = deepMerge<PartialConfig>(...configs);

  // Validate and apply defaults via schema
  const parseResult = ConfigSchema.safeParse(merged);

  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return Err({
      code: "VALIDATION_ERROR",
      message: `Invalid configuration: ${issues}`,
      cause: parseResult.error,
    });
  }

  return Ok(parseResult.data);
}

// ============================================
// Config Value Resolution with Defaults
// ============================================

/**
 * Get a timeout value from config, falling back to defaults.
 *
 * @param config - The loaded configuration
 * @param key - The timeout key to retrieve
 * @returns The timeout value in milliseconds
 *
 * @example
 * ```typescript
 * const timeout = getTimeout(config, 'shell'); // Returns config.timeouts.shell or default
 * ```
 */
export function getTimeout(
  config: Config | undefined,
  key: keyof typeof CONFIG_DEFAULTS.timeouts
): number {
  return config?.timeouts?.[key] ?? CONFIG_DEFAULTS.timeouts[key];
}

/**
 * Get a limit value from config, falling back to defaults.
 *
 * @param config - The loaded configuration
 * @param key - The limit key to retrieve
 * @returns The limit value
 *
 * @example
 * ```typescript
 * const maxRetries = getLimit(config, 'maxRetries'); // Returns config.limits.maxRetries or default
 * ```
 */
export function getLimit(
  config: Config | undefined,
  key: keyof typeof CONFIG_DEFAULTS.limits
): number {
  return config?.limits?.[key] ?? CONFIG_DEFAULTS.limits[key];
}

/**
 * Get a circuit breaker value from config, falling back to defaults.
 *
 * @param config - The loaded configuration
 * @param key - The circuit breaker key to retrieve
 * @returns The circuit breaker value
 */
export function getCircuitBreaker(
  config: Config | undefined,
  key: keyof typeof CONFIG_DEFAULTS.circuitBreaker
): number {
  return config?.circuitBreaker?.[key] ?? CONFIG_DEFAULTS.circuitBreaker[key];
}

/**
 * Get a provider default value, falling back to defaults.
 *
 * @param provider - The provider name
 * @param key - The provider config key
 * @returns The provider config value
 */
export function getProviderDefault(
  provider: keyof typeof CONFIG_DEFAULTS.providers,
  key: "defaultMaxTokens"
): number {
  return CONFIG_DEFAULTS.providers[provider]?.[key] ?? CONFIG_DEFAULTS.providers.openai[key];
}

// ============================================
// T025: Async Config Loading with Credentials
// ============================================

/**
 * Extended config result with credential resolution metadata
 */
export interface LoadConfigWithCredentialsResult {
  /** The loaded configuration */
  config: Config;
  /** Whether credentials were resolved from CredentialManager */
  credentialResolved: boolean;
  /** Whether deprecated apiKey was used as fallback */
  usedDeprecatedApiKey: boolean;
  /** The resolved credential (if any) */
  credential: Credential | null;
}

/**
 * Load configuration with credential resolution (async)
 *
 * This is the recommended way to load config when using CredentialManager.
 * It performs all the standard config loading, then:
 * 1. Attempts to resolve credentials from CredentialManager
 * 2. Falls back to deprecated apiKey if credential not found
 * 3. Optionally prompts for credentials in interactive mode
 *
 * @param options - Loading options including CredentialManager
 * @returns Result with config and credential resolution metadata
 *
 * @example
 * ```typescript
 * const result = await loadConfigWithCredentials({
 *   cwd: '/my/project',
 *   credentialManager: myCredentialManager,
 *   interactive: true,
 *   promptCredential: async (provider, opts) => {
 *     const apiKey = await prompt(`Enter API key for ${opts.displayName}:`);
 *     return { provider, type: 'api_key', value: apiKey };
 *   }
 * });
 *
 * if (result.ok) {
 *   const { config, credentialResolved, usedDeprecatedApiKey } = result.value;
 *   if (usedDeprecatedApiKey) {
 *     console.log('Consider migrating to credential field');
 *   }
 * }
 * ```
 */
export async function loadConfigWithCredentials(
  options: LoadConfigOptions = {}
): Promise<Result<LoadConfigWithCredentialsResult, ConfigError>> {
  // First, load base config synchronously
  const configResult = loadConfig(options);

  if (!configResult.ok) {
    return configResult as Result<LoadConfigWithCredentialsResult, ConfigError>;
  }

  const config = configResult.value;
  const provider = config.llm.provider;
  let credentialResolved = false;
  let usedDeprecatedApiKey = false;
  let credential: Credential | null = null;

  // T025: Attempt credential resolution via CredentialManager
  if (options.credentialManager) {
    // Check if we already have a credential configured
    if (config.llm.credential) {
      // Credential is configured in config, resolve it
      credential = await resolveProviderCredential(provider, options.credentialManager);
      if (credential) {
        credentialResolved = true;
      }
    } else {
      // No credential in config, try to resolve from store
      credential = await resolveProviderCredential(provider, options.credentialManager);

      if (credential) {
        credentialResolved = true;
      } else if (config.llm.apiKey) {
        // Fall back to deprecated apiKey
        usedDeprecatedApiKey = true;
      } else {
        // T023: No credentials found, optionally prompt in interactive mode
        if (options.interactive && options.promptCredential) {
          const credentialInput = await promptForCredentials(provider, options);

          if (credentialInput) {
            // Store the new credential
            const stored = await storeCredential(credentialInput, options.credentialManager);

            if (stored) {
              // Re-resolve to get the full credential object
              credential = await resolveProviderCredential(provider, options.credentialManager);
              credentialResolved = credential !== null;
            }
          }
        }
      }
    }
  } else if (config.llm.apiKey) {
    // No CredentialManager but apiKey present
    usedDeprecatedApiKey = true;
  }

  return Ok({
    config,
    credentialResolved,
    usedDeprecatedApiKey,
    credential,
  });
}

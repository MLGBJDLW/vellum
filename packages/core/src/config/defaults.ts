/**
 * Centralized configuration defaults for Vellum.
 * All hardcoded values should be defined here and imported elsewhere.
 */

export const CONFIG_DEFAULTS = {
  /** Timeout values in milliseconds */
  timeouts: {
    /** Default timeout for most tools */
    toolDefault: 30_000,
    /** Shell/bash command execution */
    shell: 120_000,
    /** Bash tool execution */
    bashExecution: 120_000,
    /** Web fetch operations */
    webFetch: 30_000,
    /** Web search operations */
    webSearch: 15_000,
    /** MCP server operations */
    mcpDefault: 60_000,
    /** MCP server shutdown */
    mcpShutdown: 5_000,
    /** Agent delegation */
    delegation: 300_000,
    /** LLM stream timeout */
    llmStream: 30_000,
    /** Git local operations */
    gitLocal: 5_000,
    /** Git network operations */
    gitNetwork: 30_000,
    /** Permission ask dialog */
    permissionAsk: 30_000,
    /** Spec validation */
    specValidation: 60_000,
    /** OAuth flow */
    oauth: 300_000,
    /** Hook execution */
    hookDefault: 30_000,
    /** Hook maximum */
    hookMax: 300_000,
    /** Hook minimum */
    hookMin: 100,
    /** MCP retry base delay */
    mcpRetryBaseDelay: 1_000,
    /** Quota retry delay */
    quotaRetryDelay: 60_000,
  },

  /** Numeric limits and thresholds */
  limits: {
    /** Maximum retry attempts */
    maxRetries: 3,
    /** Maximum concurrent agents */
    maxConcurrentAgents: 3,
    /** Maximum agent iteration steps */
    agentMaxSteps: 100,
    /** Maximum tokens per agent session */
    agentMaxTokens: 100_000,
    /** Maximum agent execution time (ms) */
    agentMaxTimeMs: 1_800_000,
    /** Session token quota */
    sessionMaxTokens: 100_000,
    /** Session duration quota (ms) */
    sessionMaxDurationMs: 300_000,
    /** Orchestrator task timeout (ms) */
    orchestratorTaskTimeout: 300_000,
  },

  /** Circuit breaker configuration */
  circuitBreaker: {
    /** Failures before opening circuit */
    failureThreshold: 5,
    /** Time before attempting reset (ms) */
    resetTimeout: 30_000,
    /** Window for counting failures (ms) */
    windowSize: 60_000,
  },

  /** Provider-specific defaults */
  providers: {
    anthropic: {
      defaultMaxTokens: 4096,
    },
    openai: {
      defaultMaxTokens: 4096,
    },
    google: {
      defaultMaxTokens: 8192,
    },
    mistral: {
      defaultMaxTokens: 4096,
    },
    groq: {
      defaultMaxTokens: 4096,
    },
    openrouter: {
      defaultMaxTokens: 4096,
    },
    deepseek: {
      defaultMaxTokens: 4096,
    },
    qwen: {
      defaultMaxTokens: 4096,
    },
    moonshot: {
      defaultMaxTokens: 4096,
    },
    ollama: {
      defaultMaxTokens: 4096,
    },
  },

  /** External API URLs */
  externalApis: {
    npmRegistry: "https://registry.npmjs.org",
    pypiUrl: "https://pypi.org/pypi/",
    githubApi: "https://api.github.com",
    mdnApi: "https://developer.mozilla.org/api/v1/search",
    duckduckgoHtml: "https://html.duckduckgo.com/html/",
    serpapi: "https://serpapi.com/search",
  },

  /** Path defaults */
  paths: {
    configDir: ".vellum",
    configFile: "config.toml",
    ignoreFile: "ignore",
    pluginsDir: "plugins",
  },
} as const;

export type ConfigDefaults = typeof CONFIG_DEFAULTS;

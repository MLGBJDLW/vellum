import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentLoop,
  ApprovalPolicy,
  CodingMode,
  EnterpriseHooks as CoreEnterpriseHooks,
  CredentialManager,
  EnterpriseToolCallInfo,
  SandboxPolicy,
  Session,
  SessionMode,
  ToolExecutor,
  ToolRegistry,
} from "@vellum/core";
import {
  BUILTIN_CODING_MODES,
  BuiltinAgentRegistry,
  OnboardingWizard as CoreOnboardingWizard,
  createCostService,
  createModeManager,
  createSession,
  createToolRegistry,
  getTextContent,
  ProjectMemoryService,
  registerAllBuiltinTools,
  SessionListService,
  StorageManager,
  updateSessionMetadata,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import { Box, Text, useApp as useInkApp, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DefaultContextProvider } from "./commands/index.js";
import {
  agentsCommand,
  CommandExecutor,
  CommandRegistry,
  clearCommand,
  costCommand,
  costResetCommand,
  createBatchCommand,
  createContextProvider,
  createCredentialManager,
  createResumeCommand,
  customAgentsCommand,
  enhancedAuthCommands,
  exitCommand,
  helpCommand,
  initSlashCommand,
  languageCommand,
  memoryCommand,
  metricsCommands,
  modelCommand,
  onboardCommand,
  type ResumeSessionEventData,
  registerUserCommands,
  setCostCommandsService,
  setHelpRegistry,
  setModeCommandsManager,
  setModelCommandConfig,
  setThemeContext,
  themeSlashCommands,
  tutorialCommand,
} from "./commands/index.js";
import { modeSlashCommands } from "./commands/mode.js";
import type { AsyncOperation, CommandResult, InteractivePrompt } from "./commands/types.js";
import { setShutdownCleanup } from "./index.js";
import { useAgentAdapter } from "./tui/adapters/agent-adapter.js";
import { toUIMessages } from "./tui/adapters/message-adapter.js";
import {
  createMemorySessionStorage,
  type SessionStorage,
  useSessionAdapter,
} from "./tui/adapters/session-adapter.js";
import { Banner } from "./tui/components/Banner/index.js";
import { BacktrackControls } from "./tui/components/backtrack/BacktrackControls.js";
import { LoadingIndicator } from "./tui/components/common/Spinner.js";
import type { AutocompleteOption } from "./tui/components/Input/Autocomplete.js";
import { CommandInput, type SlashCommand } from "./tui/components/Input/CommandInput.js";
import { TextInput } from "./tui/components/Input/TextInput.js";
import { McpPanel } from "./tui/components/index.js";
import { Layout } from "./tui/components/Layout.js";
import { MemoryPanel, type MemoryPanelProps } from "./tui/components/MemoryPanel.js";
import { MessageList } from "./tui/components/Messages/MessageList.js";
import { ModelSelector } from "./tui/components/ModelSelector.js";
import { ModeSelector } from "./tui/components/ModeSelector.js";
import { OnboardingWizard } from "./tui/components/OnboardingWizard.js";
import { PhaseProgressIndicator } from "./tui/components/PhaseProgressIndicator.js";
import { StatusBar } from "./tui/components/StatusBar/StatusBar.js";
import type { TrustMode } from "./tui/components/StatusBar/TrustModeIndicator.js";
import { SessionPicker } from "./tui/components/session/SessionPicker.js";
import type { SessionMetadata, SessionPreviewMessage } from "./tui/components/session/types.js";
import { ThinkingBlock } from "./tui/components/ThinkingBlock.js";
import { TipBanner } from "./tui/components/TipBanner.js";
import type { TodoItemData } from "./tui/components/TodoItem.js";
import { TodoPanel } from "./tui/components/TodoPanel.js";
import { PermissionDialog } from "./tui/components/Tools/PermissionDialog.js";
import { ToolsPanel } from "./tui/components/Tools/ToolsPanel.js";
import { UpdateBanner } from "./tui/components/UpdateBanner.js";
import type { Message } from "./tui/context/MessagesContext.js";
import { useMessages } from "./tui/context/MessagesContext.js";
import { RootProvider } from "./tui/context/RootProvider.js";
import { useTools } from "./tui/context/ToolsContext.js";
import { useAgentLoop } from "./tui/hooks/useAgentLoop.js";
import { useAlternateBuffer } from "./tui/hooks/useAlternateBuffer.js";
import { useBacktrack } from "./tui/hooks/useBacktrack.js";
import { useCopyMode } from "./tui/hooks/useCopyMode.js";
import { useDesktopNotification } from "./tui/hooks/useDesktopNotification.js";
import { type HotkeyDefinition, useHotkeys } from "./tui/hooks/useHotkeys.js";
import { useInputHistory } from "./tui/hooks/useInputHistory.js";
import { useModeShortcuts } from "./tui/hooks/useModeShortcuts.js";
import { useScreenReader } from "./tui/hooks/useScreenReader.js";
import { useSidebarPanelData } from "./tui/hooks/useSidebarPanelData.js";
import { useToolApprovalController } from "./tui/hooks/useToolApprovalController.js";
import { useVim } from "./tui/hooks/useVim.js";
import { getBannerSeen, setBannerSeen as saveBannerSeen } from "./tui/i18n/settings-integration.js";
import {
  disposeLsp,
  initializeLsp,
  type LspIntegrationOptions,
  type LspIntegrationResult,
} from "./tui/lsp-integration.js";
import {
  disposePlugins,
  getPluginCommands,
  initializePlugins,
  type PluginInitResult,
} from "./tui/plugins.js";

// =============================================================================
// Feature Integrations (T063-T070)
// =============================================================================

// Enterprise integration (T068)
import {
  createEnterpriseHooks,
  type EnterpriseHooks,
  initializeEnterprise,
  shutdownEnterprise,
} from "./tui/enterprise-integration.js";
// Metrics integration (T067)
import { getMetricsManager, type TuiMetricsManager } from "./tui/metrics-integration.js";
// Resilience integration (T064-T066)
import { createResilientProvider, type ResilientProvider } from "./tui/resilience.js";
// Sandbox integration (T063)
import { cleanupSandbox, initializeSandbox } from "./tui/sandbox-integration.js";
import { type ThemeName, useTheme } from "./tui/theme/index.js";
// Tip integration (T069)
import { buildTipContext, useTipEngine } from "./tui/tip-integration.js";
import { calculateCost, getContextWindow } from "./utils/index.js";

/**
 * Get default model for a given provider
 */
function getDefaultModelForProvider(provider: string): string {
  const defaults: Record<string, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    google: "gemini-2.0-flash",
    "azure-openai": "gpt-4o",
    gemini: "gemini-2.0-flash",
    "vertex-ai": "gemini-2.0-flash",
    cohere: "command-r-plus",
    mistral: "mistral-large-latest",
    groq: "llama-3.3-70b-versatile",
    fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    together: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    perplexity: "llama-3.1-sonar-large-128k-online",
    bedrock: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    ollama: "llama3.2",
    openrouter: "anthropic/claude-3.5-sonnet",
    deepseek: "deepseek-chat",
    qwen: "qwen-max",
    moonshot: "moonshot-v1-8k",
  };
  return defaults[provider] ?? "claude-sonnet-4-20250514";
}

function approvalPolicyToTrustMode(policy: ApprovalPolicy): TrustMode {
  switch (policy) {
    case "suggest":
      return "ask";
    case "auto-edit":
    case "on-request":
      return "auto";
    case "full-auto":
      return "full";
  }
}

function getDefaultApprovalPolicyForMode(mode: CodingMode): ApprovalPolicy {
  switch (mode) {
    case "vibe":
      return "full-auto";
    case "plan":
      return "auto-edit";
    case "spec":
      return "suggest";
  }
}

/**
 * Props for the App component.
 * Extended with coding mode options (T037-T040).
 */
interface AppProps {
  /** Model to use for AI responses */
  model: string;
  /** Provider to use (anthropic, openai, etc.) */
  provider: string;
  /** Initial coding mode (T037) */
  mode?: CodingMode;
  /** Approval policy override (T038) */
  approval?: ApprovalPolicy;
  /** Sandbox policy override (T039) */
  sandbox?: SandboxPolicy;
  /** Optional AgentLoop instance for real agent integration */
  agentLoop?: AgentLoop;
  /** Optional shared ToolRegistry for the running tool system (avoids internal registry duplication) */
  toolRegistry?: ToolRegistry;
  /** Optional shared ToolExecutor for executing tools (defaults to AgentLoop's executor when available) */
  toolExecutor?: ToolExecutor;
  /** UI theme (dark, parchment, dracula, etc.) */
  theme?: ThemeName;
  /** Force banner display on startup */
  banner?: boolean;
}

type AppContentProps = AppProps & {
  readonly toolRegistry: ToolRegistry;
};

/**
 * Cancellation controller for the current agent operation.
 * Used to wire Ctrl+C and ESC to cancel running operations.
 */
interface CancellationController {
  cancel: (reason?: string) => void;
  isCancelled: boolean;
}

/**
 * Helper to create a Message object for the MessageList
 */
function createMessage(role: Message["role"], content: string): Message {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: new Date(),
  };
}

/**
 * Map coding mode to session mode for persistence.
 */
function mapCodingModeToSessionMode(mode: CodingMode): SessionMode {
  switch (mode) {
    case "vibe":
      return "code";
    case "plan":
      return "plan";
    case "spec":
      return "plan";
  }
}

/**
 * Derive a session title from messages.
 */
type SessionMessage = Session["messages"][number];

function buildSessionTitle(messages: readonly SessionMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const content = firstUser ? getTextContent(firstUser).trim() : "";
  if (!content) {
    return "New Session";
  }
  return content.length > 60 ? `${content.slice(0, 57)}...` : content;
}

/**
 * Derive a summary/preview from messages.
 */
function buildSessionSummary(messages: readonly SessionMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    const content = getTextContent(message).trim();
    if (content) {
      return content.length > 140 ? `${content.slice(0, 137)}...` : content;
    }
  }
  return undefined;
}

// =============================================================================
// T036: Command Registry Initialization
// =============================================================================

/**
 * Create and initialize the command registry with all builtin commands
 */
function createCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  // Register core system commands
  registry.register(helpCommand);
  registry.register(clearCommand);
  registry.register(exitCommand);

  // Register additional builtin commands
  registry.register(languageCommand);
  registry.register(modelCommand);
  registry.register(costCommand);
  registry.register(costResetCommand);
  registry.register(initSlashCommand);
  registry.register(onboardCommand);
  registry.register(agentsCommand);
  registry.register(customAgentsCommand);

  // Register memory dispatcher (subcommands handled via /memory)
  registry.register(memoryCommand);

  // Register tutorial command (Phase 38)
  registry.register(tutorialCommand);

  // Register auth commands
  for (const cmd of enhancedAuthCommands) {
    registry.register(cmd);
  }

  // T041: Register mode slash commands
  for (const cmd of modeSlashCommands) {
    registry.register(cmd);
  }

  // T042: Register theme slash commands
  for (const cmd of themeSlashCommands) {
    registry.register(cmd);
  }

  // T067: Register metrics commands
  for (const cmd of metricsCommands) {
    registry.register(cmd);
  }

  // T061: Plugin commands are registered via registerPluginCommands()
  // after PluginManager initialization in AppContent

  // Wire up help command to access registry
  setHelpRegistry(registry);

  return registry;
}

/**
 * Registers plugin commands into the command registry.
 * Called after plugin initialization completes.
 *
 * @param registry - Command registry to register commands into
 * @param pluginResult - Result from plugin initialization
 */
function registerPluginCommands(registry: CommandRegistry, pluginResult: PluginInitResult): void {
  const commands = getPluginCommands(pluginResult.manager);
  for (const cmd of commands) {
    try {
      registry.register(cmd);
    } catch (error) {
      // Log but don't fail on command conflicts
      console.warn(`[plugin] Failed to register command '${cmd.name}':`, error);
    }
  }
}

export function App({
  model,
  provider,
  mode: _mode = "vibe",
  approval: _approval,
  sandbox: _sandbox,
  agentLoop: agentLoopProp,
  toolRegistry: toolRegistryProp,
  toolExecutor: toolExecutorProp,
  theme = "parchment",
  banner,
}: AppProps) {
  // Shared tool registry for the running tool system.
  // This registry is used by commands, the tools UI, and MCP tool registration.
  const toolRegistry = useMemo(() => {
    if (toolRegistryProp) {
      return toolRegistryProp;
    }

    const registry = createToolRegistry();
    registerAllBuiltinTools(registry);
    return registry;
  }, [toolRegistryProp]);

  // If an AgentLoop is provided, MCP tools must execute via the same ToolExecutor.
  const toolExecutor: ToolExecutor | undefined = useMemo(() => {
    if (toolExecutorProp) {
      return toolExecutorProp;
    }
    return agentLoopProp?.getToolExecutor();
  }, [agentLoopProp, toolExecutorProp]);

  return (
    <RootProvider theme={theme} toolRegistry={toolRegistry} toolExecutor={toolExecutor}>
      <AppContent
        model={model}
        provider={provider}
        mode={_mode}
        approval={_approval}
        sandbox={_sandbox}
        agentLoop={agentLoopProp}
        toolRegistry={toolRegistry}
        banner={banner}
      />
    </RootProvider>
  );
}

/**
 * Inner component that contains the actual app logic.
 * Separated from App to access ThemeContext via useTheme().
 */
function AppContent({
  model,
  provider,
  mode: _mode = "vibe",
  approval: _approval,
  sandbox: _sandbox,
  agentLoop: agentLoopProp,
  banner,
  toolRegistry,
}: AppContentProps) {
  const { exit } = useInkApp();
  const themeContext = useTheme();
  const { messages, addMessage, clearMessages, setMessages } = useMessages();
  const [isLoading, setIsLoading] = useState(false);
  const [interactivePrompt, setInteractivePrompt] = useState<InteractivePrompt | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [pendingOperation, setPendingOperation] = useState<AsyncOperation | null>(null);

  // ==========================================================================
  // New TUI Hooks Integration (T038-T059)
  // ==========================================================================

  // Vim modal editing mode (T041)
  const [vimEnabled, setVimEnabled] = useState(false);
  const vim = useVim();

  // Copy mode for visual selection (T055)
  const copyMode = useCopyMode();

  // Desktop notifications (T059)
  const {
    notify: _notify,
    notifyTaskComplete,
    notifyError,
  } = useDesktopNotification({ enabled: true });

  // Alternate buffer for full-screen modals (T043)
  const alternateBuffer = useAlternateBuffer({ enabled: false });

  // AgentLoop integration (T038) - use prop if provided
  // Note: The hook is conditionally used based on prop presence
  // This is acceptable because the prop doesn't change during component lifetime
  // biome-ignore lint/correctness/useHookAtTopLevel: agentLoopProp is a stable prop that doesn't change during component lifetime
  const agentLoopHook = agentLoopProp ? useAgentLoop(agentLoopProp) : null;

  // ==========================================================================
  // Feature Integrations (T063-T070)
  // ==========================================================================

  // T063: Sandbox integration for shell tool execution
  const sandboxRef = useRef<ReturnType<typeof initializeSandbox> | null>(null);
  useEffect(() => {
    // Initialize sandbox on mount
    sandboxRef.current = initializeSandbox({
      workingDirectory: process.cwd(),
      allowNetwork: false,
      allowFileSystem: true,
      timeoutMs: 30000,
    });

    return () => {
      // Cleanup sandbox on unmount
      void cleanupSandbox();
    };
  }, []);

  // T064-T066: Resilience (circuit breaker, rate limiter, fallback)
  const [_resilientProvider, setResilientProvider] = useState<ResilientProvider | null>(null);
  useEffect(() => {
    // Create resilient provider wrapper
    // In production, this would wrap actual provider clients
    const resilient = createResilientProvider(
      [
        {
          id: provider,
          name: provider,
          priority: 0,
          execute: async <T,>(request: () => Promise<T>) => request(),
        },
      ],
      {
        circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
        rateLimiter: { defaultBucket: { capacity: 60, refillRate: 1 } },
      }
    );

    setResilientProvider(resilient);

    return () => {
      resilient.dispose();
    };
  }, [provider]);

  // T067: Metrics integration
  const metricsManager = useMemo<TuiMetricsManager>(() => getMetricsManager(), []);

  // Track message processing
  useEffect(() => {
    if (messages.length > 0) {
      metricsManager.recordMessage();
    }
  }, [messages.length, metricsManager]);

  // T068: Enterprise integration
  const [enterpriseHooks, setEnterpriseHooks] = useState<EnterpriseHooks | null>(null);
  useEffect(() => {
    let cancelled = false;

    const loadEnterprise = async () => {
      const result = await initializeEnterprise();
      if (!cancelled && result.enabled) {
        setEnterpriseHooks(createEnterpriseHooks());
        console.debug("[enterprise] Enterprise mode active");
      }
    };

    void loadEnterprise();

    return () => {
      cancelled = true;
      void shutdownEnterprise();
    };
  }, []);

  // T068: Wire enterprise hooks to ToolExecutor when both are available
  useEffect(() => {
    if (!enterpriseHooks) {
      return;
    }

    // Get the tool executor from the agent loop
    const toolExecutor = agentLoopProp?.getToolExecutor();
    if (!toolExecutor) {
      return;
    }

    // Wire the hooks using the adapter interface (EnterpriseToolCallInfo → ToolCallInfo)
    const coreHooks: CoreEnterpriseHooks = {
      onBeforeToolCall: async (tool: EnterpriseToolCallInfo) => {
        return enterpriseHooks.onBeforeToolCall({
          serverName: tool.serverName ?? "vellum",
          toolName: tool.toolName,
          arguments: tool.arguments,
        });
      },
      onAfterToolCall: async (
        tool: EnterpriseToolCallInfo,
        result: unknown,
        durationMs: number
      ) => {
        return enterpriseHooks.onAfterToolCall(
          {
            serverName: tool.serverName ?? "vellum",
            toolName: tool.toolName,
            arguments: tool.arguments,
          },
          result,
          durationMs
        );
      },
    };
    toolExecutor.setEnterpriseHooks(coreHooks);

    console.debug("[enterprise] Wired enterprise hooks to ToolExecutor");

    return () => {
      // Clear hooks on cleanup
      toolExecutor.setEnterpriseHooks(null);
    };
  }, [enterpriseHooks, agentLoopProp]);

  // T069: Tip engine integration
  const { currentTip, showTip, dismissTip, tipsEnabled } = useTipEngine({
    enabled: true,
    maxTipsPerSession: 5,
    tipIntervalMs: 60000,
  });

  // Note: The tip context useEffect is placed after state declarations below

  // ==========================================================================
  // Adapter Integration - Agent Adapter (T060)
  // ==========================================================================

  // Agent adapter for AgentLoop ↔ Context integration
  // The hook connects AgentLoop events to MessagesContext and ToolsContext
  const agentAdapter = useAgentAdapter({
    clearOnDisconnect: false, // Preserve messages when disconnecting
  });

  // Connect to AgentLoop when provided
  useEffect(() => {
    if (agentLoopProp) {
      agentAdapter.connect(agentLoopProp);
    }
    return () => {
      agentAdapter.disconnect();
    };
  }, [agentLoopProp, agentAdapter]);

  // ==========================================================================
  // Core Services - Tools, Credentials, Sessions
  // ==========================================================================

  const [credentialManager, setCredentialManager] = useState<CredentialManager | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeCredentials = async () => {
      try {
        const manager = await createCredentialManager();
        if (!cancelled) {
          setCredentialManager(manager);
        }
      } catch (error) {
        console.warn(
          "[credentials] Failed to initialize credential manager:",
          error instanceof Error ? error.message : String(error)
        );
      }
    };

    void initializeCredentials();

    return () => {
      cancelled = true;
    };
  }, []);

  const storageManagerRef = useRef<StorageManager | null>(null);
  const sessionListServiceRef = useRef<SessionListService | null>(null);
  const sessionCacheRef = useRef<Session | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeStorage = async () => {
      try {
        const manager = await StorageManager.create();
        const listService = new SessionListService(manager);

        if (!cancelled) {
          storageManagerRef.current = manager;
          sessionListServiceRef.current = listService;
          setStorageReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "[sessions] Failed to initialize session storage:",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    };

    void initializeStorage();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==========================================================================
  // UI State Management
  // ==========================================================================

  // Current coding mode state
  const [currentMode, setCurrentMode] = useState<CodingMode>(_mode);
  const modeManager = useMemo(
    () => createModeManager({ initialMode: _mode, requireSpecConfirmation: true }),
    [_mode]
  );
  const currentModeRef = useRef<CodingMode>(_mode);

  // Modal visibility states
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSessionManager, setShowSessionManager] = useState(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [bannerSeen, setBannerSeenState] = useState(() => getBannerSeen());
  const [bannerSplashComplete, setBannerSplashComplete] = useState(false);

  // Model selection state (moved earlier for onboarding config loading)
  const [currentModel, setCurrentModel] = useState(model);
  const [currentProvider, setCurrentProvider] = useState(provider);

  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  useEffect(() => {
    setModeCommandsManager(modeManager);
    return () => setModeCommandsManager(null);
  }, [modeManager]);

  const bannerOverride = banner ?? false;
  const shouldShowBanner = !showOnboarding && (bannerOverride || !bannerSeen);
  const bannerCycleDurationMs = 1600;
  const bannerUpdateIntervalMs = 16;
  const bannerCycles = 2;
  const bannerDisplayDurationMs = bannerCycleDurationMs * bannerCycles + 300;

  const handleBannerComplete = useCallback(() => {
    setBannerSplashComplete(true);
    if (!bannerSeen) {
      saveBannerSeen(true);
      setBannerSeenState(true);
    }
  }, [bannerSeen]);

  // Check onboarding completion status on mount and load saved config
  useEffect(() => {
    const checkOnboarding = async () => {
      const completed = await CoreOnboardingWizard.isCompleted();
      setIsFirstRun(!completed);

      // Issue 2 Fix: Load saved config if onboarding was completed
      if (completed) {
        const wizard = new CoreOnboardingWizard();
        const loadResult = await wizard.loadState();
        if (loadResult.ok) {
          const config = wizard.generateConfig();
          if (config.provider && config.model) {
            setCurrentProvider(config.provider);
            setCurrentModel(config.model);
          }
        }
      }
    };
    void checkOnboarding();
  }, []);

  // Spec mode phase tracking
  const [specPhase, setSpecPhase] = useState(1);

  // Sidebar visibility states
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarContent, setSidebarContent] = useState<"memory" | "todo" | "tools" | "mcp">(
    "memory"
  );

  // Thinking state for ThinkingBlock
  const [thinkingContent, setThinkingContent] = useState("");

  // ==========================================================================
  // FIX 2: Session Management - Connect Real Session Data
  // ==========================================================================

  // Session list state - loaded from storage
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => createId());

  // Extended token usage state (Fix 2: TUI layer token counting)
  const tokenUsageRef = useRef({
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0,
  });
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0,
  });
  // Per-turn token usage for granular display
  const [turnUsage, setTurnUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  const previousTokenUsageRef = useRef({ inputTokens: 0, outputTokens: 0 });

  const switchToSession = useCallback((sessionId: string, session?: Session) => {
    sessionCacheRef.current = session ?? null;
    previousTokenUsageRef.current = { inputTokens: 0, outputTokens: 0 };
    tokenUsageRef.current = {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
    };
    setTokenUsage({
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
    });
    setTurnUsage({
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    setActiveSessionId(sessionId);
  }, []);

  const refreshSessions = useCallback(async () => {
    const listService = sessionListServiceRef.current;
    if (!listService) {
      return;
    }

    try {
      const recent = await listService.getRecentSessions(50);
      setSessions(
        recent.map((session) => ({
          id: session.id,
          title: session.title,
          timestamp: session.lastActive,
          messageCount: session.messageCount,
          lastMessage: session.summary,
        }))
      );
    } catch (error) {
      console.warn(
        "[sessions] Failed to refresh session list:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, []);

  // Session storage (file-backed with memory fallback while initializing)
  const sessionStorage = useMemo<SessionStorage>(() => {
    const fallbackStorage = createMemorySessionStorage();

    return {
      async save(sessionId, sessionMessages) {
        const storage = storageManagerRef.current;
        if (!storage) {
          await fallbackStorage.save(sessionId, sessionMessages);
          return;
        }

        let session = sessionCacheRef.current;
        if (!session || session.metadata.id !== sessionId) {
          try {
            session = await storage.load(sessionId);
          } catch {
            session = createSession({
              id: sessionId,
              title: "New Session",
              mode: mapCodingModeToSessionMode(currentModeRef.current),
              workingDirectory: process.cwd(),
              messages: [],
            });
          }
        }

        const title =
          sessionMessages.length > 0 ? buildSessionTitle(sessionMessages) : session.metadata.title;
        const summary =
          sessionMessages.length > 0
            ? buildSessionSummary(sessionMessages)
            : session.metadata.summary;
        const tokenCount = tokenUsageRef.current.inputTokens + tokenUsageRef.current.outputTokens;

        const updatedSession = updateSessionMetadata(
          {
            ...session,
            messages: [...sessionMessages],
          },
          {
            title,
            summary,
            lastActive: new Date(),
            workingDirectory: process.cwd(),
            messageCount: sessionMessages.length,
            tokenCount,
            mode: mapCodingModeToSessionMode(currentModeRef.current),
          }
        );

        sessionCacheRef.current = updatedSession;
        await storage.save(updatedSession);
        await refreshSessions();
      },

      async load(sessionId) {
        const storage = storageManagerRef.current;
        if (!storage) {
          return fallbackStorage.load(sessionId);
        }

        try {
          const session = await storage.load(sessionId);
          sessionCacheRef.current = session;
          return session.messages;
        } catch {
          return null;
        }
      },

      async clear(sessionId) {
        const storage = storageManagerRef.current;
        if (!storage) {
          await fallbackStorage.clear(sessionId);
          return;
        }

        try {
          await storage.delete(sessionId);
          if (sessionCacheRef.current?.metadata.id === sessionId) {
            sessionCacheRef.current = null;
          }
          await refreshSessions();
        } catch (error) {
          console.warn(
            "[sessions] Failed to clear session:",
            error instanceof Error ? error.message : String(error)
          );
        }
      },
    };
  }, [refreshSessions]);

  // ==========================================================================
  // Adapter Integration - Session Adapter (T060)
  // ==========================================================================

  // Session adapter for persistence with auto-save
  const {
    saveSession,
    clearSession,
    isSaving: _isSaving,
    isLoading: _isSessionLoading,
    error: sessionError,
  } = useSessionAdapter({
    sessionId: activeSessionId,
    storage: sessionStorage,
    autoSave: true,
    saveDebounceMs: 2000, // Auto-save after 2 seconds of inactivity
    autoLoad: true, // Load session on mount
  });

  const costService = useMemo(
    () => createCostService({ sessionId: activeSessionId }),
    [activeSessionId]
  );

  useEffect(() => {
    setCostCommandsService(costService);
    return () => setCostCommandsService(null);
  }, [costService]);

  // Handle session errors
  useEffect(() => {
    if (sessionError) {
      console.error("Session error:", sessionError.message);
      notifyError(`Session error: ${sessionError.message}`);
    }
  }, [sessionError, notifyError]);

  // Load sessions when storage is ready
  useEffect(() => {
    if (storageReady) {
      void refreshSessions();
    }
  }, [storageReady, refreshSessions]);

  // ==========================================================================
  // FIX 4: Real Todo and Memory Data
  // ==========================================================================

  const { executions } = useTools();

  const loadTodos = useCallback(async (): Promise<readonly TodoItemData[]> => {
    const todoFilePath = join(process.cwd(), ".vellum", "todos.json");

    try {
      const content = await readFile(todoFilePath, { encoding: "utf-8" });
      const parsed = JSON.parse(content) as unknown;

      if (!parsed || typeof parsed !== "object") {
        return [];
      }

      const items = (parsed as { items?: unknown }).items;
      if (!Array.isArray(items)) {
        return [];
      }

      return items
        .map((item): TodoItemData | null => {
          if (!item || typeof item !== "object") return null;

          const id = (item as { id?: unknown }).id;
          const text = (item as { text?: unknown }).text;
          const completed = (item as { completed?: unknown }).completed;
          const createdAt = (item as { createdAt?: unknown }).createdAt;
          const completedAt = (item as { completedAt?: unknown }).completedAt;

          if (
            typeof id !== "number" ||
            typeof text !== "string" ||
            typeof completed !== "boolean"
          ) {
            return null;
          }

          const createdAtStr = typeof createdAt === "string" ? createdAt : new Date().toISOString();
          const completedAtStr = typeof completedAt === "string" ? completedAt : undefined;

          const mapped: TodoItemData = {
            id,
            title: text,
            status: completed ? "completed" : "pending",
            createdAt: createdAtStr,
            completedAt: completedAtStr,
          };

          return mapped;
        })
        .filter((item): item is TodoItemData => item !== null);
    } catch {
      return [];
    }
  }, []);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex memory loading from multiple sources
  const loadMemories = useCallback(async (): Promise<MemoryPanelProps["entries"]> => {
    const projectEntries: Array<MemoryPanelProps["entries"][number]> = [];

    // 1) Project memory service entries (.vellum/memory.json)
    try {
      const service = new ProjectMemoryService();
      await service.initialize(process.cwd());
      try {
        projectEntries.push(...(await service.listEntries()));
      } finally {
        await service.close();
      }
    } catch {
      // Best-effort: ignore load failures and fall back to other sources.
    }

    // 2) save_memory tool entries (.vellum/memory/{namespace}/{key}.json)
    const toolEntries: Array<MemoryPanelProps["entries"][number]> = [];
    const toolMemoryBaseDir = join(process.cwd(), ".vellum", "memory");

    try {
      const namespaceEntries = await readdir(toolMemoryBaseDir, { withFileTypes: true });

      for (const namespaceDirent of namespaceEntries) {
        if (!namespaceDirent.isDirectory()) continue;
        const namespace = namespaceDirent.name;
        const namespaceDir = join(toolMemoryBaseDir, namespace);

        const files = await readdir(namespaceDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          if (!file.name.endsWith(".json")) continue;

          const memoryFilePath = join(namespaceDir, file.name);

          try {
            const content = await readFile(memoryFilePath, { encoding: "utf-8" });
            const parsed = JSON.parse(content) as unknown;

            if (!parsed || typeof parsed !== "object") continue;

            const value = (parsed as { value?: unknown }).value;
            const storedAt = (parsed as { storedAt?: unknown }).storedAt;
            const updatedAt = (parsed as { updatedAt?: unknown }).updatedAt;
            const key = (parsed as { key?: unknown }).key;

            if (typeof value !== "string" || typeof key !== "string") continue;

            const createdAtDate = typeof storedAt === "string" ? new Date(storedAt) : new Date();
            const updatedAtDate =
              typeof updatedAt === "string" ? new Date(updatedAt) : createdAtDate;

            toolEntries.push({
              key: `${namespace}/${key}`,
              type: "context",
              content: value,
              createdAt: createdAtDate,
              updatedAt: updatedAtDate,
              metadata: {
                tags: ["tool:save_memory", `namespace:${namespace}`],
                importance: 0.5,
              },
            });
          } catch {
            // Skip unreadable/invalid entries.
          }
        }
      }
    } catch {
      // No tool memory directory (or unreadable). Ignore.
    }

    const combined: Array<MemoryPanelProps["entries"][number]> = [
      ...projectEntries,
      ...toolEntries,
    ];
    combined.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return combined;
  }, []);

  const { todoItems, memoryEntries, refreshTodos } = useSidebarPanelData({
    sidebarVisible: showSidebar,
    sidebarContent,
    executions,
    loadTodos,
    loadMemories,
  });

  const [isThinking, setIsThinking] = useState(false);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true);

  const effectiveApprovalPolicy = useMemo<ApprovalPolicy>(() => {
    if (_approval) {
      return _approval;
    }
    // Fall back to mode-specific defaults.
    // Using explicit mapping avoids assumptions about ModeManager's internal config.
    return getDefaultApprovalPolicyForMode(currentMode);
  }, [_approval, currentMode]);

  const trustMode = useMemo<TrustMode>(
    () => approvalPolicyToTrustMode(effectiveApprovalPolicy),
    [effectiveApprovalPolicy]
  );

  // ==========================================================================
  // FIX 3: Permission System Integration
  // ==========================================================================

  // Drive tool approvals from ToolsContext (source of truth) and resume the AgentLoop
  // by calling grantPermission()/denyPermission() when the user decides.
  const { activeApproval, activeRiskLevel, approveActive, rejectActive } =
    useToolApprovalController({ agentLoop: agentLoopProp });

  const hasActiveApproval = activeApproval !== null;

  // Update banner state
  const [updateAvailable, setUpdateAvailable] = useState<{
    current: string;
    latest: string;
  } | null>(null);

  // ==========================================================================
  // FIX 5: Mode & Theme Persistence
  // ==========================================================================

  // Load persisted mode and theme on mount
  useEffect(() => {
    // Note: In terminal environment, we use process.env or config files
    // For now, we can use a simple in-memory approach or file-based config
    // This demonstrates the persistence pattern
    const savedMode = process.env.VELLUM_MODE as CodingMode | undefined;
    if (savedMode && ["vibe", "plan", "spec"].includes(savedMode)) {
      setCurrentMode(savedMode);
    }
  }, []);

  // Show onboarding wizard on first run
  useEffect(() => {
    if (isFirstRun) {
      setShowOnboarding(true);
    }
  }, [isFirstRun]);

  // T069: Show contextual tips based on state (placed after state declarations)
  useEffect(() => {
    if (!tipsEnabled) return;

    const context = buildTipContext({
      screen: showOnboarding ? "onboarding" : "main",
      mode: currentMode,
      featuresUsedCount: messages.length,
    });

    showTip(context);
  }, [currentMode, messages.length, showOnboarding, tipsEnabled, showTip]);

  // Ref to track current cancellation controller (T031)
  const cancellationRef = useRef<CancellationController | null>(null);

  // ==========================================================================
  // Hooks Integration
  // ==========================================================================

  // Screen reader accessibility hook
  const { announce } = useScreenReader({
    verbose: false,
  });

  // Input history hook for up/down arrow navigation
  const { addToHistory } = useInputHistory({
    maxItems: 100,
    persistKey: "vellum-command-history",
  });

  // Backtrack sync helpers
  // - suppressBacktrackPushRef prevents the message->backtrack sync effect from creating new
  //   history snapshots when we are *restoring* state (undo/redo/branch switch).
  // - lastMessageCountRef tracks the last "real" message count that we recorded into backtrack.
  const suppressBacktrackPushRef = useRef(false);
  const lastMessageCountRef = useRef(0);

  const applyBacktrackMessages = useCallback(
    (nextMessages: Message[], announcement?: string) => {
      suppressBacktrackPushRef.current = true;
      lastMessageCountRef.current = nextMessages.length;
      setMessages([...nextMessages]);
      if (announcement) {
        announce(announcement);
      }
    },
    [announce, setMessages]
  );

  // Backtrack hook for undo/redo conversation state
  const {
    backtrackState,
    branches,
    push: pushBacktrack,
    undo: undoBacktrack,
    redo: redoBacktrack,
    createBranch: createBacktrackBranch,
    switchBranch: switchBacktrackBranch,
  } = useBacktrack({
    initialState: { messages: [] as Message[] },
    maxHistory: 50,
    enableBranching: true,
    onStateChange: (state, action) => {
      if (action === "undo" || action === "redo") {
        applyBacktrackMessages(
          state.messages,
          `${action === "undo" ? "Undid" : "Redid"} last message`
        );
      }
    },
  });

  const handleCreateBacktrackBranch = useCallback(() => {
    // Match useBacktrack's default naming behavior: `Branch ${Object.keys(state.branches).length}`
    const branchName = `Branch ${branches.length}`;
    createBacktrackBranch(branchName);
    notifyTaskComplete(`Created branch: ${branchName}`);
    announce(`Created branch: ${branchName}`);
  }, [announce, branches.length, createBacktrackBranch, notifyTaskComplete]);

  const handleSwitchBacktrackBranch = useCallback(
    (branchId: string) => {
      const targetBranch = branches.find((b) => b.id === branchId);
      if (!targetBranch) {
        notifyError("Branch not found");
        return;
      }

      // Update the underlying backtrack state first.
      switchBacktrackBranch(branchId);

      // Then apply the target branch's latest snapshot to the messages view.
      const latestSnapshot = targetBranch.history.at(-1);
      const latestState = latestSnapshot?.state as { messages?: Message[] } | undefined;
      const nextMessages = latestState?.messages;
      if (Array.isArray(nextMessages)) {
        applyBacktrackMessages(nextMessages);
      }

      notifyTaskComplete(`Switched to branch: ${targetBranch.name}`);
      announce(`Switched to branch: ${targetBranch.name}`);
    },
    [
      announce,
      applyBacktrackMessages,
      branches,
      notifyError,
      notifyTaskComplete,
      switchBacktrackBranch,
    ]
  );

  // Sync messages with backtrack state
  // Use a ref to track last message count to avoid unnecessary pushBacktrack calls
  useEffect(() => {
    if (suppressBacktrackPushRef.current) {
      suppressBacktrackPushRef.current = false;
      return;
    }

    // Only push backtrack when messages are actually added (not undo/redo/branch restores).
    if (messages.length > lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length;
      pushBacktrack({ messages: [...messages] }, "Message added");
    }
  }, [messages, pushBacktrack]);

  // Mode shortcuts hook (Ctrl+1/2/3)
  useModeShortcuts({
    modeManager,
    enabled:
      !showModeSelector &&
      !showModelSelector &&
      !hasActiveApproval &&
      !showSessionManager &&
      !showOnboarding &&
      !interactivePrompt &&
      !pendingOperation,
    onModeSwitch: (mode, success) => {
      if (success) {
        setCurrentMode(mode);
        announce(`Switched to ${mode} mode`);
      }
    },
    onError: (mode, error) => {
      if (modeManager.isPendingSpecConfirmation()) {
        return;
      }
      announce(`Failed to switch to ${mode}: ${error}`);
    },
  });

  const openSpecConfirmation = useCallback(() => {
    if (interactivePrompt || pendingOperation) {
      return;
    }

    setPromptValue("");
    setInteractivePrompt({
      inputType: "confirm",
      message: "⚠️ Switch to spec mode? This enables a 6-phase structured workflow.",
      defaultValue: "n",
      handler: async (value: string): Promise<CommandResult> => {
        const confirmed = value.toLowerCase() === "y" || value.toLowerCase() === "yes";
        if (!confirmed) {
          modeManager.cancelSpecSwitch();
          return { kind: "success", message: "Mode switch cancelled." };
        }

        const result = await modeManager.confirmSpecMode();
        if (result.success) {
          return { kind: "success", message: "📐 Switched to spec mode." };
        }

        return {
          kind: "error",
          code: "OPERATION_NOT_ALLOWED",
          message: result.reason ?? "Unable to switch to spec mode.",
        };
      },
      onCancel: () => {
        modeManager.cancelSpecSwitch();
        return { kind: "success", message: "Mode switch cancelled." };
      },
    });
  }, [interactivePrompt, pendingOperation, modeManager]);

  useEffect(() => {
    const handleModeChanged = (event: { currentMode: CodingMode }) => {
      setCurrentMode(event.currentMode);
    };

    const handleSpecRequired = () => {
      openSpecConfirmation();
    };

    modeManager.on("mode-changed", handleModeChanged);
    modeManager.on("spec-confirmation-required", handleSpecRequired);

    return () => {
      modeManager.off("mode-changed", handleModeChanged);
      modeManager.off("spec-confirmation-required", handleSpecRequired);
    };
  }, [modeManager, openSpecConfirmation]);

  // Hotkeys hook for global keyboard shortcuts
  const hotkeyDefinitions: HotkeyDefinition[] = useMemo(
    () => [
      {
        key: "m",
        ctrl: true,
        handler: () => setShowModeSelector((prev) => !prev),
        description: "Toggle mode selector",
        scope: "global",
      },
      // Alt+M alternative for VS Code terminal compatibility
      {
        key: "m",
        alt: true,
        handler: () => setShowModeSelector((prev) => !prev),
        description: "Toggle mode selector (Alt)",
        scope: "global",
      },
      {
        key: "k",
        ctrl: true,
        handler: () => setShowSidebar((prev) => !prev),
        description: "Toggle sidebar",
        scope: "global",
      },
      // Alt+K alternative for VS Code terminal compatibility
      {
        key: "k",
        alt: true,
        handler: () => setShowSidebar((prev) => !prev),
        description: "Toggle sidebar (Alt)",
        scope: "global",
      },
      {
        key: "t",
        ctrl: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("todo");
        },
        description: "Show todo panel",
        scope: "global",
      },
      // Alt+T alternative for VS Code terminal compatibility
      {
        key: "t",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("todo");
        },
        description: "Show todo panel (Alt)",
        scope: "global",
      },
      {
        key: "p",
        ctrl: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("memory");
        },
        description: "Show memory panel",
        scope: "global",
      },
      // Alt+P alternative for VS Code terminal compatibility
      {
        key: "p",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("memory");
        },
        description: "Show memory panel (Alt)",
        scope: "global",
      },
      {
        key: "g",
        ctrl: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("tools");
        },
        description: "Show tools panel",
        scope: "global",
      },
      // Alt+G alternative for VS Code terminal compatibility
      {
        key: "g",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("tools");
        },
        description: "Show tools panel (Alt)",
        scope: "global",
      },
      {
        key: "o",
        ctrl: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("mcp");
        },
        description: "Show MCP panel",
        scope: "global",
      },
      // Alt+O alternative for VS Code terminal compatibility
      {
        key: "o",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("mcp");
        },
        description: "Show MCP panel (Alt)",
        scope: "global",
      },
      {
        key: "s",
        ctrl: true,
        handler: () => setShowSessionManager((prev) => !prev),
        description: "Session manager",
        scope: "global",
      },
      {
        key: "z",
        ctrl: true,
        handler: () => {
          if (backtrackState.canUndo) {
            undoBacktrack();
          }
        },
        description: "Undo",
        scope: "global",
      },
      {
        key: "y",
        ctrl: true,
        handler: () => {
          if (backtrackState.canRedo) {
            redoBacktrack();
          }
        },
        description: "Redo",
        scope: "global",
      },
      // Model selector toggle (Ctrl+Shift+M)
      {
        key: "m",
        ctrl: true,
        shift: true,
        handler: () => {
          setShowModelSelector((prev) => !prev);
          announce(showModelSelector ? "Model selector closed" : "Model selector opened");
        },
        description: "Toggle model selector",
        scope: "global",
      },
      // Vim mode toggle (T041)
      {
        key: "v",
        ctrl: true,
        handler: () => {
          setVimEnabled((prev) => !prev);
          vim.toggle();
          announce(vimEnabled ? "Vim mode disabled" : "Vim mode enabled");
        },
        description: "Toggle vim mode",
        scope: "global",
      },
      // Copy mode toggle (T055)
      {
        key: "c",
        ctrl: true,
        shift: true,
        handler: () => {
          if (copyMode.state.active) {
            copyMode.exitCopyMode();
            announce("Copy mode exited");
          } else {
            copyMode.enterCopyMode();
            announce("Copy mode entered - use arrow keys to select");
          }
        },
        description: "Toggle copy mode",
        scope: "global",
      },
      // Alternate buffer toggle for full-screen views (T043)
      {
        key: "f",
        ctrl: true,
        handler: () => {
          alternateBuffer.toggle();
          announce(alternateBuffer.isAlternate ? "Exited fullscreen" : "Entered fullscreen");
        },
        description: "Toggle fullscreen mode",
        scope: "global",
      },
    ],
    [
      backtrackState.canUndo,
      backtrackState.canRedo,
      undoBacktrack,
      redoBacktrack,
      announce,
      vimEnabled,
      vim,
      copyMode,
      alternateBuffer,
      showModelSelector,
    ]
  );

  useHotkeys(hotkeyDefinitions, {
    enabled:
      !showModeSelector &&
      !showModelSelector &&
      !hasActiveApproval &&
      !showSessionManager &&
      !showOnboarding &&
      !interactivePrompt &&
      !pendingOperation,
  });

  // T042: Wire theme context to theme commands
  useEffect(() => {
    setThemeContext(themeContext);
    return () => setThemeContext(null);
  }, [themeContext]);

  // T036: Initialize command registry once on mount
  const [commandRegistryVersion, setCommandRegistryVersion] = useState(0);
  const bumpCommandRegistryVersion = useCallback(
    () => setCommandRegistryVersion((prev) => prev + 1),
    []
  );
  const commandRegistry = useMemo(() => createCommandRegistry(), []);

  // ==========================================================================
  // T061: Plugin System Integration
  // ==========================================================================

  // Plugin initialization state
  // Note: pluginResult can be used for status display (plugin count, errors)
  // Note: pluginsLoading can be used for loading indicator
  const [_pluginResult, setPluginResult] = useState<PluginInitResult | null>(null);
  const [_pluginsLoading, setPluginsLoading] = useState(true);

  // Initialize plugins on mount
  useEffect(() => {
    let cancelled = false;

    const loadPlugins = async () => {
      try {
        const result = await initializePlugins({
          projectRoot: process.cwd(),
          autoTrust: false,
          eagerLoad: false,
          includeBuiltin: true,
          includeUser: true,
          includeGlobal: true,
        });

        if (!cancelled) {
          setPluginResult(result);

          // Register plugin commands into the registry
          registerPluginCommands(commandRegistry, result);
          bumpCommandRegistryVersion();

          // Log plugin loading results
          if (result.errors.length > 0) {
            console.warn(
              `[plugins] Loaded ${result.pluginCount} plugins with ${result.errors.length} errors`
            );
          }

          setPluginsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[plugins] Failed to initialize plugins:", error);
          setPluginsLoading(false);
        }
      }
    };

    void loadPlugins();

    return () => {
      cancelled = true;
      disposePlugins();
    };
  }, [commandRegistry, bumpCommandRegistryVersion]);

  // Load user-defined commands from ~/.vellum/commands
  useEffect(() => {
    let cancelled = false;

    const loadUserCommands = async () => {
      try {
        const result = await registerUserCommands(commandRegistry);
        if (cancelled) return;

        if (result.commands.length > 0) {
          bumpCommandRegistryVersion();
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "[user-commands] Failed to load commands:",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    };

    void loadUserCommands();

    return () => {
      cancelled = true;
    };
  }, [commandRegistry, bumpCommandRegistryVersion]);

  // ==========================================================================
  // T062: LSP Integration
  // ==========================================================================

  // LSP initialization state
  const [_lspResult, setLspResult] = useState<LspIntegrationResult | null>(null);
  const [_lspLoading, setLspLoading] = useState(true);

  // Initialize LSP on mount (non-blocking, graceful fallback)
  useEffect(() => {
    let cancelled = false;

    const loadLsp = async () => {
      try {
        const result = await initializeLsp({
          workspaceRoot: process.cwd(),
          toolRegistry: toolRegistry as LspIntegrationOptions["toolRegistry"],
          autoInstall: false, // Don't auto-install servers
          logger: {
            debug: (msg) => console.debug(`[lsp] ${msg}`),
            info: (msg) => console.info(`[lsp] ${msg}`),
            warn: (msg) => console.warn(`[lsp] ${msg}`),
            error: (msg) => console.error(`[lsp] ${msg}`),
          },
        });

        if (!cancelled) {
          setLspResult(result);

          if (result.success) {
            console.debug(
              `[lsp] Initialized with ${result.toolCount} tools, ${result.availableServers.length} servers available`
            );
          } else {
            // LSP initialization failed - this is non-critical
            console.debug(`[lsp] Initialization skipped: ${result.error}`);
          }

          setLspLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          // LSP is optional - log but don't fail
          console.debug("[lsp] Failed to initialize (non-critical):", error);
          setLspLoading(false);
        }
      }
    };

    void loadLsp();

    return () => {
      cancelled = true;
      void disposeLsp();
    };
  }, [toolRegistry]);

  const handleCommandEvent = useCallback(
    (event: string, data?: unknown) => {
      if (event === "app:exit") {
        exit();
        return;
      }

      if (event === "session:resume") {
        const payload = data as ResumeSessionEventData | undefined;
        if (payload?.session) {
          switchToSession(payload.session.metadata.id, payload.session);
          setMessages([...toUIMessages(payload.session.messages)]);
        }
      }
    },
    [exit, setMessages, switchToSession]
  );

  const contextProviderRef = useRef<DefaultContextProvider | null>(null);

  // T036: Create command executor with context provider
  const commandExecutor = useMemo(() => {
    if (!credentialManager) {
      return null;
    }

    const contextProvider = createContextProvider({
      session: {
        id: activeSessionId,
        provider: currentProvider,
        cwd: process.cwd(),
      },
      credentials: credentialManager,
      toolRegistry,
      emit: handleCommandEvent,
    });

    contextProviderRef.current = contextProvider as DefaultContextProvider;
    return new CommandExecutor(commandRegistry, contextProvider);
  }, [
    commandRegistry,
    credentialManager,
    toolRegistry,
    activeSessionId,
    currentProvider,
    handleCommandEvent,
  ]);

  useEffect(() => {
    if (!contextProviderRef.current) {
      return;
    }

    contextProviderRef.current.updateSession({
      id: activeSessionId,
      provider: currentProvider,
      cwd: process.cwd(),
    });
  }, [activeSessionId, currentProvider]);

  useEffect(() => {
    if (!commandExecutor) {
      return;
    }

    try {
      const batchWithExecutor = createBatchCommand(commandExecutor);
      commandRegistry.unregister(batchWithExecutor.name);
      commandRegistry.register(batchWithExecutor);
      bumpCommandRegistryVersion();
    } catch (error) {
      console.warn(
        "[commands] Failed to register batch command:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [commandExecutor, commandRegistry, bumpCommandRegistryVersion]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const storage = storageManagerRef.current;
    const listService = sessionListServiceRef.current;

    if (!storage || !listService) {
      return;
    }

    try {
      const resumeWithStorage = createResumeCommand(storage, listService);
      commandRegistry.unregister(resumeWithStorage.name);
      commandRegistry.register(resumeWithStorage);
      bumpCommandRegistryVersion();
    } catch (error) {
      console.warn(
        "[commands] Failed to register resume command:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [storageReady, commandRegistry, bumpCommandRegistryVersion]);

  // Register shutdown cleanup on mount (T030)
  useEffect(() => {
    setShutdownCleanup(() => {
      if (cancellationRef.current) {
        cancellationRef.current.cancel("shutdown");
      }
      // Save session on shutdown
      void saveSession();
    });

    return () => {
      setShutdownCleanup(null);
    };
  }, [saveSession]);

  const handleCommandResult = useCallback(
    async function process(result: CommandResult): Promise<void> {
      switch (result.kind) {
        case "success": {
          if (result.message) {
            addMessage({ role: "assistant", content: result.message });
          }
          if (result.clearScreen) {
            clearMessages();
            void clearSession();
          }
          break;
        }

        case "error": {
          addMessage({
            role: "assistant",
            content: `[x] ${result.message}${
              result.suggestions ? `\n   Did you mean: ${result.suggestions.join(", ")}?` : ""
            }`,
          });
          break;
        }

        case "interactive": {
          setPromptValue("");
          setInteractivePrompt(result.prompt);
          break;
        }

        case "pending": {
          setPendingOperation(result.operation);
          try {
            const resolved = await result.operation.promise;
            await process(resolved);
          } catch (error) {
            addMessage({
              role: "assistant",
              content: `[x] ${error instanceof Error ? error.message : String(error)}`,
            });
          } finally {
            setPendingOperation(null);
          }
          break;
        }
      }
    },
    [addMessage, clearMessages, clearSession]
  );

  const handlePromptSubmit = useCallback(async () => {
    if (!interactivePrompt) {
      return;
    }

    const prompt = interactivePrompt;
    const input = promptValue.trim();
    const resolvedValue = input === "" ? (prompt.defaultValue ?? "") : input;

    setInteractivePrompt(null);
    setPromptValue("");

    try {
      const result = await prompt.handler(resolvedValue);
      await handleCommandResult(result);
    } catch (error) {
      addMessage({
        role: "assistant",
        content: `[x] ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [interactivePrompt, promptValue, handleCommandResult, addMessage]);

  const handlePromptCancel = useCallback(() => {
    if (!interactivePrompt) {
      return;
    }

    const prompt = interactivePrompt;
    setInteractivePrompt(null);
    setPromptValue("");

    if (prompt.onCancel) {
      void handleCommandResult(prompt.onCancel());
    }
  }, [interactivePrompt, handleCommandResult]);

  // Handle Ctrl+C and ESC for cancellation (T031)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler must process multiple input types in a single callback for proper event handling
  useInput((inputChar, key) => {
    if (interactivePrompt) {
      if (key.escape) {
        handlePromptCancel();
      }
      return;
    }

    if (pendingOperation) {
      if (key.escape && pendingOperation.cancel) {
        pendingOperation.cancel();
        setPendingOperation(null);
      }
      return;
    }

    // Handle vim mode key processing (T041)
    if (vimEnabled && vim.enabled) {
      const vimAction = vim.handleKey(inputChar, { ctrl: key.ctrl, shift: key.shift });
      if (vimAction) {
        // Vim action was processed - announce mode changes
        if (vimAction.type === "mode") {
          announce(`Vim: ${vimAction.target} mode`);
        }
        // Don't process further if vim handled it (unless it's a mode exit to NORMAL)
        if (vimAction.type !== "mode" || vimAction.target !== "NORMAL") {
          return;
        }
      }
    }

    // Handle copy mode navigation (T055)
    if (copyMode.state.active) {
      if (key.escape) {
        copyMode.exitCopyMode();
        announce("Copy mode exited");
        return;
      }
      if (key.upArrow) {
        copyMode.expandSelection("up");
        return;
      }
      if (key.downArrow) {
        copyMode.expandSelection("down");
        return;
      }
      if (key.leftArrow) {
        copyMode.expandSelection("left");
        return;
      }
      if (key.rightArrow) {
        copyMode.expandSelection("right");
        return;
      }
      // Enter to copy selection
      if (key.return) {
        // Get content as 2D array from messages
        const content = messages.map((m) => m.content.split(""));
        void copyMode.copySelection(content).then(() => {
          announce("Selection copied to clipboard");
          copyMode.exitCopyMode();
        });
        return;
      }
    }

    // ESC - cancel operation, exit copy mode, or exit app
    if (key.escape) {
      if (isLoading && cancellationRef.current) {
        // Cancel running operation
        cancellationRef.current.cancel("user_escape");
        setIsLoading(false);
        addMessage({ role: "assistant", content: "[Operation cancelled]" });
      } else {
        // No operation running, exit app
        exit();
      }
      return;
    }

    // Ctrl+C - cancel operation (doesn't exit when operation is running)
    if (key.ctrl && inputChar === "c") {
      if (isLoading && cancellationRef.current) {
        cancellationRef.current.cancel("user_ctrl_c");
        setIsLoading(false);
        addMessage({ role: "assistant", content: "[Operation cancelled by Ctrl+C]" });
      }
      // Note: If not loading, let the default Ctrl+C behavior (exit) happen
      return;
    }
  });

  // T038: Handle slash command detection and execution
  const handleSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim().startsWith("/")) {
        return false; // Not a slash command
      }

      if (!commandExecutor) {
        addMessage({
          role: "assistant",
          content: "[x] Command system not ready yet. Please try again in a moment.",
        });
        return true;
      }

      try {
        const result = await commandExecutor.execute(text);
        await handleCommandResult(result);
      } catch (error) {
        addMessage({
          role: "assistant",
          content: `[x] ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      return true; // Was a slash command
    },
    [commandExecutor, addMessage, handleCommandResult]
  );

  // Handle message submission (for CommandInput onMessage)
  const handleMessage = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex message handling with multiple code paths
    async (text: string) => {
      if (!text.trim()) return;

      // Fix 4: Reset turn usage when a new turn starts
      setTurnUsage({
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });

      // Apply coding-mode handler transformations (vibe/plan/spec) and keep UI phase
      // progress in sync with SpecModeHandler's injected metadata.
      let processedText = text;
      try {
        const handlerResult = await modeManager.processMessage({
          content: text,
          timestamp: Date.now(),
        });

        const modified = handlerResult.modifiedMessage;
        if (modified?.content) {
          processedText = modified.content;
        }

        const phaseNumber = modified?.metadata?.phaseNumber;
        if (typeof phaseNumber === "number" && Number.isFinite(phaseNumber)) {
          setSpecPhase(phaseNumber);
        } else if (currentMode !== "spec") {
          // Keep PhaseProgressIndicator stable when leaving spec mode.
          setSpecPhase(1);
        }

        if (handlerResult.requiresCheckpoint) {
          // Pause downstream processing until the user approves the checkpoint.
          setPromptValue("");
          setInteractivePrompt({
            inputType: "confirm",
            message: "Checkpoint required. Continue?",
            defaultValue: "n",
            handler: async (value: string): Promise<CommandResult> => {
              const confirmed = value.toLowerCase() === "y" || value.toLowerCase() === "yes";
              if (!confirmed) {
                return { kind: "success", message: "Checkpoint declined." };
              }

              // Advance plan/spec handler state when possible.
              const checkpointResult = await modeManager.processMessage({
                content: "yes",
                timestamp: Date.now(),
                metadata: { advancePhase: true },
              });

              const checkpointPhase = checkpointResult.modifiedMessage?.metadata?.phaseNumber;
              if (typeof checkpointPhase === "number" && Number.isFinite(checkpointPhase)) {
                setSpecPhase(checkpointPhase);
              }

              return { kind: "success", message: "Checkpoint approved." };
            },
            onCancel: () => ({ kind: "success", message: "Checkpoint cancelled." }),
          });
          return;
        }
      } catch (error) {
        // Mode handling should never block primary chat; fall back to raw text.
        console.warn(
          "[mode] Failed to process message through mode handler:",
          error instanceof Error ? error.message : String(error)
        );
      }

      // Add to input history
      addToHistory(processedText);

      addMessage({ role: "user", content: processedText });

      // Announce for screen reader
      announce(`You said: ${processedText}`);

      setIsLoading(true);
      setIsThinking(true);
      setThinkingContent("Processing your request...");

      // Use AgentLoop if available (T038)
      if (agentLoopHook) {
        // Wire cancellation to AgentLoop
        cancellationRef.current = {
          cancel: (reason) => agentLoopHook.cancel(reason),
          get isCancelled() {
            return agentLoopHook.status === "cancelled";
          },
        };

        try {
          await agentLoopHook.run(processedText);
          // Sync messages from AgentLoop to local state
          const agentMessages = agentLoopHook.messages.map((m) => createMessage(m.role, m.content));
          setMessages(agentMessages);
          // Notify on completion (T059)
          notifyTaskComplete("Response received");
          announce("Response received");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          notifyError(errorMsg);
          addMessage({ role: "assistant", content: `[x] Error: ${errorMsg}` });
        } finally {
          setIsThinking(false);
          setThinkingContent("");
          setIsLoading(false);
          cancellationRef.current = null;
        }
        return;
      }

      // Fallback: Create a simple cancellation controller for simulated operation
      let cancelled = false;
      cancellationRef.current = {
        cancel: (reason) => {
          cancelled = true;
          console.log(`[Cancel] ${reason ?? "user request"}`);
        },
        get isCancelled() {
          return cancelled;
        },
      };

      // Simulated response (with cancellation check) - fallback when no AgentLoop
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          if (!cancelled) {
            setThinkingContent("Generating response...");
            setTimeout(() => {
              if (!cancelled) {
                addMessage({ role: "assistant", content: `[Echo] ${processedText}` });
                notifyTaskComplete("Response received");
                announce("Response received");
              }
              setIsThinking(false);
              setThinkingContent("");
              resolve();
            }, 300);
          } else {
            resolve();
          }
        }, 500);

        // Check for cancellation
        const checkInterval = setInterval(() => {
          if (cancelled) {
            clearTimeout(timeoutId);
            clearInterval(checkInterval);
            setIsThinking(false);
            setThinkingContent("");
            resolve();
          }
        }, 50);
      });

      setIsLoading(false);
      cancellationRef.current = null;
    },
    [
      addToHistory,
      addMessage,
      announce,
      agentLoopHook,
      currentMode,
      modeManager,
      notifyTaskComplete,
      notifyError,
      setMessages,
    ]
  );

  // Handle slash command submission (for CommandInput onCommand)
  const handleCommand = useCallback(
    async (command: SlashCommand) => {
      // Add to history
      addToHistory(command.raw);

      // Execute via the command executor
      const wasCommand = await handleSlashCommand(command.raw);
      if (!wasCommand) {
        addMessage({ role: "assistant", content: `Unknown command: /${command.name}` });
      }
    },
    [addToHistory, addMessage, handleSlashCommand]
  );

  // Category order and labels for grouped slash command menu
  const categoryOrder = useMemo(
    () => ["system", "session", "navigation", "tools", "config", "auth", "debug"] as const,
    []
  );

  const categoryLabels = useMemo(
    () => ({
      system: "System",
      session: "Session",
      navigation: "Navigation",
      tools: "Tools",
      config: "Config",
      auth: "Authentication",
      debug: "Debug",
    }),
    []
  );

  // Get available command options for CommandInput autocomplete (structured with categories)
  const commandOptions = useMemo((): AutocompleteOption[] => {
    // Recompute when commands are registered dynamically (plugins/user commands).
    void commandRegistryVersion;

    const options: AutocompleteOption[] = [];
    const seenNames = new Set<string>();

    for (const cmd of commandRegistry.list()) {
      // Skip aliases as separate entries - they clutter the menu
      // (aliases still work when typed directly)
      if (!seenNames.has(cmd.name)) {
        seenNames.add(cmd.name);
        options.push({
          name: cmd.name,
          description: cmd.description,
          category: cmd.category,
        });
      }
    }

    return options;
  }, [commandRegistry, commandRegistryVersion]);

  // Get subcommands for a command (for two-level autocomplete)
  const getSubcommands = useCallback(
    (commandName: string): AutocompleteOption[] | undefined => {
      const cmd = commandRegistry.get(commandName);
      if (!cmd?.subcommands || cmd.subcommands.length === 0) {
        return undefined;
      }
      return cmd.subcommands.map((sub) => ({
        name: sub.name,
        description: sub.description,
      }));
    },
    [commandRegistry]
  );

  // Handle permission dialog responses
  const handleApprove = useCallback(() => {
    if (!activeApproval) {
      return;
    }

    announce("Tool execution approved");
    approveActive("once");
  }, [activeApproval, approveActive, announce]);

  const handleApproveAlways = useCallback(() => {
    if (!activeApproval) {
      return;
    }

    announce("Tool execution approved (always)");
    approveActive("always");
  }, [activeApproval, approveActive, announce]);

  const handleReject = useCallback(() => {
    if (!activeApproval) {
      return;
    }

    announce("Tool execution rejected");
    rejectActive();
  }, [activeApproval, rejectActive, announce]);

  const requestModeSwitch = useCallback(
    async (mode: CodingMode) => {
      const result = await modeManager.switchMode(mode);

      if (result.success) {
        setShowModeSelector(false);
        process.env.VELLUM_MODE = mode;
        announce(`Mode changed to ${mode}`);
        return;
      }

      if (result.requiresConfirmation) {
        setShowModeSelector(false);
        openSpecConfirmation();
        return;
      }

      addMessage({
        role: "assistant",
        content: `Unable to switch to ${mode}: ${result.reason ?? "Unknown error"}`,
      });
    },
    [modeManager, openSpecConfirmation, addMessage, announce]
  );

  // Handle mode selection with persistence (FIX 5)
  const handleModeSelect = useCallback(
    (mode: CodingMode) => {
      void requestModeSwitch(mode);
    },
    [requestModeSwitch]
  );

  // Handle model selection
  const handleModelSelect = useCallback(
    (selectedProvider: string, selectedModel: string) => {
      setCurrentProvider(selectedProvider);
      setCurrentModel(selectedModel);
      setShowModelSelector(false);
      announce(`Model changed to ${selectedModel} (${selectedProvider})`);
    },
    [announce]
  );

  useEffect(() => {
    setModelCommandConfig(currentProvider, currentModel, handleModelSelect);
  }, [currentProvider, currentModel, handleModelSelect]);

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(
    (result: { provider: string; mode: string; credentialsConfigured: boolean }) => {
      // Note: OnboardingWizard.saveConfig() already persists completed state
      setIsFirstRun(false);
      setShowOnboarding(false);
      setCurrentProvider(result.provider);
      // Task 4: Sync model with provider selection
      const defaultModel = getDefaultModelForProvider(result.provider);
      setCurrentModel(defaultModel);
      setCurrentMode(result.mode as CodingMode);
      void modeManager.forceSwitch(result.mode as CodingMode);
      // Task 5: Persist configuration (environment-based for now, config file in production)
      process.env.VELLUM_PROVIDER = result.provider;
      process.env.VELLUM_MODEL = defaultModel;
      process.env.VELLUM_MODE = result.mode;
      announce("Welcome to Vellum! Onboarding complete.");
    },
    [announce, modeManager]
  );

  // Get context window for the current model
  const contextWindow = useMemo(
    () => getContextWindow(currentProvider, currentModel),
    [currentProvider, currentModel]
  );

  // ==========================================================================
  // FIX 1: Subscribe to AgentLoop usage events for real token counting
  // ==========================================================================
  useEffect(() => {
    if (!agentLoopProp) {
      return;
    }

    // Handle real usage events from AgentLoop
    const handleUsage = (usage: {
      inputTokens: number;
      outputTokens: number;
      thinkingTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }) => {
      // Update turn usage (per-turn tracking)
      setTurnUsage({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        thinkingTokens: usage.thinkingTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      });

      // Update cumulative usage
      setTokenUsage((prev) => {
        const newUsage = {
          inputTokens: prev.inputTokens + usage.inputTokens,
          outputTokens: prev.outputTokens + usage.outputTokens,
          thinkingTokens: prev.thinkingTokens + (usage.thinkingTokens ?? 0),
          cacheReadTokens: prev.cacheReadTokens + (usage.cacheReadTokens ?? 0),
          cacheWriteTokens: prev.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
          totalCost: calculateCost(
            currentProvider,
            currentModel,
            prev.inputTokens + usage.inputTokens,
            prev.outputTokens + usage.outputTokens
          ),
        };
        tokenUsageRef.current = newUsage;
        return newUsage;
      });

      // Track usage in cost service
      costService.trackUsage(
        {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
          thinkingTokens: usage.thinkingTokens ?? 0,
        },
        currentModel,
        currentProvider
      );
    };

    agentLoopProp.on("usage", handleUsage);

    return () => {
      agentLoopProp.off("usage", handleUsage);
    };
  }, [agentLoopProp, currentModel, currentProvider, costService]);

  // Fallback: Update token usage from messages when no AgentLoop (simulated)
  useEffect(() => {
    // Only use fallback when no agentLoop is provided
    if (agentLoopProp) {
      return;
    }

    // Approximate token count: ~4 chars per token (fallback only)
    const inputChars = messages
      .filter((m) => m.role === "user")
      .reduce((sum, m) => sum + m.content.length, 0);
    const outputChars = messages
      .filter((m) => m.role === "assistant")
      .reduce((sum, m) => sum + m.content.length, 0);

    const inputTokens = Math.ceil(inputChars / 4);
    const outputTokens = Math.ceil(outputChars / 4);
    const totalCost = calculateCost(currentProvider, currentModel, inputTokens, outputTokens);

    setTokenUsage((prev) => ({
      ...prev,
      inputTokens,
      outputTokens,
      totalCost,
    }));
  }, [messages, currentProvider, currentModel, agentLoopProp]);

  // Calculate total tokens for StatusBar
  const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

  const dismissUpdateBanner = useCallback(() => {
    setUpdateAvailable(null);
  }, []);

  const cancelOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const closeSessionManager = useCallback(() => {
    setShowSessionManager(false);
  }, []);

  const handleSessionSelected = useCallback(
    (id: string) => {
      announce(`Selected session: ${id}`);
      switchToSession(id);
      setShowSessionManager(false);
    },
    [announce, switchToSession]
  );

  const loadSessionPreviewMessages = useCallback(
    async (sessionId: string): Promise<readonly SessionPreviewMessage[] | null> => {
      const storage = storageManagerRef.current;
      if (!storage) {
        return null;
      }

      try {
        const session = await storage.load(sessionId);
        const messages = session.messages;

        // Keep preview lightweight: show last few messages only.
        const tail = messages.slice(Math.max(0, messages.length - 6));

        return tail
          .map((message) => {
            const content = getTextContent(message).trim();
            if (!content) {
              return null;
            }

            const role: SessionPreviewMessage["role"] =
              message.role === "tool_result"
                ? "tool"
                : message.role === "user"
                  ? "user"
                  : message.role === "assistant"
                    ? "assistant"
                    : "system";

            return {
              id: message.id,
              role,
              content,
              timestamp: new Date(message.metadata.createdAt),
            };
          })
          .filter((msg): msg is NonNullable<typeof msg> => msg !== null);
      } catch {
        return null;
      }
    },
    []
  );

  const promptPlaceholder = useMemo(() => {
    if (!interactivePrompt) {
      return "";
    }

    if (interactivePrompt.placeholder) {
      return interactivePrompt.placeholder;
    }

    if (interactivePrompt.inputType === "confirm") {
      return interactivePrompt.defaultValue?.toLowerCase() === "y" ? "Y/n" : "y/N";
    }

    if (interactivePrompt.inputType === "select" && interactivePrompt.options?.length) {
      return `Choose 1-${interactivePrompt.options.length}`;
    }

    return "";
  }, [interactivePrompt]);

  // Get agent level from AgentConfig via registry
  const agentName = BUILTIN_CODING_MODES[currentMode].agentName;
  const agentConfig = agentName ? BuiltinAgentRegistry.getInstance().get(agentName) : undefined;
  const agentLevel = (agentConfig?.level ?? 2) as 0 | 1 | 2;

  return (
    <AppContentView
      agentLevel={agentLevel}
      agentName={agentName}
      announce={announce}
      activeApproval={activeApproval}
      activeRiskLevel={activeRiskLevel}
      activeSessionId={activeSessionId}
      backtrackState={backtrackState}
      bannerCycleDurationMs={bannerCycleDurationMs}
      bannerCycles={bannerCycles}
      bannerDisplayDurationMs={bannerDisplayDurationMs}
      bannerSplashComplete={bannerSplashComplete}
      bannerUpdateIntervalMs={bannerUpdateIntervalMs}
      branches={branches}
      cancelOnboarding={cancelOnboarding}
      closeSessionManager={closeSessionManager}
      commandOptions={commandOptions}
      getSubcommands={getSubcommands}
      categoryOrder={categoryOrder}
      categoryLabels={categoryLabels}
      contextWindow={contextWindow}
      currentMode={currentMode}
      currentModel={currentModel}
      currentProvider={currentProvider}
      currentTip={currentTip}
      dismissTip={dismissTip}
      dismissUpdateBanner={dismissUpdateBanner}
      handleApprove={handleApprove}
      handleApproveAlways={handleApproveAlways}
      handleBannerComplete={handleBannerComplete}
      handleCommand={handleCommand}
      handleCreateBacktrackBranch={handleCreateBacktrackBranch}
      handleMessage={handleMessage}
      handleModeSelect={handleModeSelect}
      handleModelSelect={handleModelSelect}
      handleOnboardingComplete={handleOnboardingComplete}
      handlePromptSubmit={handlePromptSubmit}
      handleReject={handleReject}
      handleSessionSelected={handleSessionSelected}
      handleSwitchBacktrackBranch={handleSwitchBacktrackBranch}
      interactivePrompt={interactivePrompt}
      loadSessionPreviewMessages={loadSessionPreviewMessages}
      isLoading={isLoading}
      isThinking={isThinking}
      memoryEntries={memoryEntries}
      messages={messages}
      pendingOperation={pendingOperation}
      promptPlaceholder={promptPlaceholder}
      promptValue={promptValue}
      setPromptValue={setPromptValue}
      setThinkingCollapsed={setThinkingCollapsed}
      sessions={sessions}
      shouldShowBanner={shouldShowBanner}
      showModeSelector={showModeSelector}
      showModelSelector={showModelSelector}
      showOnboarding={showOnboarding}
      showSessionManager={showSessionManager}
      showSidebar={showSidebar}
      sidebarContent={sidebarContent}
      specPhase={specPhase}
      themeContext={themeContext}
      thinkingCollapsed={thinkingCollapsed}
      thinkingContent={thinkingContent}
      todoItems={todoItems}
      refreshTodos={refreshTodos}
      toolRegistry={toolRegistry}
      tokenUsage={tokenUsage}
      turnUsage={turnUsage}
      totalTokens={totalTokens}
      trustMode={trustMode}
      undoBacktrack={undoBacktrack}
      updateAvailable={updateAvailable}
      redoBacktrack={redoBacktrack}
    />
  );
}

type ThemeContextValue = ReturnType<typeof useTheme>;
type TipValue = ReturnType<typeof useTipEngine>["currentTip"];
type ToolApprovalState = ReturnType<typeof useToolApprovalController>;

interface AppContentViewProps {
  readonly agentLevel: 0 | 1 | 2;
  readonly agentName?: string;
  readonly announce: (message: string) => void;
  readonly activeApproval: ToolApprovalState["activeApproval"];
  readonly activeRiskLevel: ToolApprovalState["activeRiskLevel"];
  readonly activeSessionId: string;
  readonly backtrackState: ReturnType<typeof useBacktrack>["backtrackState"];
  readonly bannerCycleDurationMs: number;
  readonly bannerCycles: number;
  readonly bannerDisplayDurationMs: number;
  readonly bannerSplashComplete: boolean;
  readonly bannerUpdateIntervalMs: number;
  readonly branches: ReturnType<typeof useBacktrack>["branches"];
  readonly cancelOnboarding: () => void;
  readonly closeSessionManager: () => void;
  readonly commandOptions: readonly AutocompleteOption[];
  readonly getSubcommands: (commandName: string) => AutocompleteOption[] | undefined;
  readonly categoryOrder: readonly string[];
  readonly categoryLabels: Record<string, string>;
  readonly contextWindow: number;
  readonly currentMode: CodingMode;
  readonly currentModel: string;
  readonly currentProvider: string;
  readonly currentTip: TipValue;
  readonly dismissTip: () => void;
  readonly dismissUpdateBanner: () => void;
  readonly handleApprove: () => void;
  readonly handleApproveAlways: () => void;
  readonly handleBannerComplete: () => void;
  readonly handleCommand: (command: SlashCommand) => void;
  readonly handleCreateBacktrackBranch: () => void;
  readonly handleMessage: (text: string) => void;
  readonly handleModeSelect: (mode: CodingMode) => void;
  readonly handleModelSelect: (selectedProvider: string, selectedModel: string) => void;
  readonly handleOnboardingComplete: (result: {
    provider: string;
    mode: string;
    credentialsConfigured: boolean;
  }) => void;
  readonly handlePromptSubmit: () => void;
  readonly handleReject: () => void;
  readonly handleSessionSelected: (id: string) => void;
  readonly handleSwitchBacktrackBranch: (branchId: string) => void;
  readonly interactivePrompt: InteractivePrompt | null;
  readonly loadSessionPreviewMessages: (
    sessionId: string
  ) => Promise<readonly SessionPreviewMessage[] | null>;
  readonly isLoading: boolean;
  readonly isThinking: boolean;
  readonly memoryEntries: MemoryPanelProps["entries"];
  readonly messages: readonly Message[];
  readonly pendingOperation: AsyncOperation | null;
  readonly promptPlaceholder: string;
  readonly promptValue: string;
  readonly setPromptValue: (value: string) => void;
  readonly setThinkingCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  readonly sessions: SessionMetadata[];
  readonly shouldShowBanner: boolean;
  readonly showModeSelector: boolean;
  readonly showModelSelector: boolean;
  readonly showOnboarding: boolean;
  readonly showSessionManager: boolean;
  readonly showSidebar: boolean;
  readonly sidebarContent: "memory" | "todo" | "tools" | "mcp";
  readonly specPhase: number;
  readonly themeContext: ThemeContextValue;
  readonly thinkingCollapsed: boolean;
  readonly thinkingContent: string;
  readonly todoItems: readonly TodoItemData[];
  readonly refreshTodos: () => void;
  readonly toolRegistry: ToolRegistry;
  readonly tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalCost: number;
  };
  readonly turnUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  readonly totalTokens: number;
  readonly trustMode: TrustMode;
  readonly undoBacktrack: () => void;
  readonly redoBacktrack: () => void;
  readonly updateAvailable: { current: string; latest: string } | null;
}

function renderSidebarContent({
  announce,
  showSidebar,
  sidebarContent,
  todoItems,
  refreshTodos,
  memoryEntries,
  toolRegistry,
}: {
  readonly announce: (message: string) => void;
  readonly showSidebar: boolean;
  readonly sidebarContent: "memory" | "todo" | "tools" | "mcp";
  readonly todoItems: readonly TodoItemData[];
  readonly refreshTodos: () => void;
  readonly memoryEntries: MemoryPanelProps["entries"];
  readonly toolRegistry: ToolRegistry;
}): React.ReactNode | undefined {
  if (!showSidebar) return undefined;

  if (sidebarContent === "todo") {
    return (
      <TodoPanel
        items={todoItems}
        isFocused={showSidebar}
        maxHeight={20}
        onRefresh={refreshTodos}
        onActivateItem={(item) => {
          announce(`Selected: ${item.title}`);
        }}
      />
    );
  }

  if (sidebarContent === "tools") {
    return <ToolsPanel isFocused={showSidebar} maxItems={20} />;
  }

  if (sidebarContent === "mcp") {
    return <McpPanel isFocused={showSidebar} toolRegistry={toolRegistry} />;
  }

  return <MemoryPanel entries={memoryEntries} isFocused={showSidebar} maxHeight={20} />;
}

interface AppOverlaysProps {
  readonly activeApproval: ToolApprovalState["activeApproval"];
  readonly activeRiskLevel: ToolApprovalState["activeRiskLevel"];
  readonly activeSessionId: string;
  readonly closeSessionManager: () => void;
  readonly currentMode: CodingMode;
  readonly currentModel: string;
  readonly currentProvider: string;
  readonly dismissUpdateBanner: () => void;
  readonly handleApprove: () => void;
  readonly handleApproveAlways: () => void;
  readonly handleModeSelect: (mode: CodingMode) => void;
  readonly handleModelSelect: (selectedProvider: string, selectedModel: string) => void;
  readonly handlePromptSubmit: () => void;
  readonly handleReject: () => void;
  readonly handleSessionSelected: (id: string) => void;
  readonly interactivePrompt: InteractivePrompt | null;
  readonly loadSessionPreviewMessages: (
    sessionId: string
  ) => Promise<readonly import("./tui/components/session/types.js").SessionPreviewMessage[] | null>;
  readonly pendingOperation: AsyncOperation | null;
  readonly promptPlaceholder: string;
  readonly promptValue: string;
  readonly setPromptValue: (value: string) => void;
  readonly sessions: SessionMetadata[];
  readonly showModeSelector: boolean;
  readonly showModelSelector: boolean;
  readonly showSessionManager: boolean;
  readonly themeContext: ThemeContextValue;
  readonly updateAvailable: { current: string; latest: string } | null;
}

function AppOverlays({
  activeApproval,
  activeRiskLevel,
  activeSessionId,
  closeSessionManager,
  currentMode,
  currentModel,
  currentProvider,
  dismissUpdateBanner,
  handleApprove,
  handleApproveAlways,
  handleModeSelect,
  handleModelSelect,
  handlePromptSubmit,
  handleReject,
  handleSessionSelected,
  interactivePrompt,
  loadSessionPreviewMessages,
  pendingOperation,
  promptPlaceholder,
  promptValue,
  setPromptValue,
  sessions,
  showModeSelector,
  showModelSelector,
  showSessionManager,
  themeContext,
  updateAvailable,
}: AppOverlaysProps): React.JSX.Element {
  return (
    <>
      {updateAvailable && (
        <UpdateBanner
          currentVersion={updateAvailable.current}
          latestVersion={updateAvailable.latest}
          dismissible
          onDismiss={dismissUpdateBanner}
          compact
        />
      )}

      {showModeSelector && (
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={10}
          borderStyle="round"
          borderColor={themeContext.theme.colors.info}
          padding={1}
        >
          <ModeSelector
            currentMode={currentMode}
            onSelect={handleModeSelect}
            isActive={showModeSelector}
            showDescriptions
          />
        </Box>
      )}

      {showSessionManager && (
        <Box
          position="absolute"
          marginTop={3}
          marginLeft={5}
          borderStyle="round"
          borderColor={themeContext.theme.colors.primary}
          padding={1}
        >
          <SessionPicker
            sessions={sessions}
            activeSessionId={activeSessionId}
            loadPreviewMessages={loadSessionPreviewMessages}
            onSelect={handleSessionSelected}
            onClose={closeSessionManager}
            isOpen={showSessionManager}
          />
        </Box>
      )}

      {activeApproval && (
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={10}
          borderStyle="double"
          borderColor={themeContext.theme.colors.warning}
          padding={1}
        >
          <PermissionDialog
            execution={activeApproval}
            riskLevel={activeRiskLevel}
            onApprove={handleApprove}
            onApproveAlways={handleApproveAlways}
            onReject={handleReject}
            isFocused
          />
        </Box>
      )}

      {showModelSelector && (
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={10}
          borderStyle="round"
          borderColor={themeContext.theme.colors.success}
          padding={1}
        >
          <ModelSelector
            currentModel={currentModel}
            currentProvider={currentProvider}
            onSelect={handleModelSelect}
            isActive={showModelSelector}
            showDetails
          />
        </Box>
      )}

      {interactivePrompt && (
        <Box
          position="absolute"
          marginTop={4}
          marginLeft={8}
          borderStyle="round"
          borderColor={themeContext.theme.colors.info}
          padding={1}
          flexDirection="column"
          minWidth={50}
        >
          <Text>{interactivePrompt.message}</Text>
          {interactivePrompt.inputType === "select" && interactivePrompt.options && (
            <Box flexDirection="column" marginTop={1}>
              {interactivePrompt.options.map((option, index) => (
                <Text key={option}>{`${index + 1}. ${option}`}</Text>
              ))}
            </Box>
          )}
          <Box marginTop={1}>
            <TextInput
              value={promptValue}
              onChange={setPromptValue}
              onSubmit={handlePromptSubmit}
              placeholder={promptPlaceholder}
              focused
              minHeight={1}
              mask={interactivePrompt.inputType === "password" ? "*" : undefined}
            />
          </Box>
          <Text dimColor>Press Esc to cancel</Text>
        </Box>
      )}

      {pendingOperation && (
        <Box
          position="absolute"
          marginTop={4}
          marginLeft={8}
          borderStyle="round"
          borderColor={themeContext.theme.colors.warning}
          padding={1}
          flexDirection="column"
          minWidth={40}
        >
          <LoadingIndicator message={pendingOperation.message} />
          {pendingOperation.cancel && <Text dimColor>Press Esc to cancel</Text>}
        </Box>
      )}
    </>
  );
}

interface AppHeaderProps {
  readonly backtrackState: ReturnType<typeof useBacktrack>["backtrackState"];
  readonly branches: ReturnType<typeof useBacktrack>["branches"];
  readonly currentMode: CodingMode;
  readonly currentTip: TipValue;
  readonly dismissTip: () => void;
  readonly handleCreateBacktrackBranch: () => void;
  readonly handleSwitchBacktrackBranch: (branchId: string) => void;
  readonly redoBacktrack: () => void;
  readonly specPhase: number;
  readonly undoBacktrack: () => void;
}

function AppHeader({
  backtrackState,
  branches,
  currentMode,
  currentTip,
  dismissTip,
  handleCreateBacktrackBranch,
  handleSwitchBacktrackBranch,
  redoBacktrack,
  specPhase,
  undoBacktrack,
}: AppHeaderProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <TipBanner tip={currentTip} onDismiss={dismissTip} compact />
      {currentMode === "spec" && (
        <PhaseProgressIndicator currentPhase={specPhase} showLabels showPercentage />
      )}
      {backtrackState.historyLength > 1 && (
        <BacktrackControls
          backtrackState={backtrackState}
          branches={branches}
          onUndo={undoBacktrack}
          onRedo={redoBacktrack}
          onCreateBranch={handleCreateBacktrackBranch}
          onSwitchBranch={handleSwitchBacktrackBranch}
        />
      )}
    </Box>
  );
}

function AppContentView({
  agentLevel,
  agentName,
  announce,
  activeApproval,
  activeRiskLevel,
  activeSessionId,
  backtrackState,
  bannerCycleDurationMs,
  bannerCycles,
  bannerDisplayDurationMs,
  bannerSplashComplete,
  bannerUpdateIntervalMs,
  branches,
  cancelOnboarding,
  closeSessionManager,
  commandOptions,
  getSubcommands,
  categoryOrder,
  categoryLabels,
  contextWindow,
  currentMode,
  currentModel,
  currentProvider,
  currentTip,
  dismissTip,
  dismissUpdateBanner,
  handleApprove,
  handleApproveAlways,
  handleBannerComplete,
  handleCommand,
  handleCreateBacktrackBranch,
  handleMessage,
  handleModeSelect,
  handleModelSelect,
  handleOnboardingComplete,
  handlePromptSubmit,
  handleReject,
  handleSessionSelected,
  handleSwitchBacktrackBranch,
  interactivePrompt,
  loadSessionPreviewMessages,
  isLoading,
  isThinking,
  memoryEntries,
  messages,
  pendingOperation,
  promptPlaceholder,
  promptValue,
  setPromptValue,
  setThinkingCollapsed,
  sessions,
  shouldShowBanner,
  showModeSelector,
  showModelSelector,
  showOnboarding,
  showSessionManager,
  showSidebar,
  sidebarContent,
  specPhase,
  themeContext,
  thinkingCollapsed,
  thinkingContent,
  todoItems,
  refreshTodos,
  toolRegistry,
  tokenUsage,
  turnUsage,
  totalTokens,
  trustMode,
  undoBacktrack,
  redoBacktrack,
  updateAvailable,
}: AppContentViewProps): React.JSX.Element {
  const sidebar = renderSidebarContent({
    announce,
    showSidebar,
    sidebarContent,
    todoItems,
    refreshTodos,
    memoryEntries,
    toolRegistry,
  });

  const footer = (
    <StatusBar
      mode={currentMode}
      agentName={agentName}
      agentLevel={agentLevel}
      modelName={currentModel}
      tokens={{
        current: totalTokens,
        max: contextWindow,
        breakdown: {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          thinkingTokens: tokenUsage.thinkingTokens,
          cacheReadTokens: tokenUsage.cacheReadTokens,
          cacheWriteTokens: tokenUsage.cacheWriteTokens,
        },
        turnUsage: {
          inputTokens: turnUsage.inputTokens,
          outputTokens: turnUsage.outputTokens,
          thinkingTokens: turnUsage.thinkingTokens,
          cacheReadTokens: turnUsage.cacheReadTokens,
          cacheWriteTokens: turnUsage.cacheWriteTokens,
        },
        showBreakdown: true,
      }}
      cost={tokenUsage.totalCost}
      trustMode={trustMode}
      thinking={{ active: isThinking }}
    />
  );

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onCancel={cancelOnboarding} />;
  }

  if (shouldShowBanner && !bannerSplashComplete) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height={process.stdout.rows ?? 24}
      >
        <Banner
          animated
          autoHide
          cycles={bannerCycles}
          displayDuration={bannerDisplayDurationMs}
          cycleDuration={bannerCycleDurationMs}
          updateInterval={bannerUpdateIntervalMs}
          onComplete={handleBannerComplete}
        />
      </Box>
    );
  }

  return (
    <>
      <AppOverlays
        activeApproval={activeApproval}
        activeRiskLevel={activeRiskLevel}
        activeSessionId={activeSessionId}
        closeSessionManager={closeSessionManager}
        currentMode={currentMode}
        currentModel={currentModel}
        currentProvider={currentProvider}
        dismissUpdateBanner={dismissUpdateBanner}
        handleApprove={handleApprove}
        handleApproveAlways={handleApproveAlways}
        handleModeSelect={handleModeSelect}
        handleModelSelect={handleModelSelect}
        handlePromptSubmit={handlePromptSubmit}
        handleReject={handleReject}
        handleSessionSelected={handleSessionSelected}
        interactivePrompt={interactivePrompt}
        loadSessionPreviewMessages={loadSessionPreviewMessages}
        pendingOperation={pendingOperation}
        promptPlaceholder={promptPlaceholder}
        promptValue={promptValue}
        setPromptValue={setPromptValue}
        sessions={sessions}
        showModeSelector={showModeSelector}
        showModelSelector={showModelSelector}
        showSessionManager={showSessionManager}
        themeContext={themeContext}
        updateAvailable={updateAvailable}
      />

      <Layout
        header={
          <AppHeader
            backtrackState={backtrackState}
            branches={branches}
            currentMode={currentMode}
            currentTip={currentTip}
            dismissTip={dismissTip}
            handleCreateBacktrackBranch={handleCreateBacktrackBranch}
            handleSwitchBacktrackBranch={handleSwitchBacktrackBranch}
            redoBacktrack={redoBacktrack}
            specPhase={specPhase}
            undoBacktrack={undoBacktrack}
          />
        }
        footer={footer}
        sidebar={sidebar}
        showSidebar={showSidebar}
      >
        {isThinking && (
          <ThinkingBlock
            content={thinkingContent}
            isStreaming={isThinking}
            collapsed={thinkingCollapsed}
            onToggle={() => setThinkingCollapsed((prev) => !prev)}
          />
        )}

        <MessageList messages={messages} />

        <CommandInput
          onMessage={handleMessage}
          onCommand={handleCommand}
          commands={commandOptions}
          getSubcommands={getSubcommands}
          groupedCommands={true}
          categoryOrder={categoryOrder}
          categoryLabels={categoryLabels}
          placeholder={isLoading ? "Thinking..." : "Type a message or /command..."}
          disabled={isLoading || !!interactivePrompt || !!pendingOperation}
          focused={
            !isLoading &&
            !showModeSelector &&
            !showModelSelector &&
            !showSessionManager &&
            !activeApproval &&
            !interactivePrompt &&
            !pendingOperation
          }
          historyKey="vellum-command-history"
        />
      </Layout>
    </>
  );
}

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
  TaskChain,
  TaskChainNode,
  ToolExecutor,
  ToolRegistry,
} from "@vellum/core";
import {
  BUILTIN_CODING_MODES,
  OnboardingWizard as CoreOnboardingWizard,
  createCostService,
  createModeManager,
  createSession,
  createToolRegistry,
  createUserMessage,
  getTextContent,
  ProjectMemoryService,
  registerAllBuiltinTools,
  registerGitTools,
  SearchService,
  SessionListService,
  SessionParts,
  StorageManager,
  setBatchToolRegistry,
  setTuiModeActive,
  updateSessionMetadata,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import { Box, Text, useApp as useInkApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DefaultContextProvider } from "./commands/index.js";
import {
  agentsCommand,
  CommandExecutor,
  CommandRegistry,
  clearCommand,
  condenseCommand,
  configSlashCommands,
  costCommand,
  costResetCommand,
  createBatchCommand,
  createContextProvider,
  createCredentialManager,
  createResumeCommand,
  createSearchCommand,
  customAgentsCommand,
  diffModeSlashCommands,
  enhancedAuthCommands,
  exitCommand,
  getEffectiveThinkingConfig,
  getThinkingState,
  helpCommand,
  initSlashCommand,
  languageCommand,
  memoryCommand,
  metricsCommands,
  modelCommand,
  onboardCommand,
  persistenceCommands,
  promptPrioritySlashCommands,
  type ResumeSessionEventData,
  registerUserCommands,
  setCondenseCommandLoop,
  setCostCommandsService,
  setHelpRegistry,
  setModeCommandsManager,
  setModelCommandConfig,
  setPersistenceRef,
  setThemeContext,
  settingsSlashCommands,
  setVimCallbacks,
  subscribeToThinkingState,
  themeSlashCommands,
  thinkSlashCommands,
  toggleThinking,
  tutorialCommand,
  vimSlashCommands,
} from "./commands/index.js";
import { modeSlashCommands } from "./commands/mode.js";
import type { AsyncOperation, CommandResult, InteractivePrompt } from "./commands/types.js";
import { setShutdownCleanup } from "./shutdown.js";
import { useAgentAdapter } from "./tui/adapters/agent-adapter.js";
import { toUIMessages } from "./tui/adapters/message-adapter.js";
import {
  createMemorySessionStorage,
  type SessionStorage,
  useSessionAdapter,
} from "./tui/adapters/session-adapter.js";
import { AgentProgress } from "./tui/components/AgentProgress.js";
import { Banner } from "./tui/components/Banner/index.js";
import { BacktrackControls } from "./tui/components/backtrack/BacktrackControls.js";
import { CheckpointDiffView } from "./tui/components/Checkpoint/CheckpointDiffView.js";
import { SnapshotCheckpointPanel } from "./tui/components/Checkpoint/SnapshotCheckpointPanel.js";
import { CostDisplay } from "./tui/components/CostDisplay.js";
// New status components (Phase 35+)
import { AutoApprovalStatus } from "./tui/components/common/AutoApprovalStatus.js";
import { CostWarning } from "./tui/components/common/CostWarning.js";
import { ErrorBoundary } from "./tui/components/common/ErrorBoundary.js";
import { DEFAULT_HOTKEYS, HotkeyHelpModal } from "./tui/components/common/HotkeyHelpModal.js";
import { MaxSizedBox } from "./tui/components/common/MaxSizedBox.js";
import { LoadingIndicator } from "./tui/components/common/Spinner.js";
import type { AutocompleteOption } from "./tui/components/Input/Autocomplete.js";
import { EnhancedCommandInput } from "./tui/components/Input/EnhancedCommandInput.js";
import type { SlashCommand } from "./tui/components/Input/slash-command-utils.js";
import { TextInput } from "./tui/components/Input/TextInput.js";
import { InitErrorBanner, McpPanel } from "./tui/components/index.js";
import { Layout } from "./tui/components/Layout.js";
import { MemoryPanel, type MemoryPanelProps } from "./tui/components/MemoryPanel.js";
import { MessageList } from "./tui/components/Messages/MessageList.js";
import { ModeIndicator } from "./tui/components/ModeIndicator.js";
import { ModelSelector } from "./tui/components/ModelSelector.js";
import { ModeSelector } from "./tui/components/ModeSelector.js";
import { OnboardingWizard } from "./tui/components/OnboardingWizard.js";
import { PhaseProgressIndicator } from "./tui/components/PhaseProgressIndicator.js";
import { AdaptiveLayout } from "./tui/components/ScreenReaderLayout.js";
import { SystemStatusPanel } from "./tui/components/Sidebar/SystemStatusPanel.js";
import { ModelStatusBar } from "./tui/components/Status/ModelStatusBar.js";
import { FileChangesIndicator } from "./tui/components/StatusBar/FileChangesIndicator.js";
import { StatusBar } from "./tui/components/StatusBar/StatusBar.js";
import type { TrustMode } from "./tui/components/StatusBar/TrustModeIndicator.js";
import { SessionPicker } from "./tui/components/session/SessionPicker.js";
// Note: ProtectedFileLegend is rendered by tool output formatters, not app.tsx directly
import type { SessionMetadata, SessionPreviewMessage } from "./tui/components/session/types.js";
import { TipBanner } from "./tui/components/TipBanner.js";
import type { TodoItemData } from "./tui/components/TodoItem.js";
import { TodoPanel } from "./tui/components/TodoPanel.js";
import { ApprovalQueue } from "./tui/components/Tools/ApprovalQueue.js";
import { OptionSelector } from "./tui/components/Tools/OptionSelector.js";
import { PermissionDialog } from "./tui/components/Tools/PermissionDialog.js";
import { ToolsPanel } from "./tui/components/Tools/ToolsPanel.js";
import { UpdateBanner } from "./tui/components/UpdateBanner.js";
import { VimModeIndicator } from "./tui/components/VimModeIndicator.js";
import type { Message } from "./tui/context/MessagesContext.js";
import { useMessages } from "./tui/context/MessagesContext.js";
import { RootProvider } from "./tui/context/RootProvider.js";
import { type ToolExecution, useTools } from "./tui/context/ToolsContext.js";
import {
  type PersistenceStatus,
  usePersistence,
  usePersistenceShortcuts,
} from "./tui/hooks/index.js";
import { useAlternateBuffer } from "./tui/hooks/useAlternateBuffer.js";
import { useBacktrack } from "./tui/hooks/useBacktrack.js";
import { useCopyMode } from "./tui/hooks/useCopyMode.js";
import { useDesktopNotification } from "./tui/hooks/useDesktopNotification.js";
import { useFileChangeStats } from "./tui/hooks/useFileChangeStats.js";
import { useGitStatus } from "./tui/hooks/useGitStatus.js";
import { type HotkeyDefinition, useHotkeys } from "./tui/hooks/useHotkeys.js";
import { useInputHistory } from "./tui/hooks/useInputHistory.js";
import { useModeShortcuts } from "./tui/hooks/useModeShortcuts.js";
import { useProviderStatus } from "./tui/hooks/useProviderStatus.js";
import { isScreenReaderEnabled, useScreenReader } from "./tui/hooks/useScreenReader.js";
import { type SidebarContent, useSidebarPanelData } from "./tui/hooks/useSidebarPanelData.js";
import { useSnapshots } from "./tui/hooks/useSnapshots.js";
import { useToolApprovalController } from "./tui/hooks/useToolApprovalController.js";
import type { VimMode } from "./tui/hooks/useVim.js";
import { useVim } from "./tui/hooks/useVim.js";
import { useWorkspace } from "./tui/hooks/useWorkspace.js";
import {
  getAlternateBufferEnabled,
  getBannerSeen,
  setBannerSeen as saveBannerSeen,
} from "./tui/i18n/settings-integration.js";
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
// Feature Integrations-
// =============================================================================

import { getProviderModels } from "@vellum/provider";
// Enterprise integration
import {
  createEnterpriseHooks,
  type EnterpriseHooks,
  initializeEnterprise,
  shutdownEnterprise,
} from "./tui/enterprise-integration.js";
// Metrics integration
import { getMetricsManager, type TuiMetricsManager } from "./tui/metrics-integration.js";
// Resilience integration-
import { createResilientProvider, type ResilientProvider } from "./tui/resilience.js";
// Sandbox integration
import { cleanupSandbox, initializeSandbox } from "./tui/sandbox-integration.js";
import { type ThemeName, useTheme } from "./tui/theme/index.js";
// Tip integration
import { buildTipContext, useTipEngine } from "./tui/tip-integration.js";
// Cursor management utilities
import { CursorManager } from "./tui/utils/cursor-manager.js";
import { calculateCost, getContextWindow, getModelInfo } from "./utils/index.js";

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
 * Extended with coding mode options-.
 */
interface AppProps {
  /** Model to use for AI responses */
  model: string;
  /** Provider to use (anthropic, openai, etc.) */
  provider: string;
  /** Initial coding mode */
  mode?: CodingMode;
  /** Approval policy override */
  approval?: ApprovalPolicy;
  /** Sandbox policy override */
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
  /** Initialization error (when provider fails to initialize) */
  initError?: Error;
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
// Task 2: Focus Debug Component
// =============================================================================

interface FocusDebuggerProps {
  isLoading: boolean;
  showModeSelector: boolean;
  showModelSelector: boolean;
  showSessionManager: boolean;
  showHelpModal: boolean;
  activeApproval: unknown;
  interactivePrompt: unknown;
  pendingOperation: unknown;
}

/**
 * Debug component that logs focus conditions when they change.
 * Helps diagnose input focus issues.
 */
function FocusDebugger({
  isLoading,
  showModeSelector,
  showModelSelector,
  showSessionManager,
  showHelpModal,
  activeApproval,
  interactivePrompt,
  pendingOperation,
}: FocusDebuggerProps): null {
  // Note: These props are for debugging focus logic.
  // The shouldFocus calculation was removed as part of debug cleanup.
  void isLoading;
  void showModeSelector;
  void showModelSelector;
  void showSessionManager;
  void showHelpModal;
  void activeApproval;
  void interactivePrompt;
  void pendingOperation;

  return null;
}

// =============================================================================
//: Command Registry Initialization
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

  //: Register mode slash commands
  for (const cmd of modeSlashCommands) {
    registry.register(cmd);
  }

  //: Register vim slash commands
  for (const cmd of vimSlashCommands) {
    registry.register(cmd);
  }

  // Register think slash commands
  for (const cmd of thinkSlashCommands) {
    registry.register(cmd);
  }

  // Register diff-mode slash commands
  for (const cmd of diffModeSlashCommands) {
    registry.register(cmd);
  }

  //: Register context management command
  registry.register(condenseCommand);

  //: Register theme slash commands
  for (const cmd of themeSlashCommands) {
    registry.register(cmd);
  }

  //: Register metrics commands
  for (const cmd of metricsCommands) {
    registry.register(cmd);
  }

  // Register persistence commands
  for (const cmd of persistenceCommands) {
    registry.register(cmd);
  }

  // Register settings system commands
  for (const cmd of settingsSlashCommands) {
    registry.register(cmd);
  }

  for (const cmd of configSlashCommands) {
    registry.register(cmd);
  }

  for (const cmd of promptPrioritySlashCommands) {
    registry.register(cmd);
  }

  //: Plugin commands are registered via registerPluginCommands()
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
  initError,
}: AppProps) {
  // Shared tool registry for the running tool system.
  // This registry is used by commands, the tools UI, and MCP tool registration.
  const toolRegistry = useMemo(() => {
    if (toolRegistryProp) {
      return toolRegistryProp;
    }

    const registry = createToolRegistry();
    registerAllBuiltinTools(registry);
    registerGitTools(registry);
    setBatchToolRegistry(registry);
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
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error("[ErrorBoundary] Caught error:", error, errorInfo);
        }}
        showDetails
      >
        <AppContent
          model={model}
          provider={provider}
          mode={_mode}
          approval={_approval}
          sandbox={_sandbox}
          agentLoop={agentLoopProp}
          toolRegistry={toolRegistry}
          banner={banner}
          initError={initError}
        />
      </ErrorBoundary>
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
  initError,
}: AppContentProps) {
  const { exit } = useInkApp();
  const themeContext = useTheme();
  const { messages, addMessage, clearMessages, setMessages, pendingMessage } = useMessages();
  const [isLoading, setIsLoading] = useState(false);
  const [interactivePrompt, setInteractivePrompt] = useState<InteractivePrompt | null>(null);
  const [followupPrompt, setFollowupPrompt] = useState<{
    question: string;
    suggestions: string[];
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [pendingOperation, setPendingOperation] = useState<AsyncOperation | null>(null);

  // Suppress initial Enter key event when interactive prompt is mounted (fixes race condition)
  const [suppressPromptEnter, setSuppressPromptEnter] = useState(false);
  useEffect(() => {
    if (interactivePrompt) {
      setSuppressPromptEnter(true);
      const timer = setTimeout(() => setSuppressPromptEnter(false), 50);
      return () => clearTimeout(timer);
    }
  }, [interactivePrompt]);

  // ==========================================================================
  // New TUI Hooks Integration-
  // ==========================================================================

  // Vim modal editing mode
  const [vimEnabled, setVimEnabled] = useState(false);
  const vim = useVim();

  // Wire up vim callbacks for /vim command
  useEffect(() => {
    const handleToggle = () => {
      setVimEnabled((prev) => !prev);
      vim.toggle();
    };
    const isEnabled = () => vimEnabled;
    setVimCallbacks(handleToggle, isEnabled);
    return () =>
      setVimCallbacks(
        () => {},
        () => false
      );
  }, [vim, vimEnabled]);

  // Copy mode for visual selection
  const copyMode = useCopyMode();

  // Desktop notifications
  const {
    notify: _notify,
    notifyTaskComplete,
    notifyError,
  } = useDesktopNotification({ enabled: true });

  // Workspace and git status for header separator
  const { name: workspaceName } = useWorkspace();
  const { branch: gitBranch, changedFiles: gitChangedFiles } = useGitStatus();

  // Alternate buffer configuration
  // Enabled by default (config defaults to true)
  // Automatically disabled when screen reader is detected for accessibility
  const { stdout } = useStdout();
  const alternateBufferConfig = getAlternateBufferEnabled();
  const screenReaderDetected = isScreenReaderEnabled();
  // Enable alternate buffer in VS Code terminal to fix cursor flickering
  const alternateBufferEnabled = alternateBufferConfig && !screenReaderDetected;

  // Alternate buffer for full-screen rendering
  // Benefits: Clean exit (restores original terminal), no scrollback pollution
  const alternateBuffer = useAlternateBuffer({
    enabled: alternateBufferEnabled,
  });
  // Destructure for convenience
  const { isAlternate } = alternateBuffer;

  // Terminal height for layout constraint when in alternate buffer mode
  const terminalHeight = process.stdout.rows || 24;
  void isAlternate; // Used for layout height calculation
  void terminalHeight; // Used for layout height calculation

  // Hide the terminal cursor to avoid VS Code's blinking block over the message area.
  // We draw our own cursor in inputs and streaming text.
  // Uses centralized CursorManager to prevent race conditions.
  useEffect(() => {
    if (screenReaderDetected || !stdout.isTTY) {
      return;
    }
    if (process.env.VELLUM_SHOW_CURSOR === "1") {
      return;
    }

    // Lock cursor in hidden state for entire TUI session
    CursorManager.lock();

    // Setup exit handlers to restore cursor
    const handleExit = (): void => {
      CursorManager.unlock();
      CursorManager.forceShow();
    };

    process.on("exit", handleExit);
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
    process.on("SIGHUP", handleExit);

    return () => {
      process.off("exit", handleExit);
      process.off("SIGINT", handleExit);
      process.off("SIGTERM", handleExit);
      process.off("SIGHUP", handleExit);
      CursorManager.unlock();
      CursorManager.forceShow();
    };
  }, [screenReaderDetected, stdout]);

  // ==========================================================================
  // TUI Mode Console Suppression (Overflow Prevention)
  // ==========================================================================
  // Enable TUI mode to suppress console.log output from loggers.
  // This prevents console output from bypassing Ink and causing terminal overflow.
  useEffect(() => {
    // Activate TUI mode to suppress console transport
    setTuiModeActive(true);

    // Setup exit handlers to restore console on exit
    const restoreConsole = (): void => {
      setTuiModeActive(false);
    };

    // Standard exit signals
    process.on("exit", restoreConsole);
    process.on("SIGINT", restoreConsole);
    process.on("SIGTERM", restoreConsole);

    // Exception handlers for complete coverage Hardening)
    // These ensure TUI mode is disabled even on unexpected crashes
    process.on("uncaughtException", restoreConsole);
    process.on("unhandledRejection", restoreConsole);

    return () => {
      process.off("exit", restoreConsole);
      process.off("SIGINT", restoreConsole);
      process.off("SIGTERM", restoreConsole);
      process.off("uncaughtException", restoreConsole);
      process.off("unhandledRejection", restoreConsole);
      setTuiModeActive(false);
    };
  }, []);

  // NOTE: Previous useInput and setInterval for cursor hiding removed.
  // CursorManager.lock() now handles cursor state centrally, preventing
  // race conditions and flickering from multiple cursor hide/show operations.

  // ==========================================================================
  // Feature Integrations-
  // ==========================================================================

  //: Sandbox integration for shell tool execution
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

  //: Resilience (circuit breaker, rate limiter, fallback)
  const [resilientProvider, setResilientProvider] = useState<ResilientProvider | null>(null);
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

  //: Metrics integration
  const metricsManager = useMemo<TuiMetricsManager>(() => getMetricsManager(), []);

  // Track message processing
  useEffect(() => {
    if (messages.length > 0) {
      metricsManager.recordMessage();
    }
  }, [messages.length, metricsManager]);

  //: Enterprise integration
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

  //: Wire enterprise hooks to ToolExecutor when both are available
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

  //: Tip engine integration
  const { currentTip, showTip, dismissTip, tipsEnabled } = useTipEngine({
    enabled: true,
    maxTipsPerSession: 5,
    tipIntervalMs: 60000,
  });

  // Note: The tip context useEffect is placed after state declarations below

  // ==========================================================================
  // Adapter Integration - Agent Adapter
  // ==========================================================================

  // Agent adapter for AgentLoop ↔ Context integration
  // The hook connects AgentLoop events to MessagesContext and ToolsContext
  const agentAdapter = useAgentAdapter({
    clearOnDisconnect: false, // Preserve messages when disconnecting
  });

  // Destructure for stable references in useEffect dependency array.
  // Even though agentAdapter is now memoized, this makes the dependency explicit
  // and avoids re-running the effect if agentAdapter reference changes.
  const { connect: adapterConnect, disconnect: adapterDisconnect } = agentAdapter;

  // Connect to AgentLoop when provided
  useEffect(() => {
    if (agentLoopProp) {
      adapterConnect(agentLoopProp);
      // Wire up context management command
      setCondenseCommandLoop(agentLoopProp);
      // Thinking content is now handled directly in the agent-adapter
      // and integrated into the streaming message's `thinking` field.
    }
    return () => {
      adapterDisconnect();
      // Clear context management command reference
      setCondenseCommandLoop(null);
    };
  }, [agentLoopProp, adapterConnect, adapterDisconnect]);

  const upsertTaskChainNode = useCallback(
    (taskId: string, agentSlug: string | undefined, status: TaskChainNode["status"]) => {
      setTaskChain((prev) => {
        const now = new Date();
        if (!prev) {
          const rootNode: TaskChainNode = {
            taskId,
            parentTaskId: undefined,
            agentSlug: agentSlug ?? "agent",
            depth: 0,
            createdAt: now,
            status,
          };

          return {
            chainId: `ui-${createId()}`,
            rootTaskId: taskId,
            nodes: new Map([[taskId, rootNode]]),
            maxDepth: 0,
          };
        }

        const nodes = new Map(prev.nodes);
        const existing = nodes.get(taskId);
        const node: TaskChainNode = {
          taskId,
          parentTaskId: existing?.parentTaskId,
          agentSlug: agentSlug ?? existing?.agentSlug ?? "agent",
          depth: existing?.depth ?? 0,
          createdAt: existing?.createdAt ?? now,
          status,
        };

        nodes.set(taskId, node);

        return {
          ...prev,
          nodes,
          rootTaskId: prev.rootTaskId ?? taskId,
          maxDepth: prev.maxDepth ?? 0,
        };
      });
    },
    []
  );

  useEffect(() => {
    if (!agentLoopProp) {
      setTaskChain(null);
      setCurrentTaskId(undefined);
      return;
    }

    const handleDelegationStart = (delegationId: string, agent: string) => {
      upsertTaskChainNode(delegationId, agent, "running");
      setCurrentTaskId(delegationId);
    };

    const handleDelegationComplete = (delegationId: string) => {
      upsertTaskChainNode(delegationId, undefined, "completed");
      setCurrentTaskId((prev) => (prev === delegationId ? undefined : prev));
    };

    agentLoopProp.on("delegationStart", handleDelegationStart);
    agentLoopProp.on("delegationComplete", handleDelegationComplete);

    return () => {
      agentLoopProp.off("delegationStart", handleDelegationStart);
      agentLoopProp.off("delegationComplete", handleDelegationComplete);
    };
  }, [agentLoopProp, upsertTaskChainNode]);

  useEffect(() => {
    const orchestrator = agentLoopProp?.getConfig().orchestrator;
    if (!orchestrator) {
      return;
    }

    const handleSpawned = (event: { data?: { taskId?: string; agentSlug?: string } }) => {
      if (!event.data?.taskId) return;
      upsertTaskChainNode(event.data.taskId, event.data.agentSlug, "running");
      setCurrentTaskId(event.data.taskId);
    };

    const handleCompleted = (event: { data?: { taskId?: string; agentSlug?: string } }) => {
      if (!event.data?.taskId) return;
      upsertTaskChainNode(event.data.taskId, event.data.agentSlug, "completed");
      setCurrentTaskId((prev) => (prev === event.data?.taskId ? undefined : prev));
    };

    const handleFailed = (event: { data?: { taskId?: string; agentSlug?: string } }) => {
      if (!event.data?.taskId) return;
      upsertTaskChainNode(event.data.taskId, event.data.agentSlug, "failed");
      setCurrentTaskId((prev) => (prev === event.data?.taskId ? undefined : prev));
    };

    const handleStarted = (event: { data?: { taskId?: string; agentSlug?: string } }) => {
      if (!event.data?.taskId) return;
      upsertTaskChainNode(event.data.taskId, event.data.agentSlug, "running");
      setCurrentTaskId(event.data.taskId);
    };

    orchestrator.on("subagent_spawned", handleSpawned);
    orchestrator.on("task_started", handleStarted);
    orchestrator.on("task_completed", handleCompleted);
    orchestrator.on("task_failed", handleFailed);
    orchestrator.on("subagent_cancelled", handleFailed);

    return () => {
      orchestrator.off("subagent_spawned", handleSpawned);
      orchestrator.off("task_started", handleStarted);
      orchestrator.off("task_completed", handleCompleted);
      orchestrator.off("task_failed", handleFailed);
      orchestrator.off("subagent_cancelled", handleFailed);
    };
  }, [agentLoopProp, upsertTaskChainNode]);

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
  const searchServiceRef = useRef<SearchService | null>(null);
  const sessionCacheRef = useRef<Session | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeStorage = async () => {
      try {
        const manager = await StorageManager.create();
        const listService = new SessionListService(manager);
        const searchService = new SearchService(manager);
        await searchService.initialize();

        if (!cancelled) {
          storageManagerRef.current = manager;
          sessionListServiceRef.current = listService;
          searchServiceRef.current = searchService;
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
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showApprovalQueue, setShowApprovalQueue] = useState(false);
  const [checkpointDiff, setCheckpointDiff] = useState<{
    content: string;
    snapshotHash?: string;
    isLoading: boolean;
    isVisible: boolean;
  }>({ content: "", isLoading: false, isVisible: false });

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [bannerSeen, setBannerSeenState] = useState(() => getBannerSeen());
  const [bannerSplashComplete, setBannerSplashComplete] = useState(false);

  // Model selection state (moved earlier for onboarding config loading)
  const [currentModel, setCurrentModel] = useState(model);
  const [currentProvider, setCurrentProvider] = useState(provider);

  // Agent task chain state for AgentProgress display
  const [taskChain, setTaskChain] = useState<TaskChain | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined);

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
  const [sidebarContent, setSidebarContent] = useState<SidebarContent>("memory");

  // Warning ref for thinking mode (used for model capability warnings)
  const thinkingWarningRef = useRef<Set<string>>(new Set());

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
  // Adapter Integration - Session Adapter
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
  // Persistence Hook Integration
  // ==========================================================================

  // Initialize persistence hook with advanced features
  const persistence = usePersistence({
    sessionId: activeSessionId,
    storage: sessionStorage,
    storageManager: storageManagerRef.current ?? undefined,
    enableAdvancedPersistence: !!storageManagerRef.current,
    autoSave: true,
    saveDebounceMs: 2000,
    autoLoad: true,
    onError: (error) => {
      console.error("[persistence] Error:", error.message);
      notifyError(`Persistence error: ${error.message}`);
    },
    onCheckpointCreated: (checkpointId) => {
      announce(`Checkpoint created: ${checkpointId.slice(0, 8)}`);
    },
    onRollbackComplete: (success) => {
      if (success) {
        announce("Rollback complete");
      } else {
        notifyError("Rollback failed");
      }
    },
  });

  // Set persistence ref for slash commands
  useEffect(() => {
    setPersistenceRef({
      status: persistence.status,
      unsavedCount: persistence.unsavedCount,
      checkpoints: persistence.checkpoints,
      isAdvancedEnabled: persistence.isAdvancedEnabled,
      createCheckpoint: persistence.createCheckpoint,
      rollbackToCheckpoint: persistence.rollbackToCheckpoint,
      deleteCheckpoint: persistence.deleteCheckpoint,
      getMessagesToLose: persistence.getMessagesToLose,
      forceSave: persistence.forceSave,
    });
    return () => setPersistenceRef(null);
  }, [persistence]);

  // Initialize persistence keyboard shortcuts
  usePersistenceShortcuts({
    persistence,
    enabled: true,
    onSave: () => announce("Session saved"),
    onCheckpointCreated: (id) => announce(`Checkpoint: ${id.slice(0, 8)}`),
    onError: (error) => notifyError(error),
  });

  // ==========================================================================
  // FIX 4: Real Todo and Memory Data
  // ==========================================================================

  const { executions, pendingApproval, approveExecution, rejectExecution, approveAll } = useTools();
  const pendingApprovalCountRef = useRef(pendingApproval.length);

  useEffect(() => {
    const previousCount = pendingApprovalCountRef.current;
    const currentCount = pendingApproval.length;
    pendingApprovalCountRef.current = currentCount;

    if (currentCount > 1 && previousCount <= 1) {
      setShowApprovalQueue(true);
    }

    if (currentCount <= 1 && showApprovalQueue) {
      setShowApprovalQueue(false);
    }
  }, [pendingApproval.length, showApprovalQueue]);

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

  const [thinkingModeEnabled, setThinkingModeEnabled] = useState(() => getThinkingState().enabled);

  // Subscribe to global thinking state changes (mode toggle via /think)
  useEffect(() => {
    const unsubscribe = subscribeToThinkingState((state) => {
      setThinkingModeEnabled(state.enabled);
    });
    return unsubscribe;
  }, []);

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
  // Provider Status (ModelStatusBar integration)
  // ==========================================================================

  // Track provider health status with circuit breaker states
  const providerStatus = useProviderStatus({
    initialProviders: [{ id: provider, name: provider, isActive: true }],
  });

  // ==========================================================================
  // Snapshots (SnapshotCheckpointPanel integration)
  // ==========================================================================

  const snapshots = useSnapshots();

  const openCheckpointDiff = useCallback(
    async (hash: string) => {
      setCheckpointDiff({ content: "", snapshotHash: hash, isLoading: true, isVisible: true });

      try {
        const diff = await snapshots.diff(hash);
        setCheckpointDiff({
          content: diff,
          snapshotHash: hash,
          isLoading: false,
          isVisible: true,
        });
      } catch (error) {
        setCheckpointDiff({
          content: `Failed to load diff: ${error instanceof Error ? error.message : String(error)}`,
          snapshotHash: hash,
          isLoading: false,
          isVisible: true,
        });
      }
    },
    [snapshots]
  );

  const closeCheckpointDiff = useCallback(() => {
    setCheckpointDiff((prev) => ({ ...prev, isVisible: false }));
  }, []);

  // Cost tracking state for CostWarning component
  const [costWarningState, setCostWarningState] = useState<{
    show: boolean;
    limitReached: boolean;
    percentUsed: number;
    costLimit: number;
    requestLimit: number;
  }>({ show: false, limitReached: false, percentUsed: 0, costLimit: 10, requestLimit: 100 });

  // Auto-approval status state for AutoApprovalStatus component
  // NOTE: setAutoApprovalState is kept for future integration with AgentLoop's
  // getAutoApprovalStatus() method. Currently set via useEffect below.
  const [autoApprovalState, setAutoApprovalState] = useState<{
    consecutiveRequests: number;
    requestLimit: number;
    consecutiveCost: number;
    costLimit: number;
    requestPercentUsed: number;
    costPercentUsed: number;
    limitReached: boolean;
    limitType?: "requests" | "cost";
  } | null>(null);

  // Update auto-approval state from AgentLoop when available
  useEffect(() => {
    if (!agentLoopProp) return;

    // Check if AgentLoop has getAutoApprovalStatus method (Phase 35+)
    const loopWithStatus = agentLoopProp as typeof agentLoopProp & {
      getAutoApprovalStatus?: () => {
        consecutiveRequests: number;
        requestLimit: number;
        consecutiveCost: number;
        costLimit: number;
        requestPercentUsed: number;
        costPercentUsed: number;
        requestLimitReached: boolean;
        costLimitReached: boolean;
      } | null;
    };

    if (typeof loopWithStatus.getAutoApprovalStatus !== "function") {
      return;
    }

    // Periodic polling for auto-approval status
    const updateStatus = () => {
      const status = loopWithStatus.getAutoApprovalStatus?.();
      if (status) {
        setAutoApprovalState({
          consecutiveRequests: status.consecutiveRequests,
          requestLimit: status.requestLimit,
          consecutiveCost: status.consecutiveCost,
          costLimit: status.costLimit,
          requestPercentUsed: status.requestPercentUsed,
          costPercentUsed: status.costPercentUsed,
          limitReached: status.requestLimitReached || status.costLimitReached,
          limitType: status.requestLimitReached
            ? "requests"
            : status.costLimitReached
              ? "cost"
              : undefined,
        });
      }
    };

    // Update immediately and then on interval
    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [agentLoopProp]);

  // Update cost warning based on token usage
  useEffect(() => {
    const costLimit = 10; // Default $10 limit
    const requestLimit = 100;
    const percentUsed = costLimit > 0 ? (tokenUsage.totalCost / costLimit) * 100 : 0;
    const showWarning = percentUsed >= 80; // Show when 80%+ of limit used
    const limitReached = percentUsed >= 100;

    setCostWarningState({
      show: showWarning,
      limitReached,
      percentUsed: Math.min(percentUsed, 100),
      costLimit,
      requestLimit,
    });
  }, [tokenUsage.totalCost]);

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

  //: Show contextual tips based on state (placed after state declarations)
  useEffect(() => {
    if (!tipsEnabled) return;

    const context = buildTipContext({
      screen: showOnboarding ? "onboarding" : "main",
      mode: currentMode,
      featuresUsedCount: messages.length,
    });

    showTip(context);
  }, [currentMode, messages.length, showOnboarding, tipsEnabled, showTip]);

  // Ref to track current cancellation controller
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

  // Mode shortcuts hook (Alt+1/2/3)
  useModeShortcuts({
    modeManager,
    enabled:
      !showModeSelector &&
      !showModelSelector &&
      !hasActiveApproval &&
      !showSessionManager &&
      !showOnboarding &&
      !interactivePrompt &&
      !followupPrompt &&
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
  const hotkeyDefinitions: HotkeyDefinition[] = useMemo(() => {
    const hotkeys: HotkeyDefinition[] = [
      {
        key: "m",
        alt: true,
        handler: () => setShowModeSelector((prev) => !prev),
        description: "Toggle mode selector",
        scope: "global",
      },
      {
        key: "k",
        alt: true,
        handler: () => setShowSidebar((prev) => !prev),
        description: "Toggle sidebar",
        scope: "global",
      },
      {
        key: "t",
        ctrl: true,
        handler: () => {
          const newState = toggleThinking();
          announce(newState ? "Thinking mode enabled" : "Thinking mode disabled");
        },
        description: "Toggle thinking mode",
        scope: "global",
      },
      // Alt+T alternative for todo panel (thinking uses Ctrl+T)
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
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("memory");
        },
        description: "Show memory panel",
        scope: "global",
      },
      {
        key: "g",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("tools");
        },
        description: "Show tools panel",
        scope: "global",
      },
      {
        key: "o",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("mcp");
        },
        description: "Show MCP panel",
        scope: "global",
      },
      // Snapshots panel (Alt+S)
      {
        key: "s",
        alt: true,
        handler: () => {
          setShowSidebar(true);
          setSidebarContent("snapshots");
        },
        description: "Show snapshots panel",
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
        key: "f1",
        handler: () => setShowHelpModal(true),
        description: "Show help",
        scope: "global",
      },
      {
        key: "?",
        shift: true,
        handler: () => setShowHelpModal(true),
        description: "Show help",
        scope: "global",
      },
      {
        key: "a",
        ctrl: true,
        shift: true,
        handler: () => setShowApprovalQueue((prev) => !prev),
        description: "Toggle approval queue",
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
      // Model selector toggle (Alt+Shift+M)
      {
        key: "m",
        alt: true,
        shift: true,
        handler: () => {
          setShowModelSelector((prev) => !prev);
          announce(showModelSelector ? "Model selector closed" : "Model selector opened");
        },
        description: "Toggle model selector",
        scope: "global",
      },
      // Vim mode toggle
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
      // Copy mode toggle
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
    ];

    // Alternate buffer toggle for full-screen views
    if (alternateBufferEnabled) {
      hotkeys.push({
        key: "f",
        ctrl: true,
        handler: () => {
          alternateBuffer.toggle();
          announce(alternateBuffer.isAlternate ? "Exited fullscreen" : "Entered fullscreen");
        },
        description: "Toggle fullscreen mode",
        scope: "global",
      });
    }

    return hotkeys;
  }, [
    backtrackState.canUndo,
    backtrackState.canRedo,
    undoBacktrack,
    redoBacktrack,
    announce,
    vimEnabled,
    vim,
    copyMode,
    alternateBuffer,
    alternateBufferEnabled,
    showModelSelector,
  ]);

  useHotkeys(hotkeyDefinitions, {
    enabled:
      !showModeSelector &&
      !showModelSelector &&
      !hasActiveApproval &&
      !showSessionManager &&
      !showHelpModal &&
      !showOnboarding &&
      !interactivePrompt &&
      !followupPrompt &&
      !pendingOperation,
  });

  //: Wire theme context to theme commands
  useEffect(() => {
    setThemeContext(themeContext);
    return () => setThemeContext(null);
  }, [themeContext]);

  //: Initialize command registry once on mount
  const [commandRegistryVersion, setCommandRegistryVersion] = useState(0);
  const bumpCommandRegistryVersion = useCallback(
    () => setCommandRegistryVersion((prev) => prev + 1),
    []
  );
  const commandRegistry = useMemo(() => createCommandRegistry(), []);

  // ==========================================================================
  //: Plugin System Integration
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
  //: LSP Integration
  // ==========================================================================

  // LSP initialization state
  const [_lspResult, setLspResult] = useState<LspIntegrationResult | null>(null);
  const [_lspLoading, setLspLoading] = useState(true);

  // Initialize LSP on mount (non-blocking, graceful fallback)
  useEffect(() => {
    let cancelled = false;
    const isDebug = !!process.env.VELLUM_DEBUG;

    const loadLsp = async () => {
      try {
        const result = await initializeLsp({
          workspaceRoot: process.cwd(),
          toolRegistry: toolRegistry as LspIntegrationOptions["toolRegistry"],
          autoInstall: true, // Auto-install missing language servers
          logger: isDebug
            ? {
                debug: (msg) => console.debug(`[lsp] ${msg}`),
                info: (msg) => console.info(`[lsp] ${msg}`),
                warn: (msg) => console.warn(`[lsp] ${msg}`),
                error: (msg) => console.error(`[lsp] ${msg}`),
              }
            : undefined,
        });

        if (cancelled) return;

        setLspResult(result);
        if (isDebug) {
          const msg = result.success
            ? `[lsp] Initialized with ${result.toolCount} tools, ${result.availableServers.length} servers available`
            : `[lsp] Initialization skipped: ${result.error}`;
          console.debug(msg);
        }
        setLspLoading(false);
      } catch (error) {
        if (cancelled) return;
        // LSP is optional - log but don't fail
        if (isDebug) console.debug("[lsp] Failed to initialize (non-critical):", error);
        setLspLoading(false);
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
        // Show goodbye message
        addMessage({ role: "assistant", content: "Goodbye! See you next time." });
        // Give time for message to render, then exit
        setTimeout(() => {
          exit();
          setTimeout(() => process.exit(0), 50);
        }, 150);
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
    [exit, addMessage, setMessages, switchToSession]
  );

  const contextProviderRef = useRef<DefaultContextProvider | null>(null);

  //: Create command executor with context provider
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

  // Register search command when storage is ready
  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const storage = storageManagerRef.current;
    const searchService = searchServiceRef.current;

    if (!storage || !searchService) {
      return;
    }

    try {
      const searchWithStorage = createSearchCommand(storage, searchService);
      commandRegistry.unregister(searchWithStorage.name);
      commandRegistry.register(searchWithStorage);
      bumpCommandRegistryVersion();
    } catch (error) {
      console.warn(
        "[commands] Failed to register search command:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [storageReady, commandRegistry, bumpCommandRegistryVersion]);

  // Register shutdown cleanup on mount
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

  const resolveFollowupResponse = useCallback(
    (rawValue: string, suggestions: readonly string[]): string => {
      const trimmed = rawValue.trim();
      let response = trimmed;

      if (suggestions.length > 0 && trimmed.length > 0) {
        const index = Number.parseInt(trimmed, 10);
        if (!Number.isNaN(index) && index >= 1 && index <= suggestions.length) {
          response = suggestions[index - 1] ?? trimmed;
        } else {
          const match = suggestions.find(
            (option) => option.toLowerCase() === trimmed.toLowerCase()
          );
          if (match) {
            response = match;
          }
        }
      }

      return response;
    },
    []
  );

  // Handle Ctrl+C and ESC for cancellation
  useInput((inputChar, key) => {
    if (interactivePrompt) {
      if (key.escape) {
        handlePromptCancel();
      }
      return;
    }

    if (followupPrompt && key.escape) {
      agentLoopProp?.submitUserResponse("");
      setFollowupPrompt(null);
      return;
    }

    if (pendingOperation) {
      if (key.escape && pendingOperation.cancel) {
        pendingOperation.cancel();
        setPendingOperation(null);
      }
      return;
    }

    // Handle vim mode key processing
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

    // Handle copy mode navigation
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

    // ESC - cancel operation only (use Ctrl+C or /exit to quit)
    if (key.escape) {
      if (isLoading && cancellationRef.current) {
        // Cancel running operation
        cancellationRef.current.cancel("user_escape");
        setIsLoading(false);
        addMessage({ role: "assistant", content: "[Operation cancelled]" });
      }
      // ESC without operation does nothing - use Ctrl+C or /exit to quit
      return;
    }

    // Ctrl+C - cancel operation when loading; otherwise exit
    if (key.ctrl && inputChar === "c") {
      if (isLoading && cancellationRef.current) {
        cancellationRef.current.cancel("user_ctrl_c");
        setIsLoading(false);
        addMessage({ role: "assistant", content: "[Operation cancelled by Ctrl+C]" });
        return;
      }

      addMessage({ role: "assistant", content: "Goodbye! See you next time." });
      setTimeout(() => {
        exit();
        setTimeout(() => process.exit(0), 50);
      }, 150);
      return;
    }
  });

  //: Handle slash command detection and execution
  const handleSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim().startsWith("/")) {
        return false; // Not a slash command
      }

      if (!commandExecutor) {
        const normalized = text.trim().toLowerCase();
        const isExitCommand =
          normalized === "/exit" ||
          normalized === "/quit" ||
          normalized === "/q" ||
          normalized.startsWith("/exit ") ||
          normalized.startsWith("/quit ") ||
          normalized.startsWith("/q ");

        if (isExitCommand) {
          addMessage({ role: "assistant", content: "Goodbye! See you next time." });
          setTimeout(() => {
            exit();
            setTimeout(() => process.exit(0), 50);
          }, 150);
          return true;
        }

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
    [commandExecutor, addMessage, handleCommandResult, exit]
  );

  // Handle message submission (for CommandInput onMessage)
  const handleMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      if (followupPrompt && agentLoopProp) {
        const response = resolveFollowupResponse(text, followupPrompt.suggestions);
        setFollowupPrompt(null);
        addToHistory(response);
        addMessage({ role: "user", content: response });
        announce(`You said: ${response}`);
        agentLoopProp.submitUserResponse(response);
        return;
      }

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

      const effectiveThinking = getEffectiveThinkingConfig(
        BUILTIN_CODING_MODES[currentMode]?.extendedThinking
      );
      if (effectiveThinking.enabled) {
        const modelInfo = getModelInfo(currentProvider, currentModel);
        const warningKey = `${currentProvider}/${currentModel}`;
        if (!modelInfo.supportsReasoning && !thinkingWarningRef.current.has(warningKey)) {
          addMessage({
            role: "assistant",
            content:
              `⚠️ Thinking mode is enabled, but ${currentProvider}/${modelInfo.name} ` +
              "does not support reasoning. Running this request without thinking.",
          });
          thinkingWarningRef.current.add(warningKey);
        }
      }

      setIsLoading(true);
      // Thinking content is now integrated into the streaming message
      // via the agent-adapter's handleThinking function.

      // Use AgentLoop if available
      if (agentLoopProp) {
        // Wire cancellation to AgentLoop
        cancellationRef.current = {
          cancel: (reason) => agentLoopProp.cancel(reason),
          get isCancelled() {
            const state = agentLoopProp.getState();
            return state === "terminated" || state === "shutdown";
          },
        };

        try {
          agentLoopProp.addMessage(createUserMessage([SessionParts.text(processedText)]));

          // Wrap agentLoop.run() with resilience (circuit breaker + rate limiter)
          if (resilientProvider) {
            const result = await resilientProvider.execute(currentProvider, () =>
              agentLoopProp.run()
            );
            if (!result.success && result.error) {
              // Check if circuit is open or rate limited
              const circuitState = resilientProvider.getCircuitState(currentProvider);
              if (circuitState === "OPEN") {
                addMessage({
                  role: "assistant",
                  content: `⚠️ Provider ${currentProvider} circuit breaker is open. Too many failures recently.`,
                });
              }
              throw result.error;
            }
          } else {
            // Fallback to direct execution if resilient provider not ready
            await agentLoopProp.run();
          }

          // Messages are synced via AgentLoop adapter event handlers (handleText)
          // User message was already added via addMessage() above
          // Notify on completion
          notifyTaskComplete("Response received");
          announce("Response received");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          // Log resilience metrics for debugging
          if (resilientProvider) {
            const stats = resilientProvider.getRateLimiterStats();
            console.debug("[Resilience] Stats:", stats);
          }
          notifyError(errorMsg);
          addMessage({ role: "assistant", content: `[x] Error: ${errorMsg}` });
        } finally {
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
            setTimeout(() => {
              if (!cancelled) {
                addMessage({ role: "assistant", content: `[Echo] ${processedText}` });
                notifyTaskComplete("Response received");
                announce("Response received");
              }
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
      agentLoopProp,
      currentModel,
      currentMode,
      currentProvider,
      followupPrompt,
      modeManager,
      notifyTaskComplete,
      notifyError,
      resolveFollowupResponse,
      resilientProvider,
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
          aliases: cmd.aliases,
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

  // Get level 3 items for three-level autocomplete (e.g., /model anthropic claude-)
  const getLevel3Items = useCallback(
    (commandName: string, arg1: string, partial: string): AutocompleteOption[] | undefined => {
      // /model command: level 3 shows model IDs for the selected provider
      if (commandName === "model") {
        // arg1 is the provider name
        const models = getProviderModels(arg1);
        if (models.length === 0) {
          return undefined;
        }

        // Filter models by partial match
        const lowerPartial = partial.toLowerCase();
        const filtered = lowerPartial
          ? models.filter(
              (m) =>
                m.id.toLowerCase().includes(lowerPartial) ||
                m.name.toLowerCase().includes(lowerPartial)
            )
          : models;

        return filtered.map((m) => ({
          name: m.id,
          description: m.name,
          category: arg1,
        }));
      }

      // /auth command: level 3 shows provider list for set/clear subcommands
      if (commandName === "auth") {
        const setAliases = ["set", "add", "login"];
        const clearAliases = ["clear", "remove", "delete", "logout"];

        // Only show providers for set/clear subcommands (not for status)
        if (setAliases.includes(arg1) || clearAliases.includes(arg1)) {
          const providers = [
            "anthropic",
            "openai",
            "google",
            "azure",
            "bedrock",
            "vertex",
            "ollama",
            "openrouter",
            "together",
            "mistral",
            "cohere",
            "groq",
            "deepseek",
            "qwen",
            "xai",
          ];

          const lowerPartial = partial.toLowerCase();
          const filtered = lowerPartial
            ? providers.filter((p) => p.toLowerCase().startsWith(lowerPartial))
            : providers;

          return filtered.map((p) => ({
            name: p,
            description: `Configure ${p} API key`,
          }));
        }

        return undefined; // status doesn't need level 3
      }

      return undefined;
    },
    []
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

  // Handle user prompt requests from ask_followup_question (GAP 1)
  useEffect(() => {
    if (!agentLoopProp) {
      return;
    }

    const handleUserPromptRequired = (prompt: { question: string; suggestions?: string[] }) => {
      const suggestions = prompt.suggestions ?? [];

      setFollowupPrompt({
        question: prompt.question,
        suggestions,
      });
    };

    agentLoopProp.on("userPrompt:required", handleUserPromptRequired);

    return () => {
      agentLoopProp.off("userPrompt:required", handleUserPromptRequired);
    };
  }, [agentLoopProp]);

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
  // Derive active worker agent name from taskChain if available, otherwise use mode's default agent
  const modeAgentName = BUILTIN_CODING_MODES[currentMode].agentName;
  const activeWorkerAgent = currentTaskId && taskChain?.nodes.get(currentTaskId)?.agentSlug;
  const agentName = activeWorkerAgent ?? modeAgentName;
  const agentLevel = currentMode === "spec" ? 0 : currentMode === "plan" ? 1 : 2;

  return (
    <AppContentView
      agentLevel={agentLevel}
      agentName={agentName}
      announce={announce}
      alternateBufferEnabled={alternateBufferEnabled}
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
      credentialManager={credentialManager}
      getSubcommands={getSubcommands}
      getLevel3Items={getLevel3Items}
      categoryOrder={categoryOrder}
      categoryLabels={categoryLabels}
      checkpointDiff={checkpointDiff}
      closeCheckpointDiff={closeCheckpointDiff}
      onOpenCheckpointDiff={openCheckpointDiff}
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
      initError={initError}
      followupPrompt={followupPrompt}
      interactivePrompt={interactivePrompt}
      loadSessionPreviewMessages={loadSessionPreviewMessages}
      isLoading={isLoading}
      thinkingModeEnabled={thinkingModeEnabled}
      memoryEntries={memoryEntries}
      messages={messages}
      pendingMessage={pendingMessage}
      pendingOperation={pendingOperation}
      promptPlaceholder={promptPlaceholder}
      promptValue={promptValue}
      setPromptValue={setPromptValue}
      sessions={sessions}
      suppressPromptEnter={suppressPromptEnter}
      shouldShowBanner={shouldShowBanner}
      showModeSelector={showModeSelector}
      showModelSelector={showModelSelector}
      showOnboarding={showOnboarding}
      showSessionManager={showSessionManager}
      showHelpModal={showHelpModal}
      closeHelpModal={() => setShowHelpModal(false)}
      showApprovalQueue={showApprovalQueue}
      closeApprovalQueue={() => setShowApprovalQueue(false)}
      pendingApprovals={pendingApproval}
      onApproveQueueItem={(id) => approveExecution(id)}
      onRejectQueueItem={(id) => rejectExecution(id)}
      onApproveAll={() => approveAll()}
      onRejectAll={() =>
        pendingApproval.forEach((e) => {
          rejectExecution(e.id);
        })
      }
      showSidebar={showSidebar}
      sidebarContent={sidebarContent}
      specPhase={specPhase}
      themeContext={themeContext}
      taskChain={taskChain}
      currentTaskId={currentTaskId}
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
      workspace={workspaceName}
      branch={gitBranch}
      changedFiles={gitChangedFiles}
      persistence={{
        status: persistence.status,
        unsavedCount: persistence.unsavedCount,
        lastSavedAt: persistence.lastSavedAt,
      }}
      snapshots={snapshots}
      providerStatus={providerStatus}
      costWarningState={costWarningState}
      autoApprovalState={autoApprovalState}
      vimEnabled={vimEnabled}
      vimMode={vim.mode}
    />
  );
}

type ThemeContextValue = ReturnType<typeof useTheme>;
type TipValue = ReturnType<typeof useTipEngine>["currentTip"];
type ToolApprovalState = ReturnType<typeof useToolApprovalController>;

interface AppContentViewProps {
  readonly agentLevel?: 0 | 1 | 2;
  readonly agentName?: string;
  readonly announce: (message: string) => void;
  readonly alternateBufferEnabled: boolean;
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
  readonly credentialManager: CredentialManager | null;
  readonly getSubcommands: (commandName: string) => AutocompleteOption[] | undefined;
  readonly getLevel3Items: (
    commandName: string,
    arg1: string,
    partial: string
  ) => AutocompleteOption[] | undefined;
  readonly categoryOrder: readonly string[];
  readonly categoryLabels: Record<string, string>;
  readonly checkpointDiff: {
    content: string;
    snapshotHash?: string;
    isLoading: boolean;
    isVisible: boolean;
  };
  readonly closeCheckpointDiff: () => void;
  readonly onOpenCheckpointDiff: (hash: string) => void;
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
  readonly followupPrompt: { question: string; suggestions: string[] } | null;
  readonly interactivePrompt: InteractivePrompt | null;
  readonly loadSessionPreviewMessages: (
    sessionId: string
  ) => Promise<readonly SessionPreviewMessage[] | null>;
  readonly initError?: Error;
  readonly isLoading: boolean;
  readonly thinkingModeEnabled: boolean;
  readonly memoryEntries: MemoryPanelProps["entries"];
  readonly messages: readonly Message[];
  readonly pendingMessage: Message | null;
  readonly pendingOperation: AsyncOperation | null;
  readonly promptPlaceholder: string;
  readonly promptValue: string;
  readonly setPromptValue: (value: string) => void;
  readonly sessions: SessionMetadata[];
  readonly suppressPromptEnter: boolean;
  readonly shouldShowBanner: boolean;
  readonly showModeSelector: boolean;
  readonly showModelSelector: boolean;
  readonly showOnboarding: boolean;
  readonly showSessionManager: boolean;
  readonly showHelpModal: boolean;
  readonly closeHelpModal: () => void;
  readonly showApprovalQueue: boolean;
  readonly closeApprovalQueue: () => void;
  readonly pendingApprovals: readonly ToolExecution[];
  readonly onApproveQueueItem: (id: string) => void;
  readonly onRejectQueueItem: (id: string) => void;
  readonly onApproveAll: () => void;
  readonly onRejectAll: () => void;
  readonly showSidebar: boolean;
  readonly sidebarContent: SidebarContent;
  readonly specPhase: number;
  readonly themeContext: ThemeContextValue;
  readonly taskChain: TaskChain | null;
  readonly currentTaskId?: string;
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
  /** Workspace name for header separator */
  readonly workspace: string;
  /** Git branch for header separator */
  readonly branch: string | null;
  /** Number of changed files for header separator */
  readonly changedFiles: number;
  /** Persistence status for session save indicator */
  readonly persistence?: {
    status: PersistenceStatus;
    unsavedCount: number;
    lastSavedAt: Date | null;
  };
  /** Snapshots hook result for checkpoint panel */
  readonly snapshots: ReturnType<typeof useSnapshots>;
  /** Provider status for ModelStatusBar */
  readonly providerStatus: ReturnType<typeof useProviderStatus>;
  /** Cost warning state */
  readonly costWarningState: {
    show: boolean;
    limitReached: boolean;
    percentUsed: number;
    costLimit: number;
    requestLimit: number;
  };
  /** Auto-approval status */
  readonly autoApprovalState: {
    consecutiveRequests: number;
    requestLimit: number;
    consecutiveCost: number;
    costLimit: number;
    requestPercentUsed: number;
    costPercentUsed: number;
    limitReached: boolean;
    limitType?: "requests" | "cost";
  } | null;
  /** Whether vim mode is enabled */
  readonly vimEnabled: boolean;
  /** Current vim mode */
  readonly vimMode: VimMode;
}

function renderSidebarContent({
  announce,
  showSidebar,
  sidebarContent,
  todoItems,
  refreshTodos,
  memoryEntries,
  toolRegistry,
  persistence,
  snapshots,
  taskChain,
  currentTaskId,
  onOpenCheckpointDiff,
}: {
  readonly announce: (message: string) => void;
  readonly showSidebar: boolean;
  readonly sidebarContent: SidebarContent;
  readonly todoItems: readonly TodoItemData[];
  readonly refreshTodos: () => void;
  readonly memoryEntries: MemoryPanelProps["entries"];
  readonly toolRegistry: ToolRegistry;
  readonly persistence?: {
    status: PersistenceStatus;
    unsavedCount: number;
    lastSavedAt: Date | null;
  };
  readonly snapshots: ReturnType<typeof useSnapshots>;
  readonly taskChain: TaskChain | null;
  readonly currentTaskId?: string;
  readonly onOpenCheckpointDiff: (hash: string) => void;
}): React.ReactNode | undefined {
  if (!showSidebar) return undefined;

  let panelContent: React.ReactNode;

  if (sidebarContent === "todo") {
    panelContent = (
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
  } else if (sidebarContent === "tools") {
    panelContent = <ToolsPanel isFocused={showSidebar} maxItems={20} />;
  } else if (sidebarContent === "mcp") {
    panelContent = <McpPanel isFocused={showSidebar} toolRegistry={toolRegistry} />;
  } else if (sidebarContent === "snapshots") {
    panelContent = (
      <SnapshotCheckpointPanel
        snapshots={snapshots.snapshots}
        isLoading={snapshots.isLoading}
        error={snapshots.error}
        isInitialized={snapshots.isInitialized}
        isFocused={showSidebar}
        maxHeight={20}
        onRestore={async (hash) => {
          const result = await snapshots.restore(hash);
          if (result.success) {
            announce(`Restored ${result.files.length} files from checkpoint`);
          } else {
            announce(`Restore failed: ${result.error}`);
          }
        }}
        onDiff={async (hash) => {
          onOpenCheckpointDiff(hash);
        }}
        onTakeCheckpoint={async () => {
          try {
            await snapshots.take("Manual checkpoint");
            announce("Checkpoint created");
          } catch (err) {
            announce(
              `Failed to create checkpoint: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }}
        onRefresh={() => void snapshots.refresh()}
      />
    );
  } else {
    panelContent = <MemoryPanel entries={memoryEntries} isFocused={showSidebar} maxHeight={20} />;
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1}>{panelContent}</Box>
      {taskChain && taskChain.nodes.size > 0 && (
        <Box marginTop={1}>
          <MaxSizedBox maxHeight={12} truncationIndicator="... (more tasks)">
            <AgentProgress
              chain={taskChain}
              currentTaskId={currentTaskId}
              showDetails={false}
              progressBarWidth={12}
            />
          </MaxSizedBox>
        </Box>
      )}
      <SystemStatusPanel compact={false} persistence={persistence} />
    </Box>
  );
}

interface AppOverlaysProps {
  readonly activeApproval: ToolApprovalState["activeApproval"];
  readonly activeRiskLevel: ToolApprovalState["activeRiskLevel"];
  readonly activeSessionId: string;
  readonly checkpointDiff: {
    content: string;
    snapshotHash?: string;
    isLoading: boolean;
    isVisible: boolean;
  };
  readonly closeCheckpointDiff: () => void;
  readonly closeSessionManager: () => void;
  readonly currentMode: CodingMode;
  readonly currentModel: string;
  readonly currentProvider: string;
  readonly dismissUpdateBanner: () => void;
  readonly handleApprove: () => void;
  readonly handleApproveAlways: () => void;
  readonly handleModeSelect: (mode: CodingMode) => void;
  readonly handleModelSelect: (selectedProvider: string, selectedModel: string) => void;
  readonly handleReject: () => void;
  readonly handleSessionSelected: (id: string) => void;
  readonly loadSessionPreviewMessages: (
    sessionId: string
  ) => Promise<readonly import("./tui/components/session/types.js").SessionPreviewMessage[] | null>;
  readonly pendingOperation: AsyncOperation | null;
  readonly sessions: SessionMetadata[];
  readonly showModeSelector: boolean;
  readonly showModelSelector: boolean;
  readonly showSessionManager: boolean;
  readonly showHelpModal: boolean;
  readonly closeHelpModal: () => void;
  readonly showApprovalQueue: boolean;
  readonly closeApprovalQueue: () => void;
  readonly pendingApprovals: readonly ToolExecution[];
  readonly onApproveQueueItem: (id: string) => void;
  readonly onRejectQueueItem: (id: string) => void;
  readonly onApproveAll: () => void;
  readonly onRejectAll: () => void;
  readonly themeContext: ThemeContextValue;
  readonly updateAvailable: { current: string; latest: string } | null;
}

function AppOverlays({
  activeApproval,
  activeRiskLevel,
  activeSessionId,
  checkpointDiff,
  closeCheckpointDiff,
  closeSessionManager,
  currentMode,
  currentModel,
  currentProvider,
  dismissUpdateBanner,
  handleApprove,
  handleApproveAlways,
  handleModeSelect,
  handleModelSelect,
  handleReject,
  handleSessionSelected,
  loadSessionPreviewMessages,
  pendingOperation,
  sessions,
  showModeSelector,
  showModelSelector,
  showSessionManager,
  showHelpModal,
  closeHelpModal,
  showApprovalQueue,
  closeApprovalQueue: _closeApprovalQueue,
  pendingApprovals,
  onApproveQueueItem,
  onRejectQueueItem,
  onApproveAll,
  onRejectAll,
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

      {showHelpModal && (
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={10}
          borderStyle="round"
          borderColor={themeContext.theme.colors.info}
          padding={1}
        >
          <HotkeyHelpModal
            isVisible={showHelpModal}
            onClose={closeHelpModal}
            hotkeys={DEFAULT_HOTKEYS}
          />
        </Box>
      )}

      {showApprovalQueue && pendingApprovals.length > 1 && (
        <Box
          position="absolute"
          marginTop={3}
          marginLeft={5}
          borderStyle="double"
          borderColor={themeContext.theme.colors.warning}
          padding={1}
        >
          <ApprovalQueue
            executions={pendingApprovals}
            onApprove={onApproveQueueItem}
            onReject={onRejectQueueItem}
            onApproveAll={onApproveAll}
            onRejectAll={onRejectAll}
            isFocused={showApprovalQueue}
          />
        </Box>
      )}

      {checkpointDiff.isVisible && (
        <Box
          position="absolute"
          marginTop={3}
          marginLeft={5}
          borderStyle="double"
          borderColor={themeContext.theme.colors.info}
          padding={1}
        >
          <CheckpointDiffView
            diffContent={checkpointDiff.content}
            snapshotHash={checkpointDiff.snapshotHash}
            isFocused={checkpointDiff.isVisible}
            isLoading={checkpointDiff.isLoading}
            maxHeight={24}
            onClose={closeCheckpointDiff}
          />
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
  readonly initError?: Error;
  readonly redoBacktrack: () => void;
  readonly specPhase: number;
  readonly tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
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
  initError,
  redoBacktrack,
  specPhase,
  tokenUsage,
  undoBacktrack,
}: AppHeaderProps): React.JSX.Element {
  const fileStats = useFileChangeStats();
  const showFileChanges = fileStats.additions > 0 || fileStats.deletions > 0;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <ModeIndicator mode={currentMode} specPhase={specPhase} compact />
        <CostDisplay
          inputTokens={tokenUsage.inputTokens}
          outputTokens={tokenUsage.outputTokens}
          totalCost={tokenUsage.totalCost}
          compact
        />
      </Box>
      {initError && <InitErrorBanner error={initError} />}
      {(currentTip || showFileChanges) && (
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexGrow={1}>
            {currentTip && <TipBanner tip={currentTip} onDismiss={dismissTip} compact />}
          </Box>
          {showFileChanges && (
            <Box flexDirection="row">
              <Text color="gray">diff </Text>
              <FileChangesIndicator
                additions={fileStats.additions}
                deletions={fileStats.deletions}
              />
            </Box>
          )}
        </Box>
      )}
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
  alternateBufferEnabled,
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
  credentialManager,
  getSubcommands,
  getLevel3Items,
  categoryOrder,
  categoryLabels,
  checkpointDiff,
  closeCheckpointDiff,
  onOpenCheckpointDiff,
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
  initError,
  followupPrompt,
  interactivePrompt,
  loadSessionPreviewMessages,
  isLoading,
  thinkingModeEnabled,
  memoryEntries,
  messages,
  pendingMessage,
  pendingOperation,
  promptPlaceholder,
  promptValue,
  setPromptValue,
  sessions,
  suppressPromptEnter,
  shouldShowBanner,
  showModeSelector,
  showModelSelector,
  showOnboarding,
  showSessionManager,
  showHelpModal,
  closeHelpModal,
  showApprovalQueue,
  closeApprovalQueue,
  pendingApprovals,
  onApproveQueueItem,
  onRejectQueueItem,
  onApproveAll,
  onRejectAll,
  showSidebar,
  sidebarContent,
  specPhase,
  themeContext,
  taskChain,
  currentTaskId,
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
  workspace,
  branch,
  changedFiles,
  persistence,
  snapshots,
  providerStatus,
  costWarningState,
  autoApprovalState,
  vimEnabled,
  vimMode,
}: AppContentViewProps): React.JSX.Element {
  const sidebar = renderSidebarContent({
    announce,
    showSidebar,
    sidebarContent,
    todoItems,
    refreshTodos,
    memoryEntries,
    toolRegistry,
    persistence,
    snapshots,
    taskChain,
    currentTaskId,
    onOpenCheckpointDiff,
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
      thinking={{ active: thinkingModeEnabled }}
      showAllModes={showModeSelector}
      persistence={persistence}
    />
  );

  // Extended footer with ModelStatusBar and warnings
  const extendedFooter = (
    <Box flexDirection="column">
      {/* Cost warning - show above status bar when approaching/exceeding limit */}
      {costWarningState.show && (
        <CostWarning
          costUsed={tokenUsage.totalCost}
          costLimit={costWarningState.costLimit}
          requestsUsed={0}
          requestLimit={costWarningState.requestLimit}
          percentUsed={costWarningState.percentUsed}
          limitReached={costWarningState.limitReached}
          compact={true}
          severity={costWarningState.limitReached ? "error" : "warning"}
        />
      )}
      {/* Auto-approval status - show when auto-approvals are active */}
      {autoApprovalState && autoApprovalState.consecutiveRequests > 0 && (
        <AutoApprovalStatus
          consecutiveRequests={autoApprovalState.consecutiveRequests}
          requestLimit={autoApprovalState.requestLimit}
          consecutiveCost={autoApprovalState.consecutiveCost}
          costLimit={autoApprovalState.costLimit}
          requestPercentUsed={autoApprovalState.requestPercentUsed}
          costPercentUsed={autoApprovalState.costPercentUsed}
          limitReached={autoApprovalState.limitReached}
          limitType={autoApprovalState.limitType}
          compact={true}
        />
      )}
      {/* Model status bar - shows provider health */}
      {providerStatus.providers.length > 1 && (
        <Box marginBottom={1}>
          <ModelStatusBar providers={providerStatus.providers} compact={true} maxVisible={5} />
        </Box>
      )}
      {/* Main status bar */}
      {footer}
    </Box>
  );

  // Conditional rendering to avoid hook count mismatch from early returns
  const showBannerView = shouldShowBanner && !bannerSplashComplete;
  const showMainView = !showOnboarding && !showBannerView;

  const commandPlaceholder = followupPrompt
    ? "Reply to follow-up..."
    : isLoading
      ? "Thinking..."
      : "Type a message or /command...";

  const commandInputDisabled =
    (isLoading && !followupPrompt) || !!interactivePrompt || !!pendingOperation;

  const commandInputFocused =
    (!isLoading || !!followupPrompt) &&
    !showModeSelector &&
    !showModelSelector &&
    !showSessionManager &&
    !showHelpModal &&
    !activeApproval &&
    !interactivePrompt &&
    !pendingOperation;

  const headerContent = (
    <AppHeader
      backtrackState={backtrackState}
      branches={branches}
      currentMode={currentMode}
      currentTip={currentTip}
      dismissTip={dismissTip}
      handleCreateBacktrackBranch={handleCreateBacktrackBranch}
      handleSwitchBacktrackBranch={handleSwitchBacktrackBranch}
      initError={initError}
      redoBacktrack={redoBacktrack}
      specPhase={specPhase}
      tokenUsage={tokenUsage}
      undoBacktrack={undoBacktrack}
    />
  );

  const layoutBody = (
    <>
      <Box flexDirection="column" flexGrow={1}>
        {/* Thinking content is now integrated into messages via the `thinking` field */}
        {/* T-VIRTUAL-SCROLL: Pass historyMessages for Static rendering optimization */}
        <MessageList
          messages={messages}
          historyMessages={messages.filter((m) => !m.isStreaming)}
          pendingMessage={pendingMessage}
          isLoading={isLoading}
          useVirtualizedList={true}
          estimatedItemHeight={4}
          scrollKeyMode={commandInputFocused ? "page" : "all"}
          forceFollowOnInput={true}
          useAltBuffer={alternateBufferEnabled}
          enableScroll={!alternateBufferEnabled}
          isFocused={
            !showModeSelector &&
            !showModelSelector &&
            !showSessionManager &&
            !showHelpModal &&
            !activeApproval &&
            !interactivePrompt &&
            !pendingOperation
          }
        />
      </Box>

      <Box flexShrink={0} flexDirection="column">
        {/* Followup prompt with suggestions - use OptionSelector for keyboard navigation */}
        {followupPrompt && followupPrompt.suggestions.length > 0 && (
          <OptionSelector
            question={followupPrompt.question}
            options={followupPrompt.suggestions}
            onSelect={(option) => {
              handleMessage(option);
            }}
            onCancel={() => {
              handleMessage("");
            }}
            isFocused={commandInputFocused}
          />
        )}
        {/* Followup prompt without suggestions - show simple text prompt */}
        {followupPrompt && followupPrompt.suggestions.length === 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color={themeContext.theme.semantic.text.secondary}>
              ↳ {followupPrompt.question}
            </Text>
            <Text dimColor>Type your reply and press Enter (Esc to skip)</Text>
          </Box>
        )}
        {interactivePrompt && (
          <Box
            borderStyle="round"
            borderColor={themeContext.theme.colors.warning}
            paddingX={2}
            paddingY={1}
            marginY={1}
            flexDirection="column"
          >
            {/* Title section */}
            {interactivePrompt.title && (
              <Box
                borderStyle="single"
                borderBottom
                borderColor={themeContext.theme.colors.warning}
                marginBottom={1}
              >
                <Text bold color={themeContext.theme.colors.warning}>
                  🔐 {interactivePrompt.title}
                </Text>
              </Box>
            )}
            {/* Help text section */}
            {interactivePrompt.helpText && (
              <Box marginBottom={1}>
                <Text color={themeContext.theme.semantic.text.muted}>
                  {interactivePrompt.helpText}
                </Text>
              </Box>
            )}
            {/* Format hint */}
            {interactivePrompt.formatHint && (
              <Text color={themeContext.theme.semantic.text.muted}>
                📋 Format: {interactivePrompt.formatHint}
              </Text>
            )}
            {/* Documentation URL hint */}
            {interactivePrompt.documentationUrl && (
              <Text color={themeContext.theme.semantic.text.muted}>
                📚 Docs: {interactivePrompt.documentationUrl}
              </Text>
            )}
            {/* Input area with spacing */}
            <Box flexDirection="column" marginTop={1}>
              {/* Original message (e.g., "API Key:") */}
              <Text>{interactivePrompt.message}</Text>
              {/* Select options */}
              {interactivePrompt.inputType === "select" && interactivePrompt.options && (
                <Box flexDirection="column" marginTop={1}>
                  {interactivePrompt.options.map((option, index) => (
                    <Text key={option}>{`${index + 1}. ${option}`}</Text>
                  ))}
                </Box>
              )}
              {/* Input field */}
              <Box marginTop={1} flexGrow={1}>
                <Text color={themeContext.theme.semantic.text.muted}>{promptPlaceholder} </Text>
                <Box flexGrow={1}>
                  <TextInput
                    value={promptValue}
                    onChange={setPromptValue}
                    onSubmit={handlePromptSubmit}
                    mask={interactivePrompt.inputType === "password" ? "*" : undefined}
                    focused={!suppressPromptEnter}
                    suppressEnter={suppressPromptEnter}
                    showBorder={false}
                  />
                </Box>
              </Box>
            </Box>
            {/* Footer hint */}
            <Box marginTop={1}>
              <Text dimColor>Press Enter to submit, Esc to cancel</Text>
            </Box>
          </Box>
        )}

        {/* Focus Debug: logs focus conditions when they change */}
        <FocusDebugger
          isLoading={isLoading}
          showModeSelector={showModeSelector}
          showModelSelector={showModelSelector}
          showSessionManager={showSessionManager}
          showHelpModal={showHelpModal}
          activeApproval={activeApproval}
          interactivePrompt={interactivePrompt}
          pendingOperation={pendingOperation}
        />
        {/* Vim mode indicator (shown above input when vim mode is enabled) */}
        {vimEnabled && (
          <Box marginBottom={0}>
            <VimModeIndicator enabled={vimEnabled} mode={vimMode} />
          </Box>
        )}
        <EnhancedCommandInput
          onMessage={handleMessage}
          onCommand={handleCommand}
          commands={commandOptions}
          getSubcommands={getSubcommands}
          getLevel3Items={getLevel3Items}
          groupedCommands={true}
          categoryOrder={categoryOrder}
          categoryLabels={categoryLabels}
          placeholder={commandPlaceholder}
          disabled={commandInputDisabled}
          focused={commandInputFocused}
          historyKey="vellum-command-history"
          cwd={process.cwd()}
        />
      </Box>
    </>
  );

  const screenReaderStatus = pendingOperation
    ? pendingOperation.message
    : isLoading
      ? "Thinking..."
      : "Ready";

  const screenReaderContent = (
    <Box flexDirection="column">
      {layoutBody}
      {showSidebar && sidebar && (
        <Box marginTop={1} flexDirection="column">
          <Text color={themeContext.theme.semantic.text.muted}>Sidebar</Text>
          {sidebar}
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
          onCancel={cancelOnboarding}
          credentialManager={credentialManager ?? undefined}
        />
      )}

      {!showOnboarding && showBannerView && (
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
      )}

      {showMainView && (
        <>
          <AppOverlays
            activeApproval={activeApproval}
            activeRiskLevel={activeRiskLevel}
            activeSessionId={activeSessionId}
            checkpointDiff={checkpointDiff}
            closeCheckpointDiff={closeCheckpointDiff}
            closeSessionManager={closeSessionManager}
            currentMode={currentMode}
            currentModel={currentModel}
            currentProvider={currentProvider}
            dismissUpdateBanner={dismissUpdateBanner}
            handleApprove={handleApprove}
            handleApproveAlways={handleApproveAlways}
            handleModeSelect={handleModeSelect}
            handleModelSelect={handleModelSelect}
            handleReject={handleReject}
            handleSessionSelected={handleSessionSelected}
            loadSessionPreviewMessages={loadSessionPreviewMessages}
            pendingOperation={pendingOperation}
            sessions={sessions}
            showModeSelector={showModeSelector}
            showModelSelector={showModelSelector}
            showSessionManager={showSessionManager}
            showHelpModal={showHelpModal}
            closeHelpModal={closeHelpModal}
            showApprovalQueue={showApprovalQueue}
            closeApprovalQueue={closeApprovalQueue}
            pendingApprovals={pendingApprovals}
            onApproveQueueItem={onApproveQueueItem}
            onRejectQueueItem={onRejectQueueItem}
            onApproveAll={onApproveAll}
            onRejectAll={onRejectAll}
            themeContext={themeContext}
            updateAvailable={updateAvailable}
          />

          <AdaptiveLayout
            regularLayout={
              <Layout
                header={headerContent}
                footer={extendedFooter}
                sidebar={sidebar}
                showSidebar={showSidebar}
                workspace={workspace}
                branch={branch ?? undefined}
                changedFiles={changedFiles}
              >
                {layoutBody}
              </Layout>
            }
            header={headerContent}
            footer={extendedFooter}
            status={screenReaderStatus}
          >
            {screenReaderContent}
          </AdaptiveLayout>
        </>
      )}
    </>
  );
}

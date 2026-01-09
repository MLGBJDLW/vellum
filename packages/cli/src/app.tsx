import type { ApprovalPolicy, CodingMode, ModeManager, SandboxPolicy } from "@vellum/core";
import { Box, Text, useApp as useInkApp, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  batchCommand,
  CommandExecutor,
  CommandRegistry,
  clearCommand,
  createTestContextProvider,
  enhancedAuthCommands,
  exitCommand,
  helpCommand,
  metricsCommands,
  setHelpRegistry,
  setThemeContext,
  themeSlashCommands,
} from "./commands/index.js";
import { modeSlashCommands } from "./commands/mode.js";
import { setShutdownCleanup } from "./index.js";
import { useAgentAdapter } from "./tui/adapters/agent-adapter.js";
// Adapters
import {
  createMemorySessionStorage,
  type SessionStorage,
  useSessionAdapter,
} from "./tui/adapters/session-adapter.js";
// Core components
import { CostDisplay } from "./tui/components/CostDisplay.js";
import { Header } from "./tui/components/Header.js";
// Input components - Replace TextInput with CommandInput
import { CommandInput, type SlashCommand } from "./tui/components/Input/CommandInput.js";
import { Layout } from "./tui/components/Layout.js";
import { MemoryPanel, type MemoryPanelProps } from "./tui/components/MemoryPanel.js";
import { MessageList } from "./tui/components/Messages/MessageList.js";
// StatusBar enhancement components
import { ModeIndicator } from "./tui/components/ModeIndicator.js";
import { ModelSelector } from "./tui/components/ModelSelector.js";
// Layout enhancement components
import { ModeSelector } from "./tui/components/ModeSelector.js";
import { OnboardingWizard } from "./tui/components/OnboardingWizard.js";
import { PhaseProgressIndicator } from "./tui/components/PhaseProgressIndicator.js";
import { AgentModeIndicator } from "./tui/components/StatusBar/AgentModeIndicator.js";
import { StatusBar } from "./tui/components/StatusBar/StatusBar.js";
import { ThinkingModeIndicator } from "./tui/components/StatusBar/ThinkingModeIndicator.js";
import {
  type TrustMode,
  TrustModeIndicator,
} from "./tui/components/StatusBar/TrustModeIndicator.js";
import { SessionPicker } from "./tui/components/session/SessionPicker.js";
import type { SessionMetadata } from "./tui/components/session/types.js";
// Message enhancement components
import { ThinkingBlock } from "./tui/components/ThinkingBlock.js";
import type { TodoItemData } from "./tui/components/TodoItem.js";
import { TodoPanel } from "./tui/components/TodoPanel.js";
import { UpdateBanner } from "./tui/components/UpdateBanner.js";
import type { Message } from "./tui/context/MessagesContext.js";
// Context providers
import { RootProvider } from "./tui/context/RootProvider.js";
import { useTheme } from "./tui/theme/index.js";
import { calculateCost, getContextWindow } from "./utils/index.js";

// CodeBlock and DiffView are used within MessageList for rich rendering

import type { AgentLoop, PermissionResponse } from "@vellum/core";
// Banner component (ASCII Art with shimmer animation)
import { Banner } from "./tui/components/Banner/index.js";
// Backtrack components
import { BacktrackControls } from "./tui/components/backtrack/BacktrackControls.js";
// Tool/Permission components
import { ApprovalQueue } from "./tui/components/Tools/ApprovalQueue.js";
import { PermissionDialog, type RiskLevel } from "./tui/components/Tools/PermissionDialog.js";
import type { ToolExecution } from "./tui/context/ToolsContext.js";
import { useAgentLoop } from "./tui/hooks/useAgentLoop.js";
import { useAlternateBuffer } from "./tui/hooks/useAlternateBuffer.js";
import { useBacktrack } from "./tui/hooks/useBacktrack.js";
import { useCopyMode } from "./tui/hooks/useCopyMode.js";
import { useDesktopNotification } from "./tui/hooks/useDesktopNotification.js";
// Hooks
import { type HotkeyDefinition, useHotkeys } from "./tui/hooks/useHotkeys.js";
import { useInputHistory } from "./tui/hooks/useInputHistory.js";
import { useModeShortcuts } from "./tui/hooks/useModeShortcuts.js";
import { usePermissionHandler } from "./tui/hooks/usePermissionHandler.js";
import { useScreenReader } from "./tui/hooks/useScreenReader.js";
// New TUI hooks (T038-T059)
import { useVim } from "./tui/hooks/useVim.js";
// LSP integration (T062)
import { disposeLsp, initializeLsp, type LspIntegrationResult } from "./tui/lsp-integration.js";
// Plugin system integration (T061)
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
import type { ThemeName } from "./tui/theme/index.js";
// Tip integration (T069)
import { buildTipContext, useTipEngine } from "./tui/tip-integration.js";

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
  /** UI theme (dark, parchment, dracula, etc.) */
  theme?: ThemeName;
}

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

  // Register batch command (T048)
  registry.register(batchCommand);

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
  theme = "parchment",
}: AppProps) {
  return (
    <RootProvider theme={theme}>
      <AppContent
        model={model}
        provider={provider}
        mode={_mode}
        approval={_approval}
        sandbox={_sandbox}
        agentLoop={agentLoopProp}
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
}: AppProps) {
  const { exit } = useInkApp();
  const themeContext = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fix 5: Startup SplashScreen state
  const [isInitializing, setIsInitializing] = useState(true);

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

  // Fix 5: SplashScreen initialization timer
  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 1500);
    return () => clearTimeout(timer);
  }, []);

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
  const [_enterpriseHooks, setEnterpriseHooks] = useState<EnterpriseHooks | null>(null);
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

  // T069: Tip engine integration
  const {
    currentTip,
    showTip,
    dismissTip: _dismissTip,
    tipsEnabled,
  } = useTipEngine({
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
  // UI State Management
  // ==========================================================================

  // Current coding mode state
  const [currentMode, setCurrentMode] = useState<CodingMode>(_mode);

  // Modal visibility states
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSessionManager, setShowSessionManager] = useState(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstRun] = useState(() => {
    // Check if user has completed onboarding (use env var for terminal)
    return !process.env.VELLUM_ONBOARDED;
  });

  // Spec mode phase tracking
  const [specPhase, _setSpecPhase] = useState(1);

  // Approval queue for batch tool approvals
  const [pendingApprovals, setPendingApprovals] = useState<ToolExecution[]>([]);

  // Sidebar visibility states
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarContent, setSidebarContent] = useState<"memory" | "todo">("memory");

  // Thinking state for ThinkingBlock
  const [thinkingContent, setThinkingContent] = useState("");

  // ==========================================================================
  // FIX 2: Session Management - Connect Real Session Data
  // ==========================================================================

  // Session storage (in-memory for now, can be replaced with file-based storage)
  const sessionStorage = useMemo<SessionStorage>(() => createMemorySessionStorage(), []);

  // Session list state - loaded from storage
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(`session-${Date.now()}`);

  // ==========================================================================
  // Adapter Integration - Session Adapter (T060)
  // ==========================================================================

  // Session adapter for persistence with auto-save
  const {
    saveSession,
    loadSession,
    clearSession,
    isSaving,
    isLoading: isSessionLoading,
    error: sessionError,
  } = useSessionAdapter({
    sessionId: activeSessionId,
    storage: sessionStorage,
    autoSave: true,
    saveDebounceMs: 2000, // Auto-save after 2 seconds of inactivity
    autoLoad: true, // Load session on mount
  });

  // Handle session errors
  useEffect(() => {
    if (sessionError) {
      console.error("Session error:", sessionError.message);
      notifyError(`Session error: ${sessionError.message}`);
    }
  }, [sessionError, notifyError]);

  // Load sessions on mount and save current session
  useEffect(() => {
    // In a real implementation, this would load from a session list file
    // For now, we create one session entry for the current session
    const currentSession: SessionMetadata = {
      id: activeSessionId,
      title: "Current Session",
      timestamp: new Date(),
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1]?.content.slice(0, 50),
    };
    setSessions([currentSession]);

    // Save current session to storage
    if (messages.length > 0) {
      sessionStorage.save(activeSessionId, []);
    }
  }, [activeSessionId, messages.length, messages, sessionStorage]);

  // ==========================================================================
  // FIX 4: Real Todo and Memory Data
  // ==========================================================================

  // Todo items - connected to session state (would come from tool results)
  const [todoItems, setTodoItems] = useState<TodoItemData[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true);

  // Trust mode state
  const [trustMode, _setTrustMode] = useState<TrustMode>("ask");

  // ==========================================================================
  // FIX 3: Permission System Integration
  // ==========================================================================

  // Permission handler hook - creates handler for tool execution approval
  const {
    pendingPermission,
    isDialogVisible: _isDialogVisible,
    handler: _permissionHandler,
    respond: respondToPermission,
  } = usePermissionHandler();

  // Permission dialog state (derived from permission handler)
  const [pendingApproval, setPendingApproval] = useState<{
    execution: ToolExecution;
    riskLevel: RiskLevel;
  } | null>(null);

  // Sync permission handler state with dialog state
  useEffect(() => {
    if (pendingPermission) {
      // Convert PendingPermission to ToolExecution format for dialog
      const execution: ToolExecution = {
        id: pendingPermission.id,
        toolName: pendingPermission.info.type,
        params: pendingPermission.info.metadata ?? {},
        status: "pending",
      };
      // Determine risk level from permission type
      const riskLevel: RiskLevel = ["bash", "edit", "write"].includes(pendingPermission.info.type)
        ? "high"
        : "medium";
      setPendingApproval({ execution, riskLevel });
    } else {
      setPendingApproval(null);
    }
  }, [pendingPermission]);

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

  // Backtrack hook for undo/redo conversation state
  const {
    backtrackState,
    branches,
    push: pushBacktrack,
    undo: undoBacktrack,
    redo: redoBacktrack,
  } = useBacktrack({
    initialState: { messages: [] as Message[] },
    maxHistory: 50,
    enableBranching: true,
    onStateChange: (state, action) => {
      if (action === "undo" || action === "redo") {
        setMessages(state.messages);
        announce(`${action === "undo" ? "Undid" : "Redid"} last message`);
      }
    },
  });

  // Sync messages with backtrack state
  // Use a ref to track last message count to avoid unnecessary pushBacktrack calls
  const lastMessageCountRef = useRef(0);
  useEffect(() => {
    // Only push backtrack when messages are actually added (not just re-renders)
    if (messages.length > 0 && messages.length !== lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length;
      pushBacktrack({ messages }, "Message added");
    }
  }, [messages, pushBacktrack]);

  // Mode shortcuts hook (Ctrl+1/2/3)
  // Note: ModeManager would be provided by a higher-level context in production
  const modeManagerRef = useRef<ModeManager | null>(null);
  useModeShortcuts({
    modeManager: modeManagerRef.current,
    enabled: !showModeSelector && !pendingApproval,
    onModeSwitch: (mode, success) => {
      if (success) {
        setCurrentMode(mode);
        announce(`Switched to ${mode} mode`);
      }
    },
  });

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
      {
        key: "b",
        ctrl: true,
        handler: () => setShowSidebar((prev) => !prev),
        description: "Toggle sidebar",
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
      {
        key: "1",
        ctrl: true,
        handler: () => {
          setCurrentMode("vibe");
          announce("Switched to vibe mode");
        },
        description: "Switch to vibe mode",
        scope: "global",
      },
      {
        key: "2",
        ctrl: true,
        handler: () => {
          setCurrentMode("plan");
          announce("Switched to plan mode");
        },
        description: "Switch to plan mode",
        scope: "global",
      },
      {
        key: "3",
        ctrl: true,
        handler: () => {
          setCurrentMode("spec");
          announce("Switched to spec mode");
        },
        description: "Switch to spec mode",
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
      !pendingApproval &&
      !showSessionManager &&
      !showOnboarding,
  });

  // T042: Wire theme context to theme commands
  useEffect(() => {
    setThemeContext(themeContext);
    return () => setThemeContext(null);
  }, [themeContext]);

  // T036: Initialize command registry once on mount
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
  }, [commandRegistry]);

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
  }, []);

  // T036: Create command executor with context provider
  const commandExecutor = useMemo(() => {
    const contextProvider = createTestContextProvider({
      session: {
        id: `session-${Date.now()}`,
        provider,
        cwd: process.cwd(),
      },
      emit: (event, _data) => {
        // Handle app events
        if (event === "app:exit") {
          exit();
        }
        // Log other events for debugging
        // console.log(`[Event] ${event}`, _data);
      },
    });
    return new CommandExecutor(commandRegistry, contextProvider);
  }, [commandRegistry, provider, exit]);

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

  // Handle Ctrl+C and ESC for cancellation (T031)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler must process multiple input types in a single callback for proper event handling
  useInput((inputChar, key) => {
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
        setMessages((prev) => [...prev, createMessage("assistant", "[Operation cancelled]")]);
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
        setMessages((prev) => [
          ...prev,
          createMessage("assistant", "[Operation cancelled by Ctrl+C]"),
        ]);
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

      // Execute command
      const result = await commandExecutor.execute(text);

      // Handle result
      switch (result.kind) {
        case "success":
          if (result.message) {
            setMessages((prev) => [...prev, createMessage("assistant", result.message ?? "")]);
          }
          if (result.clearScreen) {
            setMessages([]);
            // Also clear session storage when clearing screen
            void clearSession();
          }
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            createMessage(
              "assistant",
              `[x] ${result.message}${result.suggestions ? `\n   Did you mean: ${result.suggestions.join(", ")}?` : ""}`
            ),
          ]);
          break;

        case "interactive":
          // For now, show the prompt message - full interactive handling to be added
          setMessages((prev) => [...prev, createMessage("assistant", result.prompt.message)]);
          break;

        case "pending":
          setMessages((prev) => [...prev, createMessage("assistant", result.operation.message)]);
          break;
      }

      return true; // Was a slash command
    },
    [commandExecutor, clearSession]
  );

  // Handle message submission (for CommandInput onMessage)
  const handleMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add to input history
      addToHistory(text);

      setMessages((prev) => [...prev, createMessage("user", text)]);

      // Announce for screen reader
      announce(`You said: ${text}`);

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
          await agentLoopHook.run(text);
          // Sync messages from AgentLoop to local state
          const agentMessages = agentLoopHook.messages.map((m) => createMessage(m.role, m.content));
          setMessages((prev) => {
            // Remove the user message we already added, then add all from agent
            const withoutLast = prev.slice(0, -1);
            return [...withoutLast, ...agentMessages];
          });
          // Notify on completion (T059)
          notifyTaskComplete("Response received");
          announce("Response received");
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          notifyError(errorMsg);
          setMessages((prev) => [...prev, createMessage("assistant", `[x] Error: ${errorMsg}`)]);
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
                setMessages((prev) => [...prev, createMessage("assistant", `[Echo] ${text}`)]);
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
    [addToHistory, announce, agentLoopHook, notifyTaskComplete, notifyError]
  );

  // Handle slash command submission (for CommandInput onCommand)
  const handleCommand = useCallback(
    async (command: SlashCommand) => {
      // Add to history
      addToHistory(command.raw);

      // Execute via the command executor
      const wasCommand = await handleSlashCommand(command.raw);
      if (!wasCommand) {
        setMessages((prev) => [
          ...prev,
          createMessage("assistant", `Unknown command: /${command.name}`),
        ]);
      }
    },
    [addToHistory, handleSlashCommand]
  );

  // Get available command names for CommandInput autocomplete
  const commandNames = useMemo(() => {
    return commandRegistry.list().map((cmd) => cmd.name);
  }, [commandRegistry]);

  // Handle permission dialog responses
  const handleApprove = useCallback(() => {
    if (pendingApproval && pendingPermission) {
      announce("Tool execution approved");

      // FIX 3: Actually execute the approved tool via permission handler
      // Use correct PermissionResponse type: "once" | "always" | "reject"
      respondToPermission("once" as PermissionResponse);

      // Add tool execution message
      setMessages((prev) => [
        ...prev,
        createMessage("assistant", `Executing tool: ${pendingApproval.execution.toolName}...`),
      ]);

      // Tool result will come through the agent adapter in production
      // For now, we clear the approval state
      setPendingApproval(null);
    }
  }, [pendingApproval, pendingPermission, respondToPermission, announce]);

  const handleReject = useCallback(() => {
    if (pendingApproval && pendingPermission) {
      announce("Tool execution rejected");

      // FIX 3: Respond to permission handler with rejection
      respondToPermission("reject" as PermissionResponse);

      setMessages((prev) => [
        ...prev,
        createMessage(
          "assistant",
          `Tool execution rejected: ${pendingApproval.execution.toolName}`
        ),
      ]);
      setPendingApproval(null);
    }
  }, [pendingApproval, pendingPermission, respondToPermission, announce]);

  // Handle mode selection with persistence (FIX 5)
  const handleModeSelect = useCallback(
    (mode: CodingMode) => {
      setCurrentMode(mode);
      setShowModeSelector(false);
      announce(`Mode changed to ${mode}`);

      // FIX 5: Persist mode (in production, write to config file)
      // This could use a config adapter in production
      process.env.VELLUM_MODE = mode;
    },
    [announce]
  );

  // Model selection state
  const [currentModel, setCurrentModel] = useState(model);
  const [currentProvider, setCurrentProvider] = useState(provider);

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

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(
    (result: { provider: string; mode: string; credentialsConfigured: boolean }) => {
      process.env.VELLUM_ONBOARDED = "true";
      setShowOnboarding(false);
      setCurrentProvider(result.provider);
      // Task 4: Sync model with provider selection
      const defaultModel = getDefaultModelForProvider(result.provider);
      setCurrentModel(defaultModel);
      setCurrentMode(result.mode as CodingMode);
      // Task 5: Persist configuration (environment-based for now, config file in production)
      process.env.VELLUM_PROVIDER = result.provider;
      process.env.VELLUM_MODEL = defaultModel;
      process.env.VELLUM_MODE = result.mode;
      announce("Welcome to Vellum! Onboarding complete.");
    },
    [announce]
  );

  // Handle approval queue actions
  const handleQueueApprove = useCallback(
    (id: string) => {
      setPendingApprovals((prev) => prev.filter((p) => p.id !== id));
      announce("Tool execution approved");
    },
    [announce]
  );

  const handleQueueReject = useCallback(
    (id: string) => {
      setPendingApprovals((prev) => prev.filter((p) => p.id !== id));
      announce("Tool execution rejected");
    },
    [announce]
  );

  const handleQueueApproveAll = useCallback(() => {
    setPendingApprovals([]);
    announce("All tool executions approved");
  }, [announce]);

  const handleQueueRejectAll = useCallback(() => {
    setPendingApprovals([]);
    announce("All tool executions rejected");
  }, [announce]);

  // Memory entries - connected to memory files
  const [memoryEntries, setMemoryEntries] = useState<MemoryPanelProps["entries"]>([]);

  // Load memory entries from .vellum/memories directory
  useEffect(() => {
    // In production, this would load from actual memory files
    // The memoryEntries would be populated by the memory adapter
    // For now, we initialize empty and populate as tool results come in
    setMemoryEntries([]);
  }, []);

  // Update todo items when tool results include todo operations
  const handleTodoToolResult = useCallback((action: string, item?: TodoItemData) => {
    if (action === "add" && item) {
      setTodoItems((prev) => [...prev, item]);
    } else if (action === "complete" && item) {
      setTodoItems((prev) =>
        prev.map((t) =>
          t.id === item.id
            ? { ...t, status: "completed", completedAt: new Date().toISOString() }
            : t
        )
      );
    } else if (action === "remove" && item) {
      setTodoItems((prev) => prev.filter((t) => t.id !== item.id));
    }
  }, []);

  // Expose handleTodoToolResult for tool execution results
  // This would be called when a tool like manage_todo_list returns results
  useEffect(() => {
    // Register the handler (in production, this would wire to the agent adapter)
    // For demonstration, we ensure the handler is available
    void handleTodoToolResult;
  }, [handleTodoToolResult]);

  // Token tracking state for CostDisplay and TokenCounter
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
  });

  // Get context window for the current model
  const contextWindow = useMemo(() => getContextWindow(provider, model), [provider, model]);

  // Update token usage when messages change (simulated for now)
  useEffect(() => {
    // Approximate token count: ~4 chars per token
    const inputChars = messages
      .filter((m) => m.role === "user")
      .reduce((sum, m) => sum + m.content.length, 0);
    const outputChars = messages
      .filter((m) => m.role === "assistant")
      .reduce((sum, m) => sum + m.content.length, 0);

    const inputTokens = Math.ceil(inputChars / 4);
    const outputTokens = Math.ceil(outputChars / 4);
    // Calculate cost using model-specific pricing
    const totalCost = calculateCost(provider, model, inputTokens, outputTokens);

    setTokenUsage({ inputTokens, outputTokens, totalCost });
  }, [messages, provider, model]);

  // Calculate total tokens for StatusBar
  const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

  // ==========================================================================
  // Sidebar Content Renderer
  // ==========================================================================
  const renderSidebar = () => {
    if (!showSidebar) return undefined;

    if (sidebarContent === "todo") {
      return (
        <TodoPanel
          items={todoItems}
          isFocused={showSidebar}
          maxHeight={20}
          onActivateItem={(item) => {
            announce(`Selected: ${item.title}`);
          }}
        />
      );
    }

    return <MemoryPanel entries={memoryEntries} isFocused={showSidebar} maxHeight={20} />;
  };

  // ==========================================================================
  // Enhanced Status Bar with Indicators
  // ==========================================================================
  const renderEnhancedStatusBar = () => (
    <Box flexDirection="row" gap={1}>
      <StatusBar
        model={{ provider, model }}
        tokens={{ current: totalTokens, max: contextWindow }}
      />
      <ModeIndicator mode={currentMode} />
      {/* Fix 2: TokenCounter removed - already in StatusBar */}
      <ThinkingModeIndicator active={isThinking} />
      <TrustModeIndicator mode={trustMode} />
      <AgentModeIndicator agentName="orchestrator" level={0} />
      {isSaving && (
        <Box>
          <Text color={themeContext.theme.colors.muted}>[S]</Text>
        </Box>
      )}
      {isSessionLoading && (
        <Box>
          <Text color={themeContext.theme.colors.info}>[...]</Text>
        </Box>
      )}
      {agentAdapter.isConnected && (
        <Box>
          <Text color={themeContext.theme.colors.success}>[+]</Text>
        </Box>
      )}
    </Box>
  );

  // ==========================================================================
  // Main Render
  // ==========================================================================

  // Fix 5: Early return for Banner during initialization
  if (isInitializing) {
    return (
      <Banner
        showVersion
        version="0.1.0"
        animated
        autoHide
        displayDuration={1500}
        onComplete={() => setIsInitializing(false)}
      />
    );
  }

  // Fix 1: Early return when onboarding is showing (hide main layout)
  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onCancel={() => setShowOnboarding(false)}
      />
    );
  }

  return (
    <>
      {/* Update Banner */}
      {updateAvailable && (
        <UpdateBanner
          currentVersion={updateAvailable.current}
          latestVersion={updateAvailable.latest}
          dismissible
          onDismiss={() => setUpdateAvailable(null)}
          compact
        />
      )}

      {/* Mode Selector Modal */}
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

      {/* Session Manager Modal */}
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
            onSelect={(id) => {
              announce(`Selected session: ${id}`);
              setActiveSessionId(id);
              setShowSessionManager(false);
              // Load the selected session's messages via adapter
              void loadSession();
            }}
            onClose={() => setShowSessionManager(false)}
            isOpen={showSessionManager}
          />
        </Box>
      )}

      {/* Permission Dialog */}
      {pendingApproval && (
        <Box
          position="absolute"
          marginTop={5}
          marginLeft={10}
          borderStyle="double"
          borderColor={themeContext.theme.colors.warning}
          padding={1}
        >
          <PermissionDialog
            execution={pendingApproval.execution}
            riskLevel={pendingApproval.riskLevel}
            onApprove={handleApprove}
            onReject={handleReject}
            isFocused
          />
        </Box>
      )}

      {/* Model Selector Modal */}
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

      {/* Approval Queue for batch tool approvals */}
      {pendingApprovals.length > 0 && !pendingApproval && (
        <Box
          position="absolute"
          marginTop={3}
          marginLeft={5}
          borderStyle="round"
          borderColor={themeContext.theme.colors.warning}
          padding={1}
        >
          <ApprovalQueue
            executions={pendingApprovals}
            onApprove={handleQueueApprove}
            onReject={handleQueueReject}
            onApproveAll={handleQueueApproveAll}
            onRejectAll={handleQueueRejectAll}
            isFocused={pendingApprovals.length > 0}
          />
        </Box>
      )}

      {/* Main Layout */}
      <Layout
        header={
          <Box flexDirection="column">
            {/* Fix 4: Tip Banner moved inside Layout header */}
            {currentTip && (
              <Box
                marginBottom={1}
                paddingX={1}
                borderStyle="single"
                borderColor={themeContext.theme.colors.info}
              >
                <Text>
                  <Text color={themeContext.theme.colors.info}>{currentTip.icon ?? "[i]"} </Text>
                  <Text bold>{currentTip.title}: </Text>
                  <Text>{currentTip.content}</Text>
                  <Text color={themeContext.theme.colors.muted}> (press any key to dismiss)</Text>
                </Text>
              </Box>
            )}
            <Header model={currentModel} provider={currentProvider} mode={currentMode} />
            {/* Phase Progress Indicator for spec mode */}
            {currentMode === "spec" && (
              <PhaseProgressIndicator currentPhase={specPhase} showLabels showPercentage />
            )}
            {/* Backtrack Controls when history is available */}
            {backtrackState.historyLength > 1 && (
              <BacktrackControls
                backtrackState={backtrackState}
                branches={branches}
                onUndo={undoBacktrack}
                onRedo={redoBacktrack}
                onCreateBranch={() => {}}
                onSwitchBranch={() => {}}
              />
            )}
          </Box>
        }
        footer={
          // Fix 3: Consolidate footer to single row
          <Box flexDirection="row" justifyContent="space-between">
            {renderEnhancedStatusBar()}
            <CostDisplay
              inputTokens={tokenUsage.inputTokens}
              outputTokens={tokenUsage.outputTokens}
              totalCost={tokenUsage.totalCost}
              compact
            />
          </Box>
        }
        sidebar={renderSidebar()}
        showSidebar={showSidebar}
      >
        {/* Thinking Block */}
        {isThinking && (
          <ThinkingBlock
            content={thinkingContent}
            isStreaming={isThinking}
            collapsed={thinkingCollapsed}
            onToggle={() => setThinkingCollapsed((prev) => !prev)}
          />
        )}

        {/* Message List */}
        <MessageList messages={messages} />

        {/* Command Input (replaces TextInput) */}
        <CommandInput
          onMessage={handleMessage}
          onCommand={handleCommand}
          commands={commandNames}
          placeholder={isLoading ? "Thinking..." : "Type a message or /command..."}
          disabled={isLoading}
          focused={
            !isLoading &&
            !showModeSelector &&
            !showModelSelector &&
            !showSessionManager &&
            !pendingApproval &&
            pendingApprovals.length === 0
          }
          historyKey="vellum-command-history"
        />
      </Layout>
    </>
  );
}

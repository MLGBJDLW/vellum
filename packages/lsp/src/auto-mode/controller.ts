import { EventEmitter } from "node:events";

import type { AutoModeConfig, AutoModeLevel, LanguageOverride } from "./config.js";
import type { LanguageDetector } from "./detector.js";
import type {
  ConfirmationRequest,
  DetectedLanguage,
  LspServerState,
  LspStateChangeEvent,
} from "./types.js";

/**
 * Options for the AutoModeController
 */
export interface ControllerOptions {
  /** Auto-mode configuration */
  config: AutoModeConfig;
  /** Workspace root directory */
  workspaceRoot: string;
  /** Callback to install a server (provided by LspHub) */
  onInstall: (serverId: string) => Promise<void>;
  /** Callback to start a server (provided by LspHub) */
  onStart: (serverId: string, root: string) => Promise<void>;
  /** Callback to stop a server (provided by LspHub) */
  onStop: (serverId: string) => Promise<void>;
  /** Check if a server is installed */
  isInstalled: (serverId: string) => Promise<boolean>;
  /** Check if a server is currently running */
  isRunning: (serverId: string) => boolean;
  /** UI callback for semi-auto mode confirmations */
  requestConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
  /** Language detector for workspace scanning */
  detector?: LanguageDetector;
  /** Check if a server is enabled in LspConfig (not in disabled list) */
  isServerEnabled?: (serverId: string) => boolean;
}

/**
 * Pending action awaiting user confirmation
 */
interface PendingAction {
  serverId: string;
  languageId: string;
  action: "install" | "start";
  resolve: (approved: boolean) => void;
}

/**
 * AutoModeController - State machine for LSP auto-mode
 *
 * Manages the lifecycle of LSP servers based on detected languages:
 * - auto: Automatically install and start servers
 * - semi-auto: Request user confirmation before actions
 * - manual: Only detect, no automatic actions
 *
 * State Machine:
 * ```
 * idle ─► detecting ─┬─► needs-install ─► waiting-confirm ─► installing ─┐
 *                    ├─► needs-start ───► waiting-confirm ─► starting ───┼─► running
 *                    └─► running ─────────────────────────────────────────┘
 * ```
 */
export class AutoModeController extends EventEmitter {
  private readonly config: AutoModeConfig;
  private readonly workspaceRoot: string;
  private readonly onInstall: ControllerOptions["onInstall"];
  private readonly onStart: ControllerOptions["onStart"];
  private readonly onStop: ControllerOptions["onStop"];
  private readonly isInstalled: ControllerOptions["isInstalled"];
  private readonly isRunning: ControllerOptions["isRunning"];
  private readonly requestConfirmation?: ControllerOptions["requestConfirmation"];
  private readonly detector?: LanguageDetector;
  private readonly isServerEnabled?: ControllerOptions["isServerEnabled"];

  /** Server states */
  private readonly states = new Map<string, LspServerState>();

  /** Pending confirmation actions (semi-auto mode) */
  private readonly pendingActions = new Map<string, PendingAction>();

  /** Currently processing servers (for concurrency control) */
  private readonly processingServers = new Set<string>();

  /** Queue of servers waiting to be processed */
  private readonly processingQueue: DetectedLanguage[] = [];

  /** Whether the controller has been disposed */
  private disposed = false;

  /** Active timeout handles for cleanup */
  private readonly timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ControllerOptions) {
    super();
    this.config = options.config;
    this.workspaceRoot = options.workspaceRoot;
    this.onInstall = options.onInstall;
    this.onStart = options.onStart;
    this.onStop = options.onStop;
    this.isInstalled = options.isInstalled;
    this.isRunning = options.isRunning;
    this.requestConfirmation = options.requestConfirmation;
    this.detector = options.detector;
    this.isServerEnabled = options.isServerEnabled;
  }

  /**
   * Get the current state of a server
   */
  getServerState(serverId: string): LspServerState {
    return this.states.get(serverId) ?? "idle";
  }

  /**
   * Get all server states
   */
  getAllServerStates(): Map<string, LspServerState> {
    return new Map(this.states);
  }

  /**
   * Update language override configuration at runtime.
   */
  setLanguageOverride(languageId: string, override: LanguageOverride): void {
    this.config.languageOverrides[languageId] = override;
  }

  /**
   * Get the effective mode for a server (respects languageOverrides)
   */
  private getEffectiveMode(languageId: string): AutoModeLevel {
    const override = this.config.languageOverrides[languageId];
    if (override?.mode) {
      return override.mode;
    }
    return this.config.mode;
  }

  /**
   * Check if a language/server is enabled
   * @param languageId - The language ID to check
   * @param serverId - Optional server ID (if available from DetectedLanguage)
   */
  private isEnabled(languageId: string, serverId?: string): boolean {
    // 1. Check AutoModeConfig override
    const override = this.config.languageOverrides[languageId];
    if (override && override.enabled === false) {
      return false;
    }

    // 2. Check LspConfig.disabled via isServerEnabled callback
    const effectiveServerId = serverId ?? override?.serverId;
    if (effectiveServerId && this.isServerEnabled && !this.isServerEnabled(effectiveServerId)) {
      return false;
    }

    return true;
  }

  /**
   * Set state for a server and emit event
   */
  private setState(serverId: string, newState: LspServerState, error?: Error): void {
    const previousState = this.states.get(serverId) ?? "idle";

    // Don't emit if state hasn't changed
    if (previousState === newState) return;

    this.states.set(serverId, newState);

    const event: LspStateChangeEvent = {
      serverId,
      previousState,
      currentState: newState,
      timestamp: Date.now(),
      error,
    };

    this.emit("stateChange", event);
  }

  /**
   * Trigger language detection using the configured detector
   */
  async triggerDetection(): Promise<DetectedLanguage[]> {
    if (!this.detector) {
      console.warn("[AutoModeController] No detector configured");
      return [];
    }
    const languages = await this.detector.detect();
    this.emit("detectionComplete", languages);
    await this.processDetectedLanguages(languages);
    return languages;
  }

  /**
   * Process detected languages based on the current mode
   */
  async processDetectedLanguages(languages: DetectedLanguage[]): Promise<void> {
    if (this.disposed) return;

    // Emit detection complete event
    this.emit("detectionComplete", languages);

    // Filter out disabled languages and servers
    const enabledLanguages = languages.filter((lang) =>
      this.isEnabled(lang.languageId, lang.serverId)
    );

    // Add to processing queue
    this.processingQueue.push(...enabledLanguages);

    // Start processing
    await this.processQueue();
  }

  /**
   * Process the queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    while (
      this.processingQueue.length > 0 &&
      this.processingServers.size < this.config.maxConcurrentServers &&
      !this.disposed
    ) {
      const language = this.processingQueue.shift();
      if (!language) break;

      // Skip if already processing this server
      if (this.processingServers.has(language.serverId)) continue;

      // Start processing this server
      this.processingServers.add(language.serverId);

      // Process in background (don't await)
      this.processLanguage(language)
        .catch((error) => {
          this.setState(
            language.serverId,
            "error",
            error instanceof Error ? error : new Error(String(error))
          );
        })
        .finally(() => {
          this.processingServers.delete(language.serverId);
          // Try to process more from queue
          void this.processQueue();
        });
    }
  }

  /**
   * Process a single detected language
   */
  private async processLanguage(language: DetectedLanguage): Promise<void> {
    const { serverId, languageId } = language;

    // Set detecting state
    this.setState(serverId, "detecting");

    // Check current status
    const installed = await this.isInstalled(serverId);
    const running = this.isRunning(serverId);

    // Already running - nothing to do
    if (running) {
      this.setState(serverId, "running");
      return;
    }

    // Determine what action is needed
    if (!installed) {
      await this.handleNeedsInstall(serverId, languageId);
    } else {
      await this.handleNeedsStart(serverId, languageId);
    }
  }

  /**
   * Handle server that needs installation
   */
  private async handleNeedsInstall(serverId: string, languageId: string): Promise<void> {
    const mode = this.getEffectiveMode(languageId);

    // Set state to needs-install
    this.setState(serverId, "needs-install");

    if (mode === "manual") {
      // Manual mode: just report, don't act
      return;
    }

    if (mode === "semi-auto") {
      // Semi-auto: wait for user confirmation
      this.setState(serverId, "waiting-confirm");

      const approved = await this.waitForConfirmation({
        serverId,
        languageId,
        action: "install",
        message: `Install LSP server for ${languageId}?`,
      });

      if (!approved) {
        this.setState(serverId, "idle");
        return;
      }
    }

    // Auto or approved semi-auto: proceed with installation
    await this.installServer(serverId);
  }

  /**
   * Handle server that needs starting
   */
  private async handleNeedsStart(serverId: string, languageId: string): Promise<void> {
    const mode = this.getEffectiveMode(languageId);

    // Set state to needs-start
    this.setState(serverId, "needs-start");

    if (mode === "manual") {
      // Manual mode: just report, don't act
      return;
    }

    if (mode === "semi-auto") {
      // Semi-auto: wait for user confirmation
      this.setState(serverId, "waiting-confirm");

      const approved = await this.waitForConfirmation({
        serverId,
        languageId,
        action: "start",
        message: `Start LSP server for ${languageId}?`,
      });

      if (!approved) {
        this.setState(serverId, "idle");
        return;
      }
    }

    // Auto or approved semi-auto: proceed with starting
    await this.startServer(serverId);
  }

  /**
   * Wait for user confirmation (semi-auto mode)
   */
  private async waitForConfirmation(request: ConfirmationRequest): Promise<boolean> {
    // If no confirmation callback, auto-approve
    if (!this.requestConfirmation) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      // Store pending action for manual confirmation
      this.pendingActions.set(request.serverId, {
        serverId: request.serverId,
        languageId: request.languageId,
        action: request.action,
        resolve,
      });

      // Request confirmation via callback
      // biome-ignore lint/style/noNonNullAssertion: already checked above
      this.requestConfirmation!(request)
        .then((approved) => {
          // Remove from pending and resolve
          this.pendingActions.delete(request.serverId);
          resolve(approved);
        })
        .catch(() => {
          // On error, reject the action
          this.pendingActions.delete(request.serverId);
          resolve(false);
        });
    });
  }

  /**
   * Install a server with timeout handling
   */
  private async installServer(serverId: string): Promise<void> {
    this.setState(serverId, "installing");

    try {
      await this.withTimeout(
        this.onInstall(serverId),
        this.config.installTimeout,
        `Installation of ${serverId} timed out`
      );

      // After install, start the server
      await this.startServer(serverId);
    } catch (error) {
      this.setState(serverId, "error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start a server with timeout handling
   */
  private async startServer(serverId: string): Promise<void> {
    this.setState(serverId, "starting");

    try {
      await this.withTimeout(
        this.onStart(serverId, this.workspaceRoot),
        this.config.startTimeout,
        `Starting ${serverId} timed out`
      );

      this.setState(serverId, "running");
    } catch (error) {
      this.setState(serverId, "error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Wrap a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Manually confirm or reject a pending action
   */
  async confirmAction(serverId: string, approved: boolean): Promise<void> {
    const pending = this.pendingActions.get(serverId);
    if (!pending) {
      // No pending action for this server
      return;
    }

    // Remove from pending and resolve
    this.pendingActions.delete(serverId);
    pending.resolve(approved);
  }

  /**
   * Stop a running server
   */
  async stopServer(serverId: string): Promise<void> {
    const currentState = this.getServerState(serverId);

    if (currentState !== "running") {
      return;
    }

    this.setState(serverId, "stopping");

    try {
      await this.onStop(serverId);
      this.setState(serverId, "idle");
    } catch (error) {
      this.setState(serverId, "error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.disposed = true;

    // Clear all pending timeouts
    for (const timeoutId of this.timeoutHandles.values()) {
      clearTimeout(timeoutId);
    }
    this.timeoutHandles.clear();

    // Reject all pending confirmations
    for (const pending of this.pendingActions.values()) {
      pending.resolve(false);
    }
    this.pendingActions.clear();

    // Clear queues
    this.processingQueue.length = 0;
    this.processingServers.clear();

    // Remove all listeners
    this.removeAllListeners();
  }
}

/**
 * Factory function to create an AutoModeController
 */
export function createAutoModeController(options: ControllerOptions): AutoModeController {
  return new AutoModeController(options);
}

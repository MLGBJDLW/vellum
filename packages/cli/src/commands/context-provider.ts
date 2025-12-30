/**
 * Command Context Provider Implementation
 *
 * Provides CommandContext instances with all dependencies
 * for command execution.
 *
 * @module cli/commands/context-provider
 */

import type { CredentialManager, ToolRegistry } from "@vellum/core";

import type { CommandContextProvider } from "./executor.js";
import type { CommandContext, ParsedArgs, Session } from "./types.js";

// =============================================================================
// T037: DefaultContextProvider Implementation
// =============================================================================

/**
 * Event emitter function type
 */
export type EventEmitter = (event: string, data?: unknown) => void;

/**
 * Options for creating a DefaultContextProvider
 */
export interface DefaultContextProviderOptions {
  /** Current session state */
  readonly session: Session;
  /** Credential manager instance */
  readonly credentials: CredentialManager;
  /** Tool registry instance */
  readonly toolRegistry: ToolRegistry;
  /** Event emitter function */
  readonly emit?: EventEmitter;
}

/**
 * Default implementation of CommandContextProvider
 *
 * Creates CommandContext instances with all required dependencies
 * for command execution.
 *
 * @example
 * ```typescript
 * const provider = new DefaultContextProvider({
 *   session: {
 *     id: 'session-123',
 *     provider: 'anthropic',
 *     cwd: process.cwd(),
 *   },
 *   credentials: credentialManager,
 *   toolRegistry: toolRegistry,
 *   emit: (event, data) => eventBus.emit(event, data),
 * });
 *
 * const executor = new CommandExecutor(registry, provider);
 * ```
 */
export class DefaultContextProvider implements CommandContextProvider {
  private readonly session: Session;
  private readonly credentials: CredentialManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly eventEmitter: EventEmitter;

  /**
   * Create a new DefaultContextProvider
   *
   * @param options - Provider configuration
   */
  constructor(options: DefaultContextProviderOptions) {
    this.session = options.session;
    this.credentials = options.credentials;
    this.toolRegistry = options.toolRegistry;
    this.eventEmitter = options.emit ?? (() => {});
  }

  /**
   * Create a CommandContext for command execution
   *
   * @param parsedArgs - Parsed command arguments
   * @param signal - Optional abort signal for cancellation
   * @returns CommandContext with all dependencies
   */
  createContext(parsedArgs: ParsedArgs, signal?: AbortSignal): CommandContext {
    return {
      session: this.session,
      credentials: this.credentials,
      toolRegistry: this.toolRegistry,
      parsedArgs,
      signal,
      emit: this.eventEmitter,
    };
  }

  /**
   * Update the session state
   *
   * @param session - New session state (partial update)
   */
  updateSession(session: Partial<Session>): void {
    Object.assign(this.session, session);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a context provider with default settings
 *
 * @param options - Provider configuration
 * @returns CommandContextProvider instance
 */
export function createContextProvider(
  options: DefaultContextProviderOptions
): CommandContextProvider {
  return new DefaultContextProvider(options);
}

/**
 * Create a minimal context provider for testing
 *
 * @param overrides - Optional overrides for context values
 * @returns CommandContextProvider instance
 */
export function createTestContextProvider(
  overrides?: Partial<DefaultContextProviderOptions>
): CommandContextProvider {
  // Create mock session
  const session: Session = {
    id: "test-session",
    provider: "anthropic",
    cwd: process.cwd(),
    ...overrides?.session,
  };

  // Create mock credential manager
  const credentials =
    overrides?.credentials ??
    ({
      exists: async () => ({ ok: true, value: false }),
      resolve: async () => ({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }),
      store: async () => ({ ok: false, error: { code: "UNSUPPORTED", message: "Not supported" } }),
      delete: async () => ({ ok: true, value: 0 }),
      list: async () => ({ ok: true, value: [] }),
      getStoreAvailability: async () => ({}),
    } as unknown as CredentialManager);

  // Create mock tool registry
  const toolRegistry =
    overrides?.toolRegistry ??
    ({
      register: () => {},
      get: () => undefined,
      has: () => false,
      list: () => [],
      listByKind: () => [],
      getLLMDefinitions: () => [],
      size: 0,
    } as unknown as ToolRegistry);

  // Create mock event emitter
  const emit = overrides?.emit ?? (() => {});

  return new DefaultContextProvider({
    session,
    credentials,
    toolRegistry,
    emit,
  });
}

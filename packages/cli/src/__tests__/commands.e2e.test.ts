/**
 * Command System E2E Tests
 *
 * End-to-end tests covering the full command lifecycle:
 * - User input → Parser → Executor → Result
 * - Autocomplete flow
 * - Error handling with suggestions
 *
 * @module cli/__tests__/commands.e2e
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  type AutocompleteState,
  autocompleteReducer,
  type CommandContext,
  type CommandContextProvider,
  CommandExecutor,
  CommandParser,
  CommandRegistry,
  type CommandResult,
  clearCommand,
  createTestContextProvider,
  exitCommand,
  fuzzyScore,
  getSelectedCandidate,
  helpCommand,
  initialAutocompleteState,
  type SlashCommandDef,
  setHelpRegistry,
  shouldShowAutocomplete,
} from "../commands/index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock SlashCommand for testing
 */
function createMockCommand(
  overrides: Partial<SlashCommandDef> & { name: string }
): SlashCommandDef {
  return {
    description: `Mock command: ${overrides.name}`,
    kind: "builtin",
    category: "system",
    execute: async () => ({ kind: "success" as const }),
    ...overrides,
  };
}

/**
 * E2E test harness for command system
 */
class CommandSystemHarness {
  readonly registry: CommandRegistry;
  readonly parser: CommandParser;
  readonly executor: CommandExecutor;
  readonly contextProvider: CommandContextProvider;
  private emittedEvents: Array<{ event: string; data?: unknown }> = [];

  constructor() {
    this.registry = new CommandRegistry();
    this.parser = new CommandParser();
    this.contextProvider = createTestContextProvider({
      emit: (event, data) => {
        this.emittedEvents.push({ event, data });
      },
    });
    this.executor = new CommandExecutor(this.registry, this.contextProvider);
  }

  /**
   * Register core commands for testing
   */
  registerCoreCommands(): void {
    this.registry.register(helpCommand);
    this.registry.register(clearCommand);
    this.registry.register(exitCommand);
    setHelpRegistry(this.registry);
  }

  /**
   * Execute a command string and return the result
   */
  async execute(input: string): Promise<CommandResult> {
    return this.executor.execute(input);
  }

  /**
   * Get autocomplete candidates for input
   */
  getAutocompleteCandidates(input: string): AutocompleteState {
    const query = input.startsWith("/") ? input.slice(1) : input;
    return autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query,
      registry: this.registry,
    });
  }

  /**
   * Simulate tab completion
   */
  tabComplete(state: AutocompleteState): AutocompleteState {
    return autocompleteReducer(state, { type: "TAB_COMPLETE" });
  }

  /**
   * Get emitted events
   */
  getEmittedEvents(): Array<{ event: string; data?: unknown }> {
    return [...this.emittedEvents];
  }

  /**
   * Clear emitted events
   */
  clearEvents(): void {
    this.emittedEvents = [];
  }
}

// =============================================================================
// E2E Test: /help Command
// =============================================================================

describe("E2E: /help command", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();
  });

  it("should receive formatted help output for /help", async () => {
    const result = await harness.execute("/help");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.message).toBeDefined();
      expect(result.message).toContain("Available Commands");
      expect(result.message).toContain("/help");
      expect(result.message).toContain("/clear");
      expect(result.message).toContain("/exit(quit)");
    }
  });

  it("should show command-specific help for /help <command>", async () => {
    const result = await harness.execute("/help exit");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.message).toBeDefined();
      expect(result.message).toContain("/exit(quit)");
      expect(result.message).toContain("Exit the application");
    }
  });

  it("should show category help for /help system", async () => {
    const result = await harness.execute("/help system");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.message).toBeDefined();
      expect(result.message).toContain("System");
    }
  });

  it("should handle alias /h", async () => {
    const result = await harness.execute("/h");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.message).toContain("Available Commands");
    }
  });
});

// =============================================================================
// E2E Test: /auth set Command (Interactive)
// =============================================================================

describe("E2E: /auth set command (interactive)", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();

    // Add auth command for testing (with set subcommand)
    const authCommand = createMockCommand({
      name: "auth",
      category: "auth",
      positionalArgs: [
        {
          name: "subcommand",
          type: "string",
          description: "Subcommand: status, set, clear",
          required: false,
        },
        {
          name: "provider",
          type: "string",
          description: "Provider name",
          required: false,
        },
      ],
      execute: async (ctx: CommandContext) => {
        const subcommand = (ctx.parsedArgs.positional[0] as string) ?? "status";
        const provider =
          (ctx.parsedArgs.positional[1] as string) ?? ctx.session.provider ?? "anthropic";

        if (subcommand === "set") {
          return {
            kind: "interactive",
            prompt: {
              inputType: "password",
              message: `Enter API key for ${provider}:`,
              placeholder: "sk-...",
              provider,
              handler: async (value: string) => {
                if (!value.trim()) {
                  return {
                    kind: "error",
                    code: "INVALID_ARGUMENT",
                    message: "API key cannot be empty",
                  };
                }
                return {
                  kind: "success",
                  message: `✅ Credential saved for ${provider}`,
                };
              },
              onCancel: () => ({ kind: "success", message: "Auth cancelled" }),
            },
          };
        }

        return {
          kind: "success",
          message: "Authentication status",
        };
      },
    });
    harness.registry.register(authCommand);
  });

  it("should return interactive prompt for /auth set", async () => {
    const result = await harness.execute("/auth set");

    expect(result.kind).toBe("interactive");
    if (result.kind === "interactive") {
      expect(result.prompt.inputType).toBe("password");
      expect(result.prompt.message).toContain("Enter API key");
      expect(result.prompt.placeholder).toBe("sk-...");
    }
  });

  it("should accept provider argument: /auth set anthropic", async () => {
    const result = await harness.execute("/auth set anthropic");

    expect(result.kind).toBe("interactive");
    if (result.kind === "interactive") {
      expect(result.prompt.message).toContain("anthropic");
      expect(result.prompt.provider).toBe("anthropic");
    }
  });

  it("should handle input submission via handler", async () => {
    const result = await harness.execute("/auth set openai");

    expect(result.kind).toBe("interactive");
    if (result.kind === "interactive") {
      const submitResult = await result.prompt.handler("sk-test-key-12345");
      expect(submitResult.kind).toBe("success");
      if (submitResult.kind === "success") {
        expect(submitResult.message).toContain("Credential saved");
        expect(submitResult.message).toContain("openai");
      }
    }
  });

  it("should validate empty input", async () => {
    const result = await harness.execute("/auth set");

    expect(result.kind).toBe("interactive");
    if (result.kind === "interactive") {
      const submitResult = await result.prompt.handler("");
      expect(submitResult.kind).toBe("error");
      if (submitResult.kind === "error") {
        expect(submitResult.code).toBe("INVALID_ARGUMENT");
        expect(submitResult.message).toContain("cannot be empty");
      }
    }
  });

  it("should handle cancellation", async () => {
    const result = await harness.execute("/auth set");

    expect(result.kind).toBe("interactive");
    if (result.kind === "interactive") {
      const cancelResult = result.prompt.onCancel?.();
      expect(cancelResult?.kind).toBe("success");
      if (cancelResult?.kind === "success") {
        expect(cancelResult.message).toContain("cancelled");
      }
    }
  });
});

// =============================================================================
// E2E Test: /exit Command
// =============================================================================

describe("E2E: /exit command", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();
  });

  it("should exit immediately with /exit", async () => {
    harness.clearEvents();
    const result = await harness.execute("/exit");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toEqual({ exit: true });
    }

    const events = harness.getEmittedEvents();
    expect(events).toContainEqual({
      event: "app:exit",
      data: { reason: "user-command" },
    });
  });

  it("should support quit alias", async () => {
    harness.clearEvents();
    const result = await harness.execute("/quit");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toEqual({ exit: true });
    }

    const events = harness.getEmittedEvents();
    expect(events).toContainEqual({
      event: "app:exit",
      data: { reason: "user-command" },
    });
  });

  it("should support q alias", async () => {
    harness.clearEvents();
    const result = await harness.execute("/q");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toEqual({ exit: true });
    }

    const events = harness.getEmittedEvents();
    expect(events).toContainEqual({
      event: "app:exit",
      data: { reason: "user-command" },
    });
  });
});

// =============================================================================
// E2E Test: Unknown Command
// =============================================================================

describe("E2E: unknown command handling", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();
  });

  it("should receive error with suggestions for /xyz", async () => {
    const result = await harness.execute("/xyz");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("COMMAND_NOT_FOUND");
      expect(result.message).toContain("xyz");
      // Message format: "Unknown command: /xyz"
      expect(result.message).toContain("Unknown command");
    }
  });

  it("should suggest similar commands for typos", async () => {
    const result = await harness.execute("/hlep"); // typo for help

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("COMMAND_NOT_FOUND");
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain("/help");
    }
  });

  it("should suggest /exit(quit) for /exti typo", async () => {
    const result = await harness.execute("/exti");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain("/exit(quit)");
    }
  });

  it("should suggest /clear for /cls (known alias)", async () => {
    // Note: cls is an alias, so it should resolve correctly
    const result = await harness.execute("/cls");
    expect(result.kind).toBe("success"); // alias should work
  });

  it("should handle completely unrelated command", async () => {
    const result = await harness.execute("/abracadabra");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("COMMAND_NOT_FOUND");
      // May or may not have suggestions depending on distance
    }
  });
});

// =============================================================================
// E2E Test: Autocomplete Flow
// =============================================================================

describe("E2E: autocomplete flow", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();

    // Add more commands for better autocomplete testing
    harness.registry.register(createMockCommand({ name: "history", category: "session" }));
    harness.registry.register(createMockCommand({ name: "hello", category: "debug" }));
  });

  it("should show candidates when typing /hel", () => {
    const state = harness.getAutocompleteCandidates("/hel");

    expect(state.active).toBe(true);
    expect(state.candidates.length).toBeGreaterThan(0);

    const names = state.candidates.map((c) => c.command.name);
    expect(names).toContain("help");
    expect(names).toContain("hello");
  });

  it("should rank exact prefix match higher", () => {
    const state = harness.getAutocompleteCandidates("/help");

    expect(state.candidates.length).toBeGreaterThan(0);
    const firstCandidate = state.candidates[0];
    expect(firstCandidate).toBeDefined();
    expect(firstCandidate?.command.name).toBe("help");
  });

  it("should Tab complete to selected candidate", () => {
    let state = harness.getAutocompleteCandidates("/hel");
    expect(state.active).toBe(true);

    // Get selected candidate before tab
    const selectedBefore = getSelectedCandidate(state);
    expect(selectedBefore).toBeDefined();

    // Tab complete - returns state unchanged for caller to read selected candidate
    state = harness.tabComplete(state);

    // State remains active - caller uses selected candidate then dispatches CANCEL
    expect(state.active).toBe(true);
    expect(getSelectedCandidate(state)).toBe(selectedBefore);
  });

  it("should navigate candidates with SELECT_NEXT/SELECT_PREV", () => {
    let state = harness.getAutocompleteCandidates("/h");
    const initialIndex = state.selectedIndex;

    state = autocompleteReducer(state, { type: "SELECT_NEXT" });
    expect(state.selectedIndex).toBe((initialIndex + 1) % state.candidates.length);

    state = autocompleteReducer(state, { type: "SELECT_PREV" });
    expect(state.selectedIndex).toBe(initialIndex);
  });

  it("should cancel autocomplete", () => {
    let state = harness.getAutocompleteCandidates("/hel");
    expect(state.active).toBe(true);

    state = autocompleteReducer(state, { type: "CANCEL" });
    expect(state.active).toBe(false);
    expect(state.candidates).toHaveLength(0);
  });

  it("should not show autocomplete for non-slash input", () => {
    // Empty query produces inactive state
    const state = harness.getAutocompleteCandidates("");
    expect(shouldShowAutocomplete(state)).toBe(false);
  });

  it("should show autocomplete for slash input", () => {
    const state = harness.getAutocompleteCandidates("/h");
    expect(shouldShowAutocomplete(state)).toBe(true);
  });

  it("should filter by query correctly", () => {
    const state = harness.getAutocompleteCandidates("/ex");

    expect(state.candidates.length).toBeGreaterThan(0);
    const names = state.candidates.map((c) => c.command.name);
    expect(names).toContain("exit(quit)");
  });
});

// =============================================================================
// E2E Test: Full Lifecycle
// =============================================================================

describe("E2E: full command lifecycle", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();
  });

  it("should handle complete flow: type → autocomplete → execute", async () => {
    // Step 1: User starts typing
    const input = "/cle";

    // Step 2: Autocomplete activates
    const autocompleteState = harness.getAutocompleteCandidates(input);
    expect(autocompleteState.active).toBe(true);
    expect(autocompleteState.candidates.length).toBeGreaterThan(0);

    // Find clear command in candidates
    const clearCandidate = autocompleteState.candidates.find((c) => c.command.name === "clear");
    expect(clearCandidate).toBeDefined();

    // Step 3: User completes and executes
    const result = await harness.execute("/clear");

    // Step 4: Verify result
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.clearScreen).toBe(true);
    }
  });

  it("should handle error recovery flow", async () => {
    // Step 1: User types invalid command
    const badResult = await harness.execute("/cleear"); // typo

    // Step 2: Get error with suggestion
    expect(badResult.kind).toBe("error");
    if (badResult.kind === "error") {
      expect(badResult.suggestions).toContain("/clear");
    }

    // Step 3: User corrects and retries
    const goodResult = await harness.execute("/clear");
    expect(goodResult.kind).toBe("success");
  });

  it("should maintain state across commands", async () => {
    // Execute multiple commands
    const result1 = await harness.execute("/help");
    expect(result1.kind).toBe("success");

    const result2 = await harness.execute("/clear");
    expect(result2.kind).toBe("success");

    const result3 = await harness.execute("/exit");
    expect(result3.kind).toBe("success");

    // All should succeed independently
    const events = harness.getEmittedEvents();
    expect(events).toContainEqual(expect.objectContaining({ event: "app:exit" }));
  });
});

// =============================================================================
// E2E Test: Parse → Execute Integration
// =============================================================================

describe("E2E: parser → executor integration", () => {
  let harness: CommandSystemHarness;

  beforeEach(() => {
    harness = new CommandSystemHarness();
    harness.registerCoreCommands();

    // Add command with complex args
    harness.registry.register(
      createMockCommand({
        name: "config",
        category: "config",
        positionalArgs: [
          { name: "key", type: "string", description: "Config key", required: true },
        ],
        namedArgs: [
          {
            name: "value",
            shorthand: "v",
            type: "string",
            description: "Config value",
            required: false,
          },
          {
            name: "global",
            shorthand: "g",
            type: "boolean",
            description: "Global scope",
            required: false,
            default: false,
          },
        ],
        execute: async (ctx: CommandContext) => {
          const key = ctx.parsedArgs.positional[0];
          const value = ctx.parsedArgs.named.value;
          const global = ctx.parsedArgs.named.global;

          return {
            kind: "success",
            message: `Config: ${key}=${value} (global=${global})`,
            data: { key, value, global },
          };
        },
      })
    );
  });

  it("should parse and execute with positional and named args", async () => {
    const result = await harness.execute("/config theme --value dark --global");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toEqual({
        key: "theme",
        value: "dark",
        global: true,
      });
    }
  });

  it("should parse short flags", async () => {
    const result = await harness.execute("/config theme -v light -g");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toEqual({
        key: "theme",
        value: "light",
        global: true,
      });
    }
  });

  it("should parse quoted values", async () => {
    const result = await harness.execute('/config message --value "Hello World"');

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toMatchObject({
        key: "message",
        value: "Hello World",
      });
    }
  });

  it("should handle missing required argument", async () => {
    const result = await harness.execute("/config"); // missing 'key'

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("MISSING_ARGUMENT");
    }
  });
});

// =============================================================================
// E2E Test: Fuzzy Score Integration
// =============================================================================

describe("E2E: fuzzy scoring in autocomplete", () => {
  it("should rank exact match highest", () => {
    const exactScore = fuzzyScore("help", "help");
    const prefixScore = fuzzyScore("hel", "help");
    const fuzzyMatch = fuzzyScore("hp", "help");

    expect(exactScore).not.toBeNull();
    expect(prefixScore).not.toBeNull();
    expect(fuzzyMatch).not.toBeNull();

    // Extract scores after null checks (safe to use optional chain in expect)
    if (exactScore && prefixScore && fuzzyMatch) {
      expect(exactScore.score).toBeGreaterThan(prefixScore.score);
      expect(prefixScore.score).toBeGreaterThan(fuzzyMatch.score);
    }
  });

  it("should return null for no match", () => {
    const result = fuzzyScore("xyz", "help");
    expect(result).toBeNull();
  });

  it("should handle word boundaries", () => {
    const result = fuzzyScore("gc", "git-commit");

    expect(result).not.toBeNull();
    // g matches start, c matches after hyphen
    expect(result?.ranges.length).toBe(2);
  });
});

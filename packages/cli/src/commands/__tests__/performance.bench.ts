/**
 * Command System Performance Benchmarks
 *
 * Benchmarks to verify performance requirements:
 * - Parse time <5ms for typical command
 * - Autocomplete <16ms for 100 commands
 *
 * Run with: pnpm exec vitest bench
 *
 * @module cli/commands/__tests__/performance
 */

import { bench, describe, expect } from "vitest";

import { autocompleteReducer, initialAutocompleteState } from "../autocomplete.js";
import { CommandParser } from "../parser.js";
import { CommandRegistry } from "../registry.js";
import type { SlashCommand } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock SlashCommand for benchmarking
 */
function createMockCommand(name: string, category = "system"): SlashCommand {
  return {
    name,
    description: `Mock command: ${name}`,
    kind: "builtin",
    category: category as SlashCommand["category"],
    execute: async () => ({ kind: "success" as const }),
  };
}

/**
 * Create a registry with N commands for benchmarking
 */
function createLargeRegistry(count: number): CommandRegistry {
  const registry = new CommandRegistry();
  const categories: SlashCommand["category"][] = [
    "system",
    "auth",
    "session",
    "navigation",
    "tools",
    "config",
    "debug",
  ];

  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length];
    registry.register(createMockCommand(`command-${i}`, category));
  }

  return registry;
}

// =============================================================================
// Parser Benchmarks
// =============================================================================

describe("Parser Performance", () => {
  const parser = new CommandParser();

  // Simple command: should be <5ms (target: <1ms)
  bench(
    "parse simple command: /help",
    () => {
      parser.parse("/help");
    },
    { iterations: 1000 }
  );

  // Command with positional arg
  bench(
    "parse with positional: /login anthropic",
    () => {
      parser.parse("/login anthropic");
    },
    { iterations: 1000 }
  );

  // Command with flags
  bench(
    "parse with flags: /exit --force",
    () => {
      parser.parse("/exit --force");
    },
    { iterations: 1000 }
  );

  // Command with short flags
  bench(
    "parse with short flags: /cmd -v -f",
    () => {
      parser.parse("/cmd -v -f");
    },
    { iterations: 1000 }
  );

  // Complex command with all features
  bench(
    "parse complex: /login anthropic --store keychain -v",
    () => {
      parser.parse("/login anthropic --store keychain -v");
    },
    { iterations: 1000 }
  );

  // Quoted strings
  bench(
    'parse quoted: /cmd "hello world"',
    () => {
      parser.parse('/cmd "hello world"');
    },
    { iterations: 1000 }
  );

  // Long quoted string
  bench(
    "parse long quoted string",
    () => {
      parser.parse('/cmd "This is a much longer string with multiple words and special chars!"');
    },
    { iterations: 1000 }
  );

  // Multiple quoted strings
  bench(
    "parse multiple quoted",
    () => {
      parser.parse('/cmd "first arg" "second arg" --flag "flag value"');
    },
    { iterations: 1000 }
  );

  // Flag with = syntax
  bench(
    "parse flag=value syntax",
    () => {
      parser.parse("/cmd --store=keychain --provider=anthropic");
    },
    { iterations: 1000 }
  );
});

// =============================================================================
// Autocomplete Benchmarks
// =============================================================================

describe("Autocomplete Performance", () => {
  // Target: <16ms for 100 commands (one frame at 60fps)

  describe("with 100 commands", () => {
    const registry100 = createLargeRegistry(100);

    bench(
      "autocomplete single char: /c",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "c",
          registry: registry100,
        });
      },
      { iterations: 100 }
    );

    bench(
      "autocomplete prefix: /com",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "com",
          registry: registry100,
        });
      },
      { iterations: 100 }
    );

    bench(
      "autocomplete full word: /command",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "command",
          registry: registry100,
        });
      },
      { iterations: 100 }
    );

    bench(
      "autocomplete fuzzy: /cmd",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "cmd",
          registry: registry100,
        });
      },
      { iterations: 100 }
    );
  });

  describe("with 500 commands (stress test)", () => {
    const registry500 = createLargeRegistry(500);

    bench(
      "autocomplete 500 commands: /c",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "c",
          registry: registry500,
        });
      },
      { iterations: 50 }
    );

    bench(
      "autocomplete 500 commands: /command",
      () => {
        autocompleteReducer(initialAutocompleteState, {
          type: "INPUT_CHANGE",
          query: "command",
          registry: registry500,
        });
      },
      { iterations: 50 }
    );
  });

  describe("navigation operations", () => {
    const registry = createLargeRegistry(100);
    const activeState = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "c",
      registry,
    });

    bench(
      "SELECT_NEXT navigation",
      () => {
        autocompleteReducer(activeState, { type: "SELECT_NEXT" });
      },
      { iterations: 1000 }
    );

    bench(
      "SELECT_PREV navigation",
      () => {
        autocompleteReducer(activeState, { type: "SELECT_PREV" });
      },
      { iterations: 1000 }
    );

    bench(
      "TAB_COMPLETE action",
      () => {
        autocompleteReducer(activeState, { type: "TAB_COMPLETE" });
      },
      { iterations: 1000 }
    );

    bench(
      "CANCEL action",
      () => {
        autocompleteReducer(activeState, { type: "CANCEL" });
      },
      { iterations: 1000 }
    );
  });
});

// =============================================================================
// Registry Benchmarks
// =============================================================================

describe("Registry Performance", () => {
  describe("with 100 commands", () => {
    const registry = createLargeRegistry(100);

    bench(
      "get command by name",
      () => {
        registry.get("command-50");
      },
      { iterations: 1000 }
    );

    bench(
      "check command exists",
      () => {
        registry.has("command-50");
      },
      { iterations: 1000 }
    );

    bench(
      "search commands: /com",
      () => {
        registry.search("com");
      },
      { iterations: 100 }
    );

    bench(
      "get commands by category",
      () => {
        registry.getByCategory("system");
      },
      { iterations: 1000 }
    );

    bench(
      "get all commands",
      () => {
        registry.list();
      },
      { iterations: 100 }
    );
  });

  describe("registration", () => {
    bench(
      "register new command",
      () => {
        const registry = new CommandRegistry();
        for (let i = 0; i < 10; i++) {
          registry.register(createMockCommand(`cmd-${i}`));
        }
      },
      { iterations: 100 }
    );
  });
});

// =============================================================================
// Timing Assertions (run as regular tests)
// =============================================================================

describe("Performance Assertions", () => {
  const parser = new CommandParser();
  const registry100 = createLargeRegistry(100);

  bench("ASSERT: parse <5ms for typical command", () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      parser.parse("/login anthropic --store keychain");
    }

    const elapsed = performance.now() - start;
    const perParse = elapsed / 100;

    // Each parse should be well under 5ms
    expect(perParse).toBeLessThan(5);
  });

  bench("ASSERT: autocomplete <16ms for 100 commands", () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      autocompleteReducer(initialAutocompleteState, {
        type: "INPUT_CHANGE",
        query: "com",
        registry: registry100,
      });
    }

    const elapsed = performance.now() - start;
    const perAutocomplete = elapsed / 10;

    // Each autocomplete should be under 16ms (one frame)
    expect(perAutocomplete).toBeLessThan(16);
  });
});

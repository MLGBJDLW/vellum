/**
 * Autocomplete Unit Tests
 *
 * Tests for the autocomplete state management including:
 * - fuzzyScore function with various patterns
 * - Candidate sorting by score
 * - Navigation (prev/next) with wrapping
 * - Tab completion
 * - Cancel/reset behavior
 * - Highlight computation
 *
 * @module cli/commands/__tests__/autocomplete
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  type AutocompleteState,
  autocompleteReducer,
  computeHighlights,
  fuzzyScore,
  getSelectedCandidate,
  initialAutocompleteState,
  shouldShowAutocomplete,
} from "../autocomplete.js";
import { CommandRegistry } from "../registry.js";
import type { SlashCommand } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock SlashCommand for testing
 */
function createMockCommand(overrides: Partial<SlashCommand> & { name: string }): SlashCommand {
  return {
    description: `Mock command: ${overrides.name}`,
    kind: "builtin",
    category: "system",
    execute: async () => ({ kind: "success" as const }),
    ...overrides,
  };
}

/**
 * Create a registry with common test commands
 */
function createTestRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register(createMockCommand({ name: "help", aliases: ["h", "?"] }));
  registry.register(createMockCommand({ name: "history", category: "session" }));
  registry.register(createMockCommand({ name: "clear", aliases: ["cls"] }));
  registry.register(createMockCommand({ name: "exit", aliases: ["quit", "q"] }));
  registry.register(createMockCommand({ name: "login", category: "auth", aliases: ["signin"] }));
  registry.register(createMockCommand({ name: "logout", category: "auth", aliases: ["signout"] }));
  registry.register(createMockCommand({ name: "git-commit", category: "tools" }));
  registry.register(createMockCommand({ name: "git-status", category: "tools" }));

  return registry;
}

// =============================================================================
// T026: fuzzyScore Tests
// =============================================================================

describe("fuzzyScore", () => {
  describe("exact match", () => {
    it("should return highest score for exact match", () => {
      const result = fuzzyScore("help", "help");

      expect(result).not.toBeNull();
      expect(result?.score).toBe(140); // 100 (exact) + 10*4 (chars)
      expect(result?.ranges).toEqual([[0, 4]]);
    });

    it("should be case-insensitive for exact match", () => {
      const result = fuzzyScore("HELP", "help");

      expect(result).not.toBeNull();
      expect(result?.score).toBe(140);
    });
  });

  describe("prefix match", () => {
    it("should give high score for prefix match", () => {
      const result = fuzzyScore("h", "help");

      expect(result).not.toBeNull();
      // 80 (prefix) + 10 (char) - 3 (unmatched penalty for 'elp')
      expect(result?.score).toBe(87);
      expect(result?.ranges).toEqual([[0, 1]]);
    });

    it("should score longer prefix higher", () => {
      const result1 = fuzzyScore("h", "help");
      const result2 = fuzzyScore("he", "help");
      const result3 = fuzzyScore("hel", "help");

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      // Safe comparison after null checks
      if (result1 && result2 && result3) {
        expect(result2.score).toBeGreaterThan(result1.score);
        expect(result3.score).toBeGreaterThan(result2.score);
      }
    });

    it("should return full prefix range", () => {
      const result = fuzzyScore("hel", "help");

      expect(result?.ranges).toEqual([[0, 3]]);
    });
  });

  describe("fuzzy match", () => {
    it("should match non-consecutive characters", () => {
      const result = fuzzyScore("hp", "help");

      expect(result).not.toBeNull();
      expect(result?.ranges).toEqual([
        [0, 1],
        [3, 4],
      ]);
    });

    it("should return null for no match", () => {
      const result = fuzzyScore("xyz", "help");

      expect(result).toBeNull();
    });

    it("should return null for partial query match", () => {
      const result = fuzzyScore("helpx", "help");

      expect(result).toBeNull();
    });
  });

  describe("consecutive character bonus", () => {
    it("should give bonus for consecutive matches", () => {
      // 'he' in 'help' is consecutive
      const consecutiveResult = fuzzyScore("he", "help");
      // 'hp' in 'help' is not consecutive
      const nonConsecutiveResult = fuzzyScore("hp", "help");

      expect(consecutiveResult).not.toBeNull();
      expect(nonConsecutiveResult).not.toBeNull();
      // Safe comparison after null checks
      if (consecutiveResult && nonConsecutiveResult) {
        expect(consecutiveResult.score).toBeGreaterThan(nonConsecutiveResult.score);
      }
    });
  });

  describe("word boundary bonus", () => {
    it("should give bonus for match at word boundary", () => {
      // 'gc' should match 'g' at start and 'c' after hyphen
      const result = fuzzyScore("gc", "git-commit");

      expect(result).not.toBeNull();
      // Should have word boundary bonus for both 'g' and 'c'
      expect(result?.score).toBeGreaterThan(20); // Base would be ~20 without bonus
    });

    it("should match first character with word boundary bonus", () => {
      const result = fuzzyScore("g", "git");

      expect(result).not.toBeNull();
      // First character always gets word boundary bonus
    });
  });

  describe("empty query", () => {
    it("should return score 0 with empty ranges for empty query", () => {
      const result = fuzzyScore("", "help");

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0);
      expect(result?.ranges).toEqual([]);
    });
  });

  describe("score comparison", () => {
    it("should rank exact > prefix > fuzzy", () => {
      const exact = fuzzyScore("help", "help");
      const prefix = fuzzyScore("hel", "help");
      const fuzzy = fuzzyScore("hp", "help");

      expect(exact).not.toBeNull();
      expect(prefix).not.toBeNull();
      expect(fuzzy).not.toBeNull();
      expect(exact?.score).toBeGreaterThan(prefix?.score ?? 0);
      expect(prefix?.score).toBeGreaterThan(fuzzy?.score ?? 0);
    });
  });
});

// =============================================================================
// T026: Candidate Sorting Tests
// =============================================================================

describe("autocompleteReducer candidate sorting", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should sort candidates by score descending", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    expect(state.candidates.length).toBeGreaterThan(0);

    // Verify sorted by score descending
    for (let i = 1; i < state.candidates.length; i++) {
      const prev = state.candidates[i - 1];
      const curr = state.candidates[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      // Safe comparison after defined checks
      if (prev && curr) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      }
    }
  });

  it("should sort alphabetically for equal scores", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "git",
      registry,
    });

    // Both git-commit and git-status should have same prefix score
    const gitCommands = state.candidates.filter((c) => c.command.name.startsWith("git-"));
    expect(gitCommands.length).toBe(2);

    // Should be alphabetically sorted
    expect(gitCommands[0]?.command.name).toBe("git-commit");
    expect(gitCommands[1]?.command.name).toBe("git-status");
  });

  it("should include commands matching query", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "log",
      registry,
    });

    const names = state.candidates.map((c) => c.command.name);
    expect(names).toContain("login");
    expect(names).toContain("logout");
  });
});

// =============================================================================
// T026: Navigation Tests
// =============================================================================

describe("autocompleteReducer navigation", () => {
  let registry: CommandRegistry;
  let stateWithCandidates: AutocompleteState;

  beforeEach(() => {
    registry = createTestRegistry();
    stateWithCandidates = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });
  });

  describe("SELECT_NEXT", () => {
    it("should increment selectedIndex", () => {
      const state = autocompleteReducer(stateWithCandidates, { type: "SELECT_NEXT" });

      expect(state.selectedIndex).toBe(1);
    });

    it("should wrap to 0 at end", () => {
      let state = stateWithCandidates;
      const candidateCount = state.candidates.length;

      // Navigate to last item
      for (let i = 0; i < candidateCount - 1; i++) {
        state = autocompleteReducer(state, { type: "SELECT_NEXT" });
      }
      expect(state.selectedIndex).toBe(candidateCount - 1);

      // Next should wrap to 0
      state = autocompleteReducer(state, { type: "SELECT_NEXT" });
      expect(state.selectedIndex).toBe(0);
    });

    it("should not change state if no candidates", () => {
      const emptyState: AutocompleteState = {
        ...initialAutocompleteState,
        active: true,
        candidates: [],
      };

      const state = autocompleteReducer(emptyState, { type: "SELECT_NEXT" });

      expect(state.selectedIndex).toBe(0);
    });

    it("should not change state if inactive", () => {
      const state = autocompleteReducer(initialAutocompleteState, { type: "SELECT_NEXT" });

      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("SELECT_PREV", () => {
    it("should decrement selectedIndex", () => {
      // First go to index 1
      let state = autocompleteReducer(stateWithCandidates, { type: "SELECT_NEXT" });
      expect(state.selectedIndex).toBe(1);

      // Then go back to 0
      state = autocompleteReducer(state, { type: "SELECT_PREV" });
      expect(state.selectedIndex).toBe(0);
    });

    it("should wrap to end at start", () => {
      const candidateCount = stateWithCandidates.candidates.length;

      // At index 0, prev should wrap to last
      const state = autocompleteReducer(stateWithCandidates, { type: "SELECT_PREV" });

      expect(state.selectedIndex).toBe(candidateCount - 1);
    });

    it("should not change state if no candidates", () => {
      const emptyState: AutocompleteState = {
        ...initialAutocompleteState,
        active: true,
        candidates: [],
      };

      const state = autocompleteReducer(emptyState, { type: "SELECT_PREV" });

      expect(state.selectedIndex).toBe(0);
    });
  });
});

// =============================================================================
// T026: Tab Complete Tests
// =============================================================================

describe("autocompleteReducer TAB_COMPLETE", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should return state unchanged for completion", () => {
    const stateWithCandidates = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    const state = autocompleteReducer(stateWithCandidates, { type: "TAB_COMPLETE" });

    // State should be same - caller reads selectedIndex to get completion
    expect(state).toEqual(stateWithCandidates);
  });

  it("should allow reading selected candidate after TAB_COMPLETE", () => {
    let state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    // Navigate to second item
    state = autocompleteReducer(state, { type: "SELECT_NEXT" });

    // Tab complete
    state = autocompleteReducer(state, { type: "TAB_COMPLETE" });

    // Should be able to get selected candidate
    const selected = getSelectedCandidate(state);
    expect(selected).toBeDefined();
    expect(selected?.command).toBeDefined();
  });
});

// =============================================================================
// T026: Cancel Tests
// =============================================================================

describe("autocompleteReducer CANCEL", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should reset state to initial", () => {
    const stateWithCandidates = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    const state = autocompleteReducer(stateWithCandidates, { type: "CANCEL" });

    expect(state.active).toBe(false);
    expect(state.query).toBe("");
    expect(state.candidates).toEqual([]);
    expect(state.selectedIndex).toBe(0);
  });

  it("should work even if already inactive", () => {
    const state = autocompleteReducer(initialAutocompleteState, { type: "CANCEL" });

    expect(state.active).toBe(false);
  });
});

// =============================================================================
// T026: INPUT_CHANGE Tests
// =============================================================================

describe("autocompleteReducer INPUT_CHANGE", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should activate autocomplete with matching query", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    expect(state.active).toBe(true);
    expect(state.query).toBe("h");
    expect(state.candidates.length).toBeGreaterThan(0);
  });

  it("should deactivate autocomplete with empty query", () => {
    // First activate
    let state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    // Then clear query
    state = autocompleteReducer(state, {
      type: "INPUT_CHANGE",
      query: "",
      registry,
    });

    expect(state.active).toBe(false);
  });

  it("should reset selectedIndex on query change", () => {
    let state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    // Navigate down
    state = autocompleteReducer(state, { type: "SELECT_NEXT" });
    expect(state.selectedIndex).toBe(1);

    // Change query should reset selection
    state = autocompleteReducer(state, {
      type: "INPUT_CHANGE",
      query: "he",
      registry,
    });

    expect(state.selectedIndex).toBe(0);
  });

  it("should populate highlights map", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    expect(state.highlights.size).toBe(state.candidates.length);

    // Each candidate should have highlights
    for (const candidate of state.candidates) {
      expect(state.highlights.has(candidate.command.name)).toBe(true);
    }
  });

  it("should handle non-matching query", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "xyz123",
      registry,
    });

    expect(state.active).toBe(false);
    expect(state.candidates).toEqual([]);
  });
});

// =============================================================================
// T026: computeHighlights Tests
// =============================================================================

describe("computeHighlights", () => {
  it("should return empty map for empty candidates", () => {
    const result = computeHighlights([]);

    expect(result.size).toBe(0);
  });

  it("should map command names to match ranges", () => {
    const candidates = [
      {
        command: createMockCommand({ name: "help" }),
        score: 100,
        matchRanges: [[0, 1]] as [number, number][],
      },
      {
        command: createMockCommand({ name: "history" }),
        score: 80,
        matchRanges: [[0, 1]] as [number, number][],
      },
    ];

    const result = computeHighlights(candidates);

    expect(result.size).toBe(2);
    expect(result.get("help")).toEqual([[0, 1]]);
    expect(result.get("history")).toEqual([[0, 1]]);
  });

  it("should preserve multiple ranges", () => {
    const candidates = [
      {
        command: createMockCommand({ name: "git-commit" }),
        score: 50,
        matchRanges: [
          [0, 1],
          [4, 5],
        ] as [number, number][],
      },
    ];

    const result = computeHighlights(candidates);

    expect(result.get("git-commit")).toEqual([
      [0, 1],
      [4, 5],
    ]);
  });
});

// =============================================================================
// T026: Utility Function Tests
// =============================================================================

describe("getSelectedCandidate", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should return undefined when inactive", () => {
    const result = getSelectedCandidate(initialAutocompleteState);

    expect(result).toBeUndefined();
  });

  it("should return undefined when no candidates", () => {
    const state: AutocompleteState = {
      ...initialAutocompleteState,
      active: true,
      candidates: [],
    };

    const result = getSelectedCandidate(state);

    expect(result).toBeUndefined();
  });

  it("should return selected candidate", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    const result = getSelectedCandidate(state);

    expect(result).toBeDefined();
    expect(result).toBe(state.candidates[0]);
  });
});

describe("shouldShowAutocomplete", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should return false when inactive", () => {
    expect(shouldShowAutocomplete(initialAutocompleteState)).toBe(false);
  });

  it("should return false when no candidates", () => {
    const state: AutocompleteState = {
      ...initialAutocompleteState,
      active: true,
      candidates: [],
    };

    expect(shouldShowAutocomplete(state)).toBe(false);
  });

  it("should return true when active with candidates", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "h",
      registry,
    });

    expect(shouldShowAutocomplete(state)).toBe(true);
  });
});

// =============================================================================
// T026: Alias Matching Tests
// =============================================================================

describe("autocomplete with aliases", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it("should match command by alias", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "cls",
      registry,
    });

    // Should find 'clear' command via its 'cls' alias
    const clearCandidate = state.candidates.find((c) => c.command.name === "clear");
    expect(clearCandidate).toBeDefined();
  });

  it("should prefer better alias match over command name", () => {
    const state = autocompleteReducer(initialAutocompleteState, {
      type: "INPUT_CHANGE",
      query: "q",
      registry,
    });

    // Should find 'exit' command via its 'q' alias
    const exitCandidate = state.candidates.find((c) => c.command.name === "exit");
    expect(exitCandidate).toBeDefined();
  });
});

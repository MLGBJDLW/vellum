/**
 * FakeResponseLoader - Load and manage fake API responses for testing
 *
 * This module provides infrastructure for loading and managing mock API responses
 * during E2E and integration testing. It enables deterministic testing without
 * making actual API calls.
 *
 * @module cli/test/fixtures/fake-response-loader
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Supported stream event types for mock responses
 */
export type MockEventType =
  | "text"
  | "reasoning"
  | "tool_call_start"
  | "tool_call_delta"
  | "tool_call_end"
  | "usage"
  | "end"
  | "error";

/**
 * Mock stream event structure
 */
export interface MockStreamEvent {
  type: MockEventType;
  content?: string;
  toolCallId?: string;
  toolName?: string;
  arguments?: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Mock response fixture structure
 */
export interface MockResponse {
  /** Unique identifier for this response fixture */
  id: string;
  /** Pattern to match against prompts */
  promptPattern: string;
  /** Whether the pattern is a regex (default: false) */
  isRegex?: boolean;
  /** Description of what this fixture tests */
  description?: string;
  /** Delay in milliseconds between events (simulates streaming) */
  streamDelay?: number;
  /** The mock events to return */
  events: MockStreamEvent[];
}

/**
 * Environment variable to enable fake responses mode
 */
export const FAKE_RESPONSES_ENV = "VELLUM_FAKE_RESPONSES";

/**
 * Environment variable for custom fixtures directory
 */
export const FIXTURES_DIR_ENV = "VELLUM_FIXTURES_DIR";

/**
 * Default fixtures directory relative to package root
 */
export const DEFAULT_FIXTURES_DIR = "__fixtures__/responses";

/**
 * FakeResponseLoader - Load and manage fake API responses for testing
 *
 * @example
 * ```typescript
 * const loader = new FakeResponseLoader();
 * const response = loader.getResponse("Hello, world");
 * if (response) {
 *   for (const event of response.events) {
 *     // Process mock events
 *   }
 * }
 * ```
 */
export class FakeResponseLoader {
  private fixtures: Map<string, MockResponse>;
  private readonly fixturesDir: string;
  private loaded = false;

  /**
   * Create a new FakeResponseLoader
   *
   * @param fixturesDir - Custom directory for fixtures (optional)
   */
  constructor(fixturesDir?: string) {
    this.fixtures = new Map();
    this.fixturesDir = fixturesDir ?? this.resolveDefaultFixturesDir();
  }

  /**
   * Resolve the default fixtures directory
   */
  private resolveDefaultFixturesDir(): string {
    // Check environment variable first
    const envDir = process.env[FIXTURES_DIR_ENV];
    if (envDir) {
      return resolve(envDir);
    }

    // Default to package __fixtures__ directory
    // Navigate from src/test/fixtures to package root
    return resolve(__dirname, "../../..", DEFAULT_FIXTURES_DIR);
  }

  /**
   * Load a single fixture from file
   *
   * @param name - Fixture filename (without .json extension)
   * @returns The loaded fixture or null if not found
   */
  load(name: string): MockResponse | null {
    const filename = name.endsWith(".json") ? name : `${name}.json`;
    const filepath = join(this.fixturesDir, filename);

    if (!existsSync(filepath)) {
      return null;
    }

    try {
      const content = readFileSync(filepath, "utf-8");
      const fixture = JSON.parse(content) as MockResponse;

      // Ensure fixture has an ID
      if (!fixture.id) {
        fixture.id = name.replace(/\.json$/, "");
      }

      // Cache the fixture
      this.fixtures.set(fixture.id, fixture);

      return fixture;
    } catch (error) {
      console.error(`Failed to load fixture ${name}:`, error);
      return null;
    }
  }

  /**
   * Load all fixtures from the fixtures directory
   */
  loadAll(): void {
    if (this.loaded) {
      return;
    }

    if (!existsSync(this.fixturesDir)) {
      console.warn(`Fixtures directory not found: ${this.fixturesDir}`);
      this.loaded = true;
      return;
    }

    try {
      const files = readdirSync(this.fixturesDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        this.load(file);
      }

      this.loaded = true;
    } catch (error) {
      console.error("Failed to load fixtures:", error);
      this.loaded = true;
    }
  }

  /**
   * Get a response matching a prompt pattern
   *
   * @param prompt - The prompt to match against
   * @returns Matching response or null if no match found
   */
  getResponse(prompt: string): MockResponse | null {
    // Ensure all fixtures are loaded
    this.loadAll();

    // Search through fixtures for a match
    for (const fixture of this.fixtures.values()) {
      if (this.matchesPattern(prompt, fixture)) {
        return fixture;
      }
    }

    return null;
  }

  /**
   * Check if a prompt matches a fixture's pattern
   */
  private matchesPattern(prompt: string, fixture: MockResponse): boolean {
    const pattern = fixture.promptPattern;

    if (fixture.isRegex) {
      try {
        const regex = new RegExp(pattern, "i");
        return regex.test(prompt);
      } catch {
        return false;
      }
    }

    // Simple substring match (case-insensitive)
    return prompt.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Get a fixture by ID
   *
   * @param id - The fixture ID
   * @returns The fixture or null if not found
   */
  getById(id: string): MockResponse | null {
    // Try cache first
    if (this.fixtures.has(id)) {
      return this.fixtures.get(id) ?? null;
    }

    // Try loading by name
    return this.load(id);
  }

  /**
   * Get all loaded fixtures
   */
  getAll(): MockResponse[] {
    this.loadAll();
    return Array.from(this.fixtures.values());
  }

  /**
   * Clear all cached fixtures
   */
  clear(): void {
    this.fixtures.clear();
    this.loaded = false;
  }

  /**
   * Get the fixtures directory path
   */
  getFixturesDir(): string {
    return this.fixturesDir;
  }

  /**
   * Check if fake responses mode is enabled
   *
   * @returns true if VELLUM_FAKE_RESPONSES env var is set to 'true' or '1'
   */
  static isEnabled(): boolean {
    const value = process.env[FAKE_RESPONSES_ENV];
    return value === "true" || value === "1";
  }

  /**
   * Create a stream from a mock response
   *
   * @param response - The mock response to stream
   * @returns AsyncIterable of mock stream events
   */
  static async *createStream(response: MockResponse): AsyncIterable<MockStreamEvent> {
    const delay = response.streamDelay ?? 0;

    for (const event of response.events) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      yield event;
    }
  }
}

/**
 * Global singleton instance for convenience
 */
let globalLoader: FakeResponseLoader | null = null;

/**
 * Get the global FakeResponseLoader instance
 *
 * @returns The global loader instance
 */
export function getFakeResponseLoader(): FakeResponseLoader {
  if (!globalLoader) {
    globalLoader = new FakeResponseLoader();
  }
  return globalLoader;
}

/**
 * Reset the global loader instance (useful for tests)
 */
export function resetFakeResponseLoader(): void {
  globalLoader?.clear();
  globalLoader = null;
}

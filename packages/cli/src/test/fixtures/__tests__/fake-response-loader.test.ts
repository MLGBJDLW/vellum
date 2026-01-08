/**
 * Tests for FakeResponseLoader
 *
 * @module cli/test/fixtures/__tests__/fake-response-loader
 */

import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_RESPONSES_ENV,
  FakeResponseLoader,
  FIXTURES_DIR_ENV,
  getFakeResponseLoader,
  type MockResponse,
  type MockStreamEvent,
  resetFakeResponseLoader,
} from "../fake-response-loader.js";

// Path to test fixtures
const TEST_FIXTURES_DIR = join(__dirname, "../../../../__fixtures__/responses");

describe("FakeResponseLoader", () => {
  let loader: FakeResponseLoader;

  beforeEach(() => {
    loader = new FakeResponseLoader(TEST_FIXTURES_DIR);
  });

  afterEach(() => {
    resetFakeResponseLoader();
    vi.unstubAllEnvs();
  });

  describe("constructor", () => {
    it("should create loader with custom fixtures directory", () => {
      const customDir = "/custom/fixtures";
      const customLoader = new FakeResponseLoader(customDir);
      expect(customLoader.getFixturesDir()).toBe(customDir);
    });

    it("should use environment variable for fixtures directory", () => {
      const envDir = join(__dirname, "test-env-fixtures");
      vi.stubEnv(FIXTURES_DIR_ENV, envDir);

      const envLoader = new FakeResponseLoader();
      expect(envLoader.getFixturesDir()).toBe(envDir);
    });
  });

  describe("load", () => {
    it("should load a valid fixture file", () => {
      const fixture = loader.load("hello-world");

      expect(fixture).not.toBeNull();
      expect(fixture?.id).toBe("hello-world");
      expect(fixture?.promptPattern).toBe("hello");
      expect(fixture?.events).toBeInstanceOf(Array);
      expect(fixture?.events.length).toBeGreaterThan(0);
    });

    it("should load fixture with .json extension", () => {
      const fixture = loader.load("hello-world.json");

      expect(fixture).not.toBeNull();
      expect(fixture?.id).toBe("hello-world");
    });

    it("should return null for non-existent fixture", () => {
      const fixture = loader.load("non-existent-fixture");
      expect(fixture).toBeNull();
    });

    it("should cache loaded fixtures", () => {
      const fixture1 = loader.load("hello-world");
      const fixture2 = loader.getById("hello-world");

      expect(fixture1).toBe(fixture2);
    });
  });

  describe("loadAll", () => {
    it("should load all fixtures from directory", () => {
      loader.loadAll();
      const fixtures = loader.getAll();

      expect(fixtures.length).toBeGreaterThanOrEqual(3);
      expect(fixtures.some((f: MockResponse) => f.id === "hello-world")).toBe(true);
      expect(fixtures.some((f: MockResponse) => f.id === "code-generation")).toBe(true);
      expect(fixtures.some((f: MockResponse) => f.id === "error-response")).toBe(true);
    });

    it("should only load once when called multiple times", () => {
      loader.loadAll();
      const count1 = loader.getAll().length;

      loader.loadAll();
      const count2 = loader.getAll().length;

      expect(count1).toBe(count2);
    });
  });

  describe("getResponse", () => {
    it("should match simple string pattern", () => {
      const response = loader.getResponse("hello world");

      expect(response).not.toBeNull();
      expect(response?.id).toBe("hello-world");
    });

    it("should match case-insensitively for simple patterns", () => {
      const response = loader.getResponse("HELLO there");

      expect(response).not.toBeNull();
      expect(response?.id).toBe("hello-world");
    });

    it("should match regex patterns", () => {
      const response = loader.getResponse("Please write a function for me");

      expect(response).not.toBeNull();
      expect(response?.id).toBe("code-generation");
    });

    it("should match another regex pattern variation", () => {
      const response = loader.getResponse("Can you create some code?");

      expect(response).not.toBeNull();
      expect(response?.id).toBe("code-generation");
    });

    it("should return null for no match", () => {
      const response = loader.getResponse("unrelated query xyz");
      expect(response).toBeNull();
    });

    it("should match error trigger patterns", () => {
      const response = loader.getResponse("trigger-error now");

      expect(response).not.toBeNull();
      expect(response?.id).toBe("error-response");
    });
  });

  describe("getById", () => {
    it("should return fixture by ID after loading", () => {
      loader.load("code-generation");
      const fixture = loader.getById("code-generation");

      expect(fixture).not.toBeNull();
      expect(fixture?.id).toBe("code-generation");
    });

    it("should attempt to load fixture if not cached", () => {
      const fixture = loader.getById("hello-world");

      expect(fixture).not.toBeNull();
      expect(fixture?.id).toBe("hello-world");
    });

    it("should return null for non-existent ID", () => {
      const fixture = loader.getById("does-not-exist");
      expect(fixture).toBeNull();
    });
  });

  describe("clear", () => {
    it("should clear all cached fixtures", () => {
      // Manually load some fixtures
      loader.load("hello-world");
      loader.load("code-generation");
      loader.load("error-response");

      loader.clear();
      // After clear, getById should not find cached fixtures
      // (but would load from disk if we call getById)
      // The internal map should be empty
      const fixture = loader.getById("does-not-exist-random");
      expect(fixture).toBeNull();
    });

    it("should allow reloading after clear", () => {
      loader.loadAll();
      loader.clear();

      const fixture = loader.load("hello-world");
      expect(fixture).not.toBeNull();
    });
  });

  describe("isEnabled", () => {
    it("should return false when env var not set", () => {
      vi.stubEnv(FAKE_RESPONSES_ENV, "");
      expect(FakeResponseLoader.isEnabled()).toBe(false);
    });

    it("should return true when env var is 'true'", () => {
      vi.stubEnv(FAKE_RESPONSES_ENV, "true");
      expect(FakeResponseLoader.isEnabled()).toBe(true);
    });

    it("should return true when env var is '1'", () => {
      vi.stubEnv(FAKE_RESPONSES_ENV, "1");
      expect(FakeResponseLoader.isEnabled()).toBe(true);
    });

    it("should return false for other values", () => {
      vi.stubEnv(FAKE_RESPONSES_ENV, "yes");
      expect(FakeResponseLoader.isEnabled()).toBe(false);

      vi.stubEnv(FAKE_RESPONSES_ENV, "false");
      expect(FakeResponseLoader.isEnabled()).toBe(false);
    });
  });

  describe("createStream", () => {
    it("should create async iterable from response events", async () => {
      const response: MockResponse = {
        id: "test",
        promptPattern: "test",
        streamDelay: 0,
        events: [
          { type: "text", content: "Hello" },
          { type: "text", content: " World" },
          { type: "end", stopReason: "end_turn" },
        ],
      };

      const events: MockStreamEvent[] = [];
      for await (const event of FakeResponseLoader.createStream(response)) {
        events.push(event);
      }

      expect(events.length).toBe(3);
      expect(events[0]?.type).toBe("text");
      expect(events[0]?.content).toBe("Hello");
      expect(events[2]?.type).toBe("end");
    });

    it("should respect stream delay", async () => {
      const response: MockResponse = {
        id: "test",
        promptPattern: "test",
        streamDelay: 50,
        events: [
          { type: "text", content: "A" },
          { type: "text", content: "B" },
        ],
      };

      const start = Date.now();
      const events: MockStreamEvent[] = [];
      for await (const event of FakeResponseLoader.createStream(response)) {
        events.push(event);
      }
      const elapsed = Date.now() - start;

      expect(events.length).toBe(2);
      expect(elapsed).toBeGreaterThanOrEqual(90); // ~50ms * 2 events (with some tolerance)
    });
  });

  describe("global loader", () => {
    it("should return singleton instance", () => {
      const loader1 = getFakeResponseLoader();
      const loader2 = getFakeResponseLoader();

      expect(loader1).toBe(loader2);
    });

    it("should reset global instance", () => {
      const loader1 = getFakeResponseLoader();
      resetFakeResponseLoader();
      const loader2 = getFakeResponseLoader();

      expect(loader1).not.toBe(loader2);
    });
  });

  describe("fixture content validation", () => {
    it("hello-world fixture has correct structure", () => {
      const fixture = loader.load("hello-world");

      expect(fixture).not.toBeNull();
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "text")).toBe(true);
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "usage")).toBe(true);
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "end")).toBe(true);
    });

    it("code-generation fixture has tool call events", () => {
      const fixture = loader.load("code-generation");

      expect(fixture).not.toBeNull();
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "tool_call_start")).toBe(true);
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "tool_call_delta")).toBe(true);
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "tool_call_end")).toBe(true);

      const toolStart = fixture?.events.find((e: MockStreamEvent) => e.type === "tool_call_start");
      expect(toolStart?.toolCallId).toBe("toolu_01ABC123");
      expect(toolStart?.toolName).toBe("write_file");
    });

    it("error-response fixture has error event", () => {
      const fixture = loader.load("error-response");

      expect(fixture).not.toBeNull();
      expect(fixture?.events.some((e: MockStreamEvent) => e.type === "error")).toBe(true);

      const errorEvent = fixture?.events.find((e: MockStreamEvent) => e.type === "error");
      expect(errorEvent?.error?.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(errorEvent?.error?.message).toContain("rate limit");
    });
  });
});

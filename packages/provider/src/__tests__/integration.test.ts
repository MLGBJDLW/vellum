/**
 * Integration Tests for LLM Providers
 *
 * These tests make real API calls and are guarded by environment variables.
 * Tests are skipped gracefully if the corresponding API key is not present.
 *
 * To run integration tests:
 * 1. Set the appropriate API keys in your environment:
 *    - ANTHROPIC_API_KEY for Anthropic tests
 *    - OPENAI_API_KEY for OpenAI tests
 *    - GOOGLE_GENERATIVE_AI_API_KEY for Google tests
 *
 * 2. Run tests with: pnpm test --run integration
 *
 * @module @vellum/provider/integration
 */

import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import { GoogleProvider } from "../google.js";
import { OpenAIProvider } from "../openai.js";
import type { CompletionParams, CompletionResult, StreamEvent } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Check if an API key is available in environment
 */
function hasApiKey(envVar: string): boolean {
  return !!process.env[envVar];
}

/**
 * Collect all events from a stream
 */
async function collectStreamEvents(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

// =============================================================================
// Anthropic Integration Tests
// =============================================================================

describe("AnthropicProvider Integration", () => {
  const hasKey = hasApiKey("ANTHROPIC_API_KEY");

  it.skipIf(!hasKey)(
    "should complete a simple request",
    async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: process.env.ANTHROPIC_API_KEY });

      const result = await provider.complete({
        model: "claude-3-5-haiku-20241022",
        messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
        maxTokens: 50,
      });

      expect(result.content).toBeTruthy();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.stopReason).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should stream a response",
    async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: process.env.ANTHROPIC_API_KEY });

      const stream = provider.stream({
        model: "claude-3-5-haiku-20241022",
        messages: [{ role: "user", content: "Count from 1 to 5." }],
        maxTokens: 100,
      });

      const events = await collectStreamEvents(stream);

      // Should have text events
      const textEvents = events.filter((e) => e.type === "text");
      expect(textEvents.length).toBeGreaterThan(0);

      // Should have done event
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();

      // Should have usage event
      const usageEvent = events.find((e) => e.type === "usage");
      expect(usageEvent).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should handle tool calls",
    async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: process.env.ANTHROPIC_API_KEY });

      const result = await provider.complete({
        model: "claude-3-5-haiku-20241022",
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            inputSchema: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        ],
        maxTokens: 200,
      });

      // Model should either respond with text or call the tool
      expect(result.content || result.toolCalls?.length).toBeTruthy();
      if (result.toolCalls && result.toolCalls.length > 0) {
        expect(result.toolCalls[0]?.name).toBe("get_weather");
        expect(result.stopReason).toBe("tool_use");
      }
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should count tokens",
    async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: process.env.ANTHROPIC_API_KEY });

      const count = await provider.countTokens("Hello, world! This is a test.");
      expect(count).toBeGreaterThan(0);
    },
    10000
  );

  it.skipIf(!hasKey)(
    "should validate credentials with API call",
    async () => {
      const provider = new AnthropicProvider();

      const result = await provider.validateCredentialWithApiCall({
        type: "api_key",
        value: process.env.ANTHROPIC_API_KEY!,
      });

      expect(result.valid).toBe(true);
    },
    15000
  );
});

// =============================================================================
// OpenAI Integration Tests
// =============================================================================

describe("OpenAIProvider Integration", () => {
  const hasKey = hasApiKey("OPENAI_API_KEY");

  it.skipIf(!hasKey)(
    "should complete a simple request",
    async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: process.env.OPENAI_API_KEY });

      const result = await provider.complete({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
        maxTokens: 50,
      });

      expect(result.content).toBeTruthy();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.stopReason).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should stream a response",
    async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: process.env.OPENAI_API_KEY });

      const stream = provider.stream({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Count from 1 to 5." }],
        maxTokens: 100,
      });

      const events = await collectStreamEvents(stream);

      // Should have text events
      const textEvents = events.filter((e) => e.type === "text");
      expect(textEvents.length).toBeGreaterThan(0);

      // Should have done event
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should handle tool calls",
    async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: process.env.OPENAI_API_KEY });

      const result = await provider.complete({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            inputSchema: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        ],
        maxTokens: 200,
      });

      // Model should either respond with text or call the tool
      expect(result.content || result.toolCalls?.length).toBeTruthy();
      if (result.toolCalls && result.toolCalls.length > 0) {
        expect(result.toolCalls[0]?.name).toBe("get_weather");
        expect(result.stopReason).toBe("tool_use");
      }
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should estimate token count",
    async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: process.env.OPENAI_API_KEY });

      const count = await provider.countTokens("Hello, world! This is a test.");
      expect(count).toBeGreaterThan(0);
    },
    10000
  );

  it.skipIf(!hasKey)(
    "should validate credentials with API call",
    async () => {
      const provider = new OpenAIProvider();

      const result = await provider.validateCredentialWithApiCall({
        type: "api_key",
        value: process.env.OPENAI_API_KEY!,
      });

      expect(result.valid).toBe(true);
    },
    15000
  );

  // O-series model test (if available and allowed)
  it.skipIf(!hasKey)(
    "should handle O-series model (non-streaming fallback)",
    async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: process.env.OPENAI_API_KEY });

      // O-series streaming falls back to non-streaming and yields result
      const stream = provider.stream({
        model: "o1-mini",
        messages: [{ role: "user", content: "What is 2+2?" }],
        maxTokens: 100,
      });

      const events = await collectStreamEvents(stream);

      // Should still get text and done events even with fallback
      const textEvents = events.filter((e) => e.type === "text");
      expect(textEvents.length).toBeGreaterThan(0);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    },
    60000
  ); // O-series can take longer
});

// =============================================================================
// Google Integration Tests
// =============================================================================

describe("GoogleProvider Integration", () => {
  const hasKey = hasApiKey("GOOGLE_GENERATIVE_AI_API_KEY");

  it.skipIf(!hasKey)(
    "should complete a simple request",
    async () => {
      const provider = new GoogleProvider();
      await provider.initialize({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const result = await provider.complete({
        model: "gemini-1.5-flash-8b",
        messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
        maxTokens: 50,
      });

      expect(result.content).toBeTruthy();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.stopReason).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should stream a response",
    async () => {
      const provider = new GoogleProvider();
      await provider.initialize({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const stream = provider.stream({
        model: "gemini-1.5-flash-8b",
        messages: [{ role: "user", content: "Count from 1 to 5." }],
        maxTokens: 100,
      });

      const events = await collectStreamEvents(stream);

      // Should have text events
      const textEvents = events.filter((e) => e.type === "text");
      expect(textEvents.length).toBeGreaterThan(0);

      // Should have done event
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should handle tool calls (function calling)",
    async () => {
      const provider = new GoogleProvider();
      await provider.initialize({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const result = await provider.complete({
        model: "gemini-1.5-flash-8b",
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            inputSchema: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        ],
        maxTokens: 200,
      });

      // Model should either respond with text or call the tool
      expect(result.content || result.toolCalls?.length).toBeTruthy();
      if (result.toolCalls && result.toolCalls.length > 0) {
        expect(result.toolCalls[0]?.name).toBe("get_weather");
      }
    },
    30000
  );

  it.skipIf(!hasKey)(
    "should count tokens",
    async () => {
      const provider = new GoogleProvider();
      await provider.initialize({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const count = await provider.countTokens("Hello, world! This is a test.");
      expect(count).toBeGreaterThan(0);
    },
    10000
  );

  it.skipIf(!hasKey)(
    "should validate credentials with API call",
    async () => {
      const provider = new GoogleProvider();

      const result = await provider.validateCredentialWithApiCall({
        type: "api_key",
        value: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      });

      expect(result.valid).toBe(true);
    },
    15000
  );
});

// =============================================================================
// Cross-Provider Tests
// =============================================================================

interface TestProvider {
  complete(params: CompletionParams): Promise<CompletionResult>;
}

describe("Cross-Provider Consistency", () => {
  const providers: Array<{
    name: string;
    envVar: string;
    create: () => Promise<TestProvider>;
    model: string;
  }> = [
    {
      name: "Anthropic",
      envVar: "ANTHROPIC_API_KEY",
      create: async () => {
        const p = new AnthropicProvider();
        await p.initialize({ apiKey: process.env.ANTHROPIC_API_KEY });
        return p;
      },
      model: "claude-3-5-haiku-20241022",
    },
    {
      name: "OpenAI",
      envVar: "OPENAI_API_KEY",
      create: async () => {
        const p = new OpenAIProvider();
        await p.initialize({ apiKey: process.env.OPENAI_API_KEY });
        return p;
      },
      model: "gpt-4o-mini",
    },
    {
      name: "Google",
      envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
      create: async () => {
        const p = new GoogleProvider();
        await p.initialize({
          apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        });
        return p;
      },
      model: "gemini-1.5-flash-8b",
    },
  ];

  for (const { name, envVar, create, model } of providers) {
    it.skipIf(!hasApiKey(envVar))(
      `${name}: should return consistent CompletionResult structure`,
      async () => {
        const provider = await create();
        const result = await provider.complete({
          model,
          messages: [{ role: "user", content: "Say hi" }],
          maxTokens: 20,
        });

        // All providers should return these fields
        expect(result).toHaveProperty("content");
        expect(result).toHaveProperty("usage");
        expect(result).toHaveProperty("stopReason");

        // Usage should have standard fields
        expect(result.usage).toHaveProperty("inputTokens");
        expect(result.usage).toHaveProperty("outputTokens");
        expect(typeof result.usage.inputTokens).toBe("number");
        expect(typeof result.usage.outputTokens).toBe("number");

        // Stop reason should be a valid value
        expect(["end_turn", "stop", "tool_use", "max_tokens", "content_filter"]).toContain(
          result.stopReason
        );
      },
      30000
    );
  }
});

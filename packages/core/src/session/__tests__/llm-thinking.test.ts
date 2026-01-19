// ============================================
// LLM Thinking Capability Tests
// ============================================

import type {
  CompletionParams,
  LLMProvider,
  ProviderRegistry,
  StreamEvent,
} from "@vellum/provider";
import { describe, expect, it } from "vitest";
import { LLM } from "../llm.js";

type CapturedParams = {
  thinking?: {
    enabled?: boolean;
    reasoningEffort?: string;
  };
  extraBody?: Record<string, unknown>;
};

function createMockProvider(onParams: (params: CompletionParams) => void): LLMProvider {
  return {
    async initialize() {
      return;
    },
    isInitialized() {
      return true;
    },
    async complete() {
      throw new Error("Not implemented");
    },
    async *stream(params: CompletionParams): AsyncIterable<StreamEvent> {
      onParams(params);
      yield { type: "done", stopReason: "end_turn" };
    },
    async countTokens() {
      return 0;
    },
    async listModels() {
      return [];
    },
    async validateCredential() {
      return { valid: true };
    },
  };
}

describe("LLM.stream thinking gating", () => {
  it("should disable thinking for models without reasoning support", async () => {
    let captured: CapturedParams | null = null;
    const provider = createMockProvider((params) => {
      captured = params as CapturedParams;
    });

    const registry = {
      async get() {
        return provider;
      },
    } as unknown as ProviderRegistry;

    LLM.initialize(registry);

    const stream = LLM.stream({
      providerType: "openai",
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
      thinking: { enabled: true, budgetTokens: 1000, reasoningEffort: "high" },
    });

    for await (const _ of stream) {
      // consume stream
    }

    expect((captured as { thinking?: unknown } | null)?.thinking).toBeUndefined();
  });

  it("should pass reasoning effort for supported models", async () => {
    let captured: CapturedParams | null = null;
    const provider = createMockProvider((params) => {
      captured = params as CapturedParams;
    });

    const registry = {
      async get() {
        return provider;
      },
    } as unknown as ProviderRegistry;

    LLM.initialize(registry);

    const stream = LLM.stream({
      providerType: "openai",
      model: "o3",
      messages: [{ role: "user", content: "Hi" }],
      thinking: { enabled: true, reasoningEffort: "high" },
      extraBody: { trace_id: "abc" },
    });

    for await (const _ of stream) {
      // consume stream
    }

    const thinking = (
      captured as { thinking?: { enabled?: boolean; reasoningEffort?: string } } | null
    )?.thinking;
    expect(thinking?.enabled).toBe(true);
    expect(thinking?.reasoningEffort).toBe("high");
    expect((captured as CapturedParams | null)?.extraBody).toEqual({ trace_id: "abc" });
  });

  it("should omit reasoning effort when model does not declare supported efforts", async () => {
    let captured: CapturedParams | null = null;
    const provider = createMockProvider((params) => {
      captured = params as CapturedParams;
    });

    const registry = {
      async get() {
        return provider;
      },
    } as unknown as ProviderRegistry;

    LLM.initialize(registry);

    const stream = LLM.stream({
      providerType: "openai",
      model: "o1",
      messages: [{ role: "user", content: "Hi" }],
      thinking: { enabled: true, reasoningEffort: "high" },
    });

    for await (const _ of stream) {
      // consume stream
    }

    const thinking = (
      captured as { thinking?: { enabled?: boolean; reasoningEffort?: string } } | null
    )?.thinking;
    expect(thinking?.enabled).toBe(true);
    expect(thinking?.reasoningEffort).toBeUndefined();
  });
});

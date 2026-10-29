import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DeepSeekProvider,
  ProviderError,
  type ProviderRegistry,
  type StreamEvent,
} from "@vellum/provider";
import { ErrorCode } from "@vellum/shared";
import { describe, expect, it } from "vitest";
import { bashTool } from "../../builtin/bash.js";
import { createToolRegistry } from "../../tool/registry.js";
import { LLM } from "../llm.js";

describe("LLM.stream error classification", () => {
  it.each([
    { code: ErrorCode.INVALID_ARGUMENT, category: "api_error", retryable: false },
    {
      code: ErrorCode.CREDENTIAL_VALIDATION_FAILED,
      category: "credential_invalid",
      retryable: false,
    },
    { code: ErrorCode.SERVICE_UNAVAILABLE, category: "api_error", retryable: true },
    { code: ErrorCode.RATE_LIMITED, category: "rate_limited", retryable: true },
  ] as const)("preserves provider classification $code/$retryable", async (classification) => {
    const error = new ProviderError("Provider rejected request", classification);
    const provider = {
      isInitialized: () => true,
      // biome-ignore lint/correctness/useYield: Reproduce a provider rejecting before the first event.
      async *stream(): AsyncGenerator<StreamEvent> {
        throw error;
      },
    };
    LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
    const events = [];
    for await (const event of LLM.stream({
      providerType: "deepseek",
      model: "deepseek-flash",
      messages: [{ role: "user", content: "Hello" }],
    }))
      events.push(event);
    expect(events).toEqual([
      {
        type: "error",
        code: classification.code.toString(),
        retryable: classification.retryable,
        message: "Provider rejected request",
      },
    ]);
  });

  it("does not mark a real HTTP 400 schema rejection as retryable", async () => {
    let requestCount = 0;
    const server = createServer(async (request, response) => {
      for await (const _ of request) {
        /* consume the SDK request */
      }
      requestCount++;
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message: "Invalid schema for function 'bash': expected number",
            type: "invalid_request_error",
          },
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const provider = new DeepSeekProvider();
      await provider.initialize({
        apiKey: "fixture-only",
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      });
      LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
      const registry = createToolRegistry();
      registry.register(bashTool);
      const events = [];
      for await (const event of LLM.stream({
        providerType: "deepseek",
        model: "deepseek-flash",
        messages: [{ role: "user", content: "Inspect files" }],
        tools: registry.getDefinitions().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        })),
      }))
        events.push(event);
      expect(events).toEqual([
        expect.objectContaining({
          type: "error",
          code: ErrorCode.INVALID_ARGUMENT.toString(),
          retryable: false,
          message: expect.stringContaining("Invalid schema for function 'bash'"),
        }),
      ]);
      expect(requestCount).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

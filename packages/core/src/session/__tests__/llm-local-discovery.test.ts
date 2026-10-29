import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ALL_MODELS,
  getModelInfo,
  LMStudioProvider,
  MODEL_CATALOG,
  OllamaProvider,
  type ProviderRegistry,
  updateDiscoveredModels,
} from "@vellum/provider";
import { describe, expect, it } from "vitest";
import { LLM } from "../llm.js";

describe("local discovery through LLM.stream", () => {
  it.each([
    ["ollama", "supported"],
    ["ollama", "unsupported"],
    ["ollama", "unknown"],
    ["lmstudio", "supported"],
    ["lmstudio", "unsupported"],
    ["lmstudio", "unknown"],
  ] as const)(
    "preserves %s tool behavior after %s metadata discovery",
    async (providerType, support) => {
      const model = "custom-local-model";
      const requests: Array<{
        path: string;
        authorization?: string;
        custom?: string;
        body: Record<string, unknown>;
      }> = [];
      const server = createServer(async (request, response) => {
        let body = "";
        for await (const chunk of request) body += String(chunk);
        const path = request.url ?? "";
        requests.push({
          path,
          authorization: request.headers.authorization,
          custom: request.headers["x-fixture"] as string | undefined,
          body: body ? JSON.parse(body) : {},
        });
        response.setHeader("content-type", "application/json");
        if (path === "/api/tags")
          return response.end(JSON.stringify({ models: [{ name: model }] }));
        if (path === "/v1/models") return response.end(JSON.stringify({ data: [{ id: model }] }));
        if ((path === "/api/show" || path === "/api/v1/models") && support === "unknown") {
          response.statusCode = 404;
          return response.end("{}");
        }
        if (path === "/api/show")
          return response.end(
            JSON.stringify({
              capabilities:
                support === "supported" ? ["completion", "tools", "vision"] : ["completion"],
              model_info: { "general.architecture": "fixture", "fixture.context_length": 32768 },
            })
          );
        if (path === "/api/v1/models")
          return response.end(
            JSON.stringify({
              models: [
                {
                  type: "llm",
                  key: model,
                  max_context_length: 32768,
                  capabilities: { trained_for_tool_use: support === "supported", vision: true },
                },
                { type: "embedding", key: "embedding-only", max_context_length: 2048 },
              ],
            })
          );
        if (path === "/v1/chat/completions") {
          response.setHeader("content-type", "text/event-stream");
          return response.end(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`
          );
        }
        response.statusCode = 404;
        response.end("{}");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const previous = MODEL_CATALOG.get(providerType) ?? [];
      try {
        const port = (server.address() as AddressInfo).port;
        const provider = providerType === "ollama" ? new OllamaProvider() : new LMStudioProvider();
        await provider.initialize({
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: "fixture-only",
          headers: { "X-Fixture": "yes" },
        });
        expect((await provider.validateCredential({ type: "api_key" })).valid).toBe(true);
        expect(await provider.isServerRunning()).toBe(true);
        const discovered = await provider.refreshModels();
        updateDiscoveredModels(providerType, discovered);
        expect(discovered.some((entry) => entry.id === "embedding-only")).toBe(false);
        expect(getModelInfo(providerType, model).supportsTools).toBe(
          support === "unknown" ? undefined : support === "supported"
        );
        LLM.initialize({ get: async () => provider } as unknown as ProviderRegistry);
        for await (const _ of LLM.stream({
          providerType,
          model,
          messages: [{ role: "user", content: "Inspect files" }],
          tools: [
            {
              name: "read_file",
              description: "Read a file",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        })) {
          // Consume the actual provider's HTTP stream through the core capability gate.
        }
        const completion = requests.find((request) => request.path === "/v1/chat/completions");
        expect(completion).toBeDefined();
        if (support === "unsupported") expect(completion?.body.tools).toBeUndefined();
        else expect(completion?.body.tools).toMatchObject([{ function: { name: "read_file" } }]);
        expect(
          requests.every(
            (request) => request.authorization === "Bearer fixture-only" && request.custom === "yes"
          )
        ).toBe(true);
      } finally {
        MODEL_CATALOG.set(providerType, previous);
        ALL_MODELS.splice(0, ALL_MODELS.length, ...[...MODEL_CATALOG.values()].flat());
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );
});

import type { ProviderResponseMetadata, StreamEvent } from "@vellum/provider";
import { describe, expect, it, vi } from "vitest";
import { AgentStreamHandler } from "../../agent/stream-handler.js";
import { StreamProcessor } from "../../streaming/processor.js";
import {
  createAssistantMessage,
  SessionMessageSchema,
  SessionParts,
  toModelMessages,
} from "../message.js";

describe("provider replay persistence", () => {
  it.each([
    false,
    true,
  ])("retains opaque metadata through the stream and session serialization (processor=%s)", async (useStreamProcessor) => {
    const metadata: ProviderResponseMetadata = {
      provider: "openai",
      model: "gpt-6.1-sol",
      replay: [{ type: "reasoning", id: "rs_fixture", encrypted_content: "opaque" }],
    };
    const handler = new AgentStreamHandler(
      { useStreamProcessor },
      {
        streamProcessor: new StreamProcessor(),
        isCancelled: () => false,
        emitText: vi.fn(),
        emitThinking: vi.fn(),
        emitToolCall: vi.fn(),
        emitError: vi.fn(),
        recordUsage: vi.fn(),
      }
    );
    async function* stream(): AsyncIterable<StreamEvent> {
      yield { type: "text", content: "Checking" };
      yield { type: "provider_metadata", metadata };
      yield { type: "done", stopReason: "end_turn" };
    }
    await handler.processStream(stream());
    const saved = createAssistantMessage([SessionParts.text("Checking")], {
      providerMetadata: handler.getState().providerMetadata,
    });
    const restored = SessionMessageSchema.parse(JSON.parse(JSON.stringify(saved)));
    expect(toModelMessages([restored])[0]?.providerMetadata).toEqual(metadata);
    handler.resetState();
    expect(handler.getState().providerMetadata).toBeUndefined();
  });
});

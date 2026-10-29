/** Wire conversion for Responses, shared by the existing OpenAI-compatible adapters. */
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "./models/types.js";
import { stripSchemaMetaFields } from "./transforms/schema-sanitizer.js";
import type {
  CompletionParams,
  CompletionResult,
  ProviderResponseMetadata,
  StopReason,
  StreamEvent,
} from "./types.js";

export function buildResponsesRequest(
  params: CompletionParams,
  provider: string,
  effort?: ReasoningEffort
): ResponseCreateParamsNonStreaming {
  const input: ResponseInput = [];
  for (const message of params.messages) {
    const metadata = message.providerMetadata;
    if (
      message.role === "assistant" &&
      metadata?.provider === provider &&
      metadata.model === params.model
    ) {
      for (const item of metadata.replay ?? []) {
        if (item.type === "reasoning") input.push(item as unknown as ResponseInput[number]);
      }
    }
    if (typeof message.content === "string") {
      input.push({ role: message.role, content: message.content });
      continue;
    }
    for (const part of message.content) {
      switch (part.type) {
        case "text":
          input.push({ role: message.role, content: part.text });
          break;
        case "image":
          input.push({
            role: "user",
            content: [
              {
                type: "input_image",
                image_url:
                  part.source.startsWith("http") || part.source.startsWith("data:")
                    ? part.source
                    : `data:${part.mimeType};base64,${part.source}`,
                detail: "auto",
              },
            ],
          });
          break;
        case "tool_use":
          input.push({
            type: "function_call",
            call_id: part.id,
            name: part.name,
            arguments: JSON.stringify(part.input),
          });
          break;
        case "tool_result":
          input.push({
            type: "function_call_output",
            call_id: part.toolUseId,
            output: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
          });
          break;
      }
    }
  }
  const request: ResponseCreateParamsNonStreaming = {
    model: params.model,
    input,
    store: false,
    include: ["reasoning.encrypted_content"],
    max_output_tokens: params.maxTokens ?? 32_768,
    ...(params.tools?.length
      ? {
          tools: params.tools.map((tool) => ({
            type: "function" as const,
            name: tool.name,
            description: tool.description,
            parameters: stripSchemaMetaFields(tool.inputSchema),
            strict: false,
          })),
        }
      : {}),
  };
  // New API effort values are valid wire values even when the installed SDK's
  // generated TypeScript union predates the model (e.g. GPT-6's "max").
  if (effort) Object.assign(request, { reasoning: { effort } });
  return request;
}

function stopReason(response: Response): StopReason {
  if (response.status === "failed")
    throw new Error(response.error?.message ?? "Responses request failed");
  if (response.status === "incomplete") {
    return response.incomplete_details?.reason === "max_output_tokens"
      ? "max_tokens"
      : "content_filter";
  }
  if (response.output.some((item) => item.type === "function_call")) return "tool_use";
  return "end_turn";
}

export function normalizeResponsesResult(
  response: Response,
  provider: string,
  model: string
): CompletionResult {
  const toolCalls = response.output.flatMap((item) => {
    if (item.type !== "function_call") return [];
    const input: unknown = JSON.parse(item.arguments);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error(`Invalid arguments for tool ${item.name}`);
    return [{ id: item.call_id, name: item.name, input: input as Record<string, unknown> }];
  });
  const metadata: ProviderResponseMetadata = {
    provider,
    model,
    replay: response.output
      .filter((item) => item.type === "reasoning")
      .map((item) => ({ ...item })),
  };
  return {
    content:
      response.output_text ??
      response.output
        .flatMap((item) =>
          item.type === "message"
            ? item.content.flatMap((part) => (part.type === "output_text" ? [part.text] : []))
            : []
        )
        .join(""),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: response.usage?.input_tokens_details?.cached_tokens,
      thinkingTokens: response.usage?.output_tokens_details?.reasoning_tokens,
    },
    stopReason: stopReason(response),
    ...(toolCalls.length ? { toolCalls } : {}),
    providerMetadata: metadata,
  };
}

export async function* mapResponsesStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  provider: string,
  model: string
): AsyncIterable<StreamEvent> {
  const calls = new Map<string, { id: string; name: string; index: number }>();
  for await (const event of stream) {
    switch (event.type) {
      case "response.output_text.delta":
        yield { type: "text", content: event.delta };
        break;
      case "response.reasoning_summary_text.delta":
        yield { type: "reasoning", content: event.delta };
        break;
      case "response.output_item.added":
        if (event.item.type === "function_call") {
          const call = { id: event.item.call_id, name: event.item.name, index: event.output_index };
          calls.set(event.item.id ?? call.id, call);
          yield { type: "tool_call_start", ...call };
        }
        break;
      case "response.function_call_arguments.delta": {
        const call = calls.get(event.item_id);
        if (call) {
          yield { type: "tool_call_delta", id: call.id, index: call.index, arguments: event.delta };
        }
        break;
      }
      case "response.output_item.done":
        if (event.item.type === "function_call") {
          const input: unknown = JSON.parse(event.item.arguments);
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error(`Invalid arguments for tool ${event.item.name}`);
          yield { type: "tool_call_end", id: event.item.call_id, index: event.output_index };
          calls.delete(event.item.id ?? event.item.call_id);
        }
        break;
      case "response.completed":
      case "response.incomplete": {
        const result = normalizeResponsesResult(event.response, provider, model);
        if (result.providerMetadata)
          yield { type: "provider_metadata", metadata: result.providerMetadata };
        // Only release executable calls after the provider confirms a complete
        // response. A dropped/failed stream must not trigger partial actions.
        if (event.type === "response.completed") {
          for (const tool of result.toolCalls ?? []) yield { type: "toolCall", ...tool };
        }
        yield { type: "usage", ...result.usage };
        yield { type: "end", stopReason: result.stopReason };
        yield { type: "done", stopReason: result.stopReason };
        return;
      }
      case "response.failed":
        throw new Error(event.response.error?.message ?? "Responses stream failed");
      case "error":
        throw new Error(event.message);
    }
  }
  throw new Error("Responses stream ended without a completion event");
}

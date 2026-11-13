import type { PersistenceManager, SessionMessage } from "@vellum/core";
import { expect, it, vi } from "vitest";
import type { Message } from "../context/MessagesContext.js";
import {
  toSessionMessage,
  toSessionMessages,
  toUIMessage,
  toUIMessages,
} from "./message-adapter.js";
import { PersistenceBridge } from "./persistence-bridge.js";
import { createMemorySessionStorage, createSessionAdapter } from "./session-adapter.js";

it("preserves tool receipts when saving live groups and saving a resumed transcript again", async () => {
  const storage = createMemorySessionStorage();
  const adapter = createSessionAdapter("session", storage);
  const call = {
    id: "read-1",
    name: "read_file",
    arguments: { path: "README.md" },
    status: "completed" as const,
    result: "Existing file content",
  };
  const messages: Message[] = [
    {
      id: "assistant",
      role: "assistant",
      content: "Reading",
      timestamp: new Date(0),
      toolCalls: [call],
    },
    { id: "receipt", role: "tool_group", content: "", timestamp: new Date(1), toolCalls: [call] },
  ];
  await adapter.save(messages);
  const saved = await storage.load("session");
  expect(saved?.[1]?.parts).toEqual([
    { type: "tool_result", toolId: "read-1", content: "Existing file content", isError: false },
  ]);
  await adapter.save((await adapter.load()) ?? []);
  const savedAgain = await storage.load("session");
  expect(savedAgain?.[1]?.parts).toEqual([
    {
      type: "tool_result",
      toolId: "read-1",
      content: "Existing file content",
      isError: false,
    },
  ]);
});

it("preserves provider replay, part ordering and thinking timestamps across UI roundtrips", () => {
  const history: SessionMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      preToolSnapshot: "snapshot-before-call",
      changedFiles: ["README.md"],
      parts: [
        { type: "reasoning", text: "Inspect workspace", startedAt: 10, completedAt: 12 },
        { type: "text", text: "Checking" },
        { type: "tool", id: "shell-1", name: "shell", input: { command: "pwd" } },
      ],
      metadata: {
        createdAt: 10,
        completedAt: 15,
        provider: "test",
        model: "test-model",
        providerMetadata: {
          provider: "test",
          model: "test-model",
          replay: [{ opaque: "provider-replay" }],
        },
        tokens: { input: 8, output: 4, reasoning: 2 },
      },
    },
    {
      id: "receipt",
      role: "tool_result",
      parts: [
        {
          type: "tool_result",
          toolId: "shell-1",
          content: { stdout: "WORKSPACE", stderr: "", exitCode: 0 },
        },
      ],
      metadata: { createdAt: 16 },
    },
  ];
  const ui = toUIMessages(history);
  expect(ui[1]?.toolCalls?.[0]).toMatchObject({ name: "shell", arguments: { command: "pwd" } });
  expect(toSessionMessages(ui)).toEqual(history);
});

it.each([null, "Tool failed", { error: "Tool failed" }])(
  "preserves unmatched and failed receipts without synthesizing message text: %j",
  (content) => {
    const message: SessionMessage = {
      id: "receipt",
      role: "tool_result",
      parts: [{ type: "tool_result", toolId: "missing-call", content, isError: content !== null }],
      metadata: { createdAt: 0 },
    };
    const ui = toUIMessage(message);
    expect(ui.role).toBe("tool_group");
    expect(ui.content).toBe("");
    expect(ui.toolCalls?.[0]?.result).toEqual(content);
    if (content !== null) expect(ui.toolCalls?.[0]?.error).toContain("Tool failed");
    expect(toSessionMessage(ui)).toEqual(message);
  }
);

it("retains attachments and untouched reasoning when editing restored text, without stale provider replay", () => {
  const source: SessionMessage = {
    id: "original",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "Thinking", startedAt: 1, completedAt: 2 },
      { type: "text", text: "Before" },
      { type: "file", url: "file:///attachment.txt", filename: "attachment.txt" },
      { type: "image", source: "image-data", mimeType: "image/png" },
    ],
    metadata: {
      createdAt: 1,
      completedAt: 3,
      provider: "test",
      providerMetadata: { provider: "test", model: "model", replay: [{ opaque: "old-content" }] },
    },
  };
  const saved = toSessionMessage({ ...toUIMessage(source), content: "After" });
  expect(saved.parts).toEqual([
    source.parts[0],
    { type: "text", text: "After" },
    ...source.parts.slice(2),
  ]);
  expect(saved.metadata).toEqual({ createdAt: 1, completedAt: 3, provider: "test" });
});

it("uses the same correlated receipts for bridge loading, full saves and incremental synchronization", async () => {
  const history: SessionMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      parts: [{ type: "tool", id: "read-1", name: "read_file", input: { path: "README.md" } }],
      metadata: { createdAt: 0 },
    },
    {
      id: "receipt",
      role: "tool_result",
      parts: [{ type: "tool_result", toolId: "read-1", content: "Read content" }],
      metadata: { createdAt: 1 },
    },
  ];
  const onMessage = vi.fn().mockResolvedValue(undefined);
  const persistence = {
    currentSession: { metadata: { id: "session" }, messages: history },
    onMessage,
  } as unknown as PersistenceManager;
  const bridge = new PersistenceBridge({ persistence });
  const ui = bridge.loadAsUIMessages();
  expect(ui[1]?.toolCalls?.[0]?.name).toBe("read_file");
  expect(bridge.toSessionMessages(ui)).toEqual(history);
  await expect(bridge.syncMessages(ui)).resolves.toMatchObject({ success: true, syncedCount: 2 });
  expect(onMessage.mock.calls.map(([message]) => message)).toEqual(history);
  await expect(bridge.syncMessages(ui)).resolves.toMatchObject({ success: true, syncedCount: 0 });
  expect(onMessage).toHaveBeenCalledTimes(2);
});

import { expect, it } from "vitest";
import type { Message } from "../context/MessagesContext.js";
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
  expect(savedAgain?.[1]?.parts).toContainEqual({
    type: "tool_result",
    toolId: "read-1",
    content: "Existing file content",
    isError: false,
  });
});

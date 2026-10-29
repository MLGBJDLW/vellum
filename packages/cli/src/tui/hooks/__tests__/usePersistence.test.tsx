import { EventEmitter } from "node:events";
import type { PersistenceManager, StorageManager } from "@vellum/core";
import { Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemorySessionStorage } from "../../adapters/session-adapter.js";
import { MessagesProvider, useMessages } from "../../context/MessagesContext.js";
import { usePersistence } from "../usePersistence.js";

afterEach(async () => {
  await act(async () => cleanup());
});

describe("usePersistence callback ownership", () => {
  it("keeps one persistence bridge while streaming rerenders App-style inline callbacks", async () => {
    const manager = Object.assign(new EventEmitter(), {
      startAutoSave: vi.fn(),
      stopAutoSave: vi.fn(),
      currentSession: null,
    });
    const storage = createMemorySessionStorage();
    const storageManager = {} as StorageManager;
    const errors: string[] = [];
    let append: (content: string) => void = () => {};
    function Harness({ revision }: { revision: number }) {
      const messages = useMessages();
      append = (content) => messages.appendToMessage("stream", content);
      const persistence = usePersistence({
        sessionId: "fixture",
        storage,
        storageManager,
        persistenceManager: manager as unknown as PersistenceManager,
        enableAdvancedPersistence: true,
        autoLoad: false,
        onError: (error) => errors.push(`${revision}:${error.message}`),
        onCheckpointCreated: () => {},
        onRollbackComplete: () => {},
      });
      return (
        <Text>{persistence.autoSaveRunning ? messages.pendingMessage?.content : "starting"}</Text>
      );
    }
    const view = (revision: number) => (
      <MessagesProvider
        initialMessages={[
          {
            id: "stream",
            role: "assistant",
            content: "seed",
            timestamp: new Date(0),
            isStreaming: true,
          },
        ]}
      >
        <Harness revision={revision} />
      </MessagesProvider>
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(view(0));
    });
    expect(manager.startAutoSave).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 140; i++) {
      await act(async () => append(` ${i}`));
    }
    await act(async () => screen.rerender(view(1)));
    expect(manager.startAutoSave).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount("error")).toBe(1);
    await act(async () => {
      manager.emit("error", new Error("latest callback"));
    });
    expect(errors).toEqual(["1:latest callback"]);
    expect(screen.lastFrame()).toContain("139");
  });
});

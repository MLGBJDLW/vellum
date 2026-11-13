import { createUserMessage, type SessionMessage } from "@vellum/core";
import { Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagesProvider, useMessages } from "../context/MessagesContext.js";
import { type SessionStorage, useSessionAdapter } from "./session-adapter.js";

afterEach(async () => {
  await act(async () => cleanup());
});

function Harness({ sessionId, storage }: { sessionId: string; storage: SessionStorage }) {
  const { messages } = useMessages();
  useSessionAdapter({ sessionId, storage, saveDebounceMs: 10 });
  return <Text>{messages.map((message) => message.content).join("|") || "<empty>"}</Text>;
}

describe("session adapter identity", () => {
  it("rejects a failed manual save, cancels its pending autosave, and allows a later retry", async () => {
    const storage: SessionStorage = {
      save: vi
        .fn()
        .mockRejectedValueOnce(new Error("Disk unavailable"))
        .mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
    };
    let append = () => {};
    let save!: () => Promise<void>;
    function Editor() {
      const { addMessage } = useMessages();
      append = () => {
        addMessage({ role: "user", content: "Keep this edit" });
      };
      const adapter = useSessionAdapter({
        sessionId: "current",
        storage,
        autoLoad: false,
        saveDebounceMs: 20,
      });
      save = adapter.saveSession;
      return <Text>{adapter.error?.message ?? "ready"}</Text>;
    }
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(
        <MessagesProvider>
          <Editor />
        </MessagesProvider>
      );
    });
    await act(async () => {
      append();
    });
    await act(async () => {
      await expect(save()).rejects.toThrow("Disk unavailable");
    });
    expect(screen.lastFrame()).toBe("Disk unavailable");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await save();
    });
    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(screen.lastFrame()).toBe("ready");
  });

  it("waits for the selected session read before manually saving a newer edit", async () => {
    let finishRead!: (messages: readonly SessionMessage[]) => void;
    const read = new Promise<readonly SessionMessage[]>((resolve) => {
      finishRead = resolve;
    });
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn(() => read),
    };
    let append = () => {};
    let save!: () => Promise<void>;
    function Editor() {
      const { addMessage } = useMessages();
      append = () => {
        addMessage({ role: "user", content: "Prompt during load" });
      };
      save = useSessionAdapter({ sessionId: "current", storage, saveDebounceMs: 20 }).saveSession;
      return <Text>editor</Text>;
    }
    await act(async () => {
      render(
        <MessagesProvider>
          <Editor />
        </MessagesProvider>
      );
    });
    await act(async () => {
      append();
    });
    let saved = false;
    const pending = save().then(() => {
      saved = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(saved).toBe(false);
    await act(async () => {
      finishRead([]);
      await pending;
    });
    expect(storage.save).toHaveBeenLastCalledWith(
      "current",
      expect.arrayContaining([
        expect.objectContaining({ parts: [{ type: "text", text: "Prompt during load" }] }),
      ])
    );
  });

  it("does not overwrite unread history when the session load fails", async () => {
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockRejectedValue(new Error("Cannot read saved history")),
    };
    let save!: () => Promise<void>;
    function Editor() {
      save = useSessionAdapter({ sessionId: "current", storage }).saveSession;
      return <Text>editor</Text>;
    }
    await act(async () => {
      render(
        <MessagesProvider>
          <Editor />
        </MessagesProvider>
      );
    });
    await expect(save()).rejects.toThrow("Cannot read saved history");
    expect(storage.save).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "saves queued edits after an earlier write finishes (failed: %s)",
    async (fails) => {
      let finishFirst!: () => void;
      const firstWrite = new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      const persisted = new Map<string, readonly SessionMessage[]>();
      const storage: SessionStorage = {
        save: vi.fn(async (id, messages) => {
          if (vi.mocked(storage.save).mock.calls.length === 1) {
            await firstWrite;
            if (fails) throw new Error("Storage write failed");
          }
          persisted.set(id, messages);
        }),
        clear: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(null),
      };
      let append = (_text: string) => {};
      function Editor({ sessionId }: { sessionId: string }) {
        const { addMessage } = useMessages();
        append = (content) => {
          addMessage({ role: "user", content });
        };
        const { error } = useSessionAdapter({ sessionId, storage, saveDebounceMs: 10 });
        return (
          <Text>
            {sessionId}
            {error?.message}
          </Text>
        );
      }
      const view = (sessionId: string) => (
        <MessagesProvider>
          <Editor sessionId={sessionId} />
        </MessagesProvider>
      );
      let screen!: ReturnType<typeof render>;
      await act(async () => {
        screen = render(view("old"));
      });
      await act(async () => {
        append("first edit");
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(storage.save).toHaveBeenCalledTimes(1);
      await act(async () => {
        append("second edit");
      });
      await act(async () => {
        screen.rerender(view("new"));
      });
      await act(async () => {
        finishFirst();
        await firstWrite;
      });
      expect(persisted.get("old")?.map((message) => message.parts)).toEqual([
        [{ type: "text", text: "first edit" }],
        [{ type: "text", text: "second edit" }],
      ]);
      expect(persisted.has("new")).toBe(false);
      if (fails) expect(screen.lastFrame()).toContain("Storage write failed");
    }
  );

  it("hides the previous transcript and preserves edits made while the selected session loads", async () => {
    let finishRead!: (messages: readonly SessionMessage[]) => void;
    const pendingRead = new Promise<readonly SessionMessage[]>((resolve) => {
      finishRead = resolve;
    });
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn((id) =>
        id === "old"
          ? Promise.resolve([createUserMessage([{ type: "text", text: "Old transcript" }])])
          : pendingRead
      ),
    };
    let append = () => {};
    function Editor({ sessionId }: { sessionId: string }) {
      const { messages, addMessage } = useMessages();
      append = () => {
        addMessage({ role: "user", content: "New prompt" });
      };
      useSessionAdapter({ sessionId, storage, saveDebounceMs: 10 });
      return <Text>{messages.map((message) => message.content).join("|") || "<empty>"}</Text>;
    }
    const view = (sessionId: string) => (
      <MessagesProvider>
        <Editor sessionId={sessionId} />
      </MessagesProvider>
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(view("old"));
    });
    await act(async () => {
      screen.rerender(view("new"));
    });
    expect(screen.lastFrame()).toBe("<empty>");
    await act(async () => {
      append();
    });
    await act(async () => {
      finishRead([]);
    });
    expect(screen.lastFrame()).toBe("New prompt");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(storage.save).toHaveBeenCalledWith(
      "new",
      expect.arrayContaining([
        expect.objectContaining({ parts: [{ type: "text", text: "New prompt" }] }),
      ])
    );
  });

  it("flushes pending edits to their original session before switching", async () => {
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
    };
    let append = () => {};
    function Editor({ sessionId }: { sessionId: string }) {
      const { addMessage } = useMessages();
      append = () => {
        addMessage({ role: "user", content: "Unsaved edit" });
      };
      useSessionAdapter({ sessionId, storage, saveDebounceMs: 10_000 });
      return <Text>{sessionId}</Text>;
    }
    const view = (sessionId: string) => (
      <MessagesProvider>
        <Editor sessionId={sessionId} />
      </MessagesProvider>
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(view("old"));
    });
    await act(async () => {
      append();
    });
    expect(storage.save).not.toHaveBeenCalled();
    await act(async () => {
      screen.rerender(view("new"));
    });
    expect(storage.save).toHaveBeenCalledWith(
      "old",
      expect.arrayContaining([
        expect.objectContaining({ parts: [{ type: "text", text: "Unsaved edit" }] }),
      ])
    );
    expect(storage.save).not.toHaveBeenCalledWith("new", expect.anything());
  });

  it("loads the selected session while an earlier read is still pending", async () => {
    let finishOld!: (messages: readonly SessionMessage[]) => void;
    const oldRead = new Promise<readonly SessionMessage[]>((resolve) => {
      finishOld = resolve;
    });
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn((id) =>
        id === "old"
          ? oldRead
          : Promise.resolve([createUserMessage([{ type: "text", text: "Current session" }])])
      ),
    };
    const view = (sessionId: string) => (
      <MessagesProvider>
        <Harness sessionId={sessionId} storage={storage} />
      </MessagesProvider>
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(view("old"));
    });
    await act(async () => {
      screen.rerender(view("current"));
    });
    await act(async () => {
      finishOld([createUserMessage([{ type: "text", text: "Old session" }])]);
    });
    expect(storage.load).toHaveBeenCalledWith("current");
    await vi.waitFor(() => expect(screen.lastFrame()).toBe("Current session"));
  });

  it("clears messages for a fresh session without saving the preceding transcript into it", async () => {
    const storage: SessionStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      load: vi.fn((id) =>
        Promise.resolve(
          id === "old" ? [createUserMessage([{ type: "text", text: "Old session" }])] : null
        )
      ),
    };
    const view = (sessionId: string) => (
      <MessagesProvider>
        <Harness sessionId={sessionId} storage={storage} />
      </MessagesProvider>
    );
    let screen!: ReturnType<typeof render>;
    await act(async () => {
      screen = render(view("old"));
    });
    await vi.waitFor(() => expect(screen.lastFrame()).toBe("Old session"));
    await act(async () => {
      screen.rerender(view("fresh"));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.lastFrame()).toBe("<empty>");
    expect(storage.save).not.toHaveBeenCalledWith(
      "fresh",
      expect.arrayContaining([
        expect.objectContaining({
          parts: expect.arrayContaining([expect.objectContaining({ text: "Old session" })]),
        }),
      ])
    );
  });
});

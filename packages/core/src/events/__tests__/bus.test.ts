import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineEvent, EventBus, type EventDefinition, TimeoutError } from "../bus.js";

describe("defineEvent", () => {
  it("creates an event definition with name and schema", () => {
    const schema = z.object({ id: z.string() });
    const event = defineEvent("test:event", schema);

    expect(event.name).toBe("test:event");
    expect(event.schema).toBe(schema);
  });

  it("preserves type information", () => {
    const event = defineEvent(
      "user:created",
      z.object({
        id: z.string(),
        name: z.string(),
      })
    );

    // Type check: this should compile without errors
    const _typed: EventDefinition<{ id: string; name: string }> = event;
    expect(_typed.name).toBe("user:created");
  });
});

describe("EventBus", () => {
  const testEvent = defineEvent(
    "test:event",
    z.object({
      message: z.string(),
    })
  );

  describe("on()", () => {
    it("subscribes to events and receives payloads", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(testEvent, handler);
      bus.emit(testEvent, { message: "hello" });

      expect(handler).toHaveBeenCalledWith({ message: "hello" });
    });

    it("supports multiple handlers for same event", () => {
      const bus = new EventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on(testEvent, handler1);
      bus.on(testEvent, handler2);
      bus.emit(testEvent, { message: "test" });

      expect(handler1).toHaveBeenCalledWith({ message: "test" });
      expect(handler2).toHaveBeenCalledWith({ message: "test" });
    });

    it("returns unsubscribe function", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      const unsubscribe = bus.on(testEvent, handler);
      unsubscribe();
      bus.emit(testEvent, { message: "ignored" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("calls handlers synchronously", () => {
      const bus = new EventBus();
      const order: number[] = [];

      bus.on(testEvent, () => order.push(1));
      bus.on(testEvent, () => order.push(2));
      bus.emit(testEvent, { message: "sync" });
      order.push(3);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("once()", () => {
    it("handler is called only once", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.once(testEvent, handler);
      bus.emit(testEvent, { message: "first" });
      bus.emit(testEvent, { message: "second" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ message: "first" });
    });

    it("returns unsubscribe function that works before emit", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      const unsubscribe = bus.once(testEvent, handler);
      unsubscribe();
      bus.emit(testEvent, { message: "ignored" });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("off()", () => {
    it("removes specific handler", () => {
      const bus = new EventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on(testEvent, handler1);
      bus.on(testEvent, handler2);
      bus.off(testEvent, handler1);
      bus.emit(testEvent, { message: "test" });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith({ message: "test" });
    });

    it("handles removing non-existent handler gracefully", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      // Should not throw
      expect(() => bus.off(testEvent, handler)).not.toThrow();
    });
  });

  describe("emit()", () => {
    it("does nothing when no handlers registered", () => {
      const bus = new EventBus();

      // Should not throw
      expect(() => bus.emit(testEvent, { message: "no one listening" })).not.toThrow();
    });

    it("isolates events by name", () => {
      const bus = new EventBus();
      const event1 = defineEvent("event:one", z.object({ a: z.string() }));
      const event2 = defineEvent("event:two", z.object({ b: z.number() }));
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on(event1, handler1);
      bus.on(event2, handler2);
      bus.emit(event1, { a: "test" });

      expect(handler1).toHaveBeenCalledWith({ a: "test" });
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe("debug mode (T050)", () => {
    it("validates payload in debug mode", () => {
      const bus = new EventBus({ debug: true });
      const handler = vi.fn();
      bus.on(testEvent, handler);

      expect(() =>
        // @ts-expect-error - intentionally passing invalid payload
        bus.emit(testEvent, { message: 123 })
      ).toThrow(/validation failed/i);
    });

    it("throws with event name in error message", () => {
      const bus = new EventBus({ debug: true });
      const customEvent = defineEvent("custom:named", z.object({ value: z.string() }));

      expect(() =>
        // @ts-expect-error - intentionally passing invalid payload
        bus.emit(customEvent, { value: 42 })
      ).toThrow(/custom:named/);
    });

    it("skips validation when debug is false", () => {
      const bus = new EventBus({ debug: false });
      const handler = vi.fn();
      bus.on(testEvent, handler);

      // @ts-expect-error - intentionally passing invalid payload
      bus.emit(testEvent, { message: 123 });

      // Handler is called even with invalid payload (no validation)
      expect(handler).toHaveBeenCalledWith({ message: 123 });
    });

    it("defaults to no validation", () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.on(testEvent, handler);

      // @ts-expect-error - intentionally passing invalid payload
      bus.emit(testEvent, { invalid: true });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe("hasListeners()", () => {
    it("returns false when no listeners", () => {
      const bus = new EventBus();
      expect(bus.hasListeners(testEvent)).toBe(false);
    });

    it("returns true when listeners exist", () => {
      const bus = new EventBus();
      bus.on(testEvent, () => {});
      expect(bus.hasListeners(testEvent)).toBe(true);
    });

    it("returns false after all listeners removed", () => {
      const bus = new EventBus();
      const unsubscribe = bus.on(testEvent, () => {});
      unsubscribe();
      expect(bus.hasListeners(testEvent)).toBe(false);
    });
  });

  describe("clear()", () => {
    it("clears all handlers for specific event", () => {
      const bus = new EventBus();
      const event1 = defineEvent("event:one", z.object({ a: z.string() }));
      const event2 = defineEvent("event:two", z.object({ b: z.string() }));

      bus.on(event1, () => {});
      bus.on(event2, () => {});

      bus.clear(event1);

      expect(bus.hasListeners(event1)).toBe(false);
      expect(bus.hasListeners(event2)).toBe(true);
    });

    it("clears all handlers when no event specified", () => {
      const bus = new EventBus();
      const event1 = defineEvent("event:one", z.object({ a: z.string() }));
      const event2 = defineEvent("event:two", z.object({ b: z.string() }));

      bus.on(event1, () => {});
      bus.on(event2, () => {});

      bus.clear();

      expect(bus.hasListeners(event1)).toBe(false);
      expect(bus.hasListeners(event2)).toBe(false);
    });
  });

  // ============================================
  // T056, T057, T059 - waitFor Tests
  // ============================================

  describe("waitFor()", () => {
    it("resolves when event is emitted", async () => {
      const bus = new EventBus();

      const promise = bus.waitFor(testEvent);

      // Emit after subscribing
      setTimeout(() => {
        bus.emit(testEvent, { message: "hello" });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ message: "hello" });
    });

    it("resolves with first event when no filter provided", async () => {
      const bus = new EventBus();

      const promise = bus.waitFor(testEvent);

      setTimeout(() => {
        bus.emit(testEvent, { message: "first" });
        bus.emit(testEvent, { message: "second" });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ message: "first" });
    });

    it("applies filter to match specific payloads", async () => {
      const bus = new EventBus();
      const numberedEvent = defineEvent("numbered", z.object({ id: z.number() }));

      const promise = bus.waitFor(numberedEvent, {
        filter: (p) => p.id === 3,
      });

      setTimeout(() => {
        bus.emit(numberedEvent, { id: 1 });
        bus.emit(numberedEvent, { id: 2 });
        bus.emit(numberedEvent, { id: 3 });
        bus.emit(numberedEvent, { id: 4 });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ id: 3 });
    });

    it("unsubscribes after resolution", async () => {
      const bus = new EventBus();

      await bus.waitFor(testEvent, { timeout: 100 }).catch(() => {});

      // Handler should be cleaned up after timeout
      expect(bus.hasListeners(testEvent)).toBe(false);
    });

    it("unsubscribes after successful match", async () => {
      const bus = new EventBus();

      const promise = bus.waitFor(testEvent);
      bus.emit(testEvent, { message: "done" });
      await promise;

      // Handler should be cleaned up after resolution
      expect(bus.hasListeners(testEvent)).toBe(false);
    });

    it("rejects with TimeoutError when timeout exceeded", async () => {
      const bus = new EventBus();

      const promise = bus.waitFor(testEvent, { timeout: 50 });

      await expect(promise).rejects.toThrow(TimeoutError);
    });

    it("TimeoutError contains timeout value and event name", async () => {
      const bus = new EventBus();
      const customEvent = defineEvent("custom:timed", z.object({ x: z.number() }));

      try {
        await bus.waitFor(customEvent, { timeout: 25 });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TimeoutError);
        expect((err as TimeoutError).timeout).toBe(25);
        expect((err as TimeoutError).message).toContain("custom:timed");
        expect((err as TimeoutError).message).toContain("25ms");
      }
    });

    it("cleans up subscription on timeout", async () => {
      const bus = new EventBus();

      try {
        await bus.waitFor(testEvent, { timeout: 20 });
      } catch {
        // Expected
      }

      expect(bus.hasListeners(testEvent)).toBe(false);
    });

    it("resolves before timeout if event fires quickly", async () => {
      const bus = new EventBus();

      const promise = bus.waitFor(testEvent, { timeout: 1000 });

      // Emit immediately
      bus.emit(testEvent, { message: "fast" });

      const result = await promise;
      expect(result).toEqual({ message: "fast" });
    });

    it("works with filter and timeout together", async () => {
      const bus = new EventBus();
      const numberedEvent = defineEvent("num", z.object({ n: z.number() }));

      const promise = bus.waitFor(numberedEvent, {
        filter: (p) => p.n > 5,
        timeout: 100,
      });

      setTimeout(() => {
        bus.emit(numberedEvent, { n: 2 });
        bus.emit(numberedEvent, { n: 8 });
      }, 20);

      const result = await promise;
      expect(result).toEqual({ n: 8 });
    });

    it("times out if filter never matches", async () => {
      const bus = new EventBus();
      const numberedEvent = defineEvent("num", z.object({ n: z.number() }));

      const promise = bus.waitFor(numberedEvent, {
        filter: (p) => p.n > 100,
        timeout: 50,
      });

      // Emit events that don't match filter
      setTimeout(() => {
        bus.emit(numberedEvent, { n: 1 });
        bus.emit(numberedEvent, { n: 2 });
      }, 10);

      await expect(promise).rejects.toThrow(TimeoutError);
    });
  });

  describe("TimeoutError", () => {
    it("has correct name property", () => {
      const error = new TimeoutError(100, "test:event");
      expect(error.name).toBe("TimeoutError");
    });

    it("extends Error", () => {
      const error = new TimeoutError(100, "test:event");
      expect(error).toBeInstanceOf(Error);
    });

    it("formats message correctly", () => {
      const error = new TimeoutError(5000, "my:event");
      expect(error.message).toBe('Timeout after 5000ms waiting for event "my:event"');
    });
  });
});

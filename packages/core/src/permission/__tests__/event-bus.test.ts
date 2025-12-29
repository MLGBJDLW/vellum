import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createPermissionCheckEvent,
  createPermissionDeniedEvent,
  createPermissionEventBus,
  createPermissionGrantedEvent,
  createTrustChangedEvent,
  type PermissionCheckEvent,
  PermissionCheckEventSchema,
  type PermissionDeniedEvent,
  PermissionDeniedEventSchema,
  PermissionEventBus,
  type PermissionGrantedEvent,
  PermissionGrantedEventSchema,
  type TrustChangedEvent,
  TrustChangedEventSchema,
} from "../event-bus.js";

describe("PermissionEventBus", () => {
  let eventBus: PermissionEventBus;

  beforeEach(() => {
    eventBus = new PermissionEventBus();
  });

  // ============================================
  // Zod Schema Validation
  // ============================================

  describe("Zod schema validation", () => {
    describe("PermissionCheckEventSchema", () => {
      it("should validate valid check event", () => {
        const event: PermissionCheckEvent = {
          toolName: "bash",
          permissionType: "bash",
          params: { command: "ls -la" },
          sessionId: "sess_1",
          timestamp: Date.now(),
        };

        expect(() => PermissionCheckEventSchema.parse(event)).not.toThrow();
      });

      it("should allow optional params and sessionId", () => {
        const event = {
          toolName: "bash",
          permissionType: "bash",
          timestamp: Date.now(),
        };

        expect(() => PermissionCheckEventSchema.parse(event)).not.toThrow();
      });

      it("should reject missing required fields", () => {
        const event = {
          toolName: "bash",
          timestamp: Date.now(),
        };

        expect(() => PermissionCheckEventSchema.parse(event)).toThrow(z.ZodError);
      });
    });

    describe("PermissionGrantedEventSchema", () => {
      it("should validate valid granted event", () => {
        const event: PermissionGrantedEvent = {
          toolName: "bash",
          permissionType: "bash",
          grantType: "user-once",
          pattern: "git *",
          sessionId: "sess_1",
          timestamp: Date.now(),
        };

        expect(() => PermissionGrantedEventSchema.parse(event)).not.toThrow();
      });

      it("should validate all grant types", () => {
        const grantTypes = ["auto", "user-once", "user-always", "config"] as const;

        for (const grantType of grantTypes) {
          const event = {
            toolName: "bash",
            permissionType: "bash",
            grantType,
            timestamp: Date.now(),
          };

          expect(() => PermissionGrantedEventSchema.parse(event)).not.toThrow();
        }
      });

      it("should reject invalid grant type", () => {
        const event = {
          toolName: "bash",
          permissionType: "bash",
          grantType: "invalid",
          timestamp: Date.now(),
        };

        expect(() => PermissionGrantedEventSchema.parse(event)).toThrow(z.ZodError);
      });
    });

    describe("PermissionDeniedEventSchema", () => {
      it("should validate valid denied event", () => {
        const event: PermissionDeniedEvent = {
          toolName: "bash",
          permissionType: "bash",
          reason: "User rejected",
          isAutoDenial: false,
          sessionId: "sess_1",
          timestamp: Date.now(),
        };

        expect(() => PermissionDeniedEventSchema.parse(event)).not.toThrow();
      });

      it("should require isAutoDenial boolean", () => {
        const event = {
          toolName: "bash",
          permissionType: "bash",
          reason: "Timeout",
          timestamp: Date.now(),
        };

        expect(() => PermissionDeniedEventSchema.parse(event)).toThrow(z.ZodError);
      });
    });

    describe("TrustChangedEventSchema", () => {
      it("should validate valid trust changed event", () => {
        const event: TrustChangedEvent = {
          previousPreset: "default",
          newPreset: "cautious",
          source: "user",
          reason: "User requested",
          timestamp: Date.now(),
        };

        expect(() => TrustChangedEventSchema.parse(event)).not.toThrow();
      });

      it("should validate all trust presets", () => {
        const presets = ["paranoid", "cautious", "default", "relaxed", "yolo"] as const;

        for (const preset of presets) {
          const event = {
            previousPreset: "default",
            newPreset: preset,
            source: "cli",
            timestamp: Date.now(),
          };

          expect(() => TrustChangedEventSchema.parse(event)).not.toThrow();
        }
      });

      it("should validate all sources", () => {
        const sources = ["cli", "env", "config", "user", "system"] as const;

        for (const source of sources) {
          const event = {
            previousPreset: "default",
            newPreset: "cautious",
            source,
            timestamp: Date.now(),
          };

          expect(() => TrustChangedEventSchema.parse(event)).not.toThrow();
        }
      });

      it("should reject invalid preset", () => {
        const event = {
          previousPreset: "invalid",
          newPreset: "cautious",
          source: "cli",
          timestamp: Date.now(),
        };

        expect(() => TrustChangedEventSchema.parse(event)).toThrow(z.ZodError);
      });
    });
  });

  // ============================================
  // Event Subscription (on)
  // ============================================

  describe("on", () => {
    it("should subscribe to events", () => {
      const listener = vi.fn();
      eventBus.on("permissionCheck", listener);

      const event = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it("should allow multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.on("permissionCheck", listener1);
      eventBus.on("permissionCheck", listener2);

      const event = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it("should return unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.on("permissionCheck", listener);

      unsubscribe();

      const event = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should support once option", () => {
      const listener = vi.fn();
      eventBus.on("permissionCheck", listener, { once: true });

      const event = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", event);
      eventBus.emit("permissionCheck", event);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // One-time Subscription (once)
  // ============================================

  describe("once", () => {
    it("should only receive one event", () => {
      const listener = vi.fn();
      eventBus.once("permissionGranted", listener);

      const event = createPermissionGrantedEvent("bash", "bash", "auto");
      eventBus.emit("permissionGranted", event);
      eventBus.emit("permissionGranted", event);
      eventBus.emit("permissionGranted", event);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should return unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.once("permissionGranted", listener);

      unsubscribe();

      const event = createPermissionGrantedEvent("bash", "bash", "auto");
      eventBus.emit("permissionGranted", event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Unsubscribe (off)
  // ============================================

  describe("off", () => {
    it("should remove listener", () => {
      const listener = vi.fn();
      eventBus.on("permissionDenied", listener);
      eventBus.off("permissionDenied", listener);

      const event = createPermissionDeniedEvent("bash", "bash", "User denied", false);
      eventBus.emit("permissionDenied", event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should not affect other listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.on("permissionDenied", listener1);
      eventBus.on("permissionDenied", listener2);
      eventBus.off("permissionDenied", listener1);

      const event = createPermissionDeniedEvent("bash", "bash", "User denied", false);
      eventBus.emit("permissionDenied", event);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  // ============================================
  // Event Emission (emit)
  // ============================================

  describe("emit", () => {
    it("should emit to all listeners for event type", () => {
      const checkListener = vi.fn();
      const grantListener = vi.fn();

      eventBus.on("permissionCheck", checkListener);
      eventBus.on("permissionGranted", grantListener);

      const checkEvent = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", checkEvent);

      expect(checkListener).toHaveBeenCalledWith(checkEvent);
      expect(grantListener).not.toHaveBeenCalled();
    });

    it("should validate payload by default", () => {
      eventBus.on("permissionCheck", vi.fn());

      const invalidEvent = {
        toolName: "bash",
        // Missing required fields
      };

      expect(() => eventBus.emit("permissionCheck", invalidEvent as PermissionCheckEvent)).toThrow(
        z.ZodError
      );
    });

    it("should allow disabling validation", () => {
      const bus = new PermissionEventBus({ validateOnEmit: false });
      const listener = vi.fn();
      bus.on("permissionCheck", listener);

      const invalidEvent = {
        toolName: "bash",
      } as PermissionCheckEvent;

      expect(() => bus.emit("permissionCheck", invalidEvent)).not.toThrow();
      expect(listener).toHaveBeenCalled();
    });

    it("should not break on listener errors", () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      eventBus.on("permissionCheck", errorListener);
      eventBus.on("permissionCheck", normalListener);

      const event = createPermissionCheckEvent("bash", "bash");

      expect(() => eventBus.emit("permissionCheck", event)).not.toThrow();
      expect(normalListener).toHaveBeenCalled();
    });

    it("should handle no listeners gracefully", () => {
      const event = createPermissionCheckEvent("bash", "bash");
      expect(() => eventBus.emit("permissionCheck", event)).not.toThrow();
    });
  });

  // ============================================
  // removeAllListeners
  // ============================================

  describe("removeAllListeners", () => {
    it("should remove all listeners for specific type", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.on("permissionCheck", listener1);
      eventBus.on("permissionCheck", listener2);

      eventBus.removeAllListeners("permissionCheck");

      const event = createPermissionCheckEvent("bash", "bash");
      eventBus.emit("permissionCheck", event);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it("should remove all listeners for all types", () => {
      const checkListener = vi.fn();
      const grantListener = vi.fn();

      eventBus.on("permissionCheck", checkListener);
      eventBus.on("permissionGranted", grantListener);

      eventBus.removeAllListeners();

      eventBus.emit("permissionCheck", createPermissionCheckEvent("bash", "bash"));
      eventBus.emit("permissionGranted", createPermissionGrantedEvent("bash", "bash", "auto"));

      expect(checkListener).not.toHaveBeenCalled();
      expect(grantListener).not.toHaveBeenCalled();
    });

    it("should not affect other event types", () => {
      const checkListener = vi.fn();
      const grantListener = vi.fn();

      eventBus.on("permissionCheck", checkListener);
      eventBus.on("permissionGranted", grantListener);

      eventBus.removeAllListeners("permissionCheck");

      eventBus.emit("permissionGranted", createPermissionGrantedEvent("bash", "bash", "auto"));

      expect(grantListener).toHaveBeenCalled();
    });
  });

  // ============================================
  // listenerCount
  // ============================================

  describe("listenerCount", () => {
    it("should return 0 for no listeners", () => {
      expect(eventBus.listenerCount("permissionCheck")).toBe(0);
    });

    it("should count listeners correctly", () => {
      eventBus.on("permissionCheck", vi.fn());
      eventBus.on("permissionCheck", vi.fn());
      eventBus.on("permissionCheck", vi.fn());

      expect(eventBus.listenerCount("permissionCheck")).toBe(3);
    });

    it("should decrease after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.on("permissionCheck", listener);

      expect(eventBus.listenerCount("permissionCheck")).toBe(1);

      unsubscribe();

      expect(eventBus.listenerCount("permissionCheck")).toBe(0);
    });

    it("should decrease after once listener fires", () => {
      eventBus.once("permissionCheck", vi.fn());

      expect(eventBus.listenerCount("permissionCheck")).toBe(1);

      eventBus.emit("permissionCheck", createPermissionCheckEvent("bash", "bash"));

      expect(eventBus.listenerCount("permissionCheck")).toBe(0);
    });
  });

  // ============================================
  // Helper Functions
  // ============================================

  describe("helper functions", () => {
    describe("createPermissionCheckEvent", () => {
      it("should create valid check event", () => {
        const event = createPermissionCheckEvent("bash", "bash", {
          params: { command: "ls" },
          sessionId: "sess_1",
        });

        expect(event.toolName).toBe("bash");
        expect(event.permissionType).toBe("bash");
        expect(event.params).toEqual({ command: "ls" });
        expect(event.sessionId).toBe("sess_1");
        expect(event.timestamp).toBeGreaterThan(0);

        expect(() => PermissionCheckEventSchema.parse(event)).not.toThrow();
      });
    });

    describe("createPermissionGrantedEvent", () => {
      it("should create valid granted event", () => {
        const event = createPermissionGrantedEvent("bash", "bash", "user-always", {
          pattern: "git *",
          sessionId: "sess_1",
        });

        expect(event.toolName).toBe("bash");
        expect(event.permissionType).toBe("bash");
        expect(event.grantType).toBe("user-always");
        expect(event.pattern).toBe("git *");
        expect(event.sessionId).toBe("sess_1");
        expect(event.timestamp).toBeGreaterThan(0);

        expect(() => PermissionGrantedEventSchema.parse(event)).not.toThrow();
      });
    });

    describe("createPermissionDeniedEvent", () => {
      it("should create valid denied event", () => {
        const event = createPermissionDeniedEvent("bash", "bash", "Timeout", true, {
          sessionId: "sess_1",
        });

        expect(event.toolName).toBe("bash");
        expect(event.permissionType).toBe("bash");
        expect(event.reason).toBe("Timeout");
        expect(event.isAutoDenial).toBe(true);
        expect(event.sessionId).toBe("sess_1");
        expect(event.timestamp).toBeGreaterThan(0);

        expect(() => PermissionDeniedEventSchema.parse(event)).not.toThrow();
      });
    });

    describe("createTrustChangedEvent", () => {
      it("should create valid trust changed event", () => {
        const event = createTrustChangedEvent("default", "cautious", "user", "User requested");

        expect(event.previousPreset).toBe("default");
        expect(event.newPreset).toBe("cautious");
        expect(event.source).toBe("user");
        expect(event.reason).toBe("User requested");
        expect(event.timestamp).toBeGreaterThan(0);

        expect(() => TrustChangedEventSchema.parse(event)).not.toThrow();
      });
    });

    describe("createPermissionEventBus", () => {
      it("should create bus with defaults", () => {
        const bus = createPermissionEventBus();
        expect(bus).toBeInstanceOf(PermissionEventBus);
      });

      it("should create bus with options", () => {
        const bus = createPermissionEventBus({ validateOnEmit: false });
        expect(bus).toBeInstanceOf(PermissionEventBus);
      });
    });
  });

  // ============================================
  // Type Safety
  // ============================================

  describe("type safety", () => {
    it("should provide correct event types to listeners", () => {
      // This test verifies TypeScript type inference works correctly
      eventBus.on("permissionCheck", (event) => {
        // TypeScript should know this is a PermissionCheckEvent
        expect(event.toolName).toBeDefined();
        expect(event.permissionType).toBeDefined();
        expect(event.timestamp).toBeDefined();
      });

      eventBus.on("permissionGranted", (event) => {
        // TypeScript should know this is a PermissionGrantedEvent
        expect(event.grantType).toBeDefined();
      });

      eventBus.on("permissionDenied", (event) => {
        // TypeScript should know this is a PermissionDeniedEvent
        expect(event.reason).toBeDefined();
        expect(event.isAutoDenial).toBeDefined();
      });

      eventBus.on("trustChanged", (event) => {
        // TypeScript should know this is a TrustChangedEvent
        expect(event.previousPreset).toBeDefined();
        expect(event.newPreset).toBeDefined();
      });

      // Emit events to trigger listeners
      eventBus.emit("permissionCheck", createPermissionCheckEvent("test", "test"));
      eventBus.emit("permissionGranted", createPermissionGrantedEvent("test", "test", "auto"));
      eventBus.emit(
        "permissionDenied",
        createPermissionDeniedEvent("test", "test", "reason", false)
      );
      eventBus.emit("trustChanged", createTrustChangedEvent("default", "cautious", "user"));
    });
  });
});

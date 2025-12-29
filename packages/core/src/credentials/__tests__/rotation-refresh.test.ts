/**
 * Tests for Credential Rotation and Refresh Modules
 *
 * @module credentials/__tests__/rotation-refresh.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Err, Ok } from "../../types/result.js";
import { CredentialManager } from "../manager.js";
import {
  createRefreshTimer,
  createRefreshTimerWithBackoff,
  RefreshTimer,
  type RefreshTimerEvent,
} from "../refresh.js";
import { RotationManager } from "../rotation.js";
import type { Credential, CredentialRef, CredentialStore } from "../types.js";
import { createStoreError } from "../types.js";

// =============================================================================
// Mock Store Implementation
// =============================================================================

function createMockStore(
  name: "keychain" | "file" | "env" = "keychain",
  options: {
    available?: boolean;
    readOnly?: boolean;
    credentials?: Map<string, Credential>;
  } = {}
): CredentialStore {
  const {
    available = true,
    readOnly = false,
    credentials = new Map<string, Credential>(),
  } = options;

  return {
    name,
    priority: name === "keychain" ? 100 : name === "file" ? 50 : 10,
    readOnly,

    async isAvailable() {
      return Ok(available);
    },

    async get(provider: string, key?: string) {
      const lookupKey = key ? `${provider}:${key}` : provider;
      const cred = credentials.get(lookupKey) ?? null;
      return Ok(cred);
    },

    async set(credential: Credential) {
      if (readOnly) {
        return Err(createStoreError("READ_ONLY", "Store is read-only", name));
      }
      const lookupKey = credential.provider;
      credentials.set(lookupKey, credential);
      return Ok(undefined);
    },

    async delete(provider: string, key?: string) {
      if (readOnly) {
        return Err(createStoreError("READ_ONLY", "Store is read-only", name));
      }
      const lookupKey = key ? `${provider}:${key}` : provider;
      const existed = credentials.has(lookupKey);
      credentials.delete(lookupKey);
      return Ok(existed);
    },

    async list(provider?: string) {
      const refs: CredentialRef[] = [];
      for (const [, cred] of credentials) {
        if (!provider || cred.provider === provider) {
          refs.push({
            id: cred.id,
            provider: cred.provider,
            type: cred.type,
            source: cred.source,
            metadata: cred.metadata,
            createdAt: cred.createdAt,
            expiresAt: cred.expiresAt,
            rotatedAt: cred.rotatedAt,
            maskedHint: `${cred.value.slice(0, 4)}...`,
          });
        }
      }
      return Ok(refs);
    },

    async exists(provider: string, key?: string) {
      const lookupKey = key ? `${provider}:${key}` : provider;
      return Ok(credentials.has(lookupKey));
    },
  };
}

function createTestCredential(
  provider: string,
  value: string,
  source: "keychain" | "file" | "env" = "keychain"
): Credential {
  return {
    id: `${source}:${provider}:${Date.now()}`,
    provider,
    type: "api_key",
    value,
    source,
    metadata: {},
    createdAt: new Date(),
  };
}

// =============================================================================
// RotationManager Tests
// =============================================================================

describe("RotationManager", () => {
  let store: CredentialStore;
  let manager: CredentialManager;
  let rotator: RotationManager;

  beforeEach(() => {
    store = createMockStore("keychain");
    manager = new CredentialManager([store]);
    rotator = new RotationManager(manager);
  });

  describe("rotate()", () => {
    it("should rotate a credential successfully", async () => {
      // Store initial credential
      const oldCred = createTestCredential("openai", "sk-old-key", "keychain");
      await (store as any).set(oldCred);

      // Rotate to new value
      const result = await rotator.rotate("openai", "sk-new-key");

      expect(result.success).toBe(true);
      expect(result.newCredential).toBeDefined();
      expect(result.newCredential?.value).toBe("sk-new-key");
      expect(result.oldCredential?.value).toBe("sk-old-key");
      expect(result.rolledBack).toBe(false);
    });

    it("should create a new credential if none exists", async () => {
      const result = await rotator.rotate("anthropic", "sk-ant-new");

      expect(result.success).toBe(true);
      expect(result.newCredential).toBeDefined();
      expect(result.newCredential?.value).toBe("sk-ant-new");
      expect(result.oldCredential).toBeUndefined();
      expect(result.rolledBack).toBe(false);
    });

    it("should emit credential:rotated event on success", async () => {
      const events: any[] = [];
      rotator.on((event) => events.push(event));

      await rotator.rotate("openai", "sk-new-key");

      expect(events.some((e) => e.type === "credential:rotated")).toBe(true);
      const rotatedEvent = events.find((e) => e.type === "credential:rotated");
      expect(rotatedEvent.provider).toBe("openai");
    });

    it("should fail and emit event when validation fails", async () => {
      const events: any[] = [];
      rotator.on((event) => events.push(event));

      const result = await rotator.rotate("openai", "invalid-key", undefined, {
        validate: true,
        validator: async () => ({ valid: false, error: "Invalid key format" }),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid key format");
      expect(events.some((e) => e.type === "credential:rotation_failed")).toBe(true);
    });

    it("should validate successfully when validator passes", async () => {
      const result = await rotator.rotate("openai", "sk-valid-key", undefined, {
        validate: true,
        validator: async () => ({ valid: true }),
      });

      expect(result.success).toBe(true);
      expect(result.newCredential?.value).toBe("sk-valid-key");
    });

    it("should preserve rotatedAt timestamp", async () => {
      const result = await rotator.rotate("openai", "sk-new-key");

      expect(result.success).toBe(true);
      expect(result.newCredential?.rotatedAt).toBeDefined();
      expect(result.newCredential?.rotatedAt).toBeInstanceOf(Date);
    });
  });

  describe("rotateWithInput()", () => {
    it("should rotate with full credential input", async () => {
      const result = await rotator.rotateWithInput({
        provider: "google",
        type: "oauth_token",
        value: "ya29.new-token",
        metadata: { scopes: ["email", "profile"] },
        expiresAt: new Date(Date.now() + 3600000),
      });

      expect(result.success).toBe(true);
      expect(result.newCredential?.type).toBe("oauth_token");
      expect(result.newCredential?.metadata.scopes).toEqual(["email", "profile"]);
    });
  });

  describe("event handling", () => {
    it("should support multiple listeners", async () => {
      const events1: any[] = [];
      const events2: any[] = [];

      rotator.on((event) => events1.push(event));
      rotator.on((event) => events2.push(event));

      await rotator.rotate("openai", "sk-new-key");

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
    });

    it("should support unsubscribe", async () => {
      const events: any[] = [];
      const unsubscribe = rotator.on((event) => events.push(event));

      await rotator.rotate("openai", "sk-key-1");
      const countAfterFirst = events.length;

      unsubscribe();

      await rotator.rotate("openai", "sk-key-2");
      expect(events.length).toBe(countAfterFirst);
    });

    it("should handle listener errors gracefully", async () => {
      rotator.on(() => {
        throw new Error("Listener error");
      });

      // Should not throw
      const result = await rotator.rotate("openai", "sk-new-key");
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// RefreshTimer Tests
// =============================================================================

describe("RefreshTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("construction", () => {
    it("should create with default config", () => {
      const timer = new RefreshTimer();
      const state = timer.getState();

      expect(state.isRunning).toBe(false);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.currentBackoffMs).toBe(30000); // Default initial backoff
    });

    it("should create with custom config", () => {
      const timer = new RefreshTimer({
        initialBackoffMs: 10000,
        maxBackoffMs: 60000,
      });
      const state = timer.getState();

      expect(state.currentBackoffMs).toBe(10000);
    });

    it("should accept provider name for event context", async () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer({}, "google");
      timer.on((event) => events.push(event));

      const expiresAt = new Date(Date.now() + 60000); // 1 min - triggers immediate refresh
      timer.start(expiresAt, async () => new Date(Date.now() + 3600000));

      // Advance timer to trigger refresh
      vi.advanceTimersByTime(0);
      await Promise.resolve();

      const refreshedEvent = events.find((e) => e.type === "token:refreshed") as
        | Extract<RefreshTimerEvent, { type: "token:refreshed" }>
        | undefined;
      expect(refreshedEvent).toBeDefined();
      expect(refreshedEvent?.provider).toBe("google");
    });
  });

  describe("start()", () => {
    it("should start the timer", () => {
      const timer = new RefreshTimer();
      const expiresAt = new Date(Date.now() + 600000); // 10 min from now

      timer.start(expiresAt, async () => new Date());

      expect(timer.isRunning()).toBe(true);
    });

    it("should emit timer:started event", () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer();
      timer.on((event) => events.push(event));

      const expiresAt = new Date(Date.now() + 600000);
      timer.start(expiresAt, async () => new Date());

      expect(events.some((e) => e.type === "timer:started")).toBe(true);
    });

    it("should schedule refresh 5 minutes before expiry", () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer();
      timer.on((event) => events.push(event));

      const now = Date.now();
      const expiresAt = new Date(now + 600000); // 10 min from now
      timer.start(expiresAt, async () => new Date());

      const scheduledEvent = events.find((e) => e.type === "timer:scheduled") as
        | Extract<RefreshTimerEvent, { type: "timer:scheduled" }>
        | undefined;

      expect(scheduledEvent).toBeDefined();
      // Should be 5 min from now (10 min expiry - 5 min buffer)
      const expectedRefreshTime = now + 300000; // 5 min
      expect(scheduledEvent?.nextRefreshAt.getTime()).toBeCloseTo(expectedRefreshTime, -2);
    });

    it("should refresh immediately if past refresh time", () => {
      const timer = new RefreshTimer();
      const expiresAt = new Date(Date.now() + 60000); // 1 min from now (past 5 min buffer)

      let refreshCalled = false;
      timer.start(expiresAt, async () => {
        refreshCalled = true;
        return new Date(Date.now() + 3600000);
      });

      // Should schedule immediately
      vi.advanceTimersByTime(0);

      expect(refreshCalled).toBe(true);
    });
  });

  describe("stop()", () => {
    it("should stop the timer", () => {
      const timer = new RefreshTimer();
      timer.start(new Date(Date.now() + 600000), async () => new Date());

      timer.stop();

      expect(timer.isRunning()).toBe(false);
    });

    it("should emit timer:stopped event", () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer();
      timer.on((event) => events.push(event));

      timer.start(new Date(Date.now() + 600000), async () => new Date());
      timer.stop();

      const stoppedEvent = events.find((e) => e.type === "timer:stopped") as
        | Extract<RefreshTimerEvent, { type: "timer:stopped" }>
        | undefined;
      expect(stoppedEvent?.reason).toBe("manual");
    });

    it("should cancel scheduled refresh", () => {
      const timer = new RefreshTimer();
      let refreshCalled = false;

      timer.start(new Date(Date.now() + 600000), async () => {
        refreshCalled = true;
        return new Date();
      });

      timer.stop();

      // Advance past when refresh would have happened
      vi.advanceTimersByTime(600000);

      expect(refreshCalled).toBe(false);
    });
  });

  describe("exponential backoff", () => {
    it("should apply exponential backoff on failure", async () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer({
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
        backoffMultiplier: 2,
        maxConsecutiveFailures: 5,
      });
      timer.on((event) => events.push(event));

      timer.start(new Date(Date.now() + 60000), async () => {
        throw new Error("Refresh failed");
      });

      // Trigger first failure
      vi.advanceTimersByTime(0);
      await Promise.resolve();

      const firstFailure = events.find((e) => e.type === "token:refresh_failed") as
        | Extract<RefreshTimerEvent, { type: "token:refresh_failed" }>
        | undefined;
      expect(firstFailure?.nextRetryMs).toBe(1000);

      // Clear events for next failure
      events.length = 0;

      // Trigger second failure
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      const secondFailure = events.find((e) => e.type === "token:refresh_failed") as
        | Extract<RefreshTimerEvent, { type: "token:refresh_failed" }>
        | undefined;
      expect(secondFailure?.nextRetryMs).toBe(2000);
    });

    it("should cap backoff at maxBackoffMs", async () => {
      const timer = new RefreshTimer({
        initialBackoffMs: 5000,
        maxBackoffMs: 10000,
        backoffMultiplier: 2,
        maxConsecutiveFailures: 10,
      });

      const events: RefreshTimerEvent[] = [];
      timer.on((event) => events.push(event));

      timer.start(new Date(Date.now() + 60000), async () => {
        throw new Error("Always fails");
      });

      // Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(10000);
        await Promise.resolve();
      }

      const failures = events.filter((e) => e.type === "token:refresh_failed") as Extract<
        RefreshTimerEvent,
        { type: "token:refresh_failed" }
      >[];

      // After several failures, backoff should be capped at 10000
      const lastFailure = failures[failures.length - 1];
      expect(lastFailure?.nextRetryMs).toBeLessThanOrEqual(10000);
    });

    it("should stop after maxConsecutiveFailures", async () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer({
        initialBackoffMs: 100,
        maxBackoffMs: 500,
        maxConsecutiveFailures: 3,
      });
      timer.on((event) => events.push(event));

      timer.start(new Date(Date.now() + 60000), async () => {
        throw new Error("Always fails");
      });

      // Trigger failures up to max
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      }

      expect(timer.isRunning()).toBe(false);

      const stoppedEvent = events.find((e) => e.type === "timer:stopped") as
        | Extract<RefreshTimerEvent, { type: "timer:stopped" }>
        | undefined;
      expect(stoppedEvent?.reason).toBe("max_failures");
    });

    it("should reset backoff on success", async () => {
      let failCount = 0;
      const timer = new RefreshTimer({
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
      });

      timer.start(new Date(Date.now() + 60000), async () => {
        if (failCount < 2) {
          failCount++;
          throw new Error("Temporary failure");
        }
        return new Date(Date.now() + 3600000);
      });

      // Trigger failures
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();

      // After success, backoff should reset
      const state = timer.getState();
      expect(state.consecutiveFailures).toBe(0);
      expect(state.currentBackoffMs).toBe(1000);
    });
  });

  describe("updateExpiry()", () => {
    it("should reschedule refresh with new expiry", () => {
      const events: RefreshTimerEvent[] = [];
      const timer = new RefreshTimer();
      timer.on((event) => events.push(event));

      timer.start(new Date(Date.now() + 600000), async () => new Date());

      events.length = 0;

      const newExpiry = new Date(Date.now() + 1200000); // 20 min from now
      timer.updateExpiry(newExpiry);

      const scheduledEvent = events.find((e) => e.type === "timer:scheduled") as
        | Extract<RefreshTimerEvent, { type: "timer:scheduled" }>
        | undefined;
      expect(scheduledEvent).toBeDefined();
    });

    it("should reset failure count", () => {
      const timer = new RefreshTimer({
        initialBackoffMs: 100,
        maxConsecutiveFailures: 10,
      });

      timer.start(new Date(Date.now() + 60000), async () => {
        throw new Error("Fail");
      });

      // Trigger some failures
      vi.advanceTimersByTime(0);
      vi.advanceTimersByTime(100);

      timer.updateExpiry(new Date(Date.now() + 600000));

      const state = timer.getState();
      expect(state.consecutiveFailures).toBe(0);
    });
  });

  describe("forceRefresh()", () => {
    it("should execute refresh immediately", async () => {
      vi.useRealTimers();

      let refreshCalled = false;
      const timer = new RefreshTimer();

      timer.start(new Date(Date.now() + 600000), async () => {
        refreshCalled = true;
        return new Date(Date.now() + 3600000);
      });

      const result = await timer.forceRefresh();

      expect(refreshCalled).toBe(true);
      expect(result).toBe(true);

      timer.stop();
    });

    it("should return false if no callback set", async () => {
      const timer = new RefreshTimer();
      const result = await timer.forceRefresh();
      expect(result).toBe(false);
    });
  });

  describe("factory functions", () => {
    it("createRefreshTimer should create default timer", () => {
      const timer = createRefreshTimer("openai");
      expect(timer).toBeInstanceOf(RefreshTimer);
    });

    it("createRefreshTimerWithBackoff should create custom timer", () => {
      const timer = createRefreshTimerWithBackoff(5000, 60000, "google");
      const state = timer.getState();
      expect(state.currentBackoffMs).toBe(5000);
    });
  });
});

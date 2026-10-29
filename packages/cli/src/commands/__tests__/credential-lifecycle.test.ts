import { LLM } from "@vellum/core";
import { ProviderRegistry } from "@vellum/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCredentialManager } from "../auth.js";

afterEach(() => vi.restoreAllMocks());

describe("interactive credential lifecycle", () => {
  it("shares one resolver with inference and discards cached clients after key updates", async () => {
    const manager = await createCredentialManager();
    expect(await createCredentialManager()).toBe(manager);
    const writable = manager.getStores().find((store) => !store.readOnly);
    expect(writable).toBeDefined();
    if (!writable) return;
    // Exercise the manager mutation event without touching a user's keychain or file.
    vi.spyOn(writable, "isAvailable").mockResolvedValue({ ok: true, value: true });
    vi.spyOn(writable, "set").mockResolvedValue({ ok: true, value: undefined });
    const registry = new ProviderRegistry({ credentialManager: manager });
    const clear = vi.spyOn(registry, "clear");
    const previous = LLM.getRegistry();
    LLM.initialize(registry);
    try {
      const saved = await manager.store({
        provider: "openai",
        type: "api_key",
        value: "test-credential-value",
        metadata: {},
      });
      expect(saved.ok).toBe(true);
      expect(clear).toHaveBeenCalledOnce();
    } finally {
      LLM.initialize(previous ?? new ProviderRegistry());
    }
  });
});

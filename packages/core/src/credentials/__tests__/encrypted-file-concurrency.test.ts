import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../types/result.js";
import { EncryptedFileStore } from "../stores/encrypted-file-store.js";
import type { Credential, CredentialStoreError } from "../types.js";

function credential(provider: string): Credential {
  return {
    id: `fixture:${provider}`,
    provider,
    type: "api_key",
    value: `fixture-${provider}`,
    source: "file",
    metadata: {},
    createdAt: new Date(),
  };
}

function nextMessage(child: ChildProcess): Promise<unknown> {
  return Promise.race([
    once(child, "message").then(([message]) => message),
    once(child, "exit").then(([code]) => {
      throw new Error(`Credential fixture process exited before replying (${code})`);
    }),
  ]);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

describe("encrypted credential concurrency", () => {
  let directory: string;
  let filePath: string;
  const password = "fixture-master-password";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "vellum-credential-concurrency-"));
    filePath = join(directory, "credentials.enc");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!resolve(directory).startsWith(resolve(tmpdir()))) throw new Error("Unexpected temp path");
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    false,
    true,
  ])("retries a restored managed key in the same instance (explicit cache clear=%s)", async (clearExplicitly) => {
    const initial = new EncryptedFileStore({ filePath });
    expect((await initial.set(credential("openai"))).ok).toBe(true);
    const ciphertext = await readFile(filePath, "utf-8");
    const keyPath = `${filePath}.key`;
    const originalKey = await readFile(keyPath, "utf-8");
    await writeFile(keyPath, "f".repeat(64));
    const recovering = new EncryptedFileStore({ filePath });
    expect((await recovering.get("openai")).ok).toBe(false);

    await writeFile(keyPath, originalKey);
    if (clearExplicitly) recovering.clearCache();
    const restored = await recovering.get("openai");
    expect(restored.ok && restored.value?.provider).toBe("openai");
    expect(await readFile(filePath, "utf-8")).toBe(ciphertext);
  });

  it("does not overwrite a newer saved credential when a legacy read finishes migration", async () => {
    const legacy = new EncryptedFileStore({ filePath, password: "vellum-default-key" });
    expect((await legacy.set(credential("openai"))).ok).toBe(true);
    const first = new EncryptedFileStore({ filePath });
    const second = new EncryptedFileStore({ filePath });
    type Persistence = { saveFile: () => Promise<Result<void, CredentialStoreError>> };
    const persistence = second as unknown as Persistence;
    const originalSave = persistence.saveFile.bind(second);
    let release = () => {};
    let arrived = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const atSave = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    vi.spyOn(persistence, "saveFile").mockImplementationOnce(async () => {
      arrived();
      await gate;
      return originalSave();
    });

    const delayedRead = second.get("openai");
    try {
      await atSave;
      expect((await first.get("openai")).ok).toBe(true);
      expect((await first.set(credential("anthropic"))).ok).toBe(true);
    } finally {
      release();
    }
    const read = await delayedRead;
    expect(read.ok && read.value?.provider).toBe("openai");
    const reopened = new EncryptedFileStore({ filePath });
    const retained = await reopened.get("anthropic");
    expect(retained.ok && retained.value?.provider).toBe("anthropic");
  });

  it("reloads stale instances before ordinary writes", async () => {
    const first = new EncryptedFileStore({ filePath, password });
    expect((await first.set(credential("openai"))).ok).toBe(true);
    const second = new EncryptedFileStore({ filePath, password });
    expect((await second.get("openai")).ok).toBe(true);
    expect((await first.set(credential("anthropic"))).ok).toBe(true);
    expect((await second.set(credential("deepseek"))).ok).toBe(true);
    const result = await new EncryptedFileStore({ filePath, password }).list();
    expect(result.ok && result.value.map((item) => item.provider).sort()).toEqual([
      "anthropic",
      "deepseek",
      "openai",
    ]);
  });

  it("keeps another instance's saved credential when deleting the last cached entry", async () => {
    const first = new EncryptedFileStore({ filePath, password });
    expect((await first.set(credential("openai"))).ok).toBe(true);
    const second = new EncryptedFileStore({ filePath, password });
    expect((await second.set(credential("anthropic"))).ok).toBe(true);
    expect(await first.delete("openai")).toEqual({ ok: true, value: true });
    const result = await new EncryptedFileStore({ filePath, password }).get("anthropic");
    expect(result.ok && result.value?.provider).toBe("anthropic");
  });

  it("never reports success for a concurrent write that disappears from disk", async () => {
    const providers = ["openai", "anthropic", "deepseek"];
    const stores = providers.map(() => new EncryptedFileStore({ filePath, password }));
    const results = await Promise.all(
      stores.map((store, index) => store.set(credential(providers[index] ?? "unknown")))
    );
    for (const [index, result] of results.entries()) {
      const provider = providers[index] ?? "unknown";
      if (result.ok) {
        const saved = await new EncryptedFileStore({ filePath, password }).get(provider);
        expect(saved.ok && saved.value?.provider).toBe(provider);
      } else {
        expect(result.error.message).toMatch(/changed|busy|retry/i);
        expect((await stores[index]?.set(credential(provider)))?.ok).toBe(true);
      }
    }
    const retained = await new EncryptedFileStore({ filePath, password }).list();
    expect(retained.ok && retained.value).toHaveLength(3);
    expect(await readFile(filePath, "utf-8")).not.toContain("fixture-openai");
  });

  it("preserves writes made after a separate process cached the credential file", async () => {
    const store = new EncryptedFileStore({ filePath, password });
    expect((await store.set(credential("openai"))).ok).toBe(true);
    const moduleUrl = new URL("../stores/encrypted-file-store.ts", import.meta.url).href;
    const script = `
      import { EncryptedFileStore } from ${JSON.stringify(moduleUrl)};
      const [filePath, password] = process.argv.slice(1);
      const store = new EncryptedFileStore({ filePath, password });
      const loaded = await store.get('openai');
      process.on('message', async () => {
        const result = await store.set({
          id:'fixture:deepseek', provider:'deepseek', type:'api_key',
          value:'fixture-deepseek', source:'file', metadata:{}, createdAt:new Date()
        });
        process.send({ type:'saved', ok:result.ok });
      });
      process.send({ type:'ready', ok:loaded.ok });
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script, filePath, password],
      {
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, VELLUM_SCRYPT_TEST_MODE: "1" },
      }
    );
    try {
      expect(await nextMessage(child)).toEqual({ type: "ready", ok: true });
      expect((await store.set(credential("anthropic"))).ok).toBe(true);
      const saved = nextMessage(child);
      child.send("save");
      expect(await saved).toEqual({ type: "saved", ok: true });
      const retained = await new EncryptedFileStore({ filePath, password }).list();
      expect(retained.ok && retained.value.map((item) => item.provider).sort()).toEqual([
        "anthropic",
        "deepseek",
        "openai",
      ]);
    } finally {
      await stopChild(child);
    }
  });

  it("fails with an actionable receipt instead of stealing another process's write lock", async () => {
    const store = new EncryptedFileStore({ filePath, password });
    expect((await store.set(credential("openai"))).ok).toBe(true);
    const original = await readFile(filePath, "utf-8");
    const script = `
      const fs = require('node:fs/promises');
      (async () => {
        const path = process.argv[1];
        const lock = await fs.open(path, 'wx', 0o600);
        await lock.writeFile(JSON.stringify({pid:process.pid}));
        process.on('message', async () => {
          await lock.close(); await fs.unlink(path);
          process.send({type:'released'});
        });
        process.send({type:'ready',pid:process.pid});
      })();
    `;
    const lockPath = `${filePath}.lock`;
    const child = spawn(process.execPath, ["--eval", script, lockPath], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    try {
      expect(await nextMessage(child)).toEqual({ type: "ready", pid: child.pid });
      const blocked = await store.set(credential("anthropic"));
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error.message).toContain("Credential store is busy; retry");
      expect(await readFile(filePath, "utf-8")).toBe(original);
      expect(JSON.parse(await readFile(lockPath, "utf-8")).pid).toBe(child.pid);
      const released = nextMessage(child);
      child.send("release");
      expect(await released).toEqual({ type: "released" });
      expect((await store.set(credential("anthropic"))).ok).toBe(true);
    } finally {
      await stopChild(child);
    }
  });
});

/**
 * E2E Tests for CLI Credential Commands
 *
 * Tests CLI commands and slash commands for credential management:
 * - `vellum credentials list` - Show all stored credentials
 * - `vellum credentials add <provider>` - Add credential interactively
 * - `vellum credentials remove <provider>` - Remove credential
 * - `/login` - Add credential via slash command
 * - `/logout` - Remove credential via slash command
 * - `/credentials` - Show credential status
 *
 * @module cli/__tests__/credentials
 */

import type {
  Credential,
  CredentialRef,
  CredentialSource,
  CredentialStore,
  CredentialStoreError,
} from "@vellum/core";
import { Err, Ok, type Result } from "@vellum/core";
import { describe, expect, it } from "vitest";

import {
  authSlashCommands,
  executeSlashCommand,
  findSlashCommand,
  getSlashCommandHelp,
  isSlashCommand,
  parseSlashCommand,
  type SlashCommandContext,
} from "../commands/auth.js";

// =============================================================================
// Mock Credential Store
// =============================================================================

/**
 * In-memory mock credential store for testing
 */
class MockCredentialStore implements CredentialStore {
  readonly name: CredentialSource;
  readonly priority: number;
  readonly readOnly: boolean;
  private credentials: Map<string, Credential> = new Map();
  private available: boolean = true;

  constructor(options: {
    name: CredentialSource;
    priority?: number;
    readOnly?: boolean;
    available?: boolean;
    initialCredentials?: Credential[];
  }) {
    this.name = options.name;
    this.priority = options.priority ?? 50;
    this.readOnly = options.readOnly ?? false;
    this.available = options.available ?? true;

    if (options.initialCredentials) {
      for (const cred of options.initialCredentials) {
        this.credentials.set(this.makeKey(cred.provider), cred);
      }
    }
  }

  private makeKey(provider: string, key?: string): string {
    return key ? `${provider}:${key}` : provider;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async isAvailable(): Promise<Result<boolean, CredentialStoreError>> {
    return Ok(this.available);
  }

  async get(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    const credential = this.credentials.get(this.makeKey(provider, key));
    return Ok(credential ?? null);
  }

  async set(credential: Credential): Promise<Result<void, CredentialStoreError>> {
    if (this.readOnly) {
      return Err({
        code: "READ_ONLY",
        message: "Store is read-only",
        store: this.name,
      });
    }
    this.credentials.set(this.makeKey(credential.provider), credential);
    return Ok(undefined);
  }

  async delete(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    if (this.readOnly) {
      return Err({
        code: "READ_ONLY",
        message: "Store is read-only",
        store: this.name,
      });
    }
    const deleted = this.credentials.delete(this.makeKey(provider, key));
    return Ok(deleted);
  }

  async exists(provider: string, key?: string): Promise<Result<boolean, CredentialStoreError>> {
    return Ok(this.credentials.has(this.makeKey(provider, key)));
  }

  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const refs: CredentialRef[] = [];
    for (const cred of this.credentials.values()) {
      if (!provider || cred.provider === provider) {
        refs.push({
          id: cred.id,
          provider: cred.provider,
          type: cred.type,
          source: cred.source,
          maskedHint: `${cred.value.substring(0, 4)}****`,
          metadata: cred.metadata,
          createdAt: cred.createdAt,
        });
      }
    }
    return Ok(refs);
  }

  // Test helpers
  getAll(): Credential[] {
    return Array.from(this.credentials.values());
  }

  clear(): void {
    this.credentials.clear();
  }
}

// =============================================================================
// Mock Credential Manager
// =============================================================================

/**
 * Mock CredentialManager for testing CLI commands
 */
class MockCredentialManager {
  private stores: MockCredentialStore[];
  private preferredWriteStore: CredentialSource;

  constructor(options: {
    stores: MockCredentialStore[];
    preferredWriteStore?: CredentialSource;
  }) {
    this.stores = options.stores;
    this.preferredWriteStore = options.preferredWriteStore ?? "keychain";
  }

  async resolve(
    provider: string,
    key?: string
  ): Promise<Result<Credential | null, CredentialStoreError>> {
    for (const store of this.stores) {
      const availResult = await store.isAvailable();
      if (!availResult.ok || !availResult.value) continue;

      const result = await store.get(provider, key);
      if (result.ok && result.value) {
        return result;
      }
    }
    return Ok(null);
  }

  async store(input: {
    provider: string;
    type: string;
    value: string;
    metadata?: { label?: string };
  }): Promise<Result<{ source: CredentialSource }, CredentialStoreError>> {
    // Find preferred store if available
    let store: MockCredentialStore | undefined;

    // Try preferred store first
    const preferredStore = this.stores.find(
      (s) => s.name === this.preferredWriteStore && !s.readOnly
    );
    if (preferredStore) {
      const availResult = await preferredStore.isAvailable();
      if (availResult.ok && availResult.value) {
        store = preferredStore;
      }
    }

    // Fall back to any available writable store
    if (!store) {
      for (const s of this.stores) {
        if (s.readOnly) continue;
        const availResult = await s.isAvailable();
        if (availResult.ok && availResult.value) {
          store = s;
          break;
        }
      }
    }

    if (!store) {
      return Err({
        code: "STORE_UNAVAILABLE",
        message: "No writable store available",
        store: "runtime",
      });
    }

    const credential: Credential = {
      id: `${store.name}:${input.provider}`,
      provider: input.provider,
      type: input.type as
        | "api_key"
        | "oauth_token"
        | "bearer_token"
        | "service_account"
        | "certificate",
      value: input.value,
      source: store.name,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };

    const result = await store.set(credential);
    if (!result.ok) return result as Result<never, CredentialStoreError>;

    return Ok({ source: store.name });
  }

  async delete(provider: string, key?: string): Promise<Result<number, CredentialStoreError>> {
    let count = 0;
    for (const store of this.stores) {
      if (store.readOnly) continue;
      const result = await store.delete(provider, key);
      if (result.ok && result.value) count++;
    }
    return Ok(count);
  }

  async exists(provider: string): Promise<Result<boolean, CredentialStoreError>> {
    const result = await this.resolve(provider);
    return Ok(result.ok && result.value !== null);
  }

  async list(provider?: string): Promise<Result<readonly CredentialRef[], CredentialStoreError>> {
    const allRefs: CredentialRef[] = [];
    for (const store of this.stores) {
      const availResult = await store.isAvailable();
      if (!availResult.ok || !availResult.value) continue;

      const result = await store.list(provider);
      if (result.ok) {
        allRefs.push(...result.value);
      }
    }
    return Ok(allRefs);
  }

  async getStoreAvailability(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    for (const store of this.stores) {
      const result = await store.isAvailable();
      availability[store.name] = result.ok && result.value;
    }
    return availability;
  }
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCredential(provider: string, source: CredentialSource = "keychain"): Credential {
  return {
    id: `${source}:${provider}`,
    provider,
    type: "api_key",
    value: `sk-${provider}-test-key-12345`,
    source,
    metadata: { label: `${provider} API Key` },
    createdAt: new Date(),
  };
}

function createMockStores(options?: {
  keychainAvailable?: boolean;
  envCredentials?: Credential[];
  keychainCredentials?: Credential[];
  fileCredentials?: Credential[];
}): MockCredentialStore[] {
  return [
    new MockCredentialStore({
      name: "env",
      priority: 100,
      readOnly: true,
      initialCredentials: options?.envCredentials,
    }),
    new MockCredentialStore({
      name: "keychain",
      priority: 75,
      readOnly: false,
      available: options?.keychainAvailable ?? true,
      initialCredentials: options?.keychainCredentials,
    }),
    new MockCredentialStore({
      name: "file",
      priority: 50,
      readOnly: false,
      initialCredentials: options?.fileCredentials,
    }),
  ];
}

function createMockContext(options?: {
  currentProvider?: string;
  stores?: MockCredentialStore[];
  keychainAvailable?: boolean;
  envCredentials?: Credential[];
  keychainCredentials?: Credential[];
  fileCredentials?: Credential[];
}): SlashCommandContext {
  const stores =
    options?.stores ??
    createMockStores({
      keychainAvailable: options?.keychainAvailable,
      envCredentials: options?.envCredentials,
      keychainCredentials: options?.keychainCredentials,
      fileCredentials: options?.fileCredentials,
    });

  return {
    currentProvider: options?.currentProvider,
    credentialManager: new MockCredentialManager({
      stores,
      preferredWriteStore: "keychain",
    }) as unknown as SlashCommandContext["credentialManager"],
  };
}

// =============================================================================
// Slash Command Parsing Tests
// =============================================================================

describe("Slash Command Parsing", () => {
  describe("isSlashCommand", () => {
    it("returns true for input starting with /", () => {
      expect(isSlashCommand("/login")).toBe(true);
      expect(isSlashCommand("/logout anthropic")).toBe(true);
      expect(isSlashCommand("/credentials")).toBe(true);
    });

    it("returns true for input with leading whitespace", () => {
      expect(isSlashCommand("  /login")).toBe(true);
    });

    it("returns false for non-slash input", () => {
      expect(isSlashCommand("login")).toBe(false);
      expect(isSlashCommand("help")).toBe(false);
      expect(isSlashCommand("")).toBe(false);
    });
  });

  describe("parseSlashCommand", () => {
    it("parses command without arguments", () => {
      const result = parseSlashCommand("/login");
      expect(result).toEqual({ command: "login", args: [] });
    });

    it("parses command with single argument", () => {
      const result = parseSlashCommand("/login anthropic");
      expect(result).toEqual({ command: "login", args: ["anthropic"] });
    });

    it("parses command with multiple arguments", () => {
      const result = parseSlashCommand("/help login details");
      expect(result).toEqual({ command: "help", args: ["login", "details"] });
    });

    it("normalizes command to lowercase", () => {
      const result = parseSlashCommand("/LOGIN");
      expect(result).toEqual({ command: "login", args: [] });
    });

    it("handles multiple spaces between arguments", () => {
      const result = parseSlashCommand("/login   anthropic   extra");
      expect(result).toEqual({ command: "login", args: ["anthropic", "extra"] });
    });

    it("returns null for non-slash input", () => {
      expect(parseSlashCommand("login")).toBeNull();
      expect(parseSlashCommand("")).toBeNull();
    });
  });

  describe("findSlashCommand", () => {
    it("finds command by name", () => {
      const cmd = findSlashCommand("login");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("login");
    });

    it("finds command by alias", () => {
      const cmd = findSlashCommand("signin");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("login");
    });

    it("returns undefined for unknown command", () => {
      const cmd = findSlashCommand("unknown");
      expect(cmd).toBeUndefined();
    });

    it("is case-insensitive", () => {
      const cmd = findSlashCommand("LOGIN");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("login");
    });
  });
});

// =============================================================================
// /login Command Tests
// =============================================================================

describe("/login Command", () => {
  describe("Provider Validation", () => {
    it("requires provider when not in context", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/login", context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Provider required");
      expect(result.message).toContain("/login <provider>");
    });

    it("uses current provider from context", async () => {
      const context = createMockContext({ currentProvider: "anthropic" });
      const result = await executeSlashCommand("/login", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("anthropic");
      expect(result.promptForInput).toBeDefined();
      expect(result.promptForInput?.provider).toBe("anthropic");
    });

    it("accepts explicit provider argument", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/login openai", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("openai");
      expect(result.promptForInput).toBeDefined();
      expect(result.promptForInput?.provider).toBe("openai");
    });
  });

  describe("Prompt for Input", () => {
    it("returns promptForInput for new credential", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/login anthropic", context);

      expect(result.success).toBe(true);
      expect(result.promptForInput).toBeDefined();
      expect(result.promptForInput?.type).toBe("api_key");
      expect(result.promptForInput?.provider).toBe("anthropic");
      expect(result.promptForInput?.placeholder).toBe("sk-...");
      expect(result.message).toContain("Adding credential");
    });

    it("indicates update for existing credential", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/login anthropic", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Updating credential");
    });
  });

  describe("Input Submission", () => {
    it("stores credential on valid input", async () => {
      const stores = createMockStores();
      const context = createMockContext({ stores });
      const loginResult = await executeSlashCommand("/login anthropic", context);

      expect(loginResult.promptForInput?.onSubmit).toBeDefined();
      const submitResult = await loginResult.promptForInput?.onSubmit("sk-test-key-12345");

      expect(submitResult).toBeDefined();
      expect(submitResult!.success).toBe(true);
      expect(submitResult!.message).toContain("saved");
      expect(submitResult!.message).toContain("keychain");
      expect(submitResult!.data?.provider).toBe("anthropic");
      expect(submitResult!.data?.source).toBe("keychain");

      // Verify credential was stored
      const keychainStore = stores.find((s) => s.name === "keychain");
      const stored = keychainStore?.getAll();
      expect(stored).toHaveLength(1);
      expect(stored?.[0]?.provider).toBe("anthropic");
    });

    it("rejects empty API key", async () => {
      const context = createMockContext();
      const loginResult = await executeSlashCommand("/login anthropic", context);
      const submitResult = await loginResult.promptForInput?.onSubmit("");

      expect(submitResult).toBeDefined();
      expect(submitResult!.success).toBe(false);
      expect(submitResult!.message).toContain("cannot be empty");
    });

    it("trims whitespace from API key", async () => {
      const stores = createMockStores();
      const context = createMockContext({ stores });
      const loginResult = await executeSlashCommand("/login anthropic", context);
      await loginResult.promptForInput?.onSubmit("  sk-test-key  ");

      const keychainStore = stores.find((s) => s.name === "keychain");
      const stored = keychainStore?.getAll();
      expect(stored?.[0]?.value).toBe("sk-test-key");
    });
  });

  describe("Aliases", () => {
    it("works with /signin alias", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/signin anthropic", context);

      expect(result.success).toBe(true);
      expect(result.promptForInput).toBeDefined();
    });

    it("works with /auth alias", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/auth anthropic", context);

      expect(result.success).toBe(true);
      expect(result.promptForInput).toBeDefined();
    });
  });
});

// =============================================================================
// /logout Command Tests
// =============================================================================

describe("/logout Command", () => {
  describe("Provider Validation", () => {
    it("requires provider when not in context", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/logout", context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Provider required");
      expect(result.message).toContain("/logout <provider>");
    });

    it("uses current provider from context", async () => {
      const context = createMockContext({
        currentProvider: "anthropic",
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/logout", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("removed");
    });
  });

  describe("Credential Removal", () => {
    it("removes existing credential", async () => {
      const stores = createMockStores({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const context = createMockContext({ stores });

      const result = await executeSlashCommand("/logout anthropic", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("removed");
      expect(result.message).toContain("1 store");
      expect(result.data?.provider).toBe("anthropic");
      expect(result.data?.deletedCount).toBe(1);

      // Verify credential was removed
      const keychainStore = stores.find((s) => s.name === "keychain");
      expect(keychainStore?.getAll()).toHaveLength(0);
    });

    it("reports when credential not found", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/logout anthropic", context);

      expect(result.success).toBe(false);
      expect(result.message).toContain("No credential found");
    });

    it("normalizes provider name to lowercase", async () => {
      const stores = createMockStores({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const context = createMockContext({ stores });

      const result = await executeSlashCommand("/logout ANTHROPIC", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("removed");
    });
  });

  describe("Aliases", () => {
    it("works with /signout alias", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/signout anthropic", context);

      expect(result.success).toBe(true);
    });

    it("works with /deauth alias", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/deauth anthropic", context);

      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// /credentials Command Tests
// =============================================================================

describe("/credentials Command", () => {
  describe("Output Format", () => {
    it("shows header and dividers", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/credentials", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("🔐 Credential Status");
      expect(result.message).toContain("━");
    });

    it("shows storage backend status", async () => {
      const context = createMockContext({
        keychainAvailable: true,
      });
      const result = await executeSlashCommand("/credentials", context);

      expect(result.message).toContain("📦 Storage Backends:");
      expect(result.message).toContain("✓ keychain");
      expect(result.message).toContain("✓ file");
      expect(result.message).toContain("✓ env");
    });

    it("shows unavailable backends with ✗", async () => {
      const stores = createMockStores({ keychainAvailable: false });
      stores.find((s) => s.name === "keychain")?.setAvailable(false);
      const context = createMockContext({ stores });

      const result = await executeSlashCommand("/credentials", context);

      expect(result.message).toContain("✗ keychain");
    });
  });

  describe("Credential Listing", () => {
    it("shows message when no credentials", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/credentials", context);

      expect(result.message).toContain("No credentials stored");
      expect(result.message).toContain("/login");
    });

    it("lists stored credentials with masked values", async () => {
      const context = createMockContext({
        keychainCredentials: [
          createTestCredential("anthropic", "keychain"),
          createTestCredential("openai", "keychain"),
        ],
      });
      const result = await executeSlashCommand("/credentials", context);

      expect(result.message).toContain("🔑 Credentials:");
      expect(result.message).toContain("anthropic (keychain)");
      expect(result.message).toContain("openai (keychain)");
      expect(result.message).toContain("sk-a****");
      expect(result.message).toContain("[api_key]");
    });

    it("filters by provider when specified", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic"), createTestCredential("openai")],
      });
      const result = await executeSlashCommand("/credentials anthropic", context);

      expect(result.message).toContain("anthropic");
      expect(result.message).not.toContain("openai");
    });

    it("shows message when filtered provider not found", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/credentials google", context);

      expect(result.message).toContain("No credential found for google");
    });
  });

  describe("Data Property", () => {
    it("includes availability in data", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/credentials", context);

      expect(result.data?.availability).toBeDefined();
      expect(result.data?.availability).toHaveProperty("keychain");
      expect(result.data?.availability).toHaveProperty("file");
      expect(result.data?.availability).toHaveProperty("env");
    });

    it("includes credentials array in data", async () => {
      const context = createMockContext({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const result = await executeSlashCommand("/credentials", context);

      expect(result.data?.credentials).toBeDefined();
      expect(Array.isArray(result.data?.credentials)).toBe(true);
      const creds = result.data?.credentials as unknown[];
      expect(creds).toHaveLength(1);
    });
  });

  describe("Aliases", () => {
    it("works with /creds alias", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/creds", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Credential Status");
    });

    it("works with /keys alias", async () => {
      const context = createMockContext();
      const result = await executeSlashCommand("/keys", context);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Credential Status");
    });
  });
});

// =============================================================================
// Unknown Command Handling Tests
// =============================================================================

describe("Unknown Command Handling", () => {
  it("shows error for unknown command", async () => {
    const context = createMockContext();
    const result = await executeSlashCommand("/unknown", context);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown command");
    expect(result.message).toContain("/unknown");
  });

  it("lists available commands on unknown", async () => {
    const context = createMockContext();
    const result = await executeSlashCommand("/notreal", context);

    expect(result.message).toContain("Available:");
    expect(result.message).toContain("/login");
    expect(result.message).toContain("/logout");
    expect(result.message).toContain("/credentials");
  });

  it("provides help for specific command", async () => {
    const context = createMockContext();
    const result = await executeSlashCommand("/help login", context);

    expect(result.success).toBe(true);
    expect(result.message).toContain("login");
    expect(result.message).toContain("Usage:");
  });
});

// =============================================================================
// Help System Tests
// =============================================================================

describe("getSlashCommandHelp", () => {
  it("lists all available commands", () => {
    const help = getSlashCommandHelp();

    expect(help).toContain("Available Commands:");
    expect(help).toContain("/login");
    expect(help).toContain("/logout");
    expect(help).toContain("/credentials");
  });

  it("shows aliases for commands", () => {
    const help = getSlashCommandHelp();

    expect(help).toContain("Aliases:");
    expect(help).toContain("/signin");
    expect(help).toContain("/signout");
    expect(help).toContain("/creds");
  });

  it("shows usage patterns", () => {
    const help = getSlashCommandHelp();

    expect(help).toContain("Usage:");
    expect(help).toContain("[provider]");
  });
});

// =============================================================================
// Command Registry Tests
// =============================================================================

describe("authSlashCommands Registry", () => {
  it("contains login command", () => {
    const cmd = authSlashCommands.find((c) => c.name === "login");
    expect(cmd).toBeDefined();
    expect(cmd?.aliases).toContain("signin");
    expect(cmd?.aliases).toContain("auth");
  });

  it("contains logout command", () => {
    const cmd = authSlashCommands.find((c) => c.name === "logout");
    expect(cmd).toBeDefined();
    expect(cmd?.aliases).toContain("signout");
    expect(cmd?.aliases).toContain("deauth");
  });

  it("contains credentials command", () => {
    const cmd = authSlashCommands.find((c) => c.name === "credentials");
    expect(cmd).toBeDefined();
    expect(cmd?.aliases).toContain("creds");
    expect(cmd?.aliases).toContain("keys");
  });

  it("all commands have required properties", () => {
    for (const cmd of authSlashCommands) {
      expect(cmd.name).toBeDefined();
      expect(cmd.description).toBeDefined();
      expect(cmd.usage).toBeDefined();
      expect(cmd.handler).toBeDefined();
      expect(typeof cmd.handler).toBe("function");
    }
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Edge Cases", () => {
  describe("Provider Name Handling", () => {
    it("normalizes provider names to lowercase", async () => {
      const stores = createMockStores();
      const context = createMockContext({ stores });

      const loginResult = await executeSlashCommand("/login ANTHROPIC", context);
      await loginResult.promptForInput?.onSubmit("sk-test-key");

      const result = await executeSlashCommand("/credentials", context);
      expect(result.message).toContain("anthropic");
      expect(result.message).not.toContain("ANTHROPIC");
    });

    it("handles hyphenated provider names", async () => {
      const stores = createMockStores();
      const context = createMockContext({ stores });

      const loginResult = await executeSlashCommand("/login azure-openai", context);
      expect(loginResult.promptForInput?.provider).toBe("azure-openai");
    });
  });

  describe("Store Fallback", () => {
    it("falls back to file store when keychain unavailable", async () => {
      const stores = createMockStores({ keychainAvailable: false });
      stores.find((s) => s.name === "keychain")?.setAvailable(false);
      const context = createMockContext({ stores });

      const loginResult = await executeSlashCommand("/login anthropic", context);
      const submitResult = await loginResult.promptForInput?.onSubmit("sk-test-key");

      expect(submitResult).toBeDefined();
      expect(submitResult!.success).toBe(true);
      expect(submitResult!.message).toContain("file");

      const fileStore = stores.find((s) => s.name === "file");
      expect(fileStore?.getAll()).toHaveLength(1);
    });
  });

  describe("Multiple Credentials", () => {
    it("handles multiple credentials from same provider", async () => {
      const stores = createMockStores({
        keychainCredentials: [createTestCredential("anthropic")],
        fileCredentials: [createTestCredential("anthropic", "file")],
      });
      const context = createMockContext({ stores });

      const result = await executeSlashCommand("/credentials", context);
      // Both should be listed
      expect(result.data?.credentials).toBeDefined();
      const creds = result.data?.credentials as { provider: string }[];
      const anthropicCreds = creds.filter((c) => c.provider === "anthropic");
      expect(anthropicCreds).toHaveLength(2);
    });
  });
});

// =============================================================================
// Integration Scenarios
// =============================================================================

describe("Integration Scenarios", () => {
  it("complete login -> verify -> logout flow", async () => {
    const stores = createMockStores();
    const context = createMockContext({ stores });

    // 1. Login
    const loginResult = await executeSlashCommand("/login anthropic", context);
    expect(loginResult.success).toBe(true);
    expect(loginResult.promptForInput).toBeDefined();

    const submitResult = await loginResult.promptForInput?.onSubmit("sk-ant-api-key-12345");
    expect(submitResult).toBeDefined();
    expect(submitResult!.success).toBe(true);
    expect(submitResult!.message).toContain("saved");

    // 2. Verify
    const credsResult = await executeSlashCommand("/credentials", context);
    expect(credsResult.success).toBe(true);
    expect(credsResult.message).toContain("anthropic");
    expect(credsResult.message).toContain("sk-a****");

    // 3. Logout
    const logoutResult = await executeSlashCommand("/logout anthropic", context);
    expect(logoutResult.success).toBe(true);
    expect(logoutResult.message).toContain("removed");

    // 4. Verify removal
    const finalResult = await executeSlashCommand("/credentials anthropic", context);
    expect(finalResult.message).toContain("No credential found");
  });

  it("handles multi-provider setup", async () => {
    const stores = createMockStores();
    const context = createMockContext({ stores });

    // Add multiple providers
    const providers = ["anthropic", "openai", "google"];
    for (const provider of providers) {
      const loginResult = await executeSlashCommand(`/login ${provider}`, context);
      await loginResult.promptForInput?.onSubmit(`sk-${provider}-key`);
    }

    // Verify all are listed
    const credsResult = await executeSlashCommand("/credentials", context);
    for (const provider of providers) {
      expect(credsResult.message).toContain(provider);
    }

    // Remove one
    await executeSlashCommand("/logout openai", context);

    // Verify correct one removed
    const afterLogout = await executeSlashCommand("/credentials", context);
    expect(afterLogout.message).toContain("anthropic");
    expect(afterLogout.message).toContain("google");
    expect(afterLogout.message).not.toContain("openai (keychain)");
  });
});

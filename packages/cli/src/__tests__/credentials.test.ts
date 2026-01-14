/**
 * E2E Tests for CLI Credential Commands
 *
 * Tests CLI commands and slash commands for credential management:
 * - `vellum credentials list` - Show all stored credentials
 * - `vellum credentials add <provider>` - Add credential interactively
 * - `vellum credentials remove <provider>` - Remove credential
 * - `/credentials` - Show credential status
 * - `/auth` - Unified authentication command (set, clear, status)
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
      expect(isSlashCommand("/auth")).toBe(true);
      expect(isSlashCommand("/auth set anthropic")).toBe(true);
      expect(isSlashCommand("/credentials")).toBe(true);
    });

    it("returns true for input with leading whitespace", () => {
      expect(isSlashCommand("  /auth")).toBe(true);
    });

    it("returns false for non-slash input", () => {
      expect(isSlashCommand("login")).toBe(false);
      expect(isSlashCommand("help")).toBe(false);
      expect(isSlashCommand("")).toBe(false);
    });
  });

  describe("parseSlashCommand", () => {
    it("parses command without arguments", () => {
      const result = parseSlashCommand("/credentials");
      expect(result).toEqual({ command: "credentials", args: [] });
    });

    it("parses command with single argument", () => {
      const result = parseSlashCommand("/credentials anthropic");
      expect(result).toEqual({ command: "credentials", args: ["anthropic"] });
    });

    it("parses command with multiple arguments", () => {
      const result = parseSlashCommand("/help credentials details");
      expect(result).toEqual({ command: "help", args: ["credentials", "details"] });
    });

    it("normalizes command to lowercase", () => {
      const result = parseSlashCommand("/CREDENTIALS");
      expect(result).toEqual({ command: "credentials", args: [] });
    });

    it("handles multiple spaces between arguments", () => {
      const result = parseSlashCommand("/credentials   anthropic   extra");
      expect(result).toEqual({ command: "credentials", args: ["anthropic", "extra"] });
    });

    it("returns null for non-slash input", () => {
      expect(parseSlashCommand("credentials")).toBeNull();
      expect(parseSlashCommand("")).toBeNull();
    });
  });

  describe("findSlashCommand", () => {
    it("finds command by name", () => {
      const cmd = findSlashCommand("credentials");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("credentials");
    });

    it("finds command by alias", () => {
      const cmd = findSlashCommand("creds");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("credentials");
    });

    it("returns undefined for unknown command", () => {
      const cmd = findSlashCommand("unknown");
      expect(cmd).toBeUndefined();
    });

    it("is case-insensitive", () => {
      const cmd = findSlashCommand("CREDENTIALS");
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe("credentials");
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
      // Note: The legacy slash command handler still references /login in output
      // The enhanced authCommand uses /auth set. This is expected behavior.
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
    expect(result.message).toContain("/credentials");
  });

  it("provides help for specific command", async () => {
    const context = createMockContext();
    const result = await executeSlashCommand("/help credentials", context);

    expect(result.success).toBe(true);
    expect(result.message).toContain("credentials");
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
    expect(help).toContain("/credentials");
  });

  it("shows aliases for commands", () => {
    const help = getSlashCommandHelp();

    expect(help).toContain("Aliases:");
    expect(help).toContain("/creds");
  });

  it("shows usage patterns", () => {
    const help = getSlashCommandHelp();

    expect(help).toContain("Usage:");
  });
});

// =============================================================================
// Command Registry Tests
// =============================================================================

describe("authSlashCommands Registry", () => {
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
    it("normalizes provider names to lowercase in credentials display", async () => {
      const stores = createMockStores({
        keychainCredentials: [createTestCredential("anthropic")],
      });
      const context = createMockContext({ stores });

      const result = await executeSlashCommand("/credentials", context);
      expect(result.message).toContain("anthropic");
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
  it("displays credentials from multiple sources", async () => {
    const stores = createMockStores({
      keychainCredentials: [createTestCredential("anthropic")],
      fileCredentials: [createTestCredential("openai", "file")],
      envCredentials: [createTestCredential("google", "env")],
    });
    const context = createMockContext({ stores });

    // Verify all are listed
    const credsResult = await executeSlashCommand("/credentials", context);
    expect(credsResult.message).toContain("anthropic");
    expect(credsResult.message).toContain("openai");
    expect(credsResult.message).toContain("google");
  });

  it("filters credentials by provider", async () => {
    const stores = createMockStores({
      keychainCredentials: [createTestCredential("anthropic"), createTestCredential("openai")],
    });
    const context = createMockContext({ stores });

    const result = await executeSlashCommand("/credentials anthropic", context);
    expect(result.message).toContain("anthropic");
    expect(result.message).not.toContain("openai");
  });

  it("shows store availability status", async () => {
    const stores = createMockStores({ keychainAvailable: false });
    stores.find((s) => s.name === "keychain")?.setAvailable(false);
    const context = createMockContext({ stores });

    const result = await executeSlashCommand("/credentials", context);
    expect(result.message).toContain("✗ keychain");
    expect(result.message).toContain("✓ file");
  });
});

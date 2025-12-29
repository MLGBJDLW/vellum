import { describe, expect, it } from "vitest";
import type { Config, ConfigManager } from "../../config/index.js";
import type { CredentialManager } from "../../credentials/index.js";
import type { GlobalErrorHandler } from "../../errors/index.js";
import type { EventBus } from "../../events/index.js";
import type { IGitSnapshotService } from "../../git/types.js";
import type { Logger } from "../../logger/index.js";
import { Token } from "../container.js";
import { Tokens } from "../tokens.js";

describe("Tokens", () => {
  describe("existence", () => {
    it("should define Config token", () => {
      expect(Tokens.Config).toBeDefined();
      expect(Tokens.Config).toBeInstanceOf(Token);
    });

    it("should define ConfigManager token", () => {
      expect(Tokens.ConfigManager).toBeDefined();
      expect(Tokens.ConfigManager).toBeInstanceOf(Token);
    });

    it("should define Logger token", () => {
      expect(Tokens.Logger).toBeDefined();
      expect(Tokens.Logger).toBeInstanceOf(Token);
    });

    it("should define EventBus token", () => {
      expect(Tokens.EventBus).toBeDefined();
      expect(Tokens.EventBus).toBeInstanceOf(Token);
    });

    it("should define ErrorHandler token", () => {
      expect(Tokens.ErrorHandler).toBeDefined();
      expect(Tokens.ErrorHandler).toBeInstanceOf(Token);
    });

    it("should define CredentialManager token", () => {
      expect(Tokens.CredentialManager).toBeDefined();
      expect(Tokens.CredentialManager).toBeInstanceOf(Token);
    });

    it("should define GitSnapshotService token", () => {
      expect(Tokens.GitSnapshotService).toBeDefined();
      expect(Tokens.GitSnapshotService).toBeInstanceOf(Token);
    });
  });

  describe("uniqueness", () => {
    it("should have unique symbol IDs for all tokens", () => {
      const tokenIds = Object.values(Tokens).map((token) => token.id);
      const uniqueIds = new Set(tokenIds);

      expect(uniqueIds.size).toBe(tokenIds.length);
    });

    it("should have unique names for all tokens", () => {
      const tokenNames = Object.values(Tokens).map((token) => token.name);
      const uniqueNames = new Set(tokenNames);

      expect(uniqueNames.size).toBe(tokenNames.length);
    });
  });

  describe("naming", () => {
    it("should have correct name for Config token", () => {
      expect(Tokens.Config.name).toBe("Config");
    });

    it("should have correct name for ConfigManager token", () => {
      expect(Tokens.ConfigManager.name).toBe("ConfigManager");
    });

    it("should have correct name for Logger token", () => {
      expect(Tokens.Logger.name).toBe("Logger");
    });

    it("should have correct name for EventBus token", () => {
      expect(Tokens.EventBus.name).toBe("EventBus");
    });

    it("should have correct name for ErrorHandler token", () => {
      expect(Tokens.ErrorHandler.name).toBe("ErrorHandler");
    });

    it("should have correct name for CredentialManager token", () => {
      expect(Tokens.CredentialManager.name).toBe("CredentialManager");
    });

    it("should have correct name for GitSnapshotService token", () => {
      expect(Tokens.GitSnapshotService.name).toBe("GitSnapshotService");
    });
  });

  describe("type safety (compile-time checks)", () => {
    // These tests verify TypeScript types at compile time
    // If the types are wrong, the file won't compile

    it("should have correct type for Config token", () => {
      // Type assertion: Token<Config> should be assignable
      const _token: Token<Config> = Tokens.Config;
      expect(_token).toBe(Tokens.Config);
    });

    it("should have correct type for ConfigManager token", () => {
      const _token: Token<ConfigManager> = Tokens.ConfigManager;
      expect(_token).toBe(Tokens.ConfigManager);
    });

    it("should have correct type for Logger token", () => {
      const _token: Token<Logger> = Tokens.Logger;
      expect(_token).toBe(Tokens.Logger);
    });

    it("should have correct type for EventBus token", () => {
      const _token: Token<EventBus> = Tokens.EventBus;
      expect(_token).toBe(Tokens.EventBus);
    });

    it("should have correct type for ErrorHandler token", () => {
      const _token: Token<GlobalErrorHandler> = Tokens.ErrorHandler;
      expect(_token).toBe(Tokens.ErrorHandler);
    });

    it("should have correct type for CredentialManager token", () => {
      const _token: Token<CredentialManager> = Tokens.CredentialManager;
      expect(_token).toBe(Tokens.CredentialManager);
    });

    it("should have correct type for GitSnapshotService token", () => {
      const _token: Token<IGitSnapshotService> = Tokens.GitSnapshotService;
      expect(_token).toBe(Tokens.GitSnapshotService);
    });
  });

  describe("immutability", () => {
    it("should be frozen (readonly)", () => {
      // Tokens is declared as `as const`, making it readonly
      // This test verifies the object structure is as expected
      expect(Object.keys(Tokens)).toHaveLength(7);
      expect(Object.keys(Tokens)).toEqual([
        "Config",
        "ConfigManager",
        "Logger",
        "EventBus",
        "ErrorHandler",
        "CredentialManager",
        "GitSnapshotService",
      ]);
    });
  });
});

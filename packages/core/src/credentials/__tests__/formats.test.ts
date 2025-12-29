import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_KEY_PATTERN,
  AZURE_KEY_PATTERN,
  COHERE_KEY_PATTERN,
  CREDENTIAL_FORMATS,
  type CredentialProvider,
  GOOGLE_KEY_PATTERN,
  getCredentialFormat,
  getSupportedProviders,
  MISTRAL_MIN_KEY_LENGTH,
  OPENAI_KEY_PATTERN,
  OPENAI_PROJECT_KEY_PATTERN,
  VERTEX_OAUTH_TOKEN_PATTERN,
} from "../providers/formats.js";

describe("credentials/providers/formats", () => {
  describe("Pattern Constants", () => {
    describe("ANTHROPIC_KEY_PATTERN", () => {
      it("should match valid Anthropic keys", () => {
        expect(ANTHROPIC_KEY_PATTERN.test("sk-ant-api03-abcd1234")).toBe(true);
        expect(ANTHROPIC_KEY_PATTERN.test("sk-ant-api03-xxxx-xxxx")).toBe(true);
      });

      it("should not match invalid keys", () => {
        expect(ANTHROPIC_KEY_PATTERN.test("sk-ant-api02-xxx")).toBe(false);
        expect(ANTHROPIC_KEY_PATTERN.test("sk-xxx")).toBe(false);
        expect(ANTHROPIC_KEY_PATTERN.test("random-key")).toBe(false);
      });
    });

    describe("OPENAI_KEY_PATTERN", () => {
      it("should match valid OpenAI keys", () => {
        expect(OPENAI_KEY_PATTERN.test("sk-1234567890abcdef")).toBe(true);
        expect(OPENAI_KEY_PATTERN.test("sk-proj-abcdefg")).toBe(true);
      });

      it("should not match invalid keys", () => {
        expect(OPENAI_KEY_PATTERN.test("pk-xxx")).toBe(false);
        expect(OPENAI_KEY_PATTERN.test("random-key")).toBe(false);
      });
    });

    describe("OPENAI_PROJECT_KEY_PATTERN", () => {
      it("should match project keys", () => {
        expect(OPENAI_PROJECT_KEY_PATTERN.test("sk-proj-abcdef")).toBe(true);
      });

      it("should not match legacy keys", () => {
        expect(OPENAI_PROJECT_KEY_PATTERN.test("sk-abcdef")).toBe(false);
      });
    });

    describe("GOOGLE_KEY_PATTERN", () => {
      it("should match valid Google keys", () => {
        expect(GOOGLE_KEY_PATTERN.test("AIzaSyB1234567890")).toBe(true);
        expect(GOOGLE_KEY_PATTERN.test("AIza_test_key")).toBe(true);
      });

      it("should not match invalid keys", () => {
        expect(GOOGLE_KEY_PATTERN.test("Alza-xxx")).toBe(false);
        expect(GOOGLE_KEY_PATTERN.test("random-key")).toBe(false);
      });
    });

    describe("AZURE_KEY_PATTERN", () => {
      it("should match valid Azure keys (32 hex chars)", () => {
        expect(AZURE_KEY_PATTERN.test("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")).toBe(true);
        expect(AZURE_KEY_PATTERN.test("ABCDEF1234567890ABCDEF1234567890")).toBe(true);
      });

      it("should not match invalid Azure keys", () => {
        expect(AZURE_KEY_PATTERN.test("a1b2c3d4")).toBe(false); // too short
        expect(AZURE_KEY_PATTERN.test("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5")).toBe(false); // too long
        expect(AZURE_KEY_PATTERN.test("g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")).toBe(false); // invalid hex
      });
    });

    describe("VERTEX_OAUTH_TOKEN_PATTERN", () => {
      it("should match valid OAuth tokens", () => {
        expect(VERTEX_OAUTH_TOKEN_PATTERN.test("ya29.abc123")).toBe(true);
        expect(VERTEX_OAUTH_TOKEN_PATTERN.test("ya29.xxxx")).toBe(true);
      });

      it("should not match invalid tokens", () => {
        expect(VERTEX_OAUTH_TOKEN_PATTERN.test("ya28.xxx")).toBe(false);
        expect(VERTEX_OAUTH_TOKEN_PATTERN.test("random-token")).toBe(false);
      });
    });

    describe("COHERE_KEY_PATTERN", () => {
      it("should match valid Cohere keys (40 alphanumeric chars)", () => {
        const validKey = "a".repeat(40);
        expect(COHERE_KEY_PATTERN.test(validKey)).toBe(true);
        expect(COHERE_KEY_PATTERN.test("AbCdEfGhIjKlMnOpQrStUvWxYz1234567890ABCD")).toBe(true);
      });

      it("should not match invalid Cohere keys", () => {
        expect(COHERE_KEY_PATTERN.test("short")).toBe(false);
        expect(COHERE_KEY_PATTERN.test("a".repeat(39))).toBe(false); // too short
        expect(COHERE_KEY_PATTERN.test("a".repeat(41))).toBe(false); // too long
        expect(COHERE_KEY_PATTERN.test(`${"a".repeat(39)}-`)).toBe(false); // special char
      });
    });

    describe("MISTRAL_MIN_KEY_LENGTH", () => {
      it("should be 32", () => {
        expect(MISTRAL_MIN_KEY_LENGTH).toBe(32);
      });
    });
  });

  describe("CREDENTIAL_FORMATS", () => {
    const providers: CredentialProvider[] = [
      "anthropic",
      "openai",
      "google",
      "azure",
      "vertex",
      "cohere",
      "mistral",
    ];

    it.each(providers)("should have format definition for %s", (provider) => {
      expect(CREDENTIAL_FORMATS[provider]).toBeDefined();
      expect(CREDENTIAL_FORMATS[provider].provider).toBe(provider);
      expect(CREDENTIAL_FORMATS[provider].description).toBeTruthy();
      expect(CREDENTIAL_FORMATS[provider].example).toBeTruthy();
    });

    it("should have patterns array for each provider", () => {
      for (const format of Object.values(CREDENTIAL_FORMATS)) {
        expect(Array.isArray(format.patterns)).toBe(true);
      }
    });
  });

  describe("getCredentialFormat", () => {
    it("should return format for known providers", () => {
      const format = getCredentialFormat("anthropic");
      expect(format).toBeDefined();
      expect(format?.provider).toBe("anthropic");
    });

    it("should return undefined for unknown providers", () => {
      expect(getCredentialFormat("unknown")).toBeUndefined();
    });
  });

  describe("getSupportedProviders", () => {
    it("should return all supported provider names", () => {
      const providers = getSupportedProviders();
      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers).toContain("google");
      expect(providers).toContain("azure");
      expect(providers).toContain("vertex");
      expect(providers).toContain("cohere");
      expect(providers).toContain("mistral");
    });

    it("should return 7 providers", () => {
      expect(getSupportedProviders().length).toBe(7);
    });
  });
});

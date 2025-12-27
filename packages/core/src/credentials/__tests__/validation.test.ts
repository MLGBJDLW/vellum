import { beforeEach, describe, expect, it } from "vitest";
import {
  CredentialValidationService,
  type CustomValidator,
  getDefaultValidationService,
  validateFormat,
  validateFormatResult,
} from "../validation.js";

describe("credentials/validation", () => {
  describe("CredentialValidationService", () => {
    let service: CredentialValidationService;

    beforeEach(() => {
      service = new CredentialValidationService();
    });

    describe("validateFormat", () => {
      describe("Anthropic", () => {
        it("should validate correct Anthropic key", () => {
          const result = service.validateFormat("anthropic", "sk-ant-api03-xxxxx");
          expect(result.valid).toBe(true);
          expect(result.provider).toBe("anthropic");
        });

        it("should reject invalid Anthropic key format", () => {
          const result = service.validateFormat("anthropic", "sk-invalid");
          expect(result.valid).toBe(false);
          expect(result.error).toContain("Invalid");
          expect(result.hints).toBeDefined();
        });
      });

      describe("OpenAI", () => {
        it("should validate correct OpenAI legacy key", () => {
          const result = service.validateFormat("openai", "sk-1234567890abcdef");
          expect(result.valid).toBe(true);
        });

        it("should validate correct OpenAI project key", () => {
          const result = service.validateFormat("openai", "sk-proj-abc123");
          expect(result.valid).toBe(true);
        });

        it("should reject invalid OpenAI key", () => {
          const result = service.validateFormat("openai", "pk-invalid");
          expect(result.valid).toBe(false);
        });
      });

      describe("Google", () => {
        it("should validate correct Google key", () => {
          const result = service.validateFormat("google", "AIzaSyB123456");
          expect(result.valid).toBe(true);
        });

        it("should reject invalid Google key", () => {
          const result = service.validateFormat("google", "invalid-key");
          expect(result.valid).toBe(false);
        });
      });

      describe("Azure", () => {
        it("should validate correct Azure key (32 hex)", () => {
          const result = service.validateFormat("azure", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
          expect(result.valid).toBe(true);
        });

        it("should reject short Azure key", () => {
          const result = service.validateFormat("azure", "a1b2c3d4");
          expect(result.valid).toBe(false);
          expect(result.error).toContain("32 characters");
        });

        it("should reject long Azure key", () => {
          const result = service.validateFormat("azure", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6");
          expect(result.valid).toBe(false);
        });
      });

      describe("Vertex", () => {
        it("should validate correct OAuth token", () => {
          const result = service.validateFormat("vertex", "ya29.abc123def456");
          expect(result.valid).toBe(true);
        });

        it("should reject invalid token format", () => {
          const result = service.validateFormat("vertex", "invalid-token");
          expect(result.valid).toBe(false);
        });
      });

      describe("Cohere", () => {
        it("should validate correct Cohere key (40 chars)", () => {
          const result = service.validateFormat("cohere", "a".repeat(40));
          expect(result.valid).toBe(true);
        });

        it("should reject short Cohere key", () => {
          const result = service.validateFormat("cohere", "a".repeat(39));
          expect(result.valid).toBe(false);
          expect(result.error).toContain("40 characters");
        });

        it("should reject long Cohere key", () => {
          const result = service.validateFormat("cohere", "a".repeat(41));
          expect(result.valid).toBe(false);
        });
      });

      describe("Mistral", () => {
        it("should validate key with minimum length", () => {
          const result = service.validateFormat("mistral", "a".repeat(32));
          expect(result.valid).toBe(true);
        });

        it("should reject short Mistral key", () => {
          const result = service.validateFormat("mistral", "a".repeat(31));
          expect(result.valid).toBe(false);
          expect(result.error).toContain("32 characters");
        });
      });

      describe("Unknown providers", () => {
        it("should accept unknown providers with basic validation", () => {
          const result = service.validateFormat("custom-provider", "validkey12345678");
          expect(result.valid).toBe(true);
          expect(result.warnings).toContain(
            "Provider 'custom-provider' is not in the supported list, format not verified"
          );
        });

        it("should reject empty values for unknown providers", () => {
          const result = service.validateFormat("custom", "");
          expect(result.valid).toBe(false);
          expect(result.error).toContain("empty");
        });

        it("should reject too short values for unknown providers", () => {
          const result = service.validateFormat("custom", "short");
          expect(result.valid).toBe(false);
          expect(result.error).toContain("too short");
        });
      });
    });

    describe("strict mode", () => {
      it("should reject unknown providers in strict mode", () => {
        const strictService = new CredentialValidationService({ strictMode: true });
        const result = strictService.validateFormat("unknown-provider", "some-key");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Unknown provider");
      });
    });

    describe("custom validators", () => {
      it("should use custom validator before default", () => {
        const customValidator: CustomValidator = (provider, value) => {
          if (provider === "my-provider") {
            return {
              valid: value.startsWith("mp-"),
              provider,
              error: value.startsWith("mp-") ? undefined : "Must start with mp-",
            };
          }
          return null;
        };

        const customService = new CredentialValidationService({
          customValidators: [customValidator],
        });

        const validResult = customService.validateFormat("my-provider", "mp-test123");
        expect(validResult.valid).toBe(true);

        const invalidResult = customService.validateFormat("my-provider", "invalid");
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.error).toBe("Must start with mp-");
      });

      it("should fall through to default validation if custom returns null", () => {
        const customValidator: CustomValidator = () => null;

        const customService = new CredentialValidationService({
          customValidators: [customValidator],
        });

        const result = customService.validateFormat("anthropic", "sk-ant-api03-xxx");
        expect(result.valid).toBe(true);
      });
    });

    describe("includeHints option", () => {
      it("should include hints by default", () => {
        const result = service.validateFormat("anthropic", "invalid");
        expect(result.hints).toBeDefined();
      });

      it("should exclude hints when disabled", () => {
        const noHintsService = new CredentialValidationService({ includeHints: false });
        const result = noHintsService.validateFormat("anthropic", "invalid");
        expect(result.hints).toBeUndefined();
      });
    });

    describe("getFormat", () => {
      it("should return format for known provider", () => {
        const format = service.getFormat("openai");
        expect(format).toBeDefined();
        expect(format?.provider).toBe("openai");
      });

      it("should return undefined for unknown provider", () => {
        expect(service.getFormat("unknown")).toBeUndefined();
      });
    });

    describe("getSupportedProviders", () => {
      it("should return list of supported providers", () => {
        const providers = service.getSupportedProviders();
        expect(providers).toContain("anthropic");
        expect(providers).toContain("openai");
        expect(providers).toContain("google");
      });
    });

    describe("isProviderSupported", () => {
      it("should return true for supported providers", () => {
        expect(service.isProviderSupported("anthropic")).toBe(true);
        expect(service.isProviderSupported("openai")).toBe(true);
      });

      it("should return false for unsupported providers", () => {
        expect(service.isProviderSupported("unknown")).toBe(false);
      });
    });
  });

  describe("Convenience functions", () => {
    describe("getDefaultValidationService", () => {
      it("should return singleton instance", () => {
        const service1 = getDefaultValidationService();
        const service2 = getDefaultValidationService();
        expect(service1).toBe(service2);
      });
    });

    describe("validateFormat", () => {
      it("should validate using default service", () => {
        const result = validateFormat("anthropic", "sk-ant-api03-test");
        expect(result.valid).toBe(true);
        expect(result.provider).toBe("anthropic");
      });
    });

    describe("validateFormatResult", () => {
      it("should return Ok result for valid format", () => {
        const result = validateFormatResult("openai", "sk-test123");
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.valid).toBe(true);
        }
      });

      it("should return Err result for invalid format", () => {
        const result = validateFormatResult("anthropic", "invalid");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.valid).toBe(false);
        }
      });
    });
  });
});

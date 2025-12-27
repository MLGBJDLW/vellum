import { describe, expect, it } from "vitest";

import {
  createVercelTelemetrySettings,
  extractVercelTelemetryData,
  hasTokenUsage,
} from "../vercel-integration.js";

describe("createVercelTelemetrySettings", () => {
  it("should create settings with default values", () => {
    const settings = createVercelTelemetrySettings();

    expect(settings.isEnabled).toBe(true);
    expect(settings.functionId).toBeUndefined();
    expect(settings.metadata).toBeDefined();
  });

  it("should create settings with custom enabled flag", () => {
    const settings = createVercelTelemetrySettings({ enabled: false });

    expect(settings.isEnabled).toBe(false);
  });

  it("should include functionId when provided", () => {
    const settings = createVercelTelemetrySettings({
      functionId: "chat-completion",
    });

    expect(settings.functionId).toBe("chat-completion");
  });

  it("should include userId in metadata", () => {
    const settings = createVercelTelemetrySettings({
      userId: "user-123",
    });

    expect(settings.metadata?.userId).toBe("user-123");
  });

  it("should include sessionId in metadata", () => {
    const settings = createVercelTelemetrySettings({
      sessionId: "session-456",
    });

    expect(settings.metadata?.sessionId).toBe("session-456");
  });

  it("should use provided environment", () => {
    const settings = createVercelTelemetrySettings({
      environment: "staging",
    });

    expect(settings.metadata?.environment).toBe("staging");
  });

  it("should include additional metadata", () => {
    const settings = createVercelTelemetrySettings({
      additionalMetadata: {
        feature: "chat",
        version: 2,
        beta: true,
      },
    });

    expect(settings.metadata?.feature).toBe("chat");
    expect(settings.metadata?.version).toBe(2);
    expect(settings.metadata?.beta).toBe(true);
  });

  it("should create complete settings with all options", () => {
    const settings = createVercelTelemetrySettings({
      enabled: true,
      functionId: "generate-text",
      userId: "user-789",
      sessionId: "session-abc",
      environment: "production",
      additionalMetadata: {
        model: "gpt-4",
      },
    });

    expect(settings.isEnabled).toBe(true);
    expect(settings.functionId).toBe("generate-text");
    expect(settings.metadata?.userId).toBe("user-789");
    expect(settings.metadata?.sessionId).toBe("session-abc");
    expect(settings.metadata?.environment).toBe("production");
    expect(settings.metadata?.model).toBe("gpt-4");
  });
});

describe("extractVercelTelemetryData", () => {
  it("should return empty object for null response", () => {
    const result = extractVercelTelemetryData(null);

    expect(result).toEqual({});
  });

  it("should return empty object for undefined response", () => {
    const result = extractVercelTelemetryData(undefined);

    expect(result).toEqual({});
  });

  it("should return empty object for non-object response", () => {
    expect(extractVercelTelemetryData("string")).toEqual({});
    expect(extractVercelTelemetryData(123)).toEqual({});
    expect(extractVercelTelemetryData(true)).toEqual({});
  });

  it("should return empty object for response without usage", () => {
    const result = extractVercelTelemetryData({ text: "hello" });

    expect(result).toEqual({});
  });

  it("should extract camelCase token usage", () => {
    const response = {
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };

    const result = extractVercelTelemetryData(response);

    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.totalTokens).toBe(150);
  });

  it("should extract snake_case token usage", () => {
    const response = {
      usage: {
        prompt_tokens: 200,
        completion_tokens: 75,
        total_tokens: 275,
      },
    };

    const result = extractVercelTelemetryData(response);

    expect(result.promptTokens).toBe(200);
    expect(result.completionTokens).toBe(75);
    expect(result.totalTokens).toBe(275);
  });

  it("should prefer camelCase over snake_case", () => {
    const response = {
      usage: {
        promptTokens: 100,
        prompt_tokens: 200,
        completionTokens: 50,
        completion_tokens: 75,
        totalTokens: 150,
        total_tokens: 275,
      },
    };

    const result = extractVercelTelemetryData(response);

    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.totalTokens).toBe(150);
  });

  it("should handle partial usage data", () => {
    const response = {
      usage: {
        promptTokens: 100,
      },
    };

    const result = extractVercelTelemetryData(response);

    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBeUndefined();
    expect(result.totalTokens).toBeUndefined();
  });
});

describe("hasTokenUsage", () => {
  it("should return false for null response", () => {
    expect(hasTokenUsage(null)).toBe(false);
  });

  it("should return false for response without usage", () => {
    expect(hasTokenUsage({ text: "hello" })).toBe(false);
  });

  it("should return true for response with totalTokens", () => {
    const response = {
      usage: {
        totalTokens: 150,
      },
    };

    expect(hasTokenUsage(response)).toBe(true);
  });

  it("should return true for response with promptTokens only", () => {
    const response = {
      usage: {
        promptTokens: 100,
      },
    };

    expect(hasTokenUsage(response)).toBe(true);
  });

  it("should return false for empty usage object", () => {
    const response = {
      usage: {},
    };

    expect(hasTokenUsage(response)).toBe(false);
  });
});

import { ErrorCode } from "@vellum/shared";
import { ProviderError } from "./errors.js";

/** Validate provider arguments before exposing a completed executable call. */
export function validateToolArguments(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError("Provider tool arguments must be a JSON object", {
      code: ErrorCode.API_ERROR,
      category: "api_error",
      retryable: false,
    });
  }
  return value as Record<string, unknown>;
}

export function parseToolArguments(value: string): Record<string, unknown> {
  let input: unknown;
  try {
    input = value ? JSON.parse(value) : {};
  } catch {
    throw new ProviderError("Provider returned invalid JSON in tool arguments", {
      code: ErrorCode.API_ERROR,
      category: "api_error",
      retryable: false,
    });
  }
  return validateToolArguments(input);
}

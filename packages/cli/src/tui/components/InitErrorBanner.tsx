/**
 * InitErrorBanner Component
 *
 * React Ink component for displaying provider initialization errors.
 * Shows a prominent red banner when the LLM provider fails to initialize.
 *
 * @module tui/components/InitErrorBanner
 */

import { Box, Text } from "ink";
import type React from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the InitErrorBanner component
 */
export interface InitErrorBannerProps {
  /** The initialization error to display */
  readonly error: Error;
  /** Whether to show in compact mode */
  readonly compact?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract a user-friendly suggestion from an error message.
 * Attempts to identify common causes and provide actionable guidance.
 */
function getSuggestion(error: Error): string {
  const message = error.message.toLowerCase();

  // API key related errors
  if (
    message.includes("api key") ||
    message.includes("apikey") ||
    message.includes("api_key") ||
    message.includes("credential") ||
    message.includes("authentication") ||
    message.includes("unauthorized") ||
    message.includes("401")
  ) {
    return "Run /credentials add <provider> or set the API key environment variable";
  }

  // Network related errors
  if (
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("timeout")
  ) {
    return "Check your network connection and try again";
  }

  // Provider not found
  if (message.includes("provider") && message.includes("not found")) {
    return "Verify the provider name is correct (anthropic, openai, google, etc.)";
  }

  // Default suggestion
  return "Check your configuration and try again";
}

// =============================================================================
// Component
// =============================================================================

/**
 * InitErrorBanner displays a prominent error when provider initialization fails.
 *
 * @example
 * ```tsx
 * <InitErrorBanner
 *   error={new Error("API key not found")}
 * />
 * ```
 */
export const InitErrorBanner: React.FC<InitErrorBannerProps> = ({ error, compact = false }) => {
  const suggestion = getSuggestion(error);

  // Compact mode - single line
  if (compact) {
    return (
      <Box>
        <Text color="red" bold>
          ⚠ Provider initialization failed: {error.message}
        </Text>
      </Box>
    );
  }

  // Full mode - bordered box with details
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
      <Box>
        <Text color="red" bold>
          ⚠ Provider initialization failed
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="white">{error.message}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">💡 {suggestion}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Messages will be echoed (no LLM connection)
        </Text>
      </Box>
    </Box>
  );
};

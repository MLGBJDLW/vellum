/**
 * Vitest Configuration for CLI Package
 *
 * CLI-specific test settings for command system tests.
 * Tests for commands are located in src/commands/__tests__/
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      // Explicitly include command tests
      "src/commands/**/*.test.{ts,tsx}",
      "src/commands/__tests__/**/*.test.{ts,tsx}",
      // Include fixture tests
      "src/test/fixtures/__tests__/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    env: {
      VELLUM_FAKE_RESPONSES: "true",
    },
  },
});

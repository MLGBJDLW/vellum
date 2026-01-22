import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Increase global timeout for CI environments (GitHub Actions can be slow)
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    env: {
      VELLUM_ICONS: "unicode", // Force Unicode icons in tests for consistent assertions
    },
  },
});

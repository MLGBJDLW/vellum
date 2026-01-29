/**
 * Vitest Global Setup
 *
 * Ensures consistent test environment across all tests.
 * Sets up icon detection to use Unicode for consistent assertions.
 */
import { beforeAll, beforeEach } from "vitest";
import { resetIconDetection, setIconSet } from "./packages/shared/src/theme/icons.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

process.env.VELLUM_TEST_DISABLE_LSP = "1";
process.env.VELLUM_TEST_DISABLE_MCP = "1";
process.env.VELLUM_TEST_DISABLE_ANIMATION = "1";

process.stdout.setMaxListeners(0);
process.setMaxListeners(0);

// Force Unicode icons for all tests to ensure consistent assertions
// This runs before each test file is loaded
beforeAll(() => {
  // Set environment variable first
  process.env.VELLUM_ICONS = "unicode";
  // Reset any cached icon detection
  resetIconDetection();
  // Force Unicode icon set
  setIconSet("unicode");
});

// Reset before each test to ensure isolation
beforeEach(() => {
  resetIconDetection();
  setIconSet("unicode");
});

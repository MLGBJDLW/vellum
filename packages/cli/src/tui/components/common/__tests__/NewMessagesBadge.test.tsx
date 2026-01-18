/**
 * NewMessagesBadge Component Tests
 *
 * @module tui/components/common/__tests__/NewMessagesBadge.test
 */

import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/index.js";
import { NewMessagesBadge } from "../NewMessagesBadge.js";

/**
 * Wrap component with ThemeProvider for testing.
 */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("NewMessagesBadge", () => {
  describe("visibility", () => {
    it("does not render when count is 0", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={0} />);

      expect(lastFrame()).toBe("");
    });

    it("does not render when count is negative", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={-5} />);

      expect(lastFrame()).toBe("");
    });

    it("renders when count is positive", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={3} />);

      expect(lastFrame()).toContain("new");
    });
  });

  describe("message text", () => {
    it("shows singular form for 1 message", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={1} />);

      expect(lastFrame()).toContain("1 new message");
      expect(lastFrame()).not.toContain("messages");
    });

    it("shows plural form for multiple messages", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={5} />);

      expect(lastFrame()).toContain("5 new messages");
    });

    it("shows down arrow indicator", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={3} />);

      expect(lastFrame()).toContain("↓");
    });

    it("shows keyboard hint", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={3} />);

      expect(lastFrame()).toContain("press End");
    });
  });

  describe("large counts", () => {
    it("handles large message counts", () => {
      const { lastFrame } = renderWithTheme(<NewMessagesBadge count={999} />);

      expect(lastFrame()).toContain("999 new messages");
    });
  });
});

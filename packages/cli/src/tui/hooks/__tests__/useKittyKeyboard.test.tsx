import { render } from "ink-testing-library";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as kittyModule from "../../utils/kitty-keyboard-protocol.js";
import { type UseKittyKeyboardReturn, useKittyKeyboard } from "../useKittyKeyboard.js";

vi.mock("../../utils/kitty-keyboard-protocol.js", () => ({
  detectKittyKeyboardProtocol: vi.fn(),
  enableKittyKeyboardProtocol: vi.fn(),
  disableKittyKeyboardProtocol: vi.fn(),
  isKittyKeyboardEnabled: vi.fn(() => false),
  isKittyKeyboardSupported: vi.fn(() => false),
  reEnableKittyProtocol: vi.fn(),
  KittyFlags: {
    DISAMBIGUATE: 1,
    REPORT_EVENTS: 2,
    REPORT_ALTERNATE: 4,
    REPORT_ALL_KEYS: 8,
    REPORT_TEXT: 16,
  },
}));

// =============================================================================
// Test Helper Component
// =============================================================================

interface TestHarnessProps {
  onHookReturn: (hookReturn: UseKittyKeyboardReturn) => void;
  options?: Parameters<typeof useKittyKeyboard>[0];
}

function TestHarness({ onHookReturn, options }: TestHarnessProps): React.ReactElement {
  const hookReturn = useKittyKeyboard(options);
  onHookReturn(hookReturn);
  return null as unknown as React.ReactElement;
}

/**
 * Simple wrapper to render and capture hook state.
 */
function renderKittyKeyboardHook(options?: Parameters<typeof useKittyKeyboard>[0]) {
  let hookReturn: UseKittyKeyboardReturn | null = null;

  const setHookReturn = (r: UseKittyKeyboardReturn) => {
    hookReturn = r;
  };

  const { rerender, unmount } = render(
    <TestHarness onHookReturn={setHookReturn} options={options} />
  );

  return {
    get current() {
      if (!hookReturn) throw new Error("Hook not initialized");
      return hookReturn;
    },
    rerender: (newOptions?: Parameters<typeof useKittyKeyboard>[0]) => {
      rerender(<TestHarness onHookReturn={setHookReturn} options={newOptions ?? options} />);
    },
    unmount,
  };
}

describe("useKittyKeyboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should initialize with isSupported null (pending detection)", () => {
      vi.mocked(kittyModule.detectKittyKeyboardProtocol).mockResolvedValue(false);

      const result = renderKittyKeyboardHook();

      // Initial state before detection completes
      expect(result.current.isSupported).toBeNull();
      expect(result.current.isEnabled).toBe(false);
    });
  });

  describe("detection", () => {
    it("should detect support on mount", async () => {
      vi.mocked(kittyModule.detectKittyKeyboardProtocol).mockResolvedValue(true);

      renderKittyKeyboardHook();

      // Wait for detection to complete
      await vi.waitFor(() => {
        expect(kittyModule.detectKittyKeyboardProtocol).toHaveBeenCalled();
      });
    });
  });

  describe("enable/disable", () => {
    it("should provide enable function", () => {
      vi.mocked(kittyModule.isKittyKeyboardSupported).mockReturnValue(true);
      vi.mocked(kittyModule.isKittyKeyboardEnabled).mockReturnValue(false);

      const result = renderKittyKeyboardHook();

      result.current.enable();
      result.rerender();

      expect(kittyModule.enableKittyKeyboardProtocol).toHaveBeenCalled();
    });

    it("should provide disable function", () => {
      vi.mocked(kittyModule.isKittyKeyboardEnabled).mockReturnValue(true);

      const result = renderKittyKeyboardHook();

      result.current.disable();
      result.rerender();

      expect(kittyModule.disableKittyKeyboardProtocol).toHaveBeenCalled();
    });
  });

  describe("options", () => {
    it("should not enable when enabled option is false", async () => {
      vi.mocked(kittyModule.detectKittyKeyboardProtocol).mockResolvedValue(true);
      vi.mocked(kittyModule.isKittyKeyboardSupported).mockReturnValue(true);

      renderKittyKeyboardHook({ enabled: false });

      await vi.waitFor(() => {
        expect(kittyModule.detectKittyKeyboardProtocol).toHaveBeenCalled();
      });

      expect(kittyModule.enableKittyKeyboardProtocol).not.toHaveBeenCalled();
    });
  });
});

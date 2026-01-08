/**
 * Design Tokens Tests
 *
 * Unit tests for the design token system.
 */

import { describe, expect, it } from "vitest";
import {
  createSpacing,
  // Utilities
  getColor,
  getColorTokens,
  getFontSize,
  getSpacing,
  getSpacingTokens,
  isColorToken,
  isSpacingToken,
} from "../index.js";
import {
  animationTiming,
  backgroundColors,
  borderCharsBold,
  borderCharsDouble,
  borderCharsRounded,
  borderCharsSingle,
  borderColors,
  // Borders
  borderRadius,
  borderWidth,
  // Core colors
  colors,
  // Typography
  fontSizes,
  fontWeights,
  // Icons
  icons,
  lineHeights,
  // Spacing
  spacing,
  // Animation
  spinnerFrames,
  statusColors,
  textColors,
  // Grouped
  tokens,
} from "../tokens.js";

// =============================================================================
// Color Token Tests
// =============================================================================

describe("Design Tokens", () => {
  describe("colors", () => {
    it("should have all required color tokens", () => {
      expect(colors.primary).toBeDefined();
      expect(colors.secondary).toBeDefined();
      expect(colors.success).toBeDefined();
      expect(colors.warning).toBeDefined();
      expect(colors.error).toBeDefined();
      expect(colors.muted).toBeDefined();
      expect(colors.info).toBeDefined();
      expect(colors.accent).toBeDefined();
    });

    it("should have valid hex color values", () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;

      for (const [name, value] of Object.entries(colors)) {
        expect(value, `${name} should be valid hex`).toMatch(hexRegex);
      }
    });

    it("should have specific expected colors", () => {
      expect(colors.primary).toBe("#7C3AED");
      expect(colors.success).toBe("#10B981");
      expect(colors.error).toBe("#EF4444");
    });
  });

  describe("textColors", () => {
    it("should have all text color tokens", () => {
      expect(textColors.primary).toBeDefined();
      expect(textColors.secondary).toBeDefined();
      expect(textColors.muted).toBeDefined();
      expect(textColors.inverted).toBeDefined();
      expect(textColors.user).toBeDefined();
      expect(textColors.assistant).toBeDefined();
      expect(textColors.system).toBeDefined();
      expect(textColors.tool).toBeDefined();
    });

    it("should have valid hex color values", () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;

      for (const [name, value] of Object.entries(textColors)) {
        expect(value, `${name} should be valid hex`).toMatch(hexRegex);
      }
    });
  });

  describe("backgroundColors", () => {
    it("should have all background color tokens", () => {
      expect(backgroundColors.primary).toBeDefined();
      expect(backgroundColors.secondary).toBeDefined();
      expect(backgroundColors.elevated).toBeDefined();
      expect(backgroundColors.code).toBeDefined();
    });
  });

  describe("borderColors", () => {
    it("should have all border color tokens", () => {
      expect(borderColors.default).toBeDefined();
      expect(borderColors.focus).toBeDefined();
      expect(borderColors.muted).toBeDefined();
    });
  });

  describe("statusColors", () => {
    it("should have all status color tokens", () => {
      expect(statusColors.pending).toBeDefined();
      expect(statusColors.running).toBeDefined();
      expect(statusColors.complete).toBeDefined();
      expect(statusColors.error).toBeDefined();
      expect(statusColors.approved).toBeDefined();
      expect(statusColors.rejected).toBeDefined();
    });
  });
});

// =============================================================================
// Spacing Token Tests
// =============================================================================

describe("Spacing Tokens", () => {
  describe("spacing", () => {
    it("should have all spacing tokens", () => {
      expect(spacing.none).toBe(0);
      expect(spacing.xs).toBe(1);
      expect(spacing.sm).toBe(2);
      expect(spacing.md).toBe(4);
      expect(spacing.lg).toBe(8);
      expect(spacing.xl).toBe(16);
    });

    it("should have ascending values", () => {
      expect(spacing.none).toBeLessThan(spacing.xs);
      expect(spacing.xs).toBeLessThan(spacing.sm);
      expect(spacing.sm).toBeLessThan(spacing.md);
      expect(spacing.md).toBeLessThan(spacing.lg);
      expect(spacing.lg).toBeLessThan(spacing.xl);
    });

    it("should be numeric values", () => {
      for (const value of Object.values(spacing)) {
        expect(typeof value).toBe("number");
      }
    });
  });
});

// =============================================================================
// Typography Token Tests
// =============================================================================

describe("Typography Tokens", () => {
  describe("fontSizes", () => {
    it("should have all font size tokens", () => {
      expect(fontSizes.xs).toBeDefined();
      expect(fontSizes.sm).toBeDefined();
      expect(fontSizes.md).toBeDefined();
      expect(fontSizes.lg).toBeDefined();
      expect(fontSizes.xl).toBeDefined();
      expect(fontSizes.xxl).toBeDefined();
    });

    it("should have ascending values", () => {
      expect(fontSizes.xs).toBeLessThan(fontSizes.sm);
      expect(fontSizes.sm).toBeLessThan(fontSizes.md);
      expect(fontSizes.md).toBeLessThan(fontSizes.lg);
      expect(fontSizes.lg).toBeLessThan(fontSizes.xl);
      expect(fontSizes.xl).toBeLessThan(fontSizes.xxl);
    });
  });

  describe("fontWeights", () => {
    it("should have all font weight tokens", () => {
      expect(fontWeights.light).toBe(300);
      expect(fontWeights.normal).toBe(400);
      expect(fontWeights.medium).toBe(500);
      expect(fontWeights.semibold).toBe(600);
      expect(fontWeights.bold).toBe(700);
    });
  });

  describe("lineHeights", () => {
    it("should have all line height tokens", () => {
      expect(lineHeights.tight).toBe(1.25);
      expect(lineHeights.normal).toBe(1.5);
      expect(lineHeights.relaxed).toBe(1.75);
    });
  });
});

// =============================================================================
// Border Token Tests
// =============================================================================

describe("Border Tokens", () => {
  describe("borderRadius", () => {
    it("should have all radius tokens", () => {
      expect(borderRadius.none).toBe(0);
      expect(borderRadius.sm).toBe(1);
      expect(borderRadius.md).toBe(2);
      expect(borderRadius.lg).toBe(4);
      expect(borderRadius.full).toBe(999);
    });
  });

  describe("borderWidth", () => {
    it("should have all width tokens", () => {
      expect(borderWidth.none).toBe(0);
      expect(borderWidth.thin).toBe(1);
      expect(borderWidth.medium).toBe(2);
      expect(borderWidth.thick).toBe(3);
    });
  });

  describe("border characters", () => {
    it("should have single border characters", () => {
      expect(borderCharsSingle.topLeft).toBe("┌");
      expect(borderCharsSingle.topRight).toBe("┐");
      expect(borderCharsSingle.bottomLeft).toBe("└");
      expect(borderCharsSingle.bottomRight).toBe("┘");
      expect(borderCharsSingle.horizontal).toBe("─");
      expect(borderCharsSingle.vertical).toBe("│");
    });

    it("should have double border characters", () => {
      expect(borderCharsDouble.topLeft).toBe("╔");
      expect(borderCharsDouble.topRight).toBe("╗");
      expect(borderCharsDouble.bottomLeft).toBe("╚");
      expect(borderCharsDouble.bottomRight).toBe("╝");
      expect(borderCharsDouble.horizontal).toBe("═");
      expect(borderCharsDouble.vertical).toBe("║");
    });

    it("should have rounded border characters", () => {
      expect(borderCharsRounded.topLeft).toBe("╭");
      expect(borderCharsRounded.topRight).toBe("╮");
      expect(borderCharsRounded.bottomLeft).toBe("╰");
      expect(borderCharsRounded.bottomRight).toBe("╯");
    });

    it("should have bold border characters", () => {
      expect(borderCharsBold.topLeft).toBe("┏");
      expect(borderCharsBold.topRight).toBe("┓");
      expect(borderCharsBold.bottomLeft).toBe("┗");
      expect(borderCharsBold.bottomRight).toBe("┛");
      expect(borderCharsBold.horizontal).toBe("━");
      expect(borderCharsBold.vertical).toBe("┃");
    });
  });
});

// =============================================================================
// Animation Token Tests
// =============================================================================

describe("Animation Tokens", () => {
  describe("spinnerFrames", () => {
    it("should have all spinner frame sequences", () => {
      expect(spinnerFrames.dots).toHaveLength(10);
      expect(spinnerFrames.line).toHaveLength(4);
      expect(spinnerFrames.arc).toHaveLength(6);
      expect(spinnerFrames.bounce).toHaveLength(4);
    });

    it("should have non-empty frames", () => {
      for (const frames of Object.values(spinnerFrames)) {
        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) {
          expect(frame.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("animationTiming", () => {
    it("should have all timing values", () => {
      expect(animationTiming.frameInterval).toBe(80);
      expect(animationTiming.cursorBlink).toBe(530);
      expect(animationTiming.fast).toBe(150);
      expect(animationTiming.normal).toBe(300);
      expect(animationTiming.slow).toBe(500);
    });
  });
});

// =============================================================================
// Icon Token Tests
// =============================================================================

describe("Icon Tokens", () => {
  describe("icons", () => {
    it("should have all status icons", () => {
      expect(icons.success).toBe("✓");
      expect(icons.error).toBe("✗");
      expect(icons.warning).toBe("⚠");
      expect(icons.info).toBe("ℹ");
      expect(icons.pending).toBe("○");
    });

    it("should have all checkbox icons", () => {
      expect(icons.checked).toBe("☑");
      expect(icons.unchecked).toBe("☐");
    });

    it("should have all navigation icons", () => {
      expect(icons.collapsed).toBe("▸");
      expect(icons.expanded).toBe("▾");
      expect(icons.arrowRight).toBe("→");
      expect(icons.arrowLeft).toBe("←");
      expect(icons.arrowUp).toBe("↑");
      expect(icons.arrowDown).toBe("↓");
    });

    it("should have all entity icons", () => {
      expect(icons.user).toBe("@");
      expect(icons.assistant).toBe("*");
      expect(icons.tool).toBe(">");
    });

    it("should have action icons", () => {
      expect(icons.edit).toBe("~");
      expect(icons.copy).toBe("#");
      expect(icons.loading).toBe("◌");
    });
  });
});

// =============================================================================
// Grouped Tokens Tests
// =============================================================================

describe("Grouped Tokens", () => {
  describe("tokens", () => {
    it("should contain all token categories", () => {
      expect(tokens.colors).toBe(colors);
      expect(tokens.textColors).toBe(textColors);
      expect(tokens.backgroundColors).toBe(backgroundColors);
      expect(tokens.borderColors).toBe(borderColors);
      expect(tokens.statusColors).toBe(statusColors);
      expect(tokens.spacing).toBe(spacing);
      expect(tokens.fontSizes).toBe(fontSizes);
      expect(tokens.fontWeights).toBe(fontWeights);
      expect(tokens.lineHeights).toBe(lineHeights);
      expect(tokens.borderRadius).toBe(borderRadius);
      expect(tokens.borderWidth).toBe(borderWidth);
      expect(tokens.borderCharsSingle).toBe(borderCharsSingle);
      expect(tokens.borderCharsDouble).toBe(borderCharsDouble);
      expect(tokens.borderCharsRounded).toBe(borderCharsRounded);
      expect(tokens.borderCharsBold).toBe(borderCharsBold);
      expect(tokens.spinnerFrames).toBe(spinnerFrames);
      expect(tokens.animationTiming).toBe(animationTiming);
      expect(tokens.icons).toBe(icons);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("Theme Utilities", () => {
  describe("getColor", () => {
    it("should return color for valid token", () => {
      expect(getColor("primary")).toBe("#7C3AED");
      expect(getColor("error")).toBe("#EF4444");
      expect(getColor("success")).toBe("#10B981");
    });
  });

  describe("getSpacing", () => {
    it("should return spacing value for valid token", () => {
      expect(getSpacing("none")).toBe(0);
      expect(getSpacing("md")).toBe(4);
      expect(getSpacing("xl")).toBe(16);
    });
  });

  describe("getFontSize", () => {
    it("should return font size for valid token", () => {
      expect(getFontSize("sm")).toBe(12);
      expect(getFontSize("md")).toBe(14);
      expect(getFontSize("xl")).toBe(20);
    });
  });

  describe("createSpacing", () => {
    it("should return single value for one token", () => {
      expect(createSpacing("md")).toBe(4);
      expect(createSpacing("lg")).toBe(8);
    });

    it("should return vertical/horizontal for two tokens", () => {
      const result = createSpacing("sm", "md");
      expect(result).toEqual({ vertical: 2, horizontal: 4 });
    });

    it("should return all sides for four tokens", () => {
      const result = createSpacing("xs", "sm", "md", "lg");
      expect(result).toEqual({ top: 1, right: 2, bottom: 4, left: 8 });
    });
  });

  describe("isColorToken", () => {
    it("should return true for valid color tokens", () => {
      expect(isColorToken("primary")).toBe(true);
      expect(isColorToken("error")).toBe(true);
      expect(isColorToken("success")).toBe(true);
    });

    it("should return false for invalid tokens", () => {
      expect(isColorToken("invalid")).toBe(false);
      expect(isColorToken("")).toBe(false);
      expect(isColorToken("PRIMARY")).toBe(false);
    });
  });

  describe("isSpacingToken", () => {
    it("should return true for valid spacing tokens", () => {
      expect(isSpacingToken("xs")).toBe(true);
      expect(isSpacingToken("md")).toBe(true);
      expect(isSpacingToken("xl")).toBe(true);
    });

    it("should return false for invalid tokens", () => {
      expect(isSpacingToken("invalid")).toBe(false);
      expect(isSpacingToken("")).toBe(false);
      expect(isSpacingToken("XXL")).toBe(false);
    });
  });

  describe("getColorTokens", () => {
    it("should return all color token names", () => {
      const tokenNames = getColorTokens();

      expect(tokenNames).toContain("primary");
      expect(tokenNames).toContain("secondary");
      expect(tokenNames).toContain("success");
      expect(tokenNames).toContain("error");
      expect(tokenNames).toContain("warning");
      expect(tokenNames).toContain("muted");
      expect(tokenNames).toContain("info");
      expect(tokenNames).toContain("accent");
    });
  });

  describe("getSpacingTokens", () => {
    it("should return all spacing token names", () => {
      const tokenNames = getSpacingTokens();

      expect(tokenNames).toContain("none");
      expect(tokenNames).toContain("xs");
      expect(tokenNames).toContain("sm");
      expect(tokenNames).toContain("md");
      expect(tokenNames).toContain("lg");
      expect(tokenNames).toContain("xl");
    });
  });
});

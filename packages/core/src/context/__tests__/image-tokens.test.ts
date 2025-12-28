/**
 * Tests for Image Token Calculators
 *
 * @module @vellum/core/context/__tests__
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  AnthropicImageCalculator,
  calculateMessageImageTokens,
  createImageCalculator,
  DefaultImageCalculator,
  extractImageDimensions,
  GeminiImageCalculator,
  hasImageBlocks,
  OpenAIImageCalculator,
} from "../image-tokens.js";
import type { ContentBlock, ImageBlock } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createImageBlock(width?: number, height?: number, mediaType = "image/png"): ImageBlock {
  return {
    type: "image",
    source: { type: "base64", data: "dGVzdA==" },
    mediaType,
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  };
}

// ============================================================================
// AnthropicImageCalculator Tests
// ============================================================================

describe("AnthropicImageCalculator", () => {
  let calculator: AnthropicImageCalculator;

  beforeEach(() => {
    calculator = new AnthropicImageCalculator();
  });

  describe("calculateTokens", () => {
    it("should calculate tokens using ceil(w*h/750) formula", () => {
      // 1000x1000 = 1,000,000 / 750 = 1333.33 → 1334
      const block = createImageBlock(1000, 1000);
      expect(calculator.calculateTokens(block)).toBe(1334);
    });

    it("should calculate tokens for 1920x1080 image (REQ-IMG-001)", () => {
      // 1920x1080 = 2,073,600 pixels > 1.15 MP limit
      // Scaled down by sqrt(1.15/2.0736) ≈ 0.745
      // → 1430x804 ≈ 1,149,720 pixels
      // tokens = ceil(1149720 / 750) = 1533
      const block = createImageBlock(1920, 1080);
      // The image exceeds 1.15 MP so it's scaled down
      const tokens = calculator.calculateTokens(block);
      expect(tokens).toBeGreaterThan(1500);
      expect(tokens).toBeLessThan(1600);
    });

    it("should handle small images", () => {
      // 100x100 = 10,000 / 750 = 13.33 → 14
      const block = createImageBlock(100, 100);
      expect(calculator.calculateTokens(block)).toBe(14);
    });

    it("should return minimum 1 token for very small images", () => {
      // 10x10 = 100 / 750 = 0.13 → 1 (minimum)
      const block = createImageBlock(10, 10);
      expect(calculator.calculateTokens(block)).toBe(1);
    });

    it("should cap dimensions at 8192 pixels", () => {
      // Image is 10000x10000 but capped to 8192x8192
      // Then scaled down for megapixel limit
      const block = createImageBlock(10000, 10000);
      const tokens = calculator.calculateTokens(block);
      // Should be significantly less than (10000*10000)/750
      expect(tokens).toBeLessThan(133334); // Would be uncapped
      expect(tokens).toBeGreaterThan(0);
    });

    it("should scale down images exceeding 1.15 megapixels", () => {
      // 2000x2000 = 4 megapixels > 1.15 MP, will be scaled
      const block = createImageBlock(2000, 2000);
      const tokens = calculator.calculateTokens(block);
      // Scaled to ~1.15 MP = ~1,150,000 pixels
      // sqrt(1.15/4) ≈ 0.536, so ~1072x1072
      // ~1,149,184 / 750 ≈ 1533
      expect(tokens).toBeCloseTo(1533, -1); // Allow ±10 tolerance
    });

    it("should use default dimensions when not provided", () => {
      const block = createImageBlock(undefined, undefined);
      // 1024x1024 = 1,048,576 / 750 = 1398.1 → 1399
      expect(calculator.calculateTokens(block)).toBe(1399);
    });

    it("should handle missing width with valid height", () => {
      const block = createImageBlock(undefined, 768);
      // 1024x768 = 786,432 / 750 = 1048.576 → 1049
      expect(calculator.calculateTokens(block)).toBe(1049);
    });
  });
});

// ============================================================================
// OpenAIImageCalculator Tests
// ============================================================================

describe("OpenAIImageCalculator", () => {
  let calculator: OpenAIImageCalculator;

  beforeEach(() => {
    calculator = new OpenAIImageCalculator();
  });

  describe("calculateTokens with low detail", () => {
    it("should return fixed 85 tokens for low detail (REQ-IMG-002)", () => {
      const block = createImageBlock(1920, 1080);
      expect(calculator.calculateTokens(block, "low")).toBe(85);
    });

    it("should return 85 tokens regardless of image size with low detail", () => {
      expect(calculator.calculateTokens(createImageBlock(100, 100), "low")).toBe(85);
      expect(calculator.calculateTokens(createImageBlock(4000, 4000), "low")).toBe(85);
    });
  });

  describe("calculateTokens with high detail", () => {
    it("should calculate tiles correctly for 1024x1024 image", () => {
      // 1024x1024 → scale to 768x768 (short side to 768)
      // tiles = ceil(768/512) * ceil(768/512) = 2 * 2 = 4
      // tokens = 85 + (4 * 170) = 765
      const block = createImageBlock(1024, 1024);
      expect(calculator.calculateTokens(block, "high")).toBe(765);
    });

    it("should handle very large images by scaling to 2048 first", () => {
      // 4096x4096 → scale to 2048x2048 → scale short side to 768x768
      // tiles = 2 * 2 = 4
      // tokens = 85 + (4 * 170) = 765
      const block = createImageBlock(4096, 4096);
      expect(calculator.calculateTokens(block, "high")).toBe(765);
    });

    it("should calculate tiles for non-square images", () => {
      // 1920x1080: aspect ~16:9
      // Step 1: fits in 2048, no scaling
      // Step 2: short side 1080 > 768, scale by 768/1080 ≈ 0.711
      // → 1365x768
      // tiles = ceil(1365/512) * ceil(768/512) = 3 * 2 = 6
      // tokens = 85 + (6 * 170) = 1105
      const block = createImageBlock(1920, 1080);
      expect(calculator.calculateTokens(block, "high")).toBe(1105);
    });

    it("should handle small images", () => {
      // 512x512: already at tile size
      // No scaling needed
      // tiles = ceil(512/512) * ceil(512/512) = 1 * 1 = 1
      // tokens = 85 + (1 * 170) = 255
      const block = createImageBlock(512, 512);
      expect(calculator.calculateTokens(block, "high")).toBe(255);
    });
  });

  describe("calculateTokens with auto detail", () => {
    it("should use low detail for very small images (≤512x512)", () => {
      const block = createImageBlock(256, 256);
      expect(calculator.calculateTokens(block, "auto")).toBe(85);
    });

    it("should use high detail for larger images", () => {
      const block = createImageBlock(1024, 1024);
      expect(calculator.calculateTokens(block, "auto")).toBe(765);
    });

    it("should default to auto when detail not specified", () => {
      const block = createImageBlock(1024, 1024);
      expect(calculator.calculateTokens(block)).toBe(765);
    });
  });
});

// ============================================================================
// GeminiImageCalculator Tests
// ============================================================================

describe("GeminiImageCalculator", () => {
  let calculator: GeminiImageCalculator;

  beforeEach(() => {
    calculator = new GeminiImageCalculator();
  });

  describe("calculateTokens", () => {
    it("should return fixed 258 tokens (REQ-IMG-003)", () => {
      const block = createImageBlock(1000, 1000);
      expect(calculator.calculateTokens(block)).toBe(258);
    });

    it("should return 258 regardless of image size", () => {
      expect(calculator.calculateTokens(createImageBlock(100, 100))).toBe(258);
      expect(calculator.calculateTokens(createImageBlock(4000, 4000))).toBe(258);
      expect(calculator.calculateTokens(createImageBlock(1920, 1080))).toBe(258);
    });

    it("should return 258 for images with missing dimensions", () => {
      const block = createImageBlock(undefined, undefined);
      expect(calculator.calculateTokens(block)).toBe(258);
    });
  });
});

// ============================================================================
// DefaultImageCalculator Tests
// ============================================================================

describe("DefaultImageCalculator", () => {
  let calculator: DefaultImageCalculator;

  beforeEach(() => {
    calculator = new DefaultImageCalculator();
  });

  describe("calculateTokens", () => {
    it("should return maximum of all provider calculations", () => {
      // For 1920x1080:
      // Anthropic: scaled to ~1.15 MP → ~1533 tokens
      // OpenAI (high): 85 + 6*170 = 1105
      // Gemini: 258
      // Max = ~1533 (Anthropic wins after scaling)
      const block = createImageBlock(1920, 1080);
      const tokens = calculator.calculateTokens(block);
      // Should be the Anthropic value (highest)
      expect(tokens).toBeGreaterThan(1500);
      expect(tokens).toBeLessThan(1600);
    });

    it("should be conservative for small images", () => {
      // For 256x256:
      // Anthropic: ceil(65536/750) = 88
      // OpenAI (high): would scale up issues, but small
      // Gemini: 258
      // Max = 258 (Gemini wins for small images)
      const block = createImageBlock(256, 256);
      expect(calculator.calculateTokens(block)).toBe(258);
    });
  });
});

// ============================================================================
// createImageCalculator Tests
// ============================================================================

describe("createImageCalculator", () => {
  it('should create AnthropicImageCalculator for "anthropic"', () => {
    const calc = createImageCalculator("anthropic");
    expect(calc).toBeInstanceOf(AnthropicImageCalculator);
  });

  it('should create AnthropicImageCalculator for "claude"', () => {
    const calc = createImageCalculator("claude");
    expect(calc).toBeInstanceOf(AnthropicImageCalculator);
  });

  it('should create OpenAIImageCalculator for "openai"', () => {
    const calc = createImageCalculator("openai");
    expect(calc).toBeInstanceOf(OpenAIImageCalculator);
  });

  it("should create OpenAIImageCalculator for GPT variants", () => {
    expect(createImageCalculator("gpt")).toBeInstanceOf(OpenAIImageCalculator);
    expect(createImageCalculator("gpt-4")).toBeInstanceOf(OpenAIImageCalculator);
    expect(createImageCalculator("gpt-4v")).toBeInstanceOf(OpenAIImageCalculator);
    expect(createImageCalculator("gpt-4o")).toBeInstanceOf(OpenAIImageCalculator);
  });

  it('should create GeminiImageCalculator for "gemini"', () => {
    const calc = createImageCalculator("gemini");
    expect(calc).toBeInstanceOf(GeminiImageCalculator);
  });

  it("should create GeminiImageCalculator for Google variants", () => {
    expect(createImageCalculator("google")).toBeInstanceOf(GeminiImageCalculator);
    expect(createImageCalculator("google-ai")).toBeInstanceOf(GeminiImageCalculator);
    expect(createImageCalculator("vertex")).toBeInstanceOf(GeminiImageCalculator);
  });

  it("should create DefaultImageCalculator for unknown providers", () => {
    expect(createImageCalculator("unknown")).toBeInstanceOf(DefaultImageCalculator);
    expect(createImageCalculator("mistral")).toBeInstanceOf(DefaultImageCalculator);
    expect(createImageCalculator("")).toBeInstanceOf(DefaultImageCalculator);
  });

  it("should be case-insensitive", () => {
    expect(createImageCalculator("ANTHROPIC")).toBeInstanceOf(AnthropicImageCalculator);
    expect(createImageCalculator("OpenAI")).toBeInstanceOf(OpenAIImageCalculator);
    expect(createImageCalculator("GEMINI")).toBeInstanceOf(GeminiImageCalculator);
  });

  it("should handle whitespace", () => {
    expect(createImageCalculator("  anthropic  ")).toBeInstanceOf(AnthropicImageCalculator);
  });
});

// ============================================================================
// extractImageDimensions Tests
// ============================================================================

describe("extractImageDimensions", () => {
  it("should extract dimensions from block", () => {
    const block = createImageBlock(1920, 1080);
    expect(extractImageDimensions(block)).toEqual([1920, 1080]);
  });

  it("should default to 1024x1024 when dimensions missing", () => {
    const block = createImageBlock(undefined, undefined);
    expect(extractImageDimensions(block)).toEqual([1024, 1024]);
  });

  it("should handle partially missing dimensions", () => {
    expect(extractImageDimensions(createImageBlock(800, undefined))).toEqual([800, 1024]);
    expect(extractImageDimensions(createImageBlock(undefined, 600))).toEqual([1024, 600]);
  });

  it("should clamp negative dimensions", () => {
    const block = {
      type: "image" as const,
      source: { type: "base64", data: "test" },
      mediaType: "image/png",
      width: -100,
      height: -200,
    };
    expect(extractImageDimensions(block)).toEqual([1024, 1024]);
  });

  it("should clamp zero dimensions", () => {
    const block = createImageBlock(0, 0);
    expect(extractImageDimensions(block)).toEqual([1024, 1024]);
  });

  it("should clamp excessively large dimensions", () => {
    const block = createImageBlock(100000, 100000);
    const [width, height] = extractImageDimensions(block);
    expect(width).toBe(16384);
    expect(height).toBe(16384);
  });

  it("should handle NaN dimensions", () => {
    const block = {
      type: "image" as const,
      source: { type: "base64", data: "test" },
      mediaType: "image/png",
      width: NaN,
      height: NaN,
    };
    expect(extractImageDimensions(block)).toEqual([1024, 1024]);
  });

  it("should handle Infinity dimensions", () => {
    const block = {
      type: "image" as const,
      source: { type: "base64", data: "test" },
      mediaType: "image/png",
      width: Infinity,
      height: Infinity,
    };
    expect(extractImageDimensions(block)).toEqual([1024, 1024]);
  });
});

// ============================================================================
// calculateMessageImageTokens Tests
// ============================================================================

describe("calculateMessageImageTokens", () => {
  it("should sum tokens for all images in content", () => {
    const calculator = new GeminiImageCalculator(); // Fixed 258 tokens
    const content: ContentBlock[] = [
      { type: "text", text: "Here are two images:" },
      createImageBlock(1000, 1000),
      { type: "text", text: "And another:" },
      createImageBlock(500, 500),
    ];

    expect(calculateMessageImageTokens(content, calculator)).toBe(516); // 258 * 2
  });

  it("should return 0 for content with no images", () => {
    const calculator = new AnthropicImageCalculator();
    const content: ContentBlock[] = [
      { type: "text", text: "Just text" },
      { type: "text", text: "More text" },
    ];

    expect(calculateMessageImageTokens(content, calculator)).toBe(0);
  });

  it("should handle empty content array", () => {
    const calculator = new OpenAIImageCalculator();
    expect(calculateMessageImageTokens([], calculator)).toBe(0);
  });

  it("should calculate correctly with mixed content types", () => {
    const calculator = new AnthropicImageCalculator();
    const content: ContentBlock[] = [
      { type: "text", text: "Image 1:" },
      createImageBlock(750, 1000), // 750000/750 = 1000
      {
        type: "tool_use",
        id: "tool-1",
        name: "read_file",
        input: { path: "test.ts" },
      },
      createImageBlock(750, 1000), // 750000/750 = 1000
      {
        type: "tool_result",
        tool_use_id: "tool-1",
        content: "file contents",
      },
    ];

    expect(calculateMessageImageTokens(content, calculator)).toBe(2000);
  });
});

// ============================================================================
// hasImageBlocks Tests
// ============================================================================

describe("hasImageBlocks", () => {
  it("should return true when content contains images", () => {
    const content: ContentBlock[] = [{ type: "text", text: "Image:" }, createImageBlock(100, 100)];
    expect(hasImageBlocks(content)).toBe(true);
  });

  it("should return false when content has no images", () => {
    const content: ContentBlock[] = [
      { type: "text", text: "Just text" },
      { type: "tool_use", id: "t1", name: "test", input: {} },
    ];
    expect(hasImageBlocks(content)).toBe(false);
  });

  it("should return false for empty content", () => {
    expect(hasImageBlocks([])).toBe(false);
  });
});

// ============================================================================
// Provider Formula Verification (from task spec)
// ============================================================================

describe("Provider Formula Verification", () => {
  describe("Table examples for 1000x1000 image", () => {
    const block = createImageBlock(1000, 1000);

    it("Anthropic: ceil(1M/750) = 1334 tokens", () => {
      const calc = new AnthropicImageCalculator();
      expect(calc.calculateTokens(block)).toBe(1334);
    });

    it("OpenAI (high): should calculate correct tile count", () => {
      // 1000x1000 → scale short side to 768 → 768x768
      // tiles = 2x2 = 4
      // tokens = 85 + 4*170 = 765
      const calc = new OpenAIImageCalculator();
      expect(calc.calculateTokens(block, "high")).toBe(765);
    });

    it("OpenAI (low): 85 fixed tokens", () => {
      const calc = new OpenAIImageCalculator();
      expect(calc.calculateTokens(block, "low")).toBe(85);
    });

    it("Gemini: 258 fixed tokens", () => {
      const calc = new GeminiImageCalculator();
      expect(calc.calculateTokens(block)).toBe(258);
    });
  });
});

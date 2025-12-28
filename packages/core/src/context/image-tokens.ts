/**
 * Image Token Calculators
 *
 * Provider-specific image token calculation for multimodal LLM messages.
 * Implements formulas for Anthropic, OpenAI (GPT-4V), and Google Gemini.
 *
 * @module @vellum/core/context
 *
 * @see REQ-IMG-001 - Anthropic image token calculation
 * @see REQ-IMG-002 - OpenAI image token calculation
 * @see REQ-IMG-003 - Gemini image token calculation
 */

import type { ContentBlock, ImageBlock, ImageCalculator } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default assumed dimensions when image size is unknown */
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

/** Maximum reasonable dimension (for validation) */
const MAX_DIMENSION = 16384;

/** Minimum tokens for any image */
const MIN_TOKENS = 1;

// Anthropic constants
const ANTHROPIC_DIVISOR = 750;
const ANTHROPIC_MAX_DIMENSION = 8192;
const ANTHROPIC_MAX_MEGAPIXELS = 1.15;

// OpenAI constants
const OPENAI_LOW_DETAIL_TOKENS = 85;
const OPENAI_HIGH_DETAIL_BASE = 85;
const OPENAI_TILE_TOKENS = 170;
const OPENAI_TILE_SIZE = 512;
const OPENAI_MAX_LONG_SIDE = 2048;
const OPENAI_SHORT_SIDE_TARGET = 768;

// Gemini constants
const GEMINI_FIXED_TOKENS = 258;

// ============================================================================
// Anthropic Image Calculator
// ============================================================================

/**
 * Anthropic image token calculation.
 *
 * Formula: Math.ceil((width * height) / 750)
 *
 * Max dimensions: 8192x8192, but larger images are downscaled.
 * Images exceeding 1.15 megapixels are resized to fit.
 * Minimum: 1 token
 *
 * @example
 * ```typescript
 * const calc = new AnthropicImageCalculator();
 * const tokens = calc.calculateTokens({
 *   type: 'image',
 *   source: { type: 'base64', data: '...' },
 *   mediaType: 'image/png',
 *   width: 1920,
 *   height: 1080,
 * });
 * // tokens = ceil(1920 * 1080 / 750) = 2765
 * ```
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/vision
 */
export class AnthropicImageCalculator implements ImageCalculator {
  /**
   * Calculate token cost for an image block using Anthropic's formula.
   *
   * @param block - The image block to calculate tokens for
   * @returns The estimated token count
   */
  calculateTokens(block: ImageBlock): number {
    const [width, height] = extractImageDimensions(block);
    const { width: effectiveWidth, height: effectiveHeight } = this.getEffectiveDimensions(
      width,
      height
    );

    const tokens = Math.ceil((effectiveWidth * effectiveHeight) / ANTHROPIC_DIVISOR);

    return Math.max(MIN_TOKENS, tokens);
  }

  /**
   * Get effective dimensions after Anthropic's auto-resizing.
   *
   * Images exceeding 1.15 megapixels are resized while preserving aspect ratio.
   * Each dimension is also capped at 8192 pixels.
   *
   * @param width - Original image width
   * @param height - Original image height
   * @returns The effective dimensions after resizing
   */
  private getEffectiveDimensions(width: number, height: number): { width: number; height: number } {
    // Cap individual dimensions
    let effectiveWidth = Math.min(width, ANTHROPIC_MAX_DIMENSION);
    let effectiveHeight = Math.min(height, ANTHROPIC_MAX_DIMENSION);

    // Check megapixel limit (1.15 MP = 1,150,000 pixels)
    const megapixels = (effectiveWidth * effectiveHeight) / 1_000_000;
    if (megapixels > ANTHROPIC_MAX_MEGAPIXELS) {
      // Scale down to fit within megapixel limit
      const scale = Math.sqrt(ANTHROPIC_MAX_MEGAPIXELS / megapixels);
      effectiveWidth = Math.floor(effectiveWidth * scale);
      effectiveHeight = Math.floor(effectiveHeight * scale);
    }

    return { width: effectiveWidth, height: effectiveHeight };
  }
}

// ============================================================================
// OpenAI Image Calculator
// ============================================================================

/**
 * OpenAI image token calculation (GPT-4V tiles algorithm).
 *
 * Detail levels:
 * - 'low': Fixed 85 tokens (512x512 or smaller)
 * - 'high': 85 base + 170 per 512x512 tile
 * - 'auto': Choose based on image size (defaults to 'high')
 *
 * High detail algorithm:
 * 1. Scale to fit in 2048x2048
 * 2. Scale shortest side to 768px
 * 3. Count 512x512 tiles (rounded up)
 * 4. tokens = 85 + (tiles * 170)
 *
 * @example
 * ```typescript
 * const calc = new OpenAIImageCalculator();
 * const tokens = calc.calculateTokens({
 *   type: 'image',
 *   source: { type: 'base64', data: '...' },
 *   mediaType: 'image/png',
 *   width: 1024,
 *   height: 1024,
 * }, 'high');
 * // After scaling: 768x768, tiles = 2x2 = 4
 * // tokens = 85 + (4 * 170) = 765
 * ```
 *
 * @see https://platform.openai.com/docs/guides/vision
 */
export class OpenAIImageCalculator implements ImageCalculator {
  /**
   * Calculate token cost for an image block using OpenAI's formula.
   *
   * @param block - The image block to calculate tokens for
   * @param detail - Detail level: 'low', 'high', or 'auto' (defaults to 'auto')
   * @returns The estimated token count
   */
  calculateTokens(block: ImageBlock, detail: "low" | "high" | "auto" = "auto"): number {
    const [width, height] = extractImageDimensions(block);

    // Determine effective detail level
    const effectiveDetail = this.resolveDetailLevel(detail, width, height);

    if (effectiveDetail === "low") {
      return OPENAI_LOW_DETAIL_TOKENS;
    }

    // High detail: calculate tiles
    const tiles = this.calculateTiles(width, height);
    return OPENAI_HIGH_DETAIL_BASE + tiles * OPENAI_TILE_TOKENS;
  }

  /**
   * Resolve 'auto' detail level to 'low' or 'high'.
   *
   * @param detail - Requested detail level
   * @param width - Image width
   * @param height - Image height
   * @returns Resolved detail level
   */
  private resolveDetailLevel(
    detail: "low" | "high" | "auto",
    width: number,
    height: number
  ): "low" | "high" {
    if (detail === "low") return "low";
    if (detail === "high") return "high";

    // Auto: use low for very small images (≤ 512x512)
    if (width <= OPENAI_TILE_SIZE && height <= OPENAI_TILE_SIZE) {
      return "low";
    }

    return "high";
  }

  /**
   * Calculate number of 512x512 tiles for high detail mode.
   *
   * Algorithm:
   * 1. Scale to fit within 2048x2048 (preserving aspect ratio)
   * 2. Scale shortest side to 768px
   * 3. Count tiles as ceil(width/512) * ceil(height/512)
   *
   * @param width - Original image width
   * @param height - Original image height
   * @returns Number of tiles
   */
  private calculateTiles(width: number, height: number): number {
    // Step 1: Scale to fit in 2048x2048
    let scaledWidth = width;
    let scaledHeight = height;

    const longSide = Math.max(scaledWidth, scaledHeight);
    if (longSide > OPENAI_MAX_LONG_SIDE) {
      const scale = OPENAI_MAX_LONG_SIDE / longSide;
      scaledWidth = Math.floor(scaledWidth * scale);
      scaledHeight = Math.floor(scaledHeight * scale);
    }

    // Step 2: Scale shortest side to 768px
    const shortSide = Math.min(scaledWidth, scaledHeight);
    if (shortSide > OPENAI_SHORT_SIDE_TARGET) {
      const scale = OPENAI_SHORT_SIDE_TARGET / shortSide;
      scaledWidth = Math.floor(scaledWidth * scale);
      scaledHeight = Math.floor(scaledHeight * scale);
    }

    // Step 3: Count tiles (ceil for both dimensions)
    const tilesWide = Math.ceil(scaledWidth / OPENAI_TILE_SIZE);
    const tilesHigh = Math.ceil(scaledHeight / OPENAI_TILE_SIZE);

    return Math.max(1, tilesWide * tilesHigh);
  }
}

// ============================================================================
// Gemini Image Calculator
// ============================================================================

/**
 * Google Gemini image token calculation.
 *
 * Fixed 258 tokens per image regardless of size.
 *
 * @example
 * ```typescript
 * const calc = new GeminiImageCalculator();
 * const tokens = calc.calculateTokens(anyImageBlock);
 * // tokens = 258 (always)
 * ```
 *
 * @see https://ai.google.dev/gemini-api/docs/vision
 */
export class GeminiImageCalculator implements ImageCalculator {
  /**
   * Calculate token cost for an image block using Gemini's fixed rate.
   *
   * @param _block - The image block (dimensions not used)
   * @returns Fixed 258 tokens
   */
  calculateTokens(_block: ImageBlock): number {
    return GEMINI_FIXED_TOKENS;
  }
}

// ============================================================================
// Default Image Calculator
// ============================================================================

/**
 * Default calculator that returns a conservative estimate.
 *
 * Uses the maximum of all provider calculations to ensure
 * token budgets are never underestimated.
 *
 * @example
 * ```typescript
 * const calc = new DefaultImageCalculator();
 * const tokens = calc.calculateTokens(imageBlock);
 * // Returns max(anthropic, openai_high, gemini) for safety
 * ```
 */
export class DefaultImageCalculator implements ImageCalculator {
  private readonly anthropic = new AnthropicImageCalculator();
  private readonly openai = new OpenAIImageCalculator();
  private readonly gemini = new GeminiImageCalculator();

  /**
   * Calculate token cost using the maximum of all provider formulas.
   *
   * @param block - The image block to calculate tokens for
   * @returns The maximum token count across all providers
   */
  calculateTokens(block: ImageBlock): number {
    const anthropicTokens = this.anthropic.calculateTokens(block);
    const openaiTokens = this.openai.calculateTokens(block, "high");
    const geminiTokens = this.gemini.calculateTokens(block);

    return Math.max(anthropicTokens, openaiTokens, geminiTokens);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory to create appropriate image calculator for a provider.
 *
 * @param provider - Provider name (case-insensitive)
 * @returns The appropriate ImageCalculator implementation
 *
 * @example
 * ```typescript
 * const calc = createImageCalculator('anthropic');
 * const tokens = calc.calculateTokens(imageBlock);
 *
 * // Supported providers:
 * createImageCalculator('anthropic'); // AnthropicImageCalculator
 * createImageCalculator('openai');    // OpenAIImageCalculator
 * createImageCalculator('gemini');    // GeminiImageCalculator
 * createImageCalculator('google');    // GeminiImageCalculator
 * createImageCalculator('unknown');   // DefaultImageCalculator
 * ```
 */
export function createImageCalculator(provider: string): ImageCalculator {
  const normalizedProvider = provider.toLowerCase().trim();

  switch (normalizedProvider) {
    case "anthropic":
    case "claude":
      return new AnthropicImageCalculator();

    case "openai":
    case "gpt":
    case "gpt-4":
    case "gpt-4v":
    case "gpt-4o":
      return new OpenAIImageCalculator();

    case "gemini":
    case "google":
    case "google-ai":
    case "vertex":
      return new GeminiImageCalculator();

    default:
      return new DefaultImageCalculator();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Utility to extract dimensions from ImageBlock.
 *
 * Returns validated dimensions, defaulting to 1024x1024 if unknown.
 * Clamps values to reasonable bounds (1 to 16384).
 *
 * @param block - The image block to extract dimensions from
 * @returns Tuple of [width, height] in pixels
 *
 * @example
 * ```typescript
 * const [width, height] = extractImageDimensions(imageBlock);
 * // If dimensions missing: [1024, 1024]
 * // If present: [block.width, block.height] (clamped)
 * ```
 */
export function extractImageDimensions(block: ImageBlock): [number, number] {
  const rawWidth = block.width ?? DEFAULT_WIDTH;
  const rawHeight = block.height ?? DEFAULT_HEIGHT;

  // Validate and clamp dimensions
  const width = clampDimension(rawWidth);
  const height = clampDimension(rawHeight);

  return [width, height];
}

/**
 * Clamp a dimension value to valid bounds.
 *
 * @param value - The dimension value to clamp
 * @returns Clamped value between 1 and MAX_DIMENSION
 */
function clampDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_WIDTH;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_DIMENSION);
}

/**
 * Calculate total image tokens in message content.
 *
 * Iterates through all content blocks and sums token costs
 * for image blocks using the provided calculator.
 *
 * @param content - Array of content blocks to analyze
 * @param calculator - The image calculator to use
 * @returns Total token count for all images
 *
 * @example
 * ```typescript
 * const calc = createImageCalculator('anthropic');
 * const tokens = calculateMessageImageTokens(message.content, calc);
 * ```
 */
export function calculateMessageImageTokens(
  content: ContentBlock[],
  calculator: ImageCalculator
): number {
  let totalTokens = 0;

  for (const block of content) {
    if (block.type === "image") {
      totalTokens += calculator.calculateTokens(block);
    }
  }

  return totalTokens;
}

/**
 * Check if a content block array contains any images.
 *
 * @param content - Array of content blocks to check
 * @returns True if at least one image block exists
 */
export function hasImageBlocks(content: ContentBlock[]): boolean {
  return content.some((block) => block.type === "image");
}

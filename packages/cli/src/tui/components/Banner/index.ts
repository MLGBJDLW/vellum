/**
 * Banner Module
 *
 * Exports all banner-related components for the Vellum CLI.
 *
 * @module tui/components/Banner
 */

// ASCII Art definitions
export {
  ASCII_VARIANTS,
  type AsciiVariant,
  SCROLL_BOTTOM,
  SCROLL_TOP,
  selectAsciiArt,
  VELLUM_LARGE,
  VELLUM_MEDIUM,
  VELLUM_MINIMAL,
  VELLUM_SMALL,
} from "./AsciiArt.js";

// Main Banner component
export {
  Banner,
  type BannerProps,
  CompactBanner,
  MinimalBanner,
} from "./Banner.js";
// Shimmer text component
export {
  BannerShimmerText,
  type BannerShimmerTextProps,
  MultiLineShimmer,
  type MultiLineShimmerProps,
} from "./ShimmerText.js";
// Shimmer animation hook
export {
  calculateShimmerIntensity,
  type ShimmerConfig,
  type ShimmerState,
  useShimmer,
} from "./useShimmer.js";

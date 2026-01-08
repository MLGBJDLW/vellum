/**
 * Vision Types
 *
 * Type definitions for multimodal/vision capabilities.
 *
 * @module @vellum/core/vision
 * @see REQ-VIS-001 - Vision capability types
 */

// =============================================================================
// Image Source Types
// =============================================================================

/**
 * Supported image MIME types
 */
export type ImageMimeType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * Image source from base64 encoded data
 */
export interface Base64ImageSource {
  /** Source type discriminator */
  type: "base64";
  /** Base64-encoded image data (without data URI prefix) */
  data: string;
  /** MIME type of the image */
  mimeType: ImageMimeType;
}

/**
 * Image source from a URL
 */
export interface UrlImageSource {
  /** Source type discriminator */
  type: "url";
  /** HTTP(S) URL to the image */
  url: string;
}

/**
 * Image source from a file path
 */
export interface FileImageSource {
  /** Source type discriminator */
  type: "file";
  /** File path (absolute or relative to working directory) */
  path: string;
}

/**
 * Union of all vision image source types
 */
export type VisionImageSource = Base64ImageSource | UrlImageSource | FileImageSource;

// =============================================================================
// Image Metadata
// =============================================================================

/**
 * Image dimensions
 */
export interface ImageDimensions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Metadata about a processed image
 */
export interface ImageMetadata {
  /** Original image dimensions */
  originalDimensions?: ImageDimensions;
  /** Processed/resized dimensions */
  processedDimensions?: ImageDimensions;
  /** File size in bytes */
  fileSizeBytes?: number;
  /** Detected MIME type */
  mimeType: ImageMimeType;
  /** Whether the image was resized */
  wasResized: boolean;
}

// =============================================================================
// Vision Capabilities
// =============================================================================

/**
 * Vision capabilities of a provider/model
 */
export interface VisionCapabilities {
  /** Whether the provider supports vision/image input */
  supportsVision: boolean;
  /** Maximum number of images per request (undefined = unlimited) */
  maxImages?: number;
  /** Maximum image dimensions (pixels) */
  maxDimension?: number;
  /** Maximum file size per image in bytes */
  maxFileSizeBytes?: number;
  /** Supported image formats */
  supportedFormats: ImageMimeType[];
  /** Whether URLs are supported as image source */
  supportsUrls: boolean;
  /** Whether base64 is supported as image source */
  supportsBase64: boolean;
}

/**
 * Default vision capabilities for providers without explicit support
 */
export const DEFAULT_VISION_CAPABILITIES: VisionCapabilities = {
  supportsVision: false,
  maxImages: 0,
  supportedFormats: [],
  supportsUrls: false,
  supportsBase64: false,
};

/**
 * Common vision capabilities for most providers
 */
export const COMMON_VISION_CAPABILITIES: VisionCapabilities = {
  supportsVision: true,
  maxImages: 20,
  maxDimension: 4096,
  maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
  supportedFormats: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  supportsUrls: true,
  supportsBase64: true,
};

// =============================================================================
// Screenshot Options
// =============================================================================

/**
 * Region selection for screenshots
 */
export interface ScreenshotRegion {
  /** X coordinate of the top-left corner */
  x: number;
  /** Y coordinate of the top-left corner */
  y: number;
  /** Width of the region */
  width: number;
  /** Height of the region */
  height: number;
}

/**
 * Options for taking screenshots
 */
export interface ScreenshotOptions {
  /** Optional file path to save the screenshot */
  outputPath?: string;
  /** Capture a specific region instead of full screen */
  region?: ScreenshotRegion;
  /** Display/screen index for multi-monitor setups (0-indexed) */
  displayIndex?: number;
  /** Include the cursor in the screenshot (platform-dependent) */
  includeCursor?: boolean;
  /** Image format for the output */
  format?: "png" | "jpeg";
  /** JPEG quality (1-100, only applicable for jpeg format) */
  quality?: number;
}

/**
 * Result of a screenshot operation
 */
export interface ScreenshotResult {
  /** Base64-encoded image data */
  data: string;
  /** MIME type of the image */
  mimeType: ImageMimeType;
  /** Image dimensions */
  dimensions: ImageDimensions;
  /** File path if saved to disk */
  savedPath?: string;
}

// =============================================================================
// Image Processing Options
// =============================================================================

/**
 * Options for image resizing
 */
export interface ResizeOptions {
  /** Maximum width in pixels */
  maxWidth?: number;
  /** Maximum height in pixels */
  maxHeight?: number;
  /** Maintain aspect ratio (default: true) */
  maintainAspectRatio?: boolean;
  /** Output format */
  format?: ImageMimeType;
  /** JPEG quality (1-100) */
  quality?: number;
}

/**
 * Options for image validation
 */
export interface ImageValidationOptions {
  /** Maximum allowed file size in bytes */
  maxFileSizeBytes?: number;
  /** Maximum allowed dimension */
  maxDimension?: number;
  /** Allowed MIME types */
  allowedFormats?: ImageMimeType[];
}

/**
 * Result of image validation
 */
export interface ImageValidationResult {
  /** Whether the image is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Detected metadata */
  metadata?: ImageMetadata;
}

/**
 * Vision Module
 *
 * Multimodal/vision capabilities for image processing and screenshot capture.
 *
 * @module @vellum/core/vision
 */

// Service
export { createVisionService, VisionService } from "./service.js";
// Types
export type {
  Base64ImageSource,
  FileImageSource,
  ImageDimensions,
  ImageMetadata,
  ImageMimeType,
  ImageValidationOptions,
  ImageValidationResult,
  ResizeOptions,
  ScreenshotOptions,
  ScreenshotRegion,
  ScreenshotResult,
  UrlImageSource,
  VisionCapabilities,
  VisionImageSource,
} from "./types.js";
export { COMMON_VISION_CAPABILITIES, DEFAULT_VISION_CAPABILITIES } from "./types.js";

// Utilities
export {
  calculateResizedDimensions,
  createDataUri,
  decodeBase64,
  detectMimeTypeFromBuffer,
  detectMimeTypeFromDataUri,
  detectMimeTypeFromExtension,
  encodeBase64,
  extractDimensions,
  isValidImageMimeType,
  needsResize,
  readImageFile,
  validateBase64Image,
  validateImageFile,
} from "./utils.js";

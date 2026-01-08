/**
 * Vision Utilities
 *
 * Image processing utilities for validation, encoding, and format detection.
 *
 * @module @vellum/core/vision
 * @see REQ-VIS-002 - Vision utilities
 */

import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

import type {
  ImageDimensions,
  ImageMetadata,
  ImageMimeType,
  ImageValidationOptions,
  ImageValidationResult,
  ResizeOptions,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Maximum dimension for image processing */
const MAX_DIMENSION = 8192;

/** Default max file size (20MB) */
const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;

/** File extension to MIME type mapping */
const EXTENSION_TO_MIME: Record<string, ImageMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Magic bytes for image format detection */
const MAGIC_BYTES: Array<{ bytes: number[]; mimeType: ImageMimeType }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png" }, // PNG
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg" }, // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38], mimeType: "image/gif" }, // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: "image/webp" }, // WEBP (RIFF header)
];

// =============================================================================
// Format Detection
// =============================================================================

/**
 * Detect MIME type from file extension
 *
 * @param filePath - File path to check
 * @returns Detected MIME type or undefined
 */
export function detectMimeTypeFromExtension(filePath: string): ImageMimeType | undefined {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_MIME[ext];
}

/**
 * Detect MIME type from file magic bytes
 *
 * @param buffer - Buffer containing file data
 * @returns Detected MIME type or undefined
 */
export function detectMimeTypeFromBuffer(buffer: Buffer): ImageMimeType | undefined {
  for (const { bytes, mimeType } of MAGIC_BYTES) {
    if (bytes.every((byte, i) => buffer[i] === byte)) {
      return mimeType;
    }
  }

  // Additional check for WEBP (after RIFF header)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return undefined;
}

/**
 * Detect MIME type from base64 data URI prefix
 *
 * @param dataUri - Data URI string
 * @returns Detected MIME type or undefined
 */
export function detectMimeTypeFromDataUri(dataUri: string): ImageMimeType | undefined {
  const match = dataUri.match(/^data:(image\/[a-z+]+);base64,/i);
  if (match) {
    const captured = match[1];
    if (captured) {
      const mimeType = captured.toLowerCase() as ImageMimeType;
      if (isValidImageMimeType(mimeType)) {
        return mimeType;
      }
    }
  }
  return undefined;
}

/**
 * Check if a string is a valid image MIME type
 *
 * @param mimeType - MIME type to check
 * @returns Whether it's a valid image MIME type
 */
export function isValidImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType);
}

// =============================================================================
// Dimension Detection
// =============================================================================

/**
 * Extract image dimensions from PNG buffer
 *
 * @param buffer - PNG file buffer
 * @returns Dimensions or undefined
 */
function extractPngDimensions(buffer: Buffer): ImageDimensions | undefined {
  // PNG dimensions are at bytes 16-23 (IHDR chunk)
  if (buffer.length < 24) return undefined;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height };
  }
  return undefined;
}

/**
 * Extract image dimensions from JPEG buffer
 *
 * @param buffer - JPEG file buffer
 * @returns Dimensions or undefined
 */
function extractJpegDimensions(buffer: Buffer): ImageDimensions | undefined {
  // JPEG dimensions are in SOF0 or SOF2 markers
  let offset = 2; // Skip FFD8

  while (offset < buffer.length - 8) {
    const firstByte = buffer[offset];
    if (firstByte !== 0xff) break;

    const marker = buffer[offset + 1];
    if (marker === undefined) break;

    // SOF0, SOF1, SOF2 markers contain dimensions
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        return { width, height };
      }
    }

    // Skip to next marker
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
    } else {
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  return undefined;
}

/**
 * Extract image dimensions from GIF buffer
 *
 * @param buffer - GIF file buffer
 * @returns Dimensions or undefined
 */
function extractGifDimensions(buffer: Buffer): ImageDimensions | undefined {
  // GIF dimensions are at bytes 6-9 (little endian)
  if (buffer.length < 10) return undefined;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  if (width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height };
  }
  return undefined;
}

/**
 * Extract image dimensions from WebP buffer
 *
 * @param buffer - WebP file buffer
 * @returns Dimensions or undefined
 */
function extractWebpDimensions(buffer: Buffer): ImageDimensions | undefined {
  // WebP can be VP8, VP8L, or VP8X format
  if (buffer.length < 30) return undefined;

  const format = buffer.toString("ascii", 12, 16);

  if (format === "VP8 ") {
    // Lossy WebP
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    if (width > 0 && height > 0) {
      return { width, height };
    }
  } else if (format === "VP8L") {
    // Lossless WebP
    const signature = buffer.readUInt32LE(21);
    const width = (signature & 0x3fff) + 1;
    const height = ((signature >> 14) & 0x3fff) + 1;
    if (width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      return { width, height };
    }
  } else if (format === "VP8X") {
    // Extended WebP
    const width = (buffer.readUIntLE(24, 3) & 0xffffff) + 1;
    const height = (buffer.readUIntLE(27, 3) & 0xffffff) + 1;
    if (width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      return { width, height };
    }
  }

  return undefined;
}

/**
 * Extract image dimensions from a buffer
 *
 * @param buffer - Image file buffer
 * @param mimeType - Optional MIME type hint
 * @returns Dimensions or undefined
 */
export function extractDimensions(
  buffer: Buffer,
  mimeType?: ImageMimeType
): ImageDimensions | undefined {
  const detectedType = mimeType ?? detectMimeTypeFromBuffer(buffer);

  switch (detectedType) {
    case "image/png":
      return extractPngDimensions(buffer);
    case "image/jpeg":
      return extractJpegDimensions(buffer);
    case "image/gif":
      return extractGifDimensions(buffer);
    case "image/webp":
      return extractWebpDimensions(buffer);
    default:
      return undefined;
  }
}

// =============================================================================
// Encoding / Decoding
// =============================================================================

/**
 * Encode a buffer as base64
 *
 * @param buffer - Buffer to encode
 * @returns Base64 encoded string
 */
export function encodeBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Decode base64 string to buffer
 *
 * @param base64 - Base64 string to decode
 * @returns Decoded buffer
 */
export function decodeBase64(base64: string): Buffer {
  // Strip data URI prefix if present
  const data = base64.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(data, "base64");
}

/**
 * Create a data URI from buffer and MIME type
 *
 * @param buffer - Image buffer
 * @param mimeType - MIME type
 * @returns Data URI string
 */
export function createDataUri(buffer: Buffer, mimeType: ImageMimeType): string {
  return `data:${mimeType};base64,${encodeBase64(buffer)}`;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate an image file
 *
 * @param filePath - Path to the image file
 * @param options - Validation options
 * @returns Validation result with metadata
 */
export async function validateImageFile(
  filePath: string,
  options: ImageValidationOptions = {}
): Promise<ImageValidationResult> {
  const {
    maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE,
    maxDimension = MAX_DIMENSION,
    allowedFormats = ["image/png", "image/jpeg", "image/gif", "image/webp"],
  } = options;

  try {
    // Check file exists and get size
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return { valid: false, error: "Path is not a file" };
    }

    if (stats.size > maxFileSizeBytes) {
      return {
        valid: false,
        error: `File size ${stats.size} exceeds maximum ${maxFileSizeBytes} bytes`,
      };
    }

    // Read file and detect format
    const buffer = await readFile(filePath);
    const mimeType = detectMimeTypeFromBuffer(buffer) ?? detectMimeTypeFromExtension(filePath);

    if (!mimeType) {
      return { valid: false, error: "Unable to detect image format" };
    }

    if (!allowedFormats.includes(mimeType)) {
      return { valid: false, error: `Format ${mimeType} not allowed` };
    }

    // Extract dimensions
    const dimensions = extractDimensions(buffer, mimeType);
    if (dimensions) {
      if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
        return {
          valid: false,
          error: `Image dimensions ${dimensions.width}x${dimensions.height} exceed maximum ${maxDimension}`,
        };
      }
    }

    const metadata: ImageMetadata = {
      mimeType,
      fileSizeBytes: stats.size,
      originalDimensions: dimensions,
      wasResized: false,
    };

    return { valid: true, metadata };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { valid: false, error: `Failed to validate image: ${message}` };
  }
}

/**
 * Validate base64 image data
 *
 * @param base64 - Base64 encoded image data
 * @param options - Validation options
 * @returns Validation result with metadata
 */
export function validateBase64Image(
  base64: string,
  options: ImageValidationOptions = {}
): ImageValidationResult {
  const {
    maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE,
    maxDimension = MAX_DIMENSION,
    allowedFormats = ["image/png", "image/jpeg", "image/gif", "image/webp"],
  } = options;

  try {
    const buffer = decodeBase64(base64);

    if (buffer.length > maxFileSizeBytes) {
      return {
        valid: false,
        error: `Data size ${buffer.length} exceeds maximum ${maxFileSizeBytes} bytes`,
      };
    }

    const mimeType = detectMimeTypeFromBuffer(buffer) ?? detectMimeTypeFromDataUri(base64);

    if (!mimeType) {
      return { valid: false, error: "Unable to detect image format" };
    }

    if (!allowedFormats.includes(mimeType)) {
      return { valid: false, error: `Format ${mimeType} not allowed` };
    }

    const dimensions = extractDimensions(buffer, mimeType);
    if (dimensions) {
      if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
        return {
          valid: false,
          error: `Image dimensions ${dimensions.width}x${dimensions.height} exceed maximum ${maxDimension}`,
        };
      }
    }

    const metadata: ImageMetadata = {
      mimeType,
      fileSizeBytes: buffer.length,
      originalDimensions: dimensions,
      wasResized: false,
    };

    return { valid: true, metadata };
  } catch {
    return { valid: false, error: "Invalid base64 data" };
  }
}

// =============================================================================
// Resize Utilities (without external dependencies)
// =============================================================================

/**
 * Calculate new dimensions while maintaining aspect ratio
 *
 * @param width - Original width
 * @param height - Original height
 * @param options - Resize options
 * @returns New dimensions
 */
export function calculateResizedDimensions(
  width: number,
  height: number,
  options: ResizeOptions
): ImageDimensions {
  const {
    maxWidth = MAX_DIMENSION,
    maxHeight = MAX_DIMENSION,
    maintainAspectRatio = true,
  } = options;

  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  if (!maintainAspectRatio) {
    return {
      width: Math.min(width, maxWidth),
      height: Math.min(height, maxHeight),
    };
  }

  const aspectRatio = width / height;
  let newWidth = width;
  let newHeight = height;

  if (newWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = Math.round(newWidth / aspectRatio);
  }

  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = Math.round(newHeight * aspectRatio);
  }

  return { width: newWidth, height: newHeight };
}

/**
 * Check if an image needs resizing based on options
 *
 * @param dimensions - Current dimensions
 * @param options - Resize options
 * @returns Whether resize is needed
 */
export function needsResize(dimensions: ImageDimensions, options: ResizeOptions): boolean {
  const { maxWidth = MAX_DIMENSION, maxHeight = MAX_DIMENSION } = options;
  return dimensions.width > maxWidth || dimensions.height > maxHeight;
}

// =============================================================================
// File Reading Utilities
// =============================================================================

/**
 * Read an image file and return metadata and base64 data
 *
 * @param filePath - Path to the image file
 * @returns Image data and metadata
 */
export async function readImageFile(
  filePath: string
): Promise<{ data: string; metadata: ImageMetadata }> {
  const buffer = await readFile(filePath);
  const stats = await stat(filePath);

  const mimeType = detectMimeTypeFromBuffer(buffer) ?? detectMimeTypeFromExtension(filePath);

  if (!mimeType) {
    throw new Error(`Unable to detect image format for: ${filePath}`);
  }

  const dimensions = extractDimensions(buffer, mimeType);

  return {
    data: encodeBase64(buffer),
    metadata: {
      mimeType,
      fileSizeBytes: stats.size,
      originalDimensions: dimensions,
      wasResized: false,
    },
  };
}

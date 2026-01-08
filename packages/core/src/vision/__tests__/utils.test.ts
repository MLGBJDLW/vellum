/**
 * Vision Utils Tests
 *
 * Tests for image format detection, validation, and utilities.
 */

import { describe, expect, it } from "vitest";

import {
  calculateResizedDimensions,
  decodeBase64,
  detectMimeTypeFromBuffer,
  detectMimeTypeFromDataUri,
  detectMimeTypeFromExtension,
  encodeBase64,
  extractDimensions,
  isValidImageMimeType,
  needsResize,
  validateBase64Image,
} from "../utils.js";

// =============================================================================
// Test Data
// =============================================================================

// Minimal valid PNG (1x1 transparent pixel)
const MINIMAL_PNG = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d, // IHDR length
  0x49,
  0x48,
  0x44,
  0x52, // IHDR type
  0x00,
  0x00,
  0x00,
  0x01, // width = 1
  0x00,
  0x00,
  0x00,
  0x01, // height = 1
  0x08,
  0x06,
  0x00,
  0x00,
  0x00, // bit depth, color type, compression, filter, interlace
  0x1f,
  0x15,
  0xc4,
  0x89, // CRC
  0x00,
  0x00,
  0x00,
  0x0a, // IDAT length
  0x49,
  0x44,
  0x41,
  0x54, // IDAT type
  0x78,
  0x9c,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01, // compressed data
  0x0d,
  0x0a,
  0x2d,
  0xb4, // CRC
  0x00,
  0x00,
  0x00,
  0x00, // IEND length
  0x49,
  0x45,
  0x4e,
  0x44, // IEND type
  0xae,
  0x42,
  0x60,
  0x82, // CRC
]);

// JPEG signature
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

// GIF signature with minimal header (1x1 pixel)
const GIF_HEADER = Buffer.from([
  0x47,
  0x49,
  0x46,
  0x38,
  0x39,
  0x61, // GIF89a
  0x01,
  0x00, // width = 1 (little endian)
  0x01,
  0x00, // height = 1 (little endian)
  0x00,
  0x00,
  0x00, // flags
]);

// WebP signature (RIFF + WEBP)
const WEBP_HEADER = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // file size
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
]);

// =============================================================================
// Format Detection Tests
// =============================================================================

describe("detectMimeTypeFromExtension", () => {
  it("detects PNG from extension", () => {
    expect(detectMimeTypeFromExtension("image.png")).toBe("image/png");
    expect(detectMimeTypeFromExtension("IMAGE.PNG")).toBe("image/png");
    expect(detectMimeTypeFromExtension("/path/to/file.png")).toBe("image/png");
  });

  it("detects JPEG from extension", () => {
    expect(detectMimeTypeFromExtension("photo.jpg")).toBe("image/jpeg");
    expect(detectMimeTypeFromExtension("photo.jpeg")).toBe("image/jpeg");
    expect(detectMimeTypeFromExtension("PHOTO.JPG")).toBe("image/jpeg");
  });

  it("detects GIF from extension", () => {
    expect(detectMimeTypeFromExtension("animation.gif")).toBe("image/gif");
  });

  it("detects WebP from extension", () => {
    expect(detectMimeTypeFromExtension("image.webp")).toBe("image/webp");
  });

  it("returns undefined for unknown extensions", () => {
    expect(detectMimeTypeFromExtension("file.txt")).toBeUndefined();
    expect(detectMimeTypeFromExtension("image.bmp")).toBeUndefined();
    expect(detectMimeTypeFromExtension("noextension")).toBeUndefined();
  });
});

describe("detectMimeTypeFromBuffer", () => {
  it("detects PNG from magic bytes", () => {
    expect(detectMimeTypeFromBuffer(MINIMAL_PNG)).toBe("image/png");
  });

  it("detects JPEG from magic bytes", () => {
    expect(detectMimeTypeFromBuffer(JPEG_SIGNATURE)).toBe("image/jpeg");
  });

  it("detects GIF from magic bytes", () => {
    expect(detectMimeTypeFromBuffer(GIF_HEADER)).toBe("image/gif");
  });

  it("detects WebP from magic bytes", () => {
    expect(detectMimeTypeFromBuffer(WEBP_HEADER)).toBe("image/webp");
  });

  it("returns undefined for unknown format", () => {
    expect(detectMimeTypeFromBuffer(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBeUndefined();
  });
});

describe("detectMimeTypeFromDataUri", () => {
  it("detects PNG from data URI", () => {
    expect(detectMimeTypeFromDataUri("data:image/png;base64,iVBORw0KGgo=")).toBe("image/png");
  });

  it("detects JPEG from data URI", () => {
    expect(detectMimeTypeFromDataUri("data:image/jpeg;base64,/9j/4AAQ")).toBe("image/jpeg");
  });

  it("returns undefined for invalid data URI", () => {
    expect(detectMimeTypeFromDataUri("not a data uri")).toBeUndefined();
    expect(detectMimeTypeFromDataUri("data:text/plain;base64,abc")).toBeUndefined();
  });
});

describe("isValidImageMimeType", () => {
  it("returns true for valid image MIME types", () => {
    expect(isValidImageMimeType("image/png")).toBe(true);
    expect(isValidImageMimeType("image/jpeg")).toBe(true);
    expect(isValidImageMimeType("image/gif")).toBe(true);
    expect(isValidImageMimeType("image/webp")).toBe(true);
  });

  it("returns false for invalid MIME types", () => {
    expect(isValidImageMimeType("image/bmp")).toBe(false);
    expect(isValidImageMimeType("text/plain")).toBe(false);
    expect(isValidImageMimeType("application/json")).toBe(false);
  });
});

// =============================================================================
// Dimension Extraction Tests
// =============================================================================

describe("extractDimensions", () => {
  it("extracts dimensions from PNG", () => {
    const dims = extractDimensions(MINIMAL_PNG, "image/png");
    expect(dims).toEqual({ width: 1, height: 1 });
  });

  it("extracts dimensions from GIF", () => {
    const dims = extractDimensions(GIF_HEADER, "image/gif");
    expect(dims).toEqual({ width: 1, height: 1 });
  });

  it("returns undefined for insufficient data", () => {
    expect(extractDimensions(Buffer.from([0x89, 0x50]), "image/png")).toBeUndefined();
  });
});

// =============================================================================
// Encoding/Decoding Tests
// =============================================================================

describe("encodeBase64/decodeBase64", () => {
  it("roundtrips buffer through base64", () => {
    const original = Buffer.from("Hello, World!");
    const encoded = encodeBase64(original);
    const decoded = decodeBase64(encoded);
    expect(decoded.toString()).toBe("Hello, World!");
  });

  it("handles binary data", () => {
    const original = Buffer.from([0x00, 0xff, 0x7f, 0x80]);
    const encoded = encodeBase64(original);
    const decoded = decodeBase64(encoded);
    expect(decoded).toEqual(original);
  });

  it("strips data URI prefix when decoding", () => {
    const data = "SGVsbG8="; // "Hello"
    const dataUri = `data:text/plain;base64,${data}`;
    const decoded = decodeBase64(dataUri);
    expect(decoded.toString()).toBe("Hello");
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe("validateBase64Image", () => {
  const validPngBase64 = encodeBase64(MINIMAL_PNG);

  it("validates a valid PNG image", () => {
    const result = validateBase64Image(validPngBase64);
    expect(result.valid).toBe(true);
    expect(result.metadata?.mimeType).toBe("image/png");
  });

  it("rejects oversized images", () => {
    const result = validateBase64Image(validPngBase64, {
      maxFileSizeBytes: 10, // Very small limit
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum");
  });

  it("rejects disallowed formats", () => {
    const result = validateBase64Image(validPngBase64, {
      allowedFormats: ["image/jpeg"], // Only JPEG allowed
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("rejects invalid base64", () => {
    const result = validateBase64Image("not valid base64!!!");
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Resize Calculation Tests
// =============================================================================

describe("calculateResizedDimensions", () => {
  it("returns original dimensions when within limits", () => {
    const dims = calculateResizedDimensions(800, 600, {
      maxWidth: 1000,
      maxHeight: 1000,
    });
    expect(dims).toEqual({ width: 800, height: 600 });
  });

  it("scales down by width when exceeding maxWidth", () => {
    const dims = calculateResizedDimensions(2000, 1000, {
      maxWidth: 1000,
      maxHeight: 1000,
    });
    expect(dims.width).toBeLessThanOrEqual(1000);
    expect(dims.height).toBeLessThanOrEqual(1000);
    // Aspect ratio should be preserved
    expect(dims.width / dims.height).toBeCloseTo(2, 1);
  });

  it("scales down by height when exceeding maxHeight", () => {
    const dims = calculateResizedDimensions(1000, 2000, {
      maxWidth: 1000,
      maxHeight: 1000,
    });
    expect(dims.width).toBeLessThanOrEqual(1000);
    expect(dims.height).toBeLessThanOrEqual(1000);
    // Aspect ratio should be preserved
    expect(dims.width / dims.height).toBeCloseTo(0.5, 1);
  });

  it("ignores aspect ratio when requested", () => {
    const dims = calculateResizedDimensions(2000, 1500, {
      maxWidth: 1000,
      maxHeight: 1000,
      maintainAspectRatio: false,
    });
    expect(dims).toEqual({ width: 1000, height: 1000 });
  });
});

describe("needsResize", () => {
  it("returns false when dimensions are within limits", () => {
    expect(needsResize({ width: 800, height: 600 }, { maxWidth: 1000, maxHeight: 1000 })).toBe(
      false
    );
  });

  it("returns true when width exceeds limit", () => {
    expect(needsResize({ width: 1200, height: 600 }, { maxWidth: 1000, maxHeight: 1000 })).toBe(
      true
    );
  });

  it("returns true when height exceeds limit", () => {
    expect(needsResize({ width: 800, height: 1200 }, { maxWidth: 1000, maxHeight: 1000 })).toBe(
      true
    );
  });
});

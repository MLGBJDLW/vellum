/**
 * Read Image Tool
 *
 * Reads an image file and returns base64-encoded data for LLM vision.
 *
 * @module @vellum/tool/vision
 * @see REQ-VIS-005 - Read image tool
 */

import { resolve } from "node:path";
import { createVisionService, defineTool, fail, ok } from "@vellum/core";
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

/**
 * Parameters schema for read_image tool
 */
export const readImageParamsSchema = z.object({
  /** Path to the image file (relative to working directory or absolute) */
  path: z.string().describe("Path to the image file to read"),
  /** Optional: validate image meets constraints */
  validate: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to validate the image meets size/format constraints"),
  /** Optional: maximum file size in bytes */
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum allowed file size in bytes"),
});

/** Inferred type for read_image parameters */
export type ReadImageParams = z.infer<typeof readImageParamsSchema>;

// =============================================================================
// Output Types
// =============================================================================

/**
 * Output structure for read_image tool
 */
export interface ReadImageOutput {
  /** Base64-encoded image data (without data URI prefix) */
  data: string;
  /** MIME type of the image */
  mimeType: string;
  /** Resolved file path */
  path: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Image width in pixels (if detected) */
  width?: number;
  /** Image height in pixels (if detected) */
  height?: number;
}

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Read image tool implementation
 *
 * Reads an image file from disk and returns it as base64-encoded data
 * suitable for passing to vision-capable LLMs.
 *
 * Supports: PNG, JPEG, GIF, WebP
 *
 * @example
 * ```typescript
 * // Read an image file
 * const result = await readImageTool.execute({
 *   path: "diagram.png"
 * }, ctx);
 *
 * // With validation constraints
 * const result = await readImageTool.execute({
 *   path: "large-image.jpg",
 *   maxFileSizeBytes: 10 * 1024 * 1024 // 10MB
 * }, ctx);
 * ```
 */
export const readImageTool = defineTool({
  name: "read_image",
  description:
    "Read an image file and return as base64-encoded data for vision analysis. Supports PNG, JPEG, GIF, and WebP formats. Returns data suitable for LLM vision capabilities.",
  parameters: readImageParamsSchema,
  kind: "read",
  category: "vision",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Resolve path relative to working directory
    const resolvedPath = resolve(ctx.workingDir, input.path);

    // Security: ensure path is within working directory
    if (!resolvedPath.startsWith(ctx.workingDir)) {
      return fail("Path traversal not allowed - path must be within working directory");
    }

    const visionService = createVisionService();

    try {
      // Validate if requested
      if (input.validate !== false) {
        const validation = await visionService.validateFile(resolvedPath, {
          maxFileSizeBytes: input.maxFileSizeBytes,
        });

        if (!validation.valid) {
          return fail(validation.error ?? "Image validation failed");
        }
      }

      // Load the image
      const loaded = await visionService.loadImage({
        type: "file",
        path: resolvedPath,
      });

      return ok<ReadImageOutput>({
        data: loaded.data,
        mimeType: loaded.mimeType,
        path: resolvedPath,
        fileSizeBytes: loaded.metadata.fileSizeBytes ?? 0,
        width: loaded.metadata.originalDimensions?.width,
        height: loaded.metadata.originalDimensions?.height,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read image";
      return fail(message);
    }
  },
});

/**
 * Screenshot Tool
 *
 * Captures screenshots from the current display.
 * Supports Windows, macOS, and Linux with region selection.
 *
 * @module @vellum/tool/vision
 * @see REQ-VIS-004 - Screenshot tool
 */

import { createVisionService, defineTool, fail, ok } from "@vellum/core";
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

/**
 * Region schema for partial screen capture
 */
const regionSchema = z
  .object({
    x: z.number().int().min(0).describe("X coordinate of the top-left corner"),
    y: z.number().int().min(0).describe("Y coordinate of the top-left corner"),
    width: z.number().int().positive().describe("Width of the region in pixels"),
    height: z.number().int().positive().describe("Height of the region in pixels"),
  })
  .optional();

/**
 * Parameters schema for screenshot tool
 */
export const screenshotParamsSchema = z.object({
  /** Optional file path to save the screenshot */
  outputPath: z.string().optional().describe("Optional file path to save the screenshot"),
  /** Optional region to capture */
  region: regionSchema.describe("Optional region to capture (x, y, width, height)"),
  /** Display index for multi-monitor setups */
  displayIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Display/screen index for multi-monitor setups (0-indexed)"),
  /** Include cursor in screenshot */
  includeCursor: z
    .boolean()
    .optional()
    .describe("Include the cursor in the screenshot (platform-dependent)"),
});

/** Inferred type for screenshot parameters */
export type ScreenshotParams = z.infer<typeof screenshotParamsSchema>;

// =============================================================================
// Output Types
// =============================================================================

/**
 * Output structure for screenshot tool
 */
export interface ScreenshotOutput {
  /** Base64-encoded image data */
  data: string;
  /** MIME type of the image */
  mimeType: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File path if saved */
  savedPath?: string;
  /** Platform used for capture */
  platform: string;
}

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Screenshot tool implementation
 *
 * Captures screenshots using platform-native tools:
 * - Windows: PowerShell with System.Drawing
 * - macOS: screencapture command
 * - Linux: ImageMagick import or gnome-screenshot
 *
 * @example
 * ```typescript
 * // Capture full screen
 * const result = await screenshotTool.execute({}, ctx);
 *
 * // Capture a specific region
 * const result = await screenshotTool.execute({
 *   region: { x: 0, y: 0, width: 800, height: 600 }
 * }, ctx);
 *
 * // Save to file
 * const result = await screenshotTool.execute({
 *   outputPath: "screenshot.png"
 * }, ctx);
 * ```
 */
export const screenshotTool = defineTool({
  name: "screenshot",
  description:
    "Take a screenshot of the current screen. Supports full screen or region capture. Returns base64-encoded PNG image data. Requires vision-capable provider.",
  parameters: screenshotParamsSchema,
  kind: "read",
  category: "vision",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const visionService = createVisionService();

    // Check platform support
    if (!visionService.supportsScreenshots()) {
      return fail("Screenshots not supported on this platform");
    }

    try {
      const result = await visionService.takeScreenshot({
        outputPath: input.outputPath,
        region: input.region,
        displayIndex: input.displayIndex,
        includeCursor: input.includeCursor,
        format: "png",
      });

      return ok<ScreenshotOutput>({
        data: result.data,
        mimeType: result.mimeType,
        width: result.dimensions.width,
        height: result.dimensions.height,
        savedPath: result.savedPath,
        platform: visionService.getPlatform(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Screenshot capture failed";
      return fail(message);
    }
  },
});

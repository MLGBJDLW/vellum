/**
 * Vision Tools
 *
 * Tools for multimodal/vision operations including screenshot capture,
 * image reading, and image description.
 *
 * @module @vellum/tool/vision
 */

// Describe image tool
export {
  type DescribeImageOutput,
  type DescribeImageParams,
  describeImageParamsSchema,
  describeImageTool,
} from "./describe-image.js";

// Read image tool
export {
  type ReadImageOutput,
  type ReadImageParams,
  readImageParamsSchema,
  readImageTool,
} from "./read-image.js";
// Screenshot tool
export {
  type ScreenshotOutput,
  type ScreenshotParams,
  screenshotParamsSchema,
  screenshotTool,
} from "./screenshot.js";

/**
 * All vision tools as an array for registration
 */
export const visionTools = [
  // Import dynamically to avoid circular imports
  // Use: import { screenshotTool, readImageTool, describeImageTool } from "./vision/index.js"
];

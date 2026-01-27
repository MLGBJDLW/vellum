/**
 * Vision Service
 *
 * Service for handling vision/multimodal operations including
 * image processing, validation, and screenshot capture.
 *
 * @module @vellum/core/vision
 * @see REQ-VIS-003 - Vision service implementation
 */

import { exec } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fetchWithPool } from "@vellum/shared";

import type {
  Base64ImageSource,
  ImageMetadata,
  ImageMimeType,
  ImageValidationOptions,
  ScreenshotOptions,
  ScreenshotResult,
  VisionCapabilities,
  VisionImageSource,
} from "./types.js";
import { COMMON_VISION_CAPABILITIES, DEFAULT_VISION_CAPABILITIES } from "./types.js";
import {
  decodeBase64,
  detectMimeTypeFromBuffer,
  encodeBase64,
  extractDimensions,
  readImageFile,
  validateBase64Image,
  validateImageFile,
} from "./utils.js";

const execAsync = promisify(exec);

// =============================================================================
// Platform Detection
// =============================================================================

type Platform = "windows" | "macos" | "linux" | "unsupported";

/**
 * Detect the current platform
 */
function detectPlatform(): Platform {
  const platform = process.platform;
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "unsupported";
  }
}

// =============================================================================
// Vision Service
// =============================================================================

/**
 * Service for vision/multimodal operations
 */
export class VisionService {
  private readonly platform: Platform;
  private readonly tempDir: string;

  constructor() {
    this.platform = detectPlatform();
    this.tempDir = join(tmpdir(), "vellum-vision");
  }

  /**
   * Get the current platform
   */
  getPlatform(): Platform {
    return this.platform;
  }

  /**
   * Check if vision operations are supported on this platform
   */
  isSupported(): boolean {
    return this.platform !== "unsupported";
  }

  /**
   * Check if screenshots are supported on this platform
   */
  supportsScreenshots(): boolean {
    return this.platform !== "unsupported";
  }

  // ===========================================================================
  // Image Loading
  // ===========================================================================

  /**
   * Load an image from various sources and return as base64
   *
   * @param source - Image source (file path, URL, or base64)
   * @returns Base64 image source with metadata
   */
  async loadImage(
    source: VisionImageSource
  ): Promise<Base64ImageSource & { metadata: ImageMetadata }> {
    switch (source.type) {
      case "base64":
        return this.processBase64Image(source);
      case "file":
        return this.loadImageFromFile(source.path);
      case "url":
        return this.loadImageFromUrl(source.url);
    }
  }

  /**
   * Process base64 image data
   */
  private processBase64Image(
    source: Base64ImageSource
  ): Base64ImageSource & { metadata: ImageMetadata } {
    const buffer = decodeBase64(source.data);
    const dimensions = extractDimensions(buffer, source.mimeType);

    return {
      type: "base64",
      data: source.data,
      mimeType: source.mimeType,
      metadata: {
        mimeType: source.mimeType,
        fileSizeBytes: buffer.length,
        originalDimensions: dimensions,
        wasResized: false,
      },
    };
  }

  /**
   * Load image from file path
   */
  private async loadImageFromFile(
    filePath: string
  ): Promise<Base64ImageSource & { metadata: ImageMetadata }> {
    const { data, metadata } = await readImageFile(filePath);
    return {
      type: "base64",
      data,
      mimeType: metadata.mimeType,
      metadata,
    };
  }

  /**
   * Load image from URL
   */
  private async loadImageFromUrl(
    url: string
  ): Promise<Base64ImageSource & { metadata: ImageMetadata }> {
    const response = await fetchWithPool(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());

    // Detect MIME type from content-type header or buffer
    let mimeType: ImageMimeType | undefined;

    if (contentType.startsWith("image/")) {
      const parsed = contentType.split(";")[0]?.trim() as ImageMimeType | undefined;
      if (parsed && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(parsed)) {
        mimeType = parsed;
      }
    }

    if (!mimeType) {
      mimeType = detectMimeTypeFromBuffer(buffer);
    }

    if (!mimeType) {
      throw new Error("Unable to detect image format from URL");
    }

    const dimensions = extractDimensions(buffer, mimeType);

    return {
      type: "base64",
      data: encodeBase64(buffer),
      mimeType,
      metadata: {
        mimeType,
        fileSizeBytes: buffer.length,
        originalDimensions: dimensions,
        wasResized: false,
      },
    };
  }

  // ===========================================================================
  // Validation
  // ===========================================================================

  /**
   * Validate an image file
   */
  async validateFile(filePath: string, options?: ImageValidationOptions) {
    return validateImageFile(filePath, options);
  }

  /**
   * Validate base64 image data
   */
  validateBase64(data: string, options?: ImageValidationOptions) {
    return validateBase64Image(data, options);
  }

  // ===========================================================================
  // Screenshot Capture
  // ===========================================================================

  /**
   * Take a screenshot
   *
   * @param options - Screenshot options
   * @returns Screenshot result with base64 data
   */
  async takeScreenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    switch (this.platform) {
      case "windows":
        return this.takeScreenshotWindows(options);
      case "macos":
        return this.takeScreenshotMacOS(options);
      case "linux":
        return this.takeScreenshotLinux(options);
      default:
        throw new Error("Screenshots not supported on this platform");
    }
  }

  /**
   * Take a screenshot on Windows using PowerShell/.NET
   */
  private async takeScreenshotWindows(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const tempFile = join(this.tempDir, `screenshot-${Date.now()}.png`);
    await mkdir(dirname(tempFile), { recursive: true });

    // Build PowerShell script for screenshot
    let script: string;

    if (options.region) {
      const { x, y, width, height } = options.region;
      script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bitmap = New-Object System.Drawing.Bitmap(${width}, ${height})
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen(${x}, ${y}, 0, 0, $bitmap.Size)
        $bitmap.Save('${tempFile.replace(/\\/g, "\\\\")}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
    } else {
      script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $displayIndex = ${options.displayIndex ?? 0}
        if ($displayIndex -ge $screens.Count) { $displayIndex = 0 }
        $screen = $screens[$displayIndex]
        $bounds = $screen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
        $bitmap.Save('${tempFile.replace(/\\/g, "\\\\")}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
    }

    try {
      await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        timeout: 30000,
        cwd: this.tempDir,
      });

      const { data, metadata } = await readImageFile(tempFile);

      // Save to output path if specified
      if (options.outputPath) {
        const { writeFile } = await import("node:fs/promises");
        const outputBuffer = decodeBase64(data);
        await mkdir(dirname(options.outputPath), { recursive: true });
        await writeFile(options.outputPath, outputBuffer);
      }

      // Cleanup temp file
      await unlink(tempFile).catch(() => {});

      return {
        data,
        mimeType: "image/png",
        dimensions: metadata.originalDimensions ?? { width: 0, height: 0 },
        savedPath: options.outputPath,
      };
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw new Error(
        `Screenshot failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Take a screenshot on macOS using screencapture
   */
  private async takeScreenshotMacOS(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const tempFile = join(this.tempDir, `screenshot-${Date.now()}.png`);
    await mkdir(dirname(tempFile), { recursive: true });

    const args: string[] = ["-x"]; // Silent mode (no sound)

    if (!options.includeCursor) {
      args.push("-C"); // Exclude cursor by default
    }

    if (options.displayIndex !== undefined) {
      args.push("-D", String(options.displayIndex + 1)); // macOS uses 1-indexed
    }

    if (options.region) {
      const { x, y, width, height } = options.region;
      args.push("-R", `${x},${y},${width},${height}`);
    }

    args.push(tempFile);

    try {
      await execAsync(`screencapture ${args.join(" ")}`, { timeout: 30000, cwd: this.tempDir });

      const { data, metadata } = await readImageFile(tempFile);

      // Save to output path if specified
      if (options.outputPath) {
        const outputBuffer = decodeBase64(data);
        await mkdir(dirname(options.outputPath), { recursive: true });
        await writeFile(options.outputPath, outputBuffer);
      }

      // Cleanup temp file
      await unlink(tempFile).catch(() => {});

      return {
        data,
        mimeType: "image/png",
        dimensions: metadata.originalDimensions ?? { width: 0, height: 0 },
        savedPath: options.outputPath,
      };
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw new Error(
        `Screenshot failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Take a screenshot on Linux using ImageMagick or gnome-screenshot
   */
  private async takeScreenshotLinux(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const tempFile = join(this.tempDir, `screenshot-${Date.now()}.png`);
    await mkdir(dirname(tempFile), { recursive: true });

    // Try ImageMagick first (more widely available)
    let command: string;

    if (options.region) {
      const { x, y, width, height } = options.region;
      command = `import -window root -crop ${width}x${height}+${x}+${y} "${tempFile}"`;
    } else {
      command = `import -window root "${tempFile}"`;
    }

    try {
      await execAsync(command, { timeout: 30000, cwd: this.tempDir });
    } catch {
      // Fall back to gnome-screenshot
      const gsArgs: string[] = ["-f", tempFile];

      if (options.region) {
        // gnome-screenshot doesn't support region via CLI easily
        // Fall back to full screen
        console.warn("Region capture not supported with gnome-screenshot, capturing full screen");
      }

      await execAsync(`gnome-screenshot ${gsArgs.join(" ")}`, {
        timeout: 30000,
        cwd: this.tempDir,
      });
    }

    try {
      const { data, metadata } = await readImageFile(tempFile);

      // Save to output path if specified
      if (options.outputPath) {
        const outputBuffer = decodeBase64(data);
        await mkdir(dirname(options.outputPath), { recursive: true });
        await writeFile(options.outputPath, outputBuffer);
      }

      // Cleanup temp file
      await unlink(tempFile).catch(() => {});

      return {
        data,
        mimeType: "image/png",
        dimensions: metadata.originalDimensions ?? { width: 0, height: 0 },
        savedPath: options.outputPath,
      };
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw new Error(
        `Screenshot failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // ===========================================================================
  // Capability Queries
  // ===========================================================================

  /**
   * Get default vision capabilities
   */
  getDefaultCapabilities(): VisionCapabilities {
    return DEFAULT_VISION_CAPABILITIES;
  }

  /**
   * Get common vision capabilities (for providers with vision support)
   */
  getCommonCapabilities(): VisionCapabilities {
    return COMMON_VISION_CAPABILITIES;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/** Singleton instance */
let visionServiceInstance: VisionService | null = null;

/**
 * Create or get the VisionService instance
 *
 * @returns VisionService instance
 */
export function createVisionService(): VisionService {
  if (!visionServiceInstance) {
    visionServiceInstance = new VisionService();
  }
  return visionServiceInstance;
}

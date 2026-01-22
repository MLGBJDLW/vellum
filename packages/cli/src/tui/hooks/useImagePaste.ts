/**
 * Image Paste Hook
 *
 * Handles pasting images from clipboard into the TUI.
 * Placeholder implementation - to be expanded.
 *
 * @module tui/hooks/useImagePaste
 */

import { useCallback, useState } from "react";

// =============================================================================
// Types
// =============================================================================

export interface PastedImage {
  /** Image data as base64 */
  data: string;
  /** MIME type of the image */
  mimeType: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** File name if available */
  filename?: string;
}

export interface UseImagePasteOptions {
  /** Whether image paste is enabled */
  enabled?: boolean;
  /** Callback when image is pasted */
  onImagePaste?: (image: PastedImage) => void;
  /** Maximum image size in bytes */
  maxSize?: number;
  /** Allowed MIME types */
  allowedTypes?: string[];
}

export interface UseImagePasteResult {
  /** Last pasted image */
  pastedImage: PastedImage | null;
  /** Whether paste is in progress */
  isPasting: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Clear the pasted image */
  clear: () => void;
  /** Handle paste event manually */
  handlePaste: (data: string, mimeType: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to handle image pasting from clipboard
 */
export function useImagePaste(options: UseImagePasteOptions = {}): UseImagePasteResult {
  const { enabled = true, onImagePaste, maxSize, allowedTypes } = options;
  const [pastedImage, setPastedImage] = useState<PastedImage | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clear = useCallback(() => {
    setPastedImage(null);
    setError(null);
  }, []);

  const handlePaste = useCallback(
    (data: string, mimeType: string) => {
      if (!enabled) return;

      setIsPasting(true);
      setError(null);

      try {
        // Validate MIME type
        if (allowedTypes && !allowedTypes.includes(mimeType)) {
          throw new Error(`Unsupported image type: ${mimeType}`);
        }

        // Validate size
        const sizeInBytes = (data.length * 3) / 4; // Approximate base64 decode size
        if (maxSize && sizeInBytes > maxSize) {
          throw new Error(`Image too large: ${sizeInBytes} bytes (max: ${maxSize})`);
        }

        const image: PastedImage = {
          data,
          mimeType,
        };

        setPastedImage(image);
        onImagePaste?.(image);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsPasting(false);
      }
    },
    [enabled, onImagePaste, maxSize, allowedTypes]
  );

  return {
    pastedImage,
    isPasting,
    error,
    clear,
    handlePaste,
  };
}

export default useImagePaste;

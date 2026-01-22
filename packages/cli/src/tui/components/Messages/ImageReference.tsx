/**
 * Image Reference Component
 *
 * Displays image references in messages.
 * Placeholder implementation - to be expanded.
 *
 * @module tui/components/Messages/ImageReference
 */

import { Text } from "ink";
import type React from "react";

// =============================================================================
// Types
// =============================================================================

export interface ImageReferenceProps {
  /** Image source path or URL */
  source: string;
  /** Alt text for the image */
  alt?: string;
  /** Whether the image is inline */
  inline?: boolean;
}

export interface ImageReferenceListProps {
  /** List of image references */
  images: ImageReferenceProps[];
  /** Max images to show */
  maxImages?: number;
}

// =============================================================================
// Components
// =============================================================================

/**
 * Displays a single image reference
 */
export function ImageReference({ source, alt, inline }: ImageReferenceProps): React.ReactElement {
  const displayText = alt || source;
  const prefix = inline ? "" : "📷 ";
  return (
    <Text dimColor>
      {prefix}[Image: {displayText}]
    </Text>
  );
}

/**
 * Displays a list of image references
 */
export function ImageReferenceList({
  images,
  maxImages = 5,
}: ImageReferenceListProps): React.ReactElement {
  const displayImages = images.slice(0, maxImages);
  const remaining = images.length - maxImages;

  return (
    <>
      {displayImages.map((img, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Images displayed in sequence, order doesn't change
        <ImageReference key={idx} {...img} />
      ))}
      {remaining > 0 && <Text dimColor>... and {remaining} more images</Text>}
    </>
  );
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Format a single image reference as text
 */
export function formatImageReference(source: string, alt?: string): string {
  return `[Image: ${alt || source}]`;
}

/**
 * Format multiple image references as text
 */
export function formatImageReferences(images: Array<{ source: string; alt?: string }>): string {
  return images.map((img) => formatImageReference(img.source, img.alt)).join("\n");
}

export default ImageReference;

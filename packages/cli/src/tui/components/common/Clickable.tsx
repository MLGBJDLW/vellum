/**
 * Clickable Wrapper Component
 *
 * Wraps children with an invisible click region that responds to mouse clicks.
 * Automatically computes absolute terminal coordinates using LayoutPositionContext
 * and VirtualizedList item position data.
 *
 * Works with or without LayoutPositionContext (graceful degradation).
 *
 * @module tui/components/common/Clickable
 */

import { Box } from "ink";
import type React from "react";
import { useMemo } from "react";

import { useClickRegion, type ClickRegionBounds } from "../../hooks/useClickRegion.js";
import { useLayoutPosition } from "../../hooks/useLayoutPosition.js";
import { useVirtualizedItemPosition } from "./VirtualizedList/ItemPositionContext.js";
import type { MouseEvent } from "../../utils/mouse-parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the Clickable component.
 */
export interface ClickableProps {
  /** Unique ID for this clickable region */
  readonly id: string;
  /** Click handler */
  readonly onClick: (event: MouseEvent) => void;
  /** Whether clickable behavior is active (default: true) */
  readonly enabled?: boolean;
  /** Children to render */
  readonly children: React.ReactNode;
  /** Position within parent — rows from top of content area (when inside VirtualizedList) */
  readonly relativeTop?: number;
  /** Height of this component in rows (default: 1) */
  readonly height?: number;
  /** Click priority for overlapping regions (higher wins) */
  readonly priority?: number;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Clickable wrapper that registers a click region for its children.
 *
 * Automatically resolves position from:
 * 1. Explicit `relativeTop` / `height` props (highest priority)
 * 2. VirtualizedItemPositionContext (when inside a VirtualizedList)
 * 3. Falls back to no registration when position is unknown
 *
 * @example
 * ```tsx
 * // Inside a VirtualizedList renderItem
 * <Clickable id={`msg-${item.id}`} onClick={() => selectMessage(item.id)}>
 *   <MessageBubble message={item} />
 * </Clickable>
 *
 * // With explicit position
 * <Clickable id="header-btn" relativeTop={0} height={1} onClick={handleClick}>
 *   <Text>Click me</Text>
 * </Clickable>
 * ```
 */
export function Clickable({
  id,
  onClick,
  enabled = true,
  children,
  relativeTop,
  height,
  priority,
}: ClickableProps): React.JSX.Element {
  // Try to get position from VirtualizedList item context
  const itemPosition = useVirtualizedItemPosition();

  // Resolve effective position: explicit props > item context > unknown
  const effectiveTop = relativeTop ?? itemPosition?.relativeTop ?? 0;
  const effectiveHeight = height ?? itemPosition?.height ?? 1;
  const hasPosition = relativeTop !== undefined || itemPosition !== null;

  // Compute absolute bounds via LayoutPositionContext
  const { absoluteBounds } = useLayoutPosition({
    id,
    relativeTop: effectiveTop,
    height: effectiveHeight,
    visible: enabled && hasPosition,
  });

  // Convert to ClickRegionBounds (useClickRegion expects 1-based coords)
  const clickBounds = useMemo<ClickRegionBounds | null>(() => {
    if (!absoluteBounds) return null;
    return {
      top: absoluteBounds.top,
      left: absoluteBounds.left,
      width: absoluteBounds.width,
      height: absoluteBounds.height,
    };
  }, [absoluteBounds]);

  // Register click region
  useClickRegion({ id, onClick, priority, enabled }, clickBounds);

  return <Box width="100%">{children}</Box>;
}

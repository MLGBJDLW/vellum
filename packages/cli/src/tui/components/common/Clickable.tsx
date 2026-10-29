/** Clickable Ink box measured at event time, including ancestor scroll clipping. */
import { Box, type BoxProps, type DOMElement, getBoundingBox } from "ink";
import type React from "react";
import { useCallback, useRef } from "react";
import {
  useMouseInteractionActivate,
  useMouseInteractionEnabled,
} from "../../context/MouseContext.js";
import { type ClickRegionBounds, useClickRegion } from "../../hooks/useClickRegion.js";
import type { MouseEvent } from "../../utils/mouse-parser.js";

export interface ClickableProps {
  readonly id: string;
  readonly onClick: (event: MouseEvent) => void;
  readonly enabled?: boolean;
  readonly children: React.ReactNode;
  /** @deprecated Bounds are measured from the rendered box. */
  readonly relativeTop?: number;
  /** @deprecated Bounds are measured from the rendered box. */
  readonly height?: number;
  readonly priority?: number;
  /** Use "auto" for adjacent inline controls; defaults to the full row. */
  readonly width?: BoxProps["width"];
}

/** Ink geometry is zero-based; terminal reports and click regions are one-based. */
export function getVisibleClickBounds(node: DOMElement | null): ClickRegionBounds | null {
  if (!node?.yogaNode) return null;
  const box = getBoundingBox(node);
  let left = Math.max(0, box.x);
  let top = Math.max(0, box.y);
  let right = Math.min(process.stdout.columns || Infinity, box.x + box.width);
  let bottom = Math.min(process.stdout.rows || Infinity, box.y + box.height);
  let current: DOMElement | undefined = node;
  let rooted = false;
  while (current) {
    if (current.style.display === "none" || current.isYogaTreeDetached) return null;
    if (current.nodeName === "ink-root") rooted = true;
    if (current !== node && current.yogaNode) {
      const bounds = getBoundingBox(current);
      const overflow = current.style.overflow ?? "visible";
      const overflowX = current.style.overflowX ?? overflow;
      const overflowY = current.style.overflowY ?? overflow;
      // Yoga's physical edge enum: left=0, top=1, right=2, bottom=3.
      if (overflowX === "hidden" || overflowX === "scroll") {
        left = Math.max(left, bounds.x + current.yogaNode.getComputedBorder(0));
        right = Math.min(right, bounds.x + bounds.width - current.yogaNode.getComputedBorder(2));
      }
      if (overflowY === "hidden" || overflowY === "scroll") {
        top = Math.max(top, bounds.y + current.yogaNode.getComputedBorder(1));
        bottom = Math.min(bottom, bounds.y + bounds.height - current.yogaNode.getComputedBorder(3));
      }
    }
    current = current.parentNode;
  }
  if (!rooted || right <= left || bottom <= top) return null;
  return { left: left + 1, top: top + 1, width: right - left, height: bottom - top };
}

export function Clickable({
  id,
  onClick,
  enabled = true,
  children,
  priority,
  width = "100%",
}: ClickableProps): React.JSX.Element {
  const node = useRef<DOMElement>(null);
  const interactionEnabled = useMouseInteractionEnabled();
  const activate = useMouseInteractionActivate();
  const handleClick = useCallback(
    (event: MouseEvent) => {
      activate?.();
      onClick(event);
    },
    [activate, onClick]
  );
  const measure = useCallback(() => getVisibleClickBounds(node.current), []);
  useClickRegion(
    { id, onClick: handleClick, enabled: enabled && interactionEnabled, priority },
    measure
  );
  return (
    <Box ref={node} width={width}>
      {children}
    </Box>
  );
}

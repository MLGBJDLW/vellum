import { type DOMElement, getVerticalScrollbarBoundingBox } from "ink";
import { type RefObject, useEffect, useRef } from "react";
import {
  useMouseContextOptional,
  useMouseInteractionActivate,
  useMouseInteractionEnabled,
} from "../../../../context/MouseContext.js";

interface ScrollbarDragOptions {
  containerRef: RefObject<DOMElement | null>;
  enabled: boolean;
  scrollTop: number;
  maxScroll: number;
  viewportHeight: number;
  scrollTo: (offset: number) => void;
}

/** Hit-test Ink's painted scrollbar and route gestures through the existing scroll owner. */
export function useScrollbarDrag(options: ScrollbarDragOptions): void {
  const mouse = useMouseContextOptional();
  const interactionEnabled = useMouseInteractionEnabled();
  const activate = useMouseInteractionActivate();
  const activateRef = useRef(activate);
  activateRef.current = activate;
  const current = useRef(options);
  current.current = options;
  const drag = useRef<{
    grabOffset: number;
    lastRow: number;
    track: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const onPointer = mouse?.onPointer;
  const cancelPointerCapture = mouse?.cancelPointerCapture;
  const enabled = options.enabled && interactionEnabled && mouse?.isMouseActive;
  const previousViewportHeight = useRef(options.viewportHeight);

  useEffect(() => {
    if (!enabled || !onPointer) return;
    return onPointer(
      (event) => {
        const latest = current.current;
        const node = latest.containerRef.current;
        const bar = node && getVerticalScrollbarBoundingBox(node);
        if (!bar || latest.maxScroll <= 0) {
          if (drag.current) cancelPointerCapture?.();
          drag.current = null;
          return false;
        }
        const x = event.col - 1;
        const y = event.row - 1;
        if (event.action === "press") {
          if (
            event.button !== "left" ||
            event.shift ||
            event.meta ||
            event.ctrl ||
            x < bar.x ||
            x >= bar.x + bar.width ||
            y < bar.y ||
            y >= bar.y + bar.height
          )
            return false;
          activateRef.current?.();
          if (y >= bar.thumb.y && y < bar.thumb.y + bar.thumb.height) {
            drag.current = {
              grabOffset: y - (bar.y + bar.thumb.startHalf / 2),
              lastRow: y,
              track: { x: bar.x, y: bar.y, width: bar.width, height: bar.height },
            };
          } else {
            const direction = y < bar.thumb.y ? -1 : 1;
            latest.scrollTo(latest.scrollTop + direction * latest.viewportHeight);
          }
          // Capture track clicks too, so release cannot activate content underneath.
          return true;
        }

        const active = drag.current;
        if (active && (event.action === "move" || event.action === "release")) {
          const resized =
            active.track.x !== bar.x ||
            active.track.y !== bar.y ||
            active.track.width !== bar.width ||
            active.track.height !== bar.height;
          if (resized) {
            cancelPointerCapture?.();
            drag.current = null;
            return false;
          }
          if (y !== active.lastRow) {
            const thumbHeight = (bar.thumb.endHalf - bar.thumb.startHalf) / 2;
            const travel = bar.height - thumbHeight;
            if (travel > 0) {
              const thumbTop = Math.max(0, Math.min(travel, y - bar.y - active.grabOffset));
              latest.scrollTo(Math.round((thumbTop / travel) * latest.maxScroll));
            }
            active.lastRow = y;
          }
        }
        if (event.action === "release") drag.current = null;
        return active !== null;
      },
      () => {
        drag.current = null;
      }
    );
  }, [enabled, onPointer, cancelPointerCapture]);

  useEffect(() => {
    if (previousViewportHeight.current !== options.viewportHeight && drag.current) {
      cancelPointerCapture?.();
    }
    previousViewportHeight.current = options.viewportHeight;
  }, [options.viewportHeight, cancelPointerCapture]);
}

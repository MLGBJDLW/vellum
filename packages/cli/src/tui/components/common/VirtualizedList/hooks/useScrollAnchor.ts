/** Stable item + row anchors; follow intent is supplied by the list's sticky-bottom owner. */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SCROLL_TO_ITEM_END, type ScrollAnchor } from "../types.js";
import { type BlockSumsState, findOffsetIndex } from "../utils/blockSums.js";

export interface UseScrollAnchorProps {
  readonly dataLength: number;
  readonly offsets: readonly number[];
  readonly heights: readonly number[];
  readonly totalHeight: number;
  readonly containerHeight: number;
  readonly initialScrollIndex?: number;
  readonly initialScrollOffsetInIndex?: number;
  /** Retained for callers that also use block sums to measure item heights. */
  readonly blockSumsState?: BlockSumsState;
  readonly enableCompensation?: boolean;
}

export interface UseScrollAnchorReturn {
  readonly scrollAnchor: ScrollAnchor;
  readonly setScrollAnchor: (anchor: ScrollAnchor) => void;
  readonly isStickingToBottom: boolean;
  readonly setIsStickingToBottom: (value: boolean) => void;
  readonly scrollTop: number;
  readonly getAnchorForScrollTop: (scrollTop: number) => ScrollAnchor;
  readonly anchorIndex: number;
  readonly anchorOffset: number;
}

export function useScrollAnchor({
  dataLength,
  offsets,
  heights,
  totalHeight,
  containerHeight,
  initialScrollIndex,
  initialScrollOffsetInIndex,
}: UseScrollAnchorProps): UseScrollAnchorReturn {
  const initiallyFollowing =
    initialScrollIndex === undefined ||
    initialScrollIndex === SCROLL_TO_ITEM_END ||
    (initialScrollIndex >= dataLength - 1 && initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);
  const [scrollAnchor, setScrollAnchorState] = useState<ScrollAnchor>(() => ({
    index: initiallyFollowing
      ? Math.max(0, dataLength - 1)
      : Math.max(0, Math.min(dataLength - 1, initialScrollIndex ?? 0)),
    offset: initiallyFollowing ? SCROLL_TO_ITEM_END : (initialScrollOffsetInIndex ?? 0),
  }));
  const [isStickingToBottom, setIsStickingToBottom] = useState(initiallyFollowing);
  const initialPositionApplied = useRef(dataLength > 0);
  const anchorRef = useRef(scrollAnchor);
  anchorRef.current = scrollAnchor;
  const setScrollAnchor = useCallback((next: ScrollAnchor) => {
    const previous = anchorRef.current;
    if (next.index === previous.index && next.offset === previous.offset) return;
    anchorRef.current = next;
    setScrollAnchorState(next);
  }, []);
  const maxScroll = Math.max(0, totalHeight - containerHeight);
  const getAnchorForScrollTop = useCallback(
    (position: number): ScrollAnchor => {
      if (dataLength === 0 || position <= 0) return { index: 0, offset: 0 };
      const index = Math.max(0, Math.min(dataLength - 1, findOffsetIndex(offsets, position)));
      return {
        index,
        offset: Math.max(0, Math.min(heights[index] ?? 0, position - (offsets[index] ?? 0))),
      };
    },
    [dataLength, offsets, heights]
  );

  // Updating offsets already compensates for height changes before this item.
  // Adding the prefix-sum delta to the row offset as well would move the reader twice.
  const anchorTop = offsets[scrollAnchor.index] ?? 0;
  const anchorRow = Math.min(
    scrollAnchor.offset,
    Math.max(0, (heights[scrollAnchor.index] ?? 1) - 1)
  );
  const unclampedScrollTop =
    scrollAnchor.offset === SCROLL_TO_ITEM_END
      ? anchorTop + (heights[scrollAnchor.index] ?? 0) - containerHeight
      : anchorTop + anchorRow;
  const scrollTop = Math.max(0, Math.min(maxScroll, unclampedScrollTop));
  const previousGeometry = useRef({ dataLength, totalHeight, containerHeight });

  useLayoutEffect(() => {
    const previous = previousGeometry.current;
    const geometryChanged =
      previous.dataLength !== dataLength ||
      previous.totalHeight !== totalHeight ||
      previous.containerHeight !== containerHeight;
    previousGeometry.current = { dataLength, totalHeight, containerHeight };

    if (dataLength === 0) {
      setScrollAnchor({ index: 0, offset: 0 });
    } else if (
      !initialPositionApplied.current &&
      totalHeight > 0 &&
      heights.length === dataLength
    ) {
      initialPositionApplied.current = true;
      setScrollAnchor(
        initiallyFollowing
          ? {
              index: dataLength - 1,
              offset: SCROLL_TO_ITEM_END,
            }
          : {
              index: Math.max(0, Math.min(dataLength - 1, initialScrollIndex ?? 0)),
              offset: initialScrollOffsetInIndex ?? 0,
            }
      );
    } else if (isStickingToBottom && geometryChanged) {
      setScrollAnchor({ index: dataLength - 1, offset: SCROLL_TO_ITEM_END });
    } else if (scrollAnchor.index >= dataLength) {
      setScrollAnchor(getAnchorForScrollTop(maxScroll));
    } else if (unclampedScrollTop > maxScroll) {
      setScrollAnchor(getAnchorForScrollTop(scrollTop));
    } else if (scrollAnchor.offset !== SCROLL_TO_ITEM_END && scrollAnchor.offset !== anchorRow) {
      setScrollAnchor({ index: scrollAnchor.index, offset: anchorRow });
    }
    // Never infer follow intent from proximity to the tail or from a resize.
  }, [
    dataLength,
    totalHeight,
    containerHeight,
    isStickingToBottom,
    scrollAnchor.index,
    unclampedScrollTop,
    maxScroll,
    scrollTop,
    getAnchorForScrollTop,
    setScrollAnchor,
    initiallyFollowing,
    initialScrollIndex,
    initialScrollOffsetInIndex,
    scrollAnchor.offset,
    anchorRow,
    heights.length,
  ]);

  const visibleAnchor = getAnchorForScrollTop(scrollTop);
  return {
    scrollAnchor,
    setScrollAnchor,
    isStickingToBottom,
    setIsStickingToBottom,
    scrollTop,
    getAnchorForScrollTop,
    anchorIndex: visibleAnchor.index,
    anchorOffset: visibleAnchor.offset,
  };
}

/**
 * Click Region Registry
 *
 * Manages clickable regions in absolute terminal coordinates.
 * Performs hit-testing on mouse click events and dispatches to
 * the highest-priority matching handler.
 *
 * @module tui/utils/click-region
 */

import type { MouseEvent } from "./mouse-parser.js";

// =============================================================================
// Types
// =============================================================================

/**
 * A clickable region in terminal coordinates.
 */
export interface ClickRegion {
  /** Unique identifier for this region */
  readonly id: string;
  /** Top edge, 1-based row */
  readonly top: number;
  /** Left edge, 1-based column */
  readonly left: number;
  /** Bottom edge, 1-based row (inclusive) */
  readonly bottom: number;
  /** Right edge, 1-based column (inclusive) */
  readonly right: number;
  /** Handler called when region is clicked */
  readonly onClick: (event: MouseEvent) => void;
  /** Priority for overlapping regions (higher wins, default: 0) */
  readonly priority?: number;
}

// =============================================================================
// Registry
// =============================================================================

/**
 * Registry for click regions.
 *
 * Components register rectangular regions with click handlers.
 * On dispatch, hit-tests all regions and calls the highest-priority match.
 */
export class ClickRegionRegistry {
  readonly #regions = new Map<string, ClickRegion>();

  /**
   * Register a click region.
   * If a region with the same id already exists, it is replaced.
   *
   * @returns Unregister function.
   */
  register(region: ClickRegion): () => void {
    this.#regions.set(region.id, region);
    return () => {
      // Only delete if the region hasn't been replaced
      if (this.#regions.get(region.id) === region) {
        this.#regions.delete(region.id);
      }
    };
  }

  /**
   * Dispatch a click event at the given terminal coordinates.
   * Finds all regions containing (col, row), sorts by priority descending,
   * and calls the highest-priority handler.
   *
   * @returns true if a handler was called.
   */
  dispatch(col: number, row: number, event: MouseEvent): boolean {
    const hits: ClickRegion[] = [];

    for (const region of this.#regions.values()) {
      if (col >= region.left && col <= region.right && row >= region.top && row <= region.bottom) {
        hits.push(region);
      }
    }

    if (hits.length === 0) return false;

    // Sort by priority descending (higher priority first)
    hits.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const winner = hits[0];
    if (winner) {
      winner.onClick(event);
    }

    return true;
  }

  /**
   * Remove all registered regions.
   */
  clear(): void {
    this.#regions.clear();
  }

  /**
   * Number of currently registered regions (useful for debugging).
   */
  get size(): number {
    return this.#regions.size;
  }
}

// =============================================================================
// Singleton
// =============================================================================

/**
 * Global click region registry singleton.
 * Components register regions here; MouseProvider dispatches clicks through it.
 */
export const globalClickRegistry = new ClickRegionRegistry();

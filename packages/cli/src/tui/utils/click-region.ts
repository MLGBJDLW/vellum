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
  readonly top?: number;
  /** Left edge, 1-based column */
  readonly left?: number;
  /** Bottom edge, 1-based row (inclusive) */
  readonly bottom?: number;
  /** Right edge, 1-based column (inclusive) */
  readonly right?: number;
  /** Live measured bounds; null means hidden or detached. Evaluated at dispatch. */
  readonly getBounds?: () => ClickRegionEdges | null;
  /** Handler called when region is clicked */
  readonly onClick: (event: MouseEvent) => void;
  /** Priority for overlapping regions (higher wins, default: 0) */
  readonly priority?: number;
}

export interface ClickRegionEdges {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
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
  #pressed: { region: ClickRegion; col: number; row: number; moved: boolean } | null = null;

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
        if (this.#pressed?.region === region) this.cancelGesture();
      }
    };
  }

  /**
   * Find the highest-priority visible target at terminal coordinates.
   */
  hitTest(col: number, row: number): ClickRegion | undefined {
    const hits: ClickRegion[] = [];

    for (const region of this.#regions.values()) {
      const bounds = region.getBounds ? region.getBounds() : region;
      if (
        bounds?.left !== undefined &&
        bounds.right !== undefined &&
        bounds.top !== undefined &&
        bounds.bottom !== undefined &&
        col >= bounds.left &&
        col <= bounds.right &&
        row >= bounds.top &&
        row <= bounds.bottom
      ) {
        hits.push(region);
      }
    }
    hits.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return hits[0];
  }

  /** Primary press/release on the same live target activates once; motion cancels. */
  dispatch(col: number, row: number, event: MouseEvent): boolean {
    if (event.action === "press") {
      this.cancelGesture();
      const region = event.button === "left" ? this.hitTest(col, row) : undefined;
      if (region) this.#pressed = { region, col, row, moved: false };
      return region !== undefined;
    }
    const pressed = this.#pressed;
    if (event.action === "move") {
      if (pressed && (pressed.col !== col || pressed.row !== row)) pressed.moved = true;
      return pressed !== null;
    }
    if (event.action !== "release") return false;
    this.cancelGesture();
    if (
      !pressed ||
      pressed.moved ||
      pressed.col !== col ||
      pressed.row !== row ||
      (event.button !== "left" && event.button !== "none") ||
      this.hitTest(col, row) !== pressed.region
    )
      return false;
    pressed.region.onClick(event);
    return true;
  }

  cancelGesture(): void {
    this.#pressed = null;
  }

  /**
   * Remove all registered regions.
   */
  clear(): void {
    this.cancelGesture();
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

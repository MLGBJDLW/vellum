/**
 * Block Sums - O(n/BLOCK_SIZE + BLOCK_SIZE) prefix sum queries
 *
 * For typical usage (<1000 items):
 * - Update single height: O(1)
 * - Prefix sum query: O(n/32 + 32) ≈ O(1) for practical sizes
 * - Anchor delta computation: <0.1ms
 *
 * Block structure visualization:
 * items:    [0, 1, 2, ... 31] [32, 33, ... 63] [64, 65, ... 95] ...
 * blocks:   [    block 0    ] [    block 1   ] [    block 2   ] ...
 * blockSums:[  sum(0..31)   ] [ sum(32..63)  ] [ sum(64..95)  ] ...
 */

/** Block size - optimized for typical message list sizes */
const BLOCK_SIZE = 32;

export interface BlockSumsState {
  /** Individual item heights */
  readonly heights: readonly number[];
  /** Pre-computed sums for each block of BLOCK_SIZE items */
  readonly blockSums: readonly number[];
  /** Cached total height */
  readonly totalHeight: number;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Get block index for a given item index */
function getBlockIndex(index: number): number {
  return Math.floor(index / BLOCK_SIZE);
}

/** Compute sum of a single block from heights array */
function computeBlockSum(heights: readonly number[], blockIndex: number): number {
  const start = blockIndex * BLOCK_SIZE;
  const end = Math.min(start + BLOCK_SIZE, heights.length);
  let sum = 0;
  for (let i = start; i < end; i++) {
    // Safe: loop bounds ensure i is within heights.length
    sum += heights[i] as number;
  }
  return sum;
}

/** Rebuild all blockSums from heights array */
function rebuildBlockSums(heights: readonly number[]): number[] {
  const numBlocks = Math.ceil(heights.length / BLOCK_SIZE);
  const blockSums: number[] = new Array(numBlocks);
  for (let b = 0; b < numBlocks; b++) {
    blockSums[b] = computeBlockSum(heights, b);
  }
  return blockSums;
}

/** Compute total from blockSums array */
function computeTotalHeight(blockSums: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < blockSums.length; i++) {
    // Safe: loop bounds ensure i is within blockSums.length
    total += blockSums[i] as number;
  }
  return total;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create initial state from heights array
 */
export function createBlockSums(initialHeights?: number[]): BlockSumsState {
  const heights = initialHeights ? [...initialHeights] : [];
  const blockSums = rebuildBlockSums(heights);
  const totalHeight = computeTotalHeight(blockSums);
  return { heights, blockSums, totalHeight };
}

/**
 * Update height at specific index (immutable - returns new state)
 * Returns same reference if no change
 */
export function updateHeight(
  state: BlockSumsState,
  index: number,
  newHeight: number
): BlockSumsState {
  // Bounds check - return same reference for invalid index
  if (index < 0 || index >= state.heights.length) {
    return state;
  }

  // Safe: bounds already checked above
  const oldHeight = state.heights[index] as number;

  // Reference stability - return same reference if no change
  if (oldHeight === newHeight) {
    return state;
  }

  const delta = newHeight - oldHeight;
  const blockIndex = getBlockIndex(index);

  // Create new heights array with updated value
  const newHeights = [...state.heights];
  newHeights[index] = newHeight;

  // Create new blockSums array with updated block
  // Safe: blockIndex derived from valid index
  const newBlockSums = [...state.blockSums];
  newBlockSums[blockIndex] = (state.blockSums[blockIndex] as number) + delta;

  return {
    heights: newHeights,
    blockSums: newBlockSums,
    totalHeight: state.totalHeight + delta,
  };
}

/**
 * Batch update multiple heights (more efficient than multiple updateHeight calls)
 */
export function batchUpdateHeights(
  state: BlockSumsState,
  updates: Array<{ index: number; height: number }>
): BlockSumsState {
  if (updates.length === 0) {
    return state;
  }

  // Filter valid updates and check for actual changes
  const validUpdates = updates.filter(
    ({ index, height }) =>
      index >= 0 && index < state.heights.length && state.heights[index] !== height
  );

  // Reference stability - return same reference if no effective changes
  if (validUpdates.length === 0) {
    return state;
  }

  // Create new heights array
  const newHeights = [...state.heights];

  // Track which blocks need updating and by how much
  const blockDeltas = new Map<number, number>();
  let totalDelta = 0;

  for (const { index, height } of validUpdates) {
    // Safe: validUpdates filtered to only contain valid indices
    const oldHeight = state.heights[index] as number;
    const delta = height - oldHeight;
    newHeights[index] = height;

    const blockIndex = getBlockIndex(index);
    blockDeltas.set(blockIndex, (blockDeltas.get(blockIndex) ?? 0) + delta);
    totalDelta += delta;
  }

  // Create new blockSums array with updated blocks
  const newBlockSums = [...state.blockSums];
  for (const [blockIndex, delta] of blockDeltas) {
    // Safe: blockIndex derived from valid index
    newBlockSums[blockIndex] = (state.blockSums[blockIndex] as number) + delta;
  }

  return {
    heights: newHeights,
    blockSums: newBlockSums,
    totalHeight: state.totalHeight + totalDelta,
  };
}

/**
 * Append new heights to the end (common case for new messages)
 */
export function appendHeights(state: BlockSumsState, newHeights: number[]): BlockSumsState {
  // Reference stability - return same reference if nothing to append
  if (newHeights.length === 0) {
    return state;
  }

  const heights = [...state.heights, ...newHeights];

  // Determine which blocks need updating
  const oldLength = state.heights.length;
  const lastOldBlockIndex = oldLength > 0 ? getBlockIndex(oldLength - 1) : -1;
  const firstNewBlockIndex = getBlockIndex(oldLength);

  // Copy existing blockSums
  const blockSums = [...state.blockSums];

  // If the last old block is partial and receives new items, recalculate it
  if (lastOldBlockIndex === firstNewBlockIndex && lastOldBlockIndex >= 0) {
    blockSums[lastOldBlockIndex] = computeBlockSum(heights, lastOldBlockIndex);
  }

  // Add new blocks as needed
  const numBlocks = Math.ceil(heights.length / BLOCK_SIZE);
  for (let b = blockSums.length; b < numBlocks; b++) {
    blockSums.push(computeBlockSum(heights, b));
  }

  // Calculate added sum efficiently
  let addedSum = 0;
  for (let i = 0; i < newHeights.length; i++) {
    // Safe: loop bounds ensure i is within newHeights.length
    addedSum += newHeights[i] as number;
  }

  return {
    heights,
    blockSums,
    totalHeight: state.totalHeight + addedSum,
  };
}

/**
 * Remove heights from the beginning (for circular buffer eviction)
 * Note: O(n) operation since all indices shift
 */
export function removeFromStart(state: BlockSumsState, count: number): BlockSumsState {
  // Reference stability - return same reference if nothing to remove
  if (count <= 0) {
    return state;
  }

  // Handle removing all items
  if (count >= state.heights.length) {
    return { heights: [], blockSums: [], totalHeight: 0 };
  }

  const newHeights = state.heights.slice(count);

  // Rebuild blockSums since all indices shift after removal
  const newBlockSums = rebuildBlockSums(newHeights);
  const newTotalHeight = computeTotalHeight(newBlockSums);

  return {
    heights: newHeights,
    blockSums: newBlockSums,
    totalHeight: newTotalHeight,
  };
}

/**
 * Get prefix sum up to (but not including) the given index
 * O(n/BLOCK_SIZE + BLOCK_SIZE) complexity
 *
 * Example: prefixSum(50) calculation:
 * 1. Full blocks before index 50: block 0 (items 0-31) → blockSums[0]
 * 2. Partial block: items 32-49 → sum individually
 * Result: blockSums[0] + heights[32] + heights[33] + ... + heights[49]
 */
export function prefixSum(state: BlockSumsState, upToIndex: number): number {
  if (upToIndex <= 0) {
    return 0;
  }

  const clampedIndex = Math.min(upToIndex, state.heights.length);

  // Count full blocks before the target index
  const fullBlocks = getBlockIndex(clampedIndex);

  // Sum all full blocks
  let sum = 0;
  for (let b = 0; b < fullBlocks; b++) {
    // Safe: loop bounds ensure b is within blockSums.length
    sum += state.blockSums[b] as number;
  }

  // Add partial block (items from start of last block to clampedIndex)
  const partialStart = fullBlocks * BLOCK_SIZE;
  for (let i = partialStart; i < clampedIndex; i++) {
    // Safe: loop bounds ensure i is within heights.length
    sum += state.heights[i] as number;
  }

  return sum;
}

/**
 * Get height at specific index
 * Returns 0 for out-of-bounds indices
 */
export function getHeight(state: BlockSumsState, index: number): number {
  if (index < 0 || index >= state.heights.length) {
    return 0;
  }
  // Safe: bounds already checked above
  return state.heights[index] as number;
}

/**
 * Compute scroll delta needed to maintain anchor position
 * when heights before anchor have changed
 *
 * @param state Current block sums state
 * @param oldPrefixSum Previous prefix sum at anchor index
 * @param anchorIndex Index of the anchor item
 * @returns Delta to add to scrollTop to maintain visual position
 */
export function computeAnchorDelta(
  state: BlockSumsState,
  oldPrefixSum: number,
  anchorIndex: number
): number {
  const newPrefixSum = prefixSum(state, anchorIndex);
  return newPrefixSum - oldPrefixSum;
}

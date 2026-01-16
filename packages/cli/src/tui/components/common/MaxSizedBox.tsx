/**
 * MaxSizedBox Component
 *
 * A container component that limits content to a maximum size
 * and shows a "Show More" indicator when content is truncated.
 *
 * This component is essential for preventing overflow in terminal UIs
 * while maintaining a good user experience by indicating when content
 * has been truncated.
 *
 * Ported from Gemini CLI for Vellum TUI.
 *
 * @module tui/components/common/MaxSizedBox
 */

import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useOverflowOptional } from "../../context/OverflowContext.js";
import { useFlickerDetector } from "../../hooks/useFlickerDetector.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MaxSizedBox component
 */
export interface MaxSizedBoxProps {
  /** Content to render (will be truncated if exceeds maxHeight) */
  readonly children: ReactNode;
  /** Maximum height in rows/lines */
  readonly maxHeight: number;
  /** Minimum height in rows/lines (default: 1) */
  readonly minHeight?: number;
  /**
   * Text to show when content is truncated.
   * Set to null to hide the indicator.
   * @default "... (more)"
   */
  readonly truncationIndicator?: string | null;
  /**
   * Color for the truncation indicator
   * @default "dim"
   */
  readonly indicatorColor?: string;
  /**
   * Callback when expanded state changes
   * @param expanded - Whether the content is now expanded
   */
  readonly onExpandChange?: (expanded: boolean) => void;
  /**
   * Callback when overflow state changes
   * @param isOverflowing - Whether content is currently overflowing
   */
  readonly onOverflowChange?: (isOverflowing: boolean) => void;
  /**
   * Initial expanded state (default: false)
   */
  readonly initialExpanded?: boolean;
  /**
   * Allow expanding the content (default: false)
   * When true, the truncation indicator becomes "Show More" / "Show Less"
   */
  readonly expandable?: boolean;
  /**
   * Unique ID for overflow tracking (auto-generated if not provided)
   */
  readonly id?: string;
  /** Width of the box (default: 100%) */
  readonly width?: number | string;
  /** Padding within the box */
  readonly padding?: number;
  /** Horizontal padding */
  readonly paddingX?: number;
  /** Vertical padding */
  readonly paddingY?: number;
}

/**
 * State returned by the MaxSizedBox for external control
 */
export interface MaxSizedBoxState {
  /** Whether content is currently overflowing */
  readonly isOverflowing: boolean;
  /** Whether content is currently expanded */
  readonly isExpanded: boolean;
  /** Measured content height */
  readonly contentHeight: number;
  /** Amount of overflow (0 if content fits) */
  readonly overflowAmount: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default truncation indicator text */
const DEFAULT_TRUNCATION_INDICATOR = "... (more)";

/** Expandable show more text */
const SHOW_MORE_TEXT = "▼ Show More";

/** Expandable show less text */
const SHOW_LESS_TEXT = "▲ Show Less";

// =============================================================================
// Component
// =============================================================================

/**
 * MaxSizedBox limits content to a maximum height with optional truncation indicator.
 *
 * Features:
 * - **Height limiting**: Prevents content from exceeding specified bounds
 * - **Truncation indicator**: Shows when content is cut off
 * - **Expandable mode**: Optional expand/collapse functionality
 * - **Overflow tracking**: Integrates with OverflowContext
 * - **Flicker prevention**: Uses debounced overflow detection
 *
 * @example
 * ```tsx
 * // Basic usage - truncate at 10 rows
 * <MaxSizedBox maxHeight={10}>
 *   <Text>{longContent}</Text>
 * </MaxSizedBox>
 *
 * // With expand functionality
 * <MaxSizedBox
 *   maxHeight={5}
 *   expandable
 *   onExpandChange={(expanded) => console.log('Expanded:', expanded)}
 * >
 *   <CodeBlock code={sourceCode} />
 * </MaxSizedBox>
 *
 * // Custom truncation indicator
 * <MaxSizedBox
 *   maxHeight={20}
 *   truncationIndicator="[Content truncated...]"
 *   indicatorColor="yellow"
 * >
 *   <LogOutput logs={logs} />
 * </MaxSizedBox>
 *
 * // Hide truncation indicator
 * <MaxSizedBox maxHeight={10} truncationIndicator={null}>
 *   <Content />
 * </MaxSizedBox>
 * ```
 */
export function MaxSizedBox({
  children,
  maxHeight,
  minHeight = 1,
  truncationIndicator = DEFAULT_TRUNCATION_INDICATOR,
  indicatorColor = "dim",
  onExpandChange,
  onOverflowChange,
  initialExpanded = false,
  expandable = false,
  id: providedId,
  width = "100%",
  padding,
  paddingX,
  paddingY,
}: MaxSizedBoxProps): React.JSX.Element {
  // Generate unique ID if not provided
  const generatedId = useId();
  const componentId = providedId ?? generatedId;

  // Expansion state
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Content measurement
  const contentRef = useRef<DOMElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  // Optional overflow context integration
  const overflowContext = useOverflowOptional();

  // Flicker detection for stable overflow state
  const { isOverflowing, overflow } = useFlickerDetector({
    contentHeight: measuredHeight,
    containerHeight: maxHeight,
    threshold: 0,
    debounce: true,
  });

  /**
   * Measure content height on mount and updates
   */
  const measureContent = useCallback(() => {
    if (contentRef.current) {
      // In Ink, we estimate height based on the rendered output
      // This is a simplified measurement - actual implementation may
      // need to parse ANSI output or use Ink's measurement APIs
      const element = contentRef.current;
      const yogaNode = element.yogaNode;
      if (yogaNode) {
        const computedHeight = yogaNode.getComputedHeight();
        setMeasuredHeight(Math.ceil(computedHeight));
      }
    }
  }, []);

  /**
   * Effect to measure content on mount.
   * Measurement happens on every render since content could change.
   * We call measureContent directly in the effect body which captures
   * the current contentRef value.
   */
  useEffect(() => {
    measureContent();
  });

  /**
   * Effect to notify parent of overflow changes
   */
  useEffect(() => {
    onOverflowChange?.(isOverflowing);
  }, [isOverflowing, onOverflowChange]);

  /**
   * Effect to register/unregister with overflow context
   */
  useEffect(() => {
    if (!overflowContext) return;

    if (isOverflowing && !isExpanded) {
      overflowContext.registerOverflow(componentId);
    } else {
      overflowContext.unregisterOverflow(componentId);
    }

    return () => {
      overflowContext.unregisterOverflow(componentId);
    };
  }, [isOverflowing, isExpanded, componentId, overflowContext]);

  /**
   * Handle expand/collapse toggle.
   * Reserved for future interactive functionality (keyboard/click handlers).
   */
  const _handleToggleExpand = useCallback(() => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  }, [isExpanded, onExpandChange]);

  // Preserve reference for future use
  void _handleToggleExpand;

  /**
   * Calculate effective height
   */
  const effectiveHeight = useMemo(() => {
    if (isExpanded) {
      // When expanded, use measured height (no limit)
      return Math.max(minHeight, measuredHeight);
    }
    // When collapsed, limit to maxHeight
    return Math.max(minHeight, Math.min(maxHeight, measuredHeight));
  }, [isExpanded, maxHeight, minHeight, measuredHeight]);

  /**
   * Determine if truncation indicator should show
   */
  const showTruncationIndicator = useMemo(() => {
    // Don't show if no indicator text
    if (truncationIndicator === null) return false;
    // Show if overflowing and not expanded
    return isOverflowing && !isExpanded;
  }, [truncationIndicator, isOverflowing, isExpanded]);

  /**
   * Get indicator text based on mode
   */
  const indicatorText = useMemo(() => {
    if (expandable) {
      return isExpanded ? SHOW_LESS_TEXT : SHOW_MORE_TEXT;
    }
    return truncationIndicator;
  }, [expandable, isExpanded, truncationIndicator]);

  /**
   * Render the content with optional truncation
   */
  const resolvedHeight = measuredHeight > 0 ? effectiveHeight : undefined;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={resolvedHeight}
      overflow="hidden"
      padding={padding}
      paddingX={paddingX}
      paddingY={paddingY}
    >
      {/* Content container */}
      <Box ref={contentRef} flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>

      {/* Truncation indicator */}
      {showTruncationIndicator && indicatorText && (
        <Box>
          <Text color={indicatorColor} dimColor={!expandable}>
            {indicatorText}
            {overflow > 0 && !expandable && ` (+${overflow} lines)`}
          </Text>
        </Box>
      )}

      {/* Show "Show Less" when expanded */}
      {expandable && isExpanded && (
        <Box>
          <Text color={indicatorColor}>{SHOW_LESS_TEXT}</Text>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Convenience Hook
// =============================================================================

/**
 * Hook to get MaxSizedBox-like overflow calculations without the component.
 * Useful for custom implementations that need the same logic.
 *
 * @param contentHeight - Current content height
 * @param maxHeight - Maximum allowed height
 * @returns Overflow state and metrics
 */
export function useMaxSizedBox(contentHeight: number, maxHeight: number): MaxSizedBoxState {
  const { isOverflowing, overflow } = useFlickerDetector({
    contentHeight,
    containerHeight: maxHeight,
    threshold: 0,
  });

  return useMemo(
    () => ({
      isOverflowing,
      isExpanded: false,
      contentHeight,
      overflowAmount: Math.max(0, overflow),
    }),
    [isOverflowing, contentHeight, overflow]
  );
}

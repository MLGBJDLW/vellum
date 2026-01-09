/**
 * Layout Component (T033)
 *
 * Main application layout with configurable regions:
 * - Header (top)
 * - Sidebar (optional, left)
 * - Content (main area)
 * - Footer (bottom)
 *
 * Supports compact mode for narrow terminals (< 80 columns).
 *
 * @module tui/components/Layout
 */

import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Compact mode threshold in columns */
const COMPACT_THRESHOLD = 80;

/** Default sidebar width percentage */
const SIDEBAR_WIDTH_PERCENT = 25;

/** Minimum sidebar width in columns */
const SIDEBAR_MIN_WIDTH = 20;

/** Maximum sidebar width in columns */
const SIDEBAR_MAX_WIDTH = 40;

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the Layout component.
 */
export interface LayoutProps {
  /** Header region content (top) */
  readonly header?: React.ReactNode;
  /** Footer region content (bottom) */
  readonly footer?: React.ReactNode;
  /** Sidebar region content (left) */
  readonly sidebar?: React.ReactNode;
  /** Main content area */
  readonly children: React.ReactNode;
  /** Whether to show the sidebar (default: true if sidebar provided) */
  readonly showSidebar?: boolean;
  /** Force compact mode or auto-detect based on terminal width */
  readonly compactMode?: boolean;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to get terminal dimensions and listen for resize events.
 * Returns { columns, rows } with defaults for non-TTY environments.
 */
function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  useEffect(() => {
    function updateSize() {
      setSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    }

    process.stdout.on("resize", updateSize);
    return () => {
      process.stdout.off("resize", updateSize);
    };
  }, []);

  return size;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Simple horizontal line separator.
 */
interface SeparatorProps {
  readonly color: string;
  readonly style?: "single" | "double";
}

function Separator({ color, style = "single" }: SeparatorProps): React.JSX.Element {
  // Use box-drawing characters for separators
  const char = style === "double" ? "═" : "─";
  // Repeat enough to fill typical terminal widths
  const line = char.repeat(200);
  return (
    <Box width="100%">
      <Text color={color}>{line}</Text>
    </Box>
  );
}

/**
 * Header region of the layout.
 * Borderless design with simple line separator below.
 */
interface HeaderRegionProps {
  readonly children: React.ReactNode;
  readonly borderColor: string;
}

function HeaderRegion({ children, borderColor }: HeaderRegionProps): React.JSX.Element {
  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1}>{children}</Box>
      <Separator color={borderColor} />
    </Box>
  );
}

/**
 * Footer region of the layout.
 * Uses double-line separator above for visual emphasis.
 */
interface FooterRegionProps {
  readonly children: React.ReactNode;
  readonly borderColor: string;
}

function FooterRegion({ children, borderColor }: FooterRegionProps): React.JSX.Element {
  return (
    <Box flexDirection="column" width="100%">
      <Separator color={borderColor} style="double" />
      <Box paddingX={1}>{children}</Box>
    </Box>
  );
}

/**
 * Sidebar region of the layout.
 */
interface SidebarRegionProps {
  readonly children: React.ReactNode;
  readonly width: number;
  readonly borderColor: string;
}

function SidebarRegion({ children, width, borderColor }: SidebarRegionProps): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={borderColor}
      borderRight={true}
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
      paddingX={1}
    >
      {children}
    </Box>
  );
}

/**
 * Content region of the layout.
 */
interface ContentRegionProps {
  readonly children: React.ReactNode;
}

function ContentRegion({ children }: ContentRegionProps): React.JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {children}
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Layout provides the main application structure with configurable regions.
 *
 * The layout structure:
 * ```
 * ┌─────────────────────────────┐
 * │         Header              │
 * ├──────────┬──────────────────┤
 * │ Sidebar  │     Content      │
 * │ (opt)    │                  │
 * ├──────────┴──────────────────┤
 * │         Footer              │
 * └─────────────────────────────┘
 * ```
 *
 * Features:
 * - Three main regions: header, content, footer
 * - Optional sidebar (left side, collapsible)
 * - Auto-detect compact mode for narrow terminals
 * - Theme-aware border colors
 *
 * @example
 * ```tsx
 * // Basic layout with header and footer
 * <Layout
 *   header={<Text>My App</Text>}
 *   footer={<StatusBar />}
 * >
 *   <MainContent />
 * </Layout>
 *
 * // Layout with sidebar
 * <Layout
 *   header={<Header />}
 *   sidebar={<Navigation />}
 *   footer={<StatusBar />}
 *   showSidebar={true}
 * >
 *   <MainContent />
 * </Layout>
 *
 * // Force compact mode
 * <Layout compactMode={true}>
 *   <Content />
 * </Layout>
 * ```
 */
export function Layout({
  header,
  footer,
  sidebar,
  children,
  showSidebar,
  compactMode,
}: LayoutProps): React.JSX.Element {
  const { theme } = useTheme();
  const { columns } = useTerminalSize();

  // Determine if we should be in compact mode
  const isCompact = useMemo(() => {
    if (compactMode !== undefined) {
      return compactMode;
    }
    return columns < COMPACT_THRESHOLD;
  }, [compactMode, columns]);

  // Determine if sidebar should be visible
  const sidebarVisible = useMemo(() => {
    // If explicitly set, use that value
    if (showSidebar !== undefined) {
      return showSidebar && !isCompact;
    }
    // Auto-show if sidebar content is provided and not in compact mode
    return !!sidebar && !isCompact;
  }, [showSidebar, sidebar, isCompact]);

  // Calculate sidebar width based on terminal width
  const sidebarWidth = useMemo(() => {
    if (!sidebarVisible) {
      return 0;
    }
    const calculatedWidth = Math.floor(columns * (SIDEBAR_WIDTH_PERCENT / 100));
    return Math.min(Math.max(calculatedWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
  }, [sidebarVisible, columns]);

  // Get border colors from theme - use focus color for header/footer, default for sidebar
  const headerBorderColor = theme.colors.primary;
  const footerBorderColor = theme.semantic.border.focus;
  const sidebarBorderColor = theme.semantic.border.default;

  return (
    <Box flexDirection="column" width="100%">
      {/* Header Region */}
      {header && <HeaderRegion borderColor={headerBorderColor}>{header}</HeaderRegion>}

      {/* Middle Section: Sidebar + Content */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Sidebar Region (optional) */}
        {sidebarVisible && sidebar && (
          <SidebarRegion width={sidebarWidth} borderColor={sidebarBorderColor}>
            {sidebar}
          </SidebarRegion>
        )}

        {/* Content Region */}
        <ContentRegion>{children}</ContentRegion>
      </Box>

      {/* Footer Region */}
      {footer && <FooterRegion borderColor={footerBorderColor}>{footer}</FooterRegion>}
    </Box>
  );
}

/**
 * Export hook for components that need terminal size.
 */
export { useTerminalSize };

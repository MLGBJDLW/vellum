/**
 * Layout Component (T033)
 *
 * Main application layout with configurable regions:
 * - Header (top)
 * - Sidebar (optional, right)
 * - Content (main area)
 * - Footer (bottom)
 *
 * Supports compact mode for narrow terminals (< 80 columns).
 *
 * @module tui/components/Layout
 */

import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTerminalDimensions } from "../hooks/useTerminalSize.js";
import { getAlternateBufferEnabled } from "../i18n/settings-integration.js";
import { useTheme } from "../theme/index.js";
import { tuiConfig } from "./theme/tokens.js";

// =============================================================================
// Constants (from tuiConfig with ENV overrides)
// =============================================================================

/** Compact mode threshold in columns */
const COMPACT_THRESHOLD = tuiConfig.layout.compactThreshold;

/** Default sidebar width percentage */
const SIDEBAR_WIDTH_PERCENT = tuiConfig.layout.sidebarWidthPercent;

/** Minimum sidebar width in columns */
const SIDEBAR_MIN_WIDTH = tuiConfig.layout.sidebarMinWidth;

/** Maximum sidebar width in columns */
const SIDEBAR_MAX_WIDTH = tuiConfig.layout.sidebarMaxWidth;

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
  /** Sidebar region content (right) */
  readonly sidebar?: React.ReactNode;
  /** Main content area */
  readonly children: React.ReactNode;
  /** Whether to show the sidebar (default: true if sidebar provided) */
  readonly showSidebar?: boolean;
  /** Force compact mode or auto-detect based on terminal width */
  readonly compactMode?: boolean;
  /** Workspace name to show in header separator */
  readonly workspace?: string;
  /** Git branch to show in header separator */
  readonly branch?: string;
  /** Number of changed files to show in header separator */
  readonly changedFiles?: number;
}

// =============================================================================
// Hooks
// =============================================================================

// Terminal dimensions hook moved to hooks/useTerminalSize.ts
// Uses useTerminalDimensions from that module for resize handling

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Horizontal line separator with optional embedded info.
 */
interface SeparatorProps {
  readonly color: string;
  readonly style?: "single" | "double";
  /** Workspace name to embed in the separator */
  readonly workspace?: string;
  /** Git branch to embed in the separator */
  readonly branch?: string;
  /** Number of changed files */
  readonly changedFiles?: number;
}

/** Minimum line chars on each side of embedded info */
const MIN_LINE_PADDING = 4;

function Separator({
  color,
  style = "single",
  workspace,
  branch,
  changedFiles,
}: SeparatorProps): React.JSX.Element {
  const { width: columns } = useTerminalDimensions();
  const char = style === "double" ? "═" : "─";

  // If no embedded info, render simple line
  if (!workspace && !branch) {
    const line = char.repeat(columns);
    return (
      <Box width="100%">
        <Text color={color} wrap="truncate-end">
          {line}
        </Text>
      </Box>
    );
  }

  // Build embedded info string: "[ workspace | branch *N ]"
  const parts: string[] = [];
  if (workspace) {
    parts.push(workspace);
  }
  if (branch) {
    let branchPart = branch;
    if (changedFiles && changedFiles > 0) {
      branchPart += ` *${changedFiles}`;
    }
    parts.push(branchPart);
  }

  const infoText = parts.length > 0 ? `[ ${parts.join(" | ")} ]` : "";
  const infoLength = infoText.length;

  // Calculate available space for line chars
  const availableSpace = columns - infoLength;

  // If not enough space, fall back to simple line
  if (availableSpace < MIN_LINE_PADDING * 2) {
    const line = char.repeat(columns);
    return (
      <Box width="100%">
        <Text color={color} wrap="truncate-end">
          {line}
        </Text>
      </Box>
    );
  }

  // Distribute line chars: more on right side for visual balance
  const leftPadding = MIN_LINE_PADDING;
  const rightPadding = availableSpace - leftPadding;

  const leftLine = char.repeat(leftPadding);
  const rightLine = char.repeat(Math.max(0, rightPadding));

  return (
    <Box width="100%">
      <Text color={color} wrap="truncate-end">
        {leftLine}
        {infoText}
        {rightLine}
      </Text>
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
  /** Workspace name to show in separator */
  readonly workspace?: string;
  /** Git branch to show in separator */
  readonly branch?: string;
  /** Number of changed files */
  readonly changedFiles?: number;
}

function HeaderRegion({
  children,
  borderColor,
  workspace,
  branch,
  changedFiles,
}: HeaderRegionProps): React.JSX.Element {
  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1}>{children}</Box>
      <Separator
        color={borderColor}
        workspace={workspace}
        branch={branch}
        changedFiles={changedFiles}
      />
    </Box>
  );
}

/**
 * Footer region of the layout.
 * Uses single-line separator above (double caused visual confusion with progress bars).
 * Footer has flexShrink={0} to prevent compression.
 */
interface FooterRegionProps {
  readonly children: React.ReactNode;
  readonly borderColor: string;
}

function FooterRegion({ children, borderColor }: FooterRegionProps): React.JSX.Element {
  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      <Separator color={borderColor} style="single" />
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
      flexBasis={width}
      flexShrink={1}
      flexGrow={0}
      width={width}
      minHeight={0}
      borderStyle="single"
      borderColor={borderColor}
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      paddingX={1}
      overflow="hidden"
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
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      paddingX={1}
      overflow="hidden"
    >
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
 * ├──────────────────┬──────────┤
 * │     Content      │ Sidebar  │
 * │                  │ (opt)    │
 * ├──────────────────┴──────────┤
 * │         Footer              │
 * └─────────────────────────────┘
 * ```
 *
 * Features:
 * - Three main regions: header, content, footer
 * - Optional sidebar (right side, collapsible)
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
  workspace,
  branch,
  changedFiles,
}: LayoutProps): React.JSX.Element {
  const { theme } = useTheme();
  const { width: columns, height: rows } = useTerminalDimensions();

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

  // Calculate sidebar width based on terminal width - adaptive tiered approach
  const sidebarWidth = useMemo(() => {
    if (!sidebarVisible) {
      return 0;
    }

    // Adaptive calculation based on terminal size
    const baseWidth = Math.floor(columns * (SIDEBAR_WIDTH_PERCENT / 100));

    // Tiered approach: small terminals get smaller sidebar, large terminals get proportional
    if (columns < 80) {
      // Compact: minimum viable sidebar
      return Math.max(baseWidth, SIDEBAR_MIN_WIDTH);
    } else if (columns < 120) {
      // Normal: standard percentage, cap at 35
      return Math.min(baseWidth, 35);
    } else {
      // Wide: allow up to max, but keep percentage-based
      return Math.min(baseWidth, SIDEBAR_MAX_WIDTH);
    }
  }, [sidebarVisible, columns]);

  // Get border colors from theme - use focus color for header/footer, default for sidebar
  const headerBorderColor = theme.colors.primary;
  const footerBorderColor = theme.semantic.border.focus;
  const sidebarBorderColor = theme.semantic.border.default;

  // Constrain height for interactive TUI rendering to prevent scrollback duplication.
  // Allow static output mode to grow naturally (e.g. debug snapshots/logs).
  const isAlternateBuffer = getAlternateBufferEnabled();
  const isStaticOutputMode = process.env.VELLUM_STATIC_OUTPUT === "1";
  const shouldConstrainHeight =
    !isStaticOutputMode && (isAlternateBuffer || (process.stdout.isTTY ?? false));

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={shouldConstrainHeight ? rows : undefined}
      minHeight={shouldConstrainHeight ? undefined : rows}
    >
      {/* Header Region */}
      {header && (
        <HeaderRegion
          borderColor={headerBorderColor}
          workspace={workspace}
          branch={branch}
          changedFiles={changedFiles}
        >
          {header}
        </HeaderRegion>
      )}

      {/* Middle Section: Content + Sidebar (sidebar on right) */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
        {/* Content Region */}
        <ContentRegion>{children}</ContentRegion>

        {/* Sidebar Region (optional, on right) */}
        {sidebarVisible && sidebar && (
          <SidebarRegion width={sidebarWidth} borderColor={sidebarBorderColor}>
            {sidebar}
          </SidebarRegion>
        )}
      </Box>

      {/* Footer Region */}
      {footer && <FooterRegion borderColor={footerBorderColor}>{footer}</FooterRegion>}
    </Box>
  );
}

// useTerminalSize re-export removed - import directly from hooks/useTerminalSize.js

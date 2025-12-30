/**
 * ScreenReaderLayout Component (T045)
 *
 * Simplified layout for screen reader accessibility.
 * Provides a linear, sequential display optimized for screen readers
 * with automatic status announcements.
 *
 * Key features:
 * - Linear/sequential message display (no complex grid layouts)
 * - Clear section headings for navigation
 * - Automatic status change announcements
 * - Simplified visual presentation
 *
 * @module tui/components/ScreenReaderLayout
 */

import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  formatForScreenReader,
  type UseScreenReaderOptions,
  useScreenReader,
} from "../hooks/useScreenReader.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ScreenReaderLayout component.
 */
export interface ScreenReaderLayoutProps {
  /** Header content (rendered as first section) */
  readonly header?: React.ReactNode;
  /** Main content area */
  readonly children: React.ReactNode;
  /** Footer content (rendered as last section) */
  readonly footer?: React.ReactNode;
  /** Current status message to announce on change */
  readonly status?: string;
  /** Screen reader options */
  readonly screenReaderOptions?: UseScreenReaderOptions;
  /** Callback when screen reader mode changes */
  readonly onScreenReaderChange?: (isEnabled: boolean) => void;
}

/**
 * Status information for tracking changes.
 */
interface StatusInfo {
  readonly message: string;
  readonly timestamp: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Section separator for visual clarity */
const SECTION_SEPARATOR = "────────────────────────────────────────";

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Section header for screen reader navigation.
 */
interface SectionHeaderProps {
  readonly title: string;
  readonly level?: 1 | 2 | 3;
}

function SectionHeader({ title, level = 2 }: SectionHeaderProps): React.ReactElement {
  const { theme } = useTheme();

  // Use different prefixes for heading levels (helps screen readers)
  const prefix = level === 1 ? "# " : level === 2 ? "## " : "### ";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.semantic.text.muted}>{SECTION_SEPARATOR}</Text>
      <Text bold color={theme.semantic.text.primary}>
        {prefix}
        {title}
      </Text>
    </Box>
  );
}

/**
 * Simple message display for screen reader mode.
 */
interface SimpleMessageProps {
  readonly children: React.ReactNode;
}

function SimpleMessage({ children }: SimpleMessageProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      {children}
    </Box>
  );
}

/**
 * Status display with clear labeling.
 */
interface StatusDisplayProps {
  readonly status: string;
}

function StatusDisplay({ status }: StatusDisplayProps): React.ReactElement {
  const { theme } = useTheme();

  return (
    <Box marginY={1}>
      <Text>
        <Text color={theme.semantic.text.secondary} bold>
          Status:{" "}
        </Text>
        <Text>{status}</Text>
      </Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ScreenReaderLayout provides an accessible layout optimized for screen readers.
 *
 * Unlike the standard Layout component which uses complex grid arrangements,
 * ScreenReaderLayout presents content in a simple, linear fashion that screen
 * readers can navigate sequentially.
 *
 * @example
 * ```tsx
 * function AccessibleApp() {
 *   return (
 *     <ScreenReaderLayout
 *       header={<Text>Vellum AI Assistant</Text>}
 *       status="Ready for input"
 *       footer={<Text>Press Ctrl+C to exit</Text>}
 *     >
 *       <MessageList messages={messages} />
 *     </ScreenReaderLayout>
 *   );
 * }
 * ```
 */
export function ScreenReaderLayout({
  header,
  children,
  footer,
  status,
  screenReaderOptions,
  onScreenReaderChange,
}: ScreenReaderLayoutProps): React.ReactElement {
  const { theme } = useTheme();
  const { isEnabled, announce } = useScreenReader(screenReaderOptions);

  // Track previous status to detect changes
  const prevStatusRef = useRef<StatusInfo | null>(null);

  // Notify parent of screen reader mode changes
  useEffect(() => {
    onScreenReaderChange?.(isEnabled);
  }, [isEnabled, onScreenReaderChange]);

  // Announce status changes
  useEffect(() => {
    if (!status || !isEnabled) return;

    const prevStatus = prevStatusRef.current;
    const statusChanged = !prevStatus || prevStatus.message !== status;

    if (statusChanged) {
      // Announce the new status
      announce(formatForScreenReader(`Status: ${status}`), "polite");

      // Update the ref
      prevStatusRef.current = {
        message: status,
        timestamp: Date.now(),
      };
    }
  }, [status, isEnabled, announce]);

  // Announce initial state on mount
  useEffect(() => {
    if (isEnabled) {
      announce("Vellum AI Assistant loaded. Screen reader mode active.", "polite");
    }
  }, [isEnabled, announce]);

  // Memoize the layout structure
  const layout = useMemo(() => {
    return (
      <Box flexDirection="column" padding={1}>
        {/* Header Section */}
        {header && (
          <>
            <SectionHeader title="Header" level={1} />
            <SimpleMessage>{header}</SimpleMessage>
          </>
        )}

        {/* Status Section */}
        {status && (
          <>
            <SectionHeader title="Current Status" level={2} />
            <StatusDisplay status={status} />
          </>
        )}

        {/* Main Content Section */}
        <SectionHeader title="Content" level={1} />
        <SimpleMessage>{children}</SimpleMessage>

        {/* Footer Section */}
        {footer && (
          <>
            <SectionHeader title="Footer" level={2} />
            <SimpleMessage>{footer}</SimpleMessage>
          </>
        )}

        {/* Screen Reader Mode Indicator */}
        <Box marginTop={1}>
          <Text color={theme.semantic.text.muted} dimColor>
            [Screen reader mode: {isEnabled ? "ON" : "OFF"}]
          </Text>
        </Box>
      </Box>
    );
  }, [header, status, children, footer, isEnabled, theme.semantic.text.muted]);

  return layout;
}

// =============================================================================
// Utility Components
// =============================================================================

/**
 * Wrapper to conditionally render ScreenReaderLayout or regular Layout.
 */
export interface AdaptiveLayoutProps extends Omit<ScreenReaderLayoutProps, "screenReaderOptions"> {
  /** Regular layout to render when screen reader mode is off */
  readonly regularLayout?: React.ReactElement;
  /** Screen reader options */
  readonly screenReaderOptions?: UseScreenReaderOptions;
}

/**
 * AdaptiveLayout automatically switches between ScreenReaderLayout and a
 * regular layout based on screen reader detection.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AdaptiveLayout
 *       regularLayout={<Layout>{content}</Layout>}
 *       status={status}
 *     >
 *       {content}
 *     </AdaptiveLayout>
 *   );
 * }
 * ```
 */
export function AdaptiveLayout({
  regularLayout,
  screenReaderOptions,
  ...screenReaderProps
}: AdaptiveLayoutProps): React.ReactElement {
  const { isEnabled } = useScreenReader(screenReaderOptions);

  if (isEnabled) {
    return <ScreenReaderLayout screenReaderOptions={screenReaderOptions} {...screenReaderProps} />;
  }

  // If no regular layout provided, use screen reader layout as fallback
  if (!regularLayout) {
    return <ScreenReaderLayout screenReaderOptions={screenReaderOptions} {...screenReaderProps} />;
  }

  return regularLayout;
}

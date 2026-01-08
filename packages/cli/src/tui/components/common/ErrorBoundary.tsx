/**
 * ErrorBoundary Component (Chain 20)
 *
 * React error boundary for graceful error handling in the TUI.
 * Catches errors in child components and displays a fallback UI.
 *
 * @module tui/components/common/ErrorBoundary
 */

import { Box, Text } from "ink";
import { Component, type ReactNode } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ErrorBoundary component.
 */
export interface ErrorBoundaryProps {
  /** Child components to render */
  readonly children: ReactNode;
  /** Custom fallback UI to render on error */
  readonly fallback?: ReactNode;
  /** Callback when an error is caught */
  readonly onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Whether to show error details */
  readonly showDetails?: boolean;
}

/**
 * Internal state for the ErrorBoundary.
 */
interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The caught error, if any */
  error: Error | null;
}

// =============================================================================
// ErrorBoundary Component
// =============================================================================

/**
 * ErrorBoundary - Catches JavaScript errors in child components.
 *
 * Features:
 * - Catches errors in render, lifecycle methods, and constructors
 * - Displays customizable fallback UI
 * - Supports error callback for logging
 * - Provides reset functionality
 *
 * @example
 * ```tsx
 * <ErrorBoundary onError={(err) => logError(err)}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With custom fallback
 * <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  /**
   * Update state when an error is caught.
   * Called during the "render" phase.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error information.
   * Called during the "commit" phase.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  /**
   * Reset the error state.
   * Can be called externally via ref or exposed through context.
   */
  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, showDetails = true } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
          <Text color="red" bold>
            ! Something went wrong
          </Text>
          {showDetails && error && (
            <Box marginTop={1}>
              <Text color="gray" wrap="wrap">
                {error.message}
              </Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="cyan">Press 'r' to retry or Ctrl+C to exit</Text>
          </Box>
        </Box>
      );
    }

    return children;
  }
}

// =============================================================================
// Exports
// =============================================================================

export default ErrorBoundary;

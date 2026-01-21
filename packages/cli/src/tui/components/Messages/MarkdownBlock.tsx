/**
 * MarkdownBlock Component
 *
 * Ink component for rendering Markdown content with async syntax highlighting.
 * Uses the markdown-renderer service for ANSI terminal output.
 *
 * @module tui/components/Messages/MarkdownBlock
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type MarkdownRenderOptions,
  renderMarkdown,
  renderMarkdownSync,
} from "../../services/markdown-renderer.js";
import { preloadHighlighter } from "../../services/syntax-highlighter.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MarkdownBlock component
 */
export interface MarkdownBlockProps {
  /** Markdown content to render */
  readonly content: string;
  /** Use compact mode with less spacing */
  readonly compact?: boolean;
  /** Whether content is currently streaming */
  readonly isStreaming?: boolean;
  /** Cursor character while streaming (default: '▊') */
  readonly cursorChar?: string;
  /** Disable syntax highlighting for faster rendering */
  readonly disableHighlight?: boolean;
  /** Called when rendering completes */
  readonly onRenderComplete?: () => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * MarkdownBlock renders Markdown with async syntax highlighting.
 *
 * Features:
 * - Async code block highlighting via Shiki
 * - Loading state while highlighting
 * - Streaming cursor support
 * - Theme-aware colors
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MarkdownBlock content="# Hello **world**" />
 *
 * // Streaming mode
 * <MarkdownBlock content={streamedContent} isStreaming />
 *
 * // Fast mode without highlighting
 * <MarkdownBlock content={content} disableHighlight />
 * ```
 */
export function MarkdownBlock({
  content,
  compact = false,
  isStreaming = false,
  cursorChar = "▊",
  disableHighlight = false,
  onRenderComplete,
}: MarkdownBlockProps): React.JSX.Element {
  const { theme } = useTheme();
  const [renderedContent, setRenderedContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Build render options from theme
  const renderOptions = useMemo<MarkdownRenderOptions>(
    () => ({
      compact,
      syntaxHighlight: !disableHighlight,
      colors: {
        heading: theme.colors.info,
        bold: theme.semantic.text.primary,
        italic: theme.semantic.text.muted,
        inlineCode: theme.semantic.syntax.keyword,
        inlineCodeBg: theme.semantic.background.code,
        link: theme.colors.info,
        linkUrl: theme.semantic.text.muted,
        blockquote: theme.semantic.text.muted,
        listBullet: theme.semantic.text.muted,
        hr: theme.semantic.border.default,
        codeBlockBorder: theme.semantic.border.default,
        codeLanguage: theme.semantic.text.muted,
      },
    }),
    [compact, disableHighlight, theme]
  );

  // Preload highlighter on mount
  useEffect(() => {
    if (!disableHighlight) {
      preloadHighlighter();
    }
  }, [disableHighlight]);

  // Render markdown content
  const renderContent = useCallback(async () => {
    if (!content) {
      setRenderedContent("");
      setIsLoading(false);
      return;
    }

    try {
      // For streaming, use sync render for responsiveness
      if (isStreaming || disableHighlight) {
        const result = renderMarkdownSync(content, renderOptions);
        setRenderedContent(result);
        setIsLoading(false);
        onRenderComplete?.();
      } else {
        // For static content, use async render with highlighting
        setIsLoading(true);
        const result = await renderMarkdown(content, renderOptions);
        setRenderedContent(result);
        setIsLoading(false);
        onRenderComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
  }, [content, isStreaming, disableHighlight, renderOptions, onRenderComplete]);

  // Trigger render on content change
  useEffect(() => {
    renderContent();
  }, [renderContent]);

  // Handle errors
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={theme.colors.error}>Error rendering markdown:</Text>
        <Text color={theme.semantic.text.muted}>{error.message}</Text>
        <Box marginTop={1}>
          <Text>{content}</Text>
        </Box>
      </Box>
    );
  }

  // Show loading state only for non-streaming async renders
  if (isLoading && !isStreaming && !disableHighlight) {
    // Show sync-rendered content while waiting for highlighting
    const syncContent = renderMarkdownSync(content, { ...renderOptions, syntaxHighlight: false });
    return (
      <Box flexDirection="column">
        <Text>{syncContent}</Text>
      </Box>
    );
  }

  // Render final content with optional streaming cursor
  return (
    <Box flexDirection="column">
      <Text>
        {renderedContent}
        {isStreaming && cursorChar}
      </Text>
    </Box>
  );
}

/**
 * Lightweight markdown block without async highlighting
 *
 * Use this for real-time streaming where latency is critical.
 */
export function MarkdownBlockSync({
  content,
  compact = false,
  cursorChar,
  isStreaming = false,
}: Omit<MarkdownBlockProps, "disableHighlight" | "onRenderComplete">): React.JSX.Element {
  const { theme } = useTheme();

  const renderOptions = useMemo<MarkdownRenderOptions>(
    () => ({
      compact,
      syntaxHighlight: false,
      colors: {
        heading: theme.colors.info,
        bold: theme.semantic.text.primary,
        italic: theme.semantic.text.muted,
        inlineCode: theme.semantic.syntax.keyword,
        inlineCodeBg: theme.semantic.background.code,
        link: theme.colors.info,
        linkUrl: theme.semantic.text.muted,
        blockquote: theme.semantic.text.muted,
        listBullet: theme.semantic.text.muted,
        hr: theme.semantic.border.default,
        codeBlockBorder: theme.semantic.border.default,
        codeLanguage: theme.semantic.text.muted,
      },
    }),
    [compact, theme]
  );

  const renderedContent = useMemo(
    () => renderMarkdownSync(content, renderOptions),
    [content, renderOptions]
  );

  return (
    <Box flexDirection="column">
      <Text>
        {renderedContent}
        {isStreaming && cursorChar}
      </Text>
    </Box>
  );
}

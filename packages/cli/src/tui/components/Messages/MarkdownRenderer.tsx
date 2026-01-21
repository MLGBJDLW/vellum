/**
 * MarkdownRenderer Component (T020)
 *
 * Renders markdown content with theme-aware styling for TUI display.
 * Supports headers, bold, italic, inline code, code blocks, lists, and links.
 *
 * @module tui/components/Messages/MarkdownRenderer
 */

import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useAnimation } from "../../context/AnimationContext.js";
import { useDiffMode } from "../../hooks/useDiffMode.js";
import { useTheme } from "../../theme/index.js";
import { sanitize } from "../../utils/textSanitizer.js";
import { DiffView } from "./DiffView.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MarkdownRenderer component.
 */
export interface MarkdownRendererProps {
  /** The markdown content to render */
  readonly content: string;
  /** Reduce spacing for compact display (default: false) */
  readonly compact?: boolean;
  /** Override base text color (optional) */
  readonly textColor?: string;
  /** Whether content is currently streaming (optional) */
  readonly isStreaming?: boolean;
  /** Cursor character while streaming (default: '▊') */
  readonly cursorChar?: string;
  /** Whether cursor should blink while streaming (default: true) */
  readonly cursorBlink?: boolean;
}

/**
 * Parsed markdown node types
 */
type MarkdownNodeType =
  | "text"
  | "header"
  | "bold"
  | "italic"
  | "inline-code"
  | "code-block"
  | "list-item"
  | "link"
  | "paragraph";

/**
 * Parsed markdown node
 */
interface MarkdownNode {
  readonly type: MarkdownNodeType;
  readonly content: string;
  readonly level?: number; // For headers (1-6)
  readonly language?: string; // For code blocks
  readonly url?: string; // For links
  readonly ordered?: boolean; // For list items
  readonly index?: number; // For ordered list items
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse markdown content into nodes
 */
function parseMarkdown(content: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const lines = content.split("\n");

  let inCodeBlock = false;
  let codeBlockLanguage = "";
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // Code block start/end
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        nodes.push({
          type: "code-block",
          content: codeBlockContent.join("\n"),
          language: codeBlockLanguage,
        });
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLanguage = "";
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line - paragraph break
    if (line.trim() === "") {
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch?.[1] && headerMatch[2]) {
      nodes.push({
        type: "header",
        content: headerMatch[2],
        level: headerMatch[1].length,
      });
      continue;
    }

    // Unordered list items
    const unorderedListMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (unorderedListMatch?.[2]) {
      nodes.push({
        type: "list-item",
        content: unorderedListMatch[2],
        ordered: false,
        level: Math.floor((unorderedListMatch[1]?.length ?? 0) / 2),
      });
      continue;
    }

    // Ordered list items
    const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedListMatch?.[2] && orderedListMatch[3]) {
      nodes.push({
        type: "list-item",
        content: orderedListMatch[3],
        ordered: true,
        index: Number.parseInt(orderedListMatch[2], 10),
        level: Math.floor((orderedListMatch[1]?.length ?? 0) / 2),
      });
      continue;
    }

    // Regular paragraph
    nodes.push({
      type: "paragraph",
      content: line,
    });
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    nodes.push({
      type: "code-block",
      content: codeBlockContent.join("\n"),
      language: codeBlockLanguage,
    });
  }

  return nodes;
}

/**
 * Parse inline markdown elements (bold, italic, code, links)
 */
interface InlineElement {
  readonly type: "text" | "bold" | "italic" | "inline-code" | "link";
  readonly content: string;
  readonly url?: string;
}

/** Process a regex match and return the corresponding inline element */
function processInlineMatch(match: RegExpMatchArray): InlineElement {
  if (match[1] || match[3]) {
    return { type: "bold", content: match[2] ?? match[4] ?? "" };
  }
  if (match[5] || match[7]) {
    return { type: "italic", content: match[6] ?? match[8] ?? "" };
  }
  if (match[9]) {
    return { type: "inline-code", content: match[10] ?? "" };
  }
  if (match[11]) {
    return { type: "link", content: match[12] ?? "", url: match[13] ?? "" };
  }
  return { type: "text", content: match[0] };
}

function parseInline(text: string): InlineElement[] {
  const elements: InlineElement[] = [];
  const inlineRegex =
    /(\*\*(.+?)\*\*)|(__(.+?)__)|(\*(.+?)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  const matches = [...text.matchAll(inlineRegex)];

  for (const match of matches) {
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      elements.push({ type: "text", content: text.slice(lastIndex, matchIndex) });
    }

    elements.push(processInlineMatch(match));
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (elements.length === 0) {
    elements.push({ type: "text", content: text });
  }

  return elements;
}

// =============================================================================
// Rendering Components
// =============================================================================

/**
 * Render inline elements with appropriate styling
 */
function InlineRenderer({
  elements,
  textColor,
  codeColor,
  codeBgColor,
  linkColor,
}: {
  readonly elements: InlineElement[];
  readonly textColor: string;
  readonly codeColor: string;
  readonly codeBgColor: string;
  readonly linkColor: string;
}): React.JSX.Element {
  return (
    <Text>
      {elements.map((element, index) => {
        // Use a composite key since elements are static after parsing
        const elementKey = `${element.type}-${index}`;
        switch (element.type) {
          case "bold":
            return (
              <Text key={elementKey} bold color={textColor}>
                {element.content}
              </Text>
            );
          case "italic":
            return (
              <Text key={elementKey} italic color={textColor}>
                {element.content}
              </Text>
            );
          case "inline-code":
            return (
              <Text key={elementKey} backgroundColor={codeBgColor} color={codeColor}>
                {` ${element.content} `}
              </Text>
            );
          case "link":
            return (
              <Text key={elementKey} color={linkColor} underline>
                {element.content}
                {element.url && <Text color={codeColor}> ({element.url})</Text>}
              </Text>
            );
          default:
            return (
              <Text key={elementKey} color={textColor}>
                {element.content}
              </Text>
            );
        }
      })}
    </Text>
  );
}

/**
 * Render a code block with basic styling
 * Note: Full syntax highlighting is handled by CodeBlock component (T021)
 */
function CodeBlockRenderer({
  content,
  language,
  bgColor,
  textColor,
  mutedColor,
  compact,
}: {
  readonly content: string;
  readonly language?: string;
  readonly bgColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
  readonly compact: boolean;
}): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      marginTop={compact ? 0 : 1}
      marginBottom={compact ? 0 : 1}
      paddingX={1}
    >
      {language && (
        <Text color={mutedColor} italic>
          {language}
        </Text>
      )}
      <Box borderStyle="single" borderColor={bgColor} paddingX={1}>
        <Text color={textColor}>{content}</Text>
      </Box>
    </Box>
  );
}

/**
 * Detect if content looks like a unified diff.
 * Checks for diff language marker, hunk headers (@@), or file headers (--- / +++).
 */
function isDiffContent(content: string, language?: string): boolean {
  if (language === "diff") {
    return true;
  }
  // Check for unified diff patterns: @@ hunk headers or file headers
  const lines = content.split("\n");
  const hasHunkHeader = lines.some((line) => /^@@\s+-\d+/.test(line));
  const hasFileHeaders =
    lines.some((line) => line.startsWith("---")) && lines.some((line) => line.startsWith("+++"));
  return hasHunkHeader || hasFileHeaders;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * MarkdownRenderer displays markdown content with theme-aware styling.
 *
 * Features:
 * - Headers (# ## ###) with bold styling and size indication
 * - Bold (**text**) with bold styling
 * - Italic (*text* or _text_) with dim styling
 * - Inline code (`code`) with inverse styling
 * - Code blocks (```) with border and optional language label
 * - Lists (- or 1.) with proper indentation
 * - Links [text](url) with underline styling
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MarkdownRenderer content="# Hello **world**" />
 *
 * // Compact mode
 * <MarkdownRenderer content={markdown} compact />
 * ```
 */
export function MarkdownRenderer({
  content,
  compact = false,
  textColor: textColorOverride,
  isStreaming = false,
  cursorChar = "▊",
  cursorBlink = true,
}: MarkdownRendererProps): React.JSX.Element {
  const { theme } = useTheme();
  const { mode: diffMode } = useDiffMode();
  const { frame, isPaused } = useAnimation();

  // Theme colors
  const textColor = textColorOverride ?? theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const codeColor = theme.semantic.syntax.keyword;
  const codeBgColor = theme.semantic.background.code;
  const linkColor = theme.colors.info;

  // Sanitize content before parsing (normalize line endings, strip dangerous ANSI)
  const sanitizedContent = useMemo(() => sanitize(content), [content]);

  // Parse markdown content
  const nodes = useMemo(() => parseMarkdown(sanitizedContent), [sanitizedContent]);

  const cursorVisible = useMemo(() => {
    if (!isStreaming || !cursorBlink) return true;
    if (isPaused) return true;
    return Math.floor(frame / 4) % 2 === 0;
  }, [frame, isPaused, isStreaming, cursorBlink]);

  const cursor = isStreaming && cursorVisible ? cursorChar : "";
  const lastNodeIndex = nodes.length - 1;

  if (nodes.length === 0) {
    return <Box flexDirection="column">{cursor && <Text color={textColor}>{cursor}</Text>}</Box>;
  }

  return (
    <Box flexDirection="column">
      {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Markdown node renderer with many node types */}
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;
        const isLastNode = index === lastNodeIndex;

        switch (node.type) {
          case "header": {
            // Headers: bold, with visual indicator for level
            const prefix = "─".repeat(Math.max(1, 4 - (node.level ?? 1)));
            return (
              <Box key={key} marginTop={compact ? 0 : 1} marginBottom={compact ? 0 : 1}>
                <Text bold color={textColor}>
                  {prefix} {node.content}
                  {isLastNode && cursor}
                </Text>
              </Box>
            );
          }

          case "code-block": {
            // Check if this is a diff and render with DiffView
            if (isDiffContent(node.content, node.language)) {
              return (
                <Box key={key} marginTop={compact ? 0 : 1} marginBottom={compact ? 0 : 1}>
                  <DiffView diff={node.content} compact={compact} mode={diffMode} />
                  {isLastNode && cursor && <Text color={textColor}>{cursor}</Text>}
                </Box>
              );
            }
            return (
              <Box key={key} marginTop={compact ? 0 : 1} marginBottom={compact ? 0 : 1}>
                <CodeBlockRenderer
                  content={node.content}
                  language={node.language}
                  bgColor={mutedColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  compact={compact}
                />
                {isLastNode && cursor && <Text color={textColor}>{cursor}</Text>}
              </Box>
            );
          }

          case "list-item": {
            const indent = "  ".repeat(node.level ?? 0);
            const bullet = node.ordered ? `${node.index ?? 1}.` : "•";
            const inlineElements = parseInline(node.content);

            return (
              <Box key={key} marginLeft={1}>
                <Text>
                  <Text color={mutedColor}>
                    {indent}
                    {bullet}{" "}
                  </Text>
                  <InlineRenderer
                    elements={inlineElements}
                    textColor={textColor}
                    codeColor={codeColor}
                    codeBgColor={codeBgColor}
                    linkColor={linkColor}
                  />
                  {isLastNode && cursor && <Text color={textColor}>{cursor}</Text>}
                </Text>
              </Box>
            );
          }

          default: {
            const inlineElements = parseInline(node.content);

            return (
              <Box key={key} marginBottom={compact ? 0 : 0}>
                <Text wrap="wrap">
                  <InlineRenderer
                    elements={inlineElements}
                    textColor={textColor}
                    codeColor={codeColor}
                    codeBgColor={codeBgColor}
                    linkColor={linkColor}
                  />
                  {isLastNode && cursor && <Text color={textColor}>{cursor}</Text>}
                </Text>
              </Box>
            );
          }
        }
      })}
    </Box>
  );
}

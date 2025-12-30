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
import { useTheme } from "../../theme/index.js";

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

function parseInline(text: string): InlineElement[] {
  const elements: InlineElement[] = [];

  // Combined regex for inline elements
  // Order matters: bold before italic (** before *)
  const inlineRegex =
    /(\*\*(.+?)\*\*)|(__(.+?)__)|(\*(.+?)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  const matches = [...text.matchAll(inlineRegex)];

  for (const match of matches) {
    const matchIndex = match.index ?? 0;

    // Add text before match
    if (matchIndex > lastIndex) {
      elements.push({
        type: "text",
        content: text.slice(lastIndex, matchIndex),
      });
    }

    if (match[1] || match[3]) {
      // Bold: **text** or __text__
      elements.push({
        type: "bold",
        content: match[2] ?? match[4] ?? "",
      });
    } else if (match[5] || match[7]) {
      // Italic: *text* or _text_
      elements.push({
        type: "italic",
        content: match[6] ?? match[8] ?? "",
      });
    } else if (match[9]) {
      // Inline code: `code`
      elements.push({
        type: "inline-code",
        content: match[10] ?? "",
      });
    } else if (match[11]) {
      // Link: [text](url)
      elements.push({
        type: "link",
        content: match[12] ?? "",
        url: match[13] ?? "",
      });
    }

    lastIndex = matchIndex + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  // If no matches found, return original text
  if (elements.length === 0) {
    elements.push({
      type: "text",
      content: text,
    });
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
              <Text key={elementKey} dimColor italic color={textColor}>
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
                {element.url && <Text dimColor> ({element.url})</Text>}
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
  compact,
}: {
  readonly content: string;
  readonly language?: string;
  readonly bgColor: string;
  readonly textColor: string;
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
        <Text dimColor italic>
          {language}
        </Text>
      )}
      <Box borderStyle="single" borderColor={bgColor} paddingX={1}>
        <Text color={textColor}>{content}</Text>
      </Box>
    </Box>
  );
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
}: MarkdownRendererProps): React.JSX.Element {
  const { theme } = useTheme();

  // Theme colors
  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const codeColor = theme.semantic.syntax.keyword;
  const codeBgColor = theme.semantic.background.code;
  const linkColor = theme.colors.info;

  // Parse markdown content
  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return (
    <Box flexDirection="column">
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;

        switch (node.type) {
          case "header": {
            // Headers: bold, with visual indicator for level
            const prefix = "─".repeat(Math.max(1, 4 - (node.level ?? 1)));
            return (
              <Box key={key} marginTop={compact ? 0 : 1} marginBottom={compact ? 0 : 1}>
                <Text bold color={textColor}>
                  {prefix} {node.content}
                </Text>
              </Box>
            );
          }

          case "code-block": {
            return (
              <CodeBlockRenderer
                key={key}
                content={node.content}
                language={node.language}
                bgColor={mutedColor}
                textColor={textColor}
                compact={compact}
              />
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
                </Text>
              </Box>
            );
          }
        }
      })}
    </Box>
  );
}

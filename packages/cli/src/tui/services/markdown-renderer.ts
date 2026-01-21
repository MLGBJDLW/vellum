/**
 * Markdown Renderer Service
 *
 * Provides marked-based Markdown parsing with ANSI terminal output.
 * Integrates with the syntax-highlighter service for code block highlighting.
 *
 * @module tui/services/markdown-renderer
 */

import chalk from "chalk";
import { Marked, type Tokens } from "marked";
import { highlightCode, highlightCodeSync, isHighlighterReady } from "./syntax-highlighter.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for markdown rendering
 */
export interface MarkdownRenderOptions {
  /** Whether to use compact mode (less spacing) */
  readonly compact?: boolean;
  /** Custom colors for rendering */
  readonly colors?: Partial<MarkdownColors>;
  /** Whether to include syntax highlighting for code blocks */
  readonly syntaxHighlight?: boolean;
}

/**
 * Color configuration for markdown elements
 */
export interface MarkdownColors {
  /** Heading color */
  readonly heading: string;
  /** Bold text color */
  readonly bold: string;
  /** Italic text color */
  readonly italic: string;
  /** Inline code color */
  readonly inlineCode: string;
  /** Inline code background */
  readonly inlineCodeBg: string;
  /** Link text color */
  readonly link: string;
  /** Link URL color */
  readonly linkUrl: string;
  /** Blockquote color */
  readonly blockquote: string;
  /** List bullet color */
  readonly listBullet: string;
  /** Horizontal rule color */
  readonly hr: string;
  /** Code block border color */
  readonly codeBlockBorder: string;
  /** Code language label color */
  readonly codeLanguage: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default colors for markdown rendering
 */
const DEFAULT_COLORS: MarkdownColors = {
  heading: "#58a6ff", // GitHub blue
  bold: "#ffffff",
  italic: "#8b949e",
  inlineCode: "#f0883e",
  inlineCodeBg: "#161b22",
  link: "#58a6ff",
  linkUrl: "#8b949e",
  blockquote: "#8b949e",
  listBullet: "#8b949e",
  hr: "#30363d",
  codeBlockBorder: "#30363d",
  codeLanguage: "#8b949e",
};

/**
 * Heading level prefixes for visual hierarchy
 */
const HEADING_PREFIXES: Record<number, string> = {
  1: "═══",
  2: "───",
  3: "──",
  4: "─",
  5: "·",
  6: "·",
};

// =============================================================================
// Rendering State
// =============================================================================

/** Store for pending async code blocks during sync render */
const pendingCodeBlocks: Map<string, { code: string; lang: string }> = new Map();

// =============================================================================
// Marked Renderer Factory
// =============================================================================

/**
 * Create a marked renderer with ANSI terminal output
 */
function createTerminalRenderer(
  options: MarkdownRenderOptions = {},
  codeBlockResolver?: (id: string, code: string, lang: string) => string
): {
  renderer: Partial<import("marked").RendererObject>;
  parseInline: (tokens: Tokens.Generic[]) => string;
} {
  const colors = { ...DEFAULT_COLORS, ...options.colors };
  const compact = options.compact ?? false;
  const syntaxHighlight = options.syntaxHighlight ?? true;

  const colorFn = {
    heading: chalk.hex(colors.heading),
    bold: chalk.hex(colors.bold).bold,
    italic: chalk.hex(colors.italic).italic,
    inlineCode: chalk.hex(colors.inlineCode),
    inlineCodeBg: chalk.bgHex(colors.inlineCodeBg).hex(colors.inlineCode),
    link: chalk.hex(colors.link).underline,
    linkUrl: chalk.hex(colors.linkUrl).dim,
    blockquote: chalk.hex(colors.blockquote),
    listBullet: chalk.hex(colors.listBullet),
    hr: chalk.hex(colors.hr),
    codeBlockBorder: chalk.hex(colors.codeBlockBorder),
    codeLanguage: chalk.hex(colors.codeLanguage).italic,
  };

  // Inline token parser
  const parseInline = (tokens: Tokens.Generic[]): string => {
    return tokens
      .map((token) => {
        switch (token.type) {
          case "text":
            return (token as Tokens.Text).text;
          case "strong":
            return colorFn.bold(parseInline((token as Tokens.Strong).tokens));
          case "em":
            return colorFn.italic(parseInline((token as Tokens.Em).tokens));
          case "codespan":
            return colorFn.inlineCodeBg(` ${(token as Tokens.Codespan).text} `);
          case "link": {
            const linkToken = token as Tokens.Link;
            const text = parseInline(linkToken.tokens);
            return `${colorFn.link(text)} ${colorFn.linkUrl(`(${linkToken.href})`)}`;
          }
          case "image": {
            const imgToken = token as Tokens.Image;
            return colorFn.linkUrl(`[image: ${imgToken.text || imgToken.href}]`);
          }
          case "br":
            return "\n";
          case "del":
            return chalk.strikethrough(parseInline((token as Tokens.Del).tokens));
          case "escape":
            return (token as Tokens.Escape).text;
          default:
            // Fallback for unknown inline tokens
            if ("text" in token && typeof token.text === "string") {
              return token.text;
            }
            if ("tokens" in token && Array.isArray(token.tokens)) {
              return parseInline(token.tokens as Tokens.Generic[]);
            }
            return "";
        }
      })
      .join("");
  };

  const spacing = compact ? "\n" : "\n\n";

  const renderer: Partial<import("marked").RendererObject> = {
    // Headings: bold + colored with prefix
    heading({ tokens, depth }: Tokens.Heading): string {
      const text = parseInline(tokens);
      const prefix = HEADING_PREFIXES[depth] ?? "·";
      return colorFn.heading.bold(`${prefix} ${text}`) + spacing;
    },

    // Paragraphs
    paragraph({ tokens }: Tokens.Paragraph): string {
      return parseInline(tokens) + spacing;
    },

    // Bold text
    strong({ tokens }: Tokens.Strong): string {
      return colorFn.bold(parseInline(tokens));
    },

    // Italic text
    em({ tokens }: Tokens.Em): string {
      return colorFn.italic(parseInline(tokens));
    },

    // Inline code
    codespan({ text }: Tokens.Codespan): string {
      return colorFn.inlineCodeBg(` ${text} `);
    },

    // Code blocks with syntax highlighting
    code({ text, lang }: Tokens.Code): string {
      const language = lang || "text";

      if (syntaxHighlight && codeBlockResolver) {
        // Async mode: return placeholder only - formatting applied after highlighting
        const id = `code-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        pendingCodeBlocks.set(id, { code: text, lang: language });
        return codeBlockResolver(id, text, language);
      }

      // Sync mode: format immediately
      const languageLabel = colorFn.codeLanguage(language);
      const border = colorFn.codeBlockBorder("│");

      let highlightedCode: string;

      if (syntaxHighlight && isHighlighterReady()) {
        // Sync mode: use cached highlighter
        const result = highlightCodeSync(text, { lang: language });
        highlightedCode = result?.output ?? text;
      } else {
        // Fallback: no highlighting
        highlightedCode = text;
      }

      // Format code block with border
      const lines = highlightedCode.split("\n");
      const formattedLines = lines.map((line) => `${border} ${line}`).join("\n");
      const topBorder = `${colorFn.codeBlockBorder("┌─")} ${languageLabel}`;
      const bottomBorder = colorFn.codeBlockBorder("└─");

      return `${topBorder}\n${formattedLines}\n${bottomBorder}${spacing}`;
    },

    // Links
    link({ href, tokens }: Tokens.Link): string {
      const text = parseInline(tokens);
      return `${colorFn.link(text)} ${colorFn.linkUrl(`(${href})`)}`;
    },

    // Images
    image({ href, text }: Tokens.Image): string {
      return colorFn.linkUrl(`[image: ${text || href}]`);
    },

    // Blockquotes
    blockquote({ tokens }: Tokens.Blockquote): string {
      // Parse block content, then prefix each line
      const content = tokens
        .map((token) => {
          if (token.type === "paragraph") {
            return parseInline((token as Tokens.Paragraph).tokens);
          }
          return "";
        })
        .join("\n");
      const lines = content.split("\n");
      const prefixed = lines.map((line) => colorFn.blockquote(`│ ${line}`)).join("\n");
      return prefixed + spacing;
    },

    // Unordered lists
    list({ items, ordered, start }: Tokens.List): string {
      const startNum = typeof start === "number" ? start : 1;
      const result = items
        .map((item, index) => {
          const bullet = ordered
            ? colorFn.listBullet(`${startNum + index}.`)
            : colorFn.listBullet("•");
          const indent = "  ".repeat(0); // Top-level indent
          const content = item.tokens
            .map((token) => {
              if (token.type === "text") {
                // Handle loose list items
                if ("tokens" in token && Array.isArray(token.tokens)) {
                  return parseInline(token.tokens as Tokens.Generic[]);
                }
                return (token as Tokens.Text).text;
              }
              if (token.type === "paragraph") {
                return parseInline((token as Tokens.Paragraph).tokens);
              }
              if (token.type === "list") {
                // Nested list - indent
                const nestedItems = (token as Tokens.List).items
                  .map((nestedItem, nestedIndex) => {
                    const nestedBullet = (token as Tokens.List).ordered
                      ? colorFn.listBullet(`${nestedIndex + 1}.`)
                      : colorFn.listBullet("◦");
                    const nestedContent = nestedItem.tokens
                      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Nested list rendering requires this complexity
                      .map((t) => {
                        if (t.type === "text") {
                          if ("tokens" in t && Array.isArray(t.tokens)) {
                            return parseInline(t.tokens as Tokens.Generic[]);
                          }
                          return (t as Tokens.Text).text;
                        }
                        if (t.type === "paragraph") {
                          return parseInline((t as Tokens.Paragraph).tokens);
                        }
                        return "";
                      })
                      .join("");
                    return `    ${nestedBullet} ${nestedContent}`;
                  })
                  .join("\n");
                return `\n${nestedItems}`;
              }
              return "";
            })
            .join("");
          return `${indent}${bullet} ${content}`;
        })
        .join("\n");
      return result + spacing;
    },

    // List items (handled by list)
    listitem({ tokens }: Tokens.ListItem): string {
      return tokens
        .map((token) => {
          if (token.type === "text") {
            if ("tokens" in token && Array.isArray(token.tokens)) {
              return parseInline(token.tokens as Tokens.Generic[]);
            }
            return (token as Tokens.Text).text;
          }
          if (token.type === "paragraph") {
            return parseInline((token as Tokens.Paragraph).tokens);
          }
          return "";
        })
        .join("");
    },

    // Horizontal rules
    hr(): string {
      return colorFn.hr("─".repeat(40)) + spacing;
    },

    // Line breaks
    br(): string {
      return "\n";
    },

    // HTML (strip tags, show as plain text)
    html(token: Tokens.HTML | Tokens.Tag): string {
      // Strip HTML tags for terminal display
      const text = token.text;
      return text.replace(/<[^>]*>/g, "") + (text.includes("\n") ? "" : "");
    },

    // Tables
    table({ header, rows }: Tokens.Table): string {
      const headerCells = header.map((cell) => parseInline(cell.tokens));
      const headerRow = colorFn.bold(headerCells.join(" │ "));
      const separator = colorFn.hr("─".repeat(headerCells.join(" │ ").length));
      const bodyRows = rows.map((row) => row.map((cell) => parseInline(cell.tokens)).join(" │ "));
      return `${headerRow}\n${separator}\n${bodyRows.join("\n")}${spacing}`;
    },

    // Table row (handled by table)
    tablerow({ text }: Tokens.TableRow): string {
      return text;
    },

    // Table cell (handled by table)
    tablecell({ tokens }: Tokens.TableCell): string {
      return parseInline(tokens);
    },

    // Strikethrough
    del({ tokens }: Tokens.Del): string {
      return chalk.strikethrough(parseInline(tokens));
    },

    // Text
    text(token: Tokens.Text | Tokens.Escape): string {
      if ("tokens" in token && Array.isArray(token.tokens)) {
        return parseInline(token.tokens as Tokens.Generic[]);
      }
      return token.text;
    },
  };

  return { renderer, parseInline };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Render markdown to ANSI terminal string (async version)
 *
 * Uses Shiki for syntax highlighting of code blocks.
 *
 * @param markdown - The markdown string to render
 * @param options - Rendering options
 * @returns Promise resolving to ANSI-formatted string
 *
 * @example
 * ```ts
 * const output = await renderMarkdown('# Hello **world**');
 * console.log(output);
 * ```
 */
export async function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {}
): Promise<string> {
  // Collect code blocks for async highlighting
  const codeBlocks: Map<string, { code: string; lang: string }> = new Map();
  const colors = { ...DEFAULT_COLORS, ...options.colors };
  const spacing = options.compact ? "\n" : "\n\n";

  const colorFn = {
    codeBlockBorder: chalk.hex(colors.codeBlockBorder),
    codeLanguage: chalk.hex(colors.codeLanguage).italic,
  };

  const { renderer } = createTerminalRenderer(options, (id, code, lang) => {
    codeBlocks.set(id, { code, lang });
    // Return just the placeholder - formatting will be applied after highlighting
    return `__CODE_BLOCK_${id}__`;
  });

  const marked = new Marked({ renderer, async: false, gfm: true, breaks: true });
  let result = marked.parse(markdown) as string;

  // Highlight code blocks asynchronously
  if (options.syntaxHighlight !== false && codeBlocks.size > 0) {
    const highlights = await Promise.all(
      Array.from(codeBlocks.entries()).map(async ([id, { code, lang }]) => {
        const highlighted = await highlightCode(code, { lang });
        return { id, output: highlighted.output, lang };
      })
    );

    // Replace placeholders with highlighted code (with formatting)
    for (const { id, output, lang } of highlights) {
      const border = colorFn.codeBlockBorder("│");
      const lines = output.split("\n");
      const formattedLines = lines.map((line) => `${border} ${line}`).join("\n");
      const topBorder = `${colorFn.codeBlockBorder("┌─")} ${colorFn.codeLanguage(lang)}`;
      const bottomBorder = colorFn.codeBlockBorder("└─");
      const codeBlock = `${topBorder}\n${formattedLines}\n${bottomBorder}${spacing}`;

      result = result.replace(`__CODE_BLOCK_${id}__`, codeBlock);
    }
  }

  // Clean up extra newlines
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Render markdown to ANSI terminal string (sync version)
 *
 * Uses cached Shiki highlighter if available, otherwise falls back to plain text.
 * Prefer the async version for initial renders.
 *
 * @param markdown - The markdown string to render
 * @param options - Rendering options
 * @returns ANSI-formatted string
 *
 * @example
 * ```ts
 * const output = renderMarkdownSync('# Hello **world**');
 * console.log(output);
 * ```
 */
export function renderMarkdownSync(markdown: string, options: MarkdownRenderOptions = {}): string {
  const { renderer } = createTerminalRenderer(options);
  const marked = new Marked({ renderer, async: false, gfm: true, breaks: true });
  const result = marked.parse(markdown) as string;
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Render markdown without syntax highlighting (fast sync version)
 *
 * Useful for real-time streaming where highlighting latency is unacceptable.
 *
 * @param markdown - The markdown string to render
 * @param options - Rendering options (syntaxHighlight is ignored)
 * @returns ANSI-formatted string
 */
export function renderMarkdownPlain(
  markdown: string,
  options: Omit<MarkdownRenderOptions, "syntaxHighlight"> = {}
): string {
  return renderMarkdownSync(markdown, { ...options, syntaxHighlight: false });
}

/**
 * Check if a string contains markdown formatting
 *
 * @param text - The text to check
 * @returns True if the text appears to contain markdown
 */
export function containsMarkdown(text: string): boolean {
  // Check for common markdown patterns
  const patterns = [
    /^#{1,6}\s+/m, // Headers
    /\*\*[^*]+\*\*/, // Bold
    /\*[^*]+\*/, // Italic
    /__[^_]+__/, // Bold (underscore)
    /_[^_]+_/, // Italic (underscore)
    /`[^`]+`/, // Inline code
    /```[\s\S]*?```/, // Code blocks
    /^\s*[-*+]\s+/m, // Unordered lists
    /^\s*\d+\.\s+/m, // Ordered lists
    /\[[^\]]+\]\([^)]+\)/, // Links
    /^>\s+/m, // Blockquotes
    /^---+$/m, // Horizontal rules
    /^\|.*\|$/m, // Tables
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Strip markdown formatting from text
 *
 * @param markdown - The markdown string
 * @returns Plain text without markdown formatting
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove blockquotes
      .replace(/^>\s+/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      // Remove list markers
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // Clean up whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

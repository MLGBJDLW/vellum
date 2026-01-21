/**
 * CodeBlock Component (T021)
 *
 * Renders code with syntax highlighting, line numbers, and optional copy button.
 * Supports Shiki-based highlighting (async) with regex-based fallback.
 *
 * @module tui/components/Messages/CodeBlock
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTUITranslation } from "../../i18n/index.js";
import {
  highlightCodeSync,
  isHighlighterReady,
  preloadHighlighter,
} from "../../services/syntax-highlighter.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the CodeBlock component.
 */
export interface CodeBlockProps {
  /** The source code to display */
  readonly code: string;
  /** Programming language for syntax highlighting */
  readonly language?: string;
  /** Show line numbers on the left (default: false) */
  readonly showLineNumbers?: boolean;
  /** Show copy button in header (default: false) */
  readonly showCopyButton?: boolean;
  /** Maximum height in lines before scrolling (default: unlimited) */
  readonly maxHeight?: number;
  /** Line numbers to highlight (1-indexed) */
  readonly highlight?: number[];
  /** Use Shiki for highlighting (default: true if available) */
  readonly useShiki?: boolean;
  /** Callback when copy button is clicked */
  readonly onCopy?: (code: string) => void;
}

/**
 * Token types for syntax highlighting
 */
type TokenType =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "variable"
  | "type"
  | "operator"
  | "punctuation"
  | "plain";

/**
 * A token with its type and content
 */
interface Token {
  readonly type: TokenType;
  readonly content: string;
}

// =============================================================================
// Language Definitions
// =============================================================================

/**
 * Language-specific patterns for syntax highlighting
 */
interface LanguagePatterns {
  readonly keywords: RegExp;
  readonly strings: RegExp;
  readonly numbers: RegExp;
  readonly comments: RegExp;
  readonly functions?: RegExp;
  readonly types?: RegExp;
  readonly operators?: RegExp;
}

/**
 * Language pattern definitions
 */
const LANGUAGE_PATTERNS: Record<string, LanguagePatterns> = {
  javascript: {
    keywords:
      /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|void)\b/g,
    strings: /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g,
    numbers: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g,
    comments: /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][a-zA-Z0-9]*)\b/g,
    operators: /[+\-*/%=<>!&|^~?:]+/g,
  },
  typescript: {
    keywords:
      /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|implements|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|void|type|interface|enum|namespace|abstract|private|protected|public|static|readonly|as|is|keyof|infer|never|unknown|any)\b/g,
    strings: /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g,
    numbers: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g,
    comments: /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][a-zA-Z0-9]*)\b/g,
    operators: /[+\-*/%=<>!&|^~?:]+/g,
  },
  python: {
    keywords:
      /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|True|False|None|and|or|not|in|is|async|await)\b/g,
    strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    numbers: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[jJ]?\b/g,
    comments: /#.*$/gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    types: /\b([A-Z][a-zA-Z0-9]*)\b/g,
    operators: /[+\-*/%=<>!&|^~@]+/g,
  },
  bash: {
    keywords:
      /\b(if|then|else|elif|fi|case|esac|for|while|until|do|done|in|function|return|exit|local|export|source|alias|unalias|set|unset|readonly|declare|typeset|shift|trap|exec|eval|test)\b/g,
    strings: /(["'])(?:(?!\1)[^\\]|\\.)*?\1/g,
    numbers: /\b\d+\b/g,
    comments: /#.*$/gm,
    functions: /\b([a-zA-Z_]\w*)\s*\(\)/g,
    operators: /[|&;><]+/g,
  },
  json: {
    keywords: /\b(true|false|null)\b/g,
    strings: /"(?:[^"\\]|\\.)*"/g,
    numbers: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g,
    comments: /(?!)/g, // JSON has no comments
    operators: /[{}[\]:,]/g,
  },
  shell: {
    keywords:
      /\b(if|then|else|elif|fi|case|esac|for|while|until|do|done|in|function|return|exit|local|export|source|alias|unalias|set|unset|readonly|declare|typeset|shift|trap|exec|eval|test)\b/g,
    strings: /(["'])(?:(?!\1)[^\\]|\\.)*?\1/g,
    numbers: /\b\d+\b/g,
    comments: /#.*$/gm,
    functions: /\b([a-zA-Z_]\w*)\s*\(\)/g,
    operators: /[|&;><]+/g,
  },
};

// Language aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  zsh: "bash",
  fish: "bash",
};

// =============================================================================
// Tokenizer
// =============================================================================

/**
 * Tokenize a line of code for syntax highlighting
 */
function tokenizeLine(line: string, language: string | undefined): Token[] {
  if (!line) {
    return [{ type: "plain", content: "" }];
  }

  // Normalize language name
  const normalizedLang = language?.toLowerCase() ?? "";
  const resolvedLang = LANGUAGE_ALIASES[normalizedLang] ?? normalizedLang;
  const patterns = LANGUAGE_PATTERNS[resolvedLang];

  // No patterns for this language - return plain text
  if (!patterns) {
    return [{ type: "plain", content: line }];
  }

  // Track which parts of the line have been tokenized
  const tokens: Array<{ start: number; end: number; type: TokenType; content: string }> = [];

  // Helper to add matches
  const addMatches = (regex: RegExp, type: TokenType) => {
    // Reset regex state
    regex.lastIndex = 0;
    const matches = line.matchAll(regex);
    for (const match of matches) {
      tokens.push({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        type,
        content: match[0],
      });
    }
  };

  // Order matters: comments first (they can contain anything)
  addMatches(patterns.comments, "comment");
  addMatches(patterns.strings, "string");
  addMatches(patterns.numbers, "number");
  addMatches(patterns.keywords, "keyword");
  if (patterns.functions) addMatches(patterns.functions, "function");
  if (patterns.types) addMatches(patterns.types, "type");
  if (patterns.operators) addMatches(patterns.operators, "operator");

  // Sort by start position
  tokens.sort((a, b) => a.start - b.start);

  // Remove overlapping tokens (keep first match - higher priority)
  const nonOverlapping: typeof tokens = [];
  for (const token of tokens) {
    const hasOverlap = nonOverlapping.some(
      (existing) =>
        (token.start >= existing.start && token.start < existing.end) ||
        (token.end > existing.start && token.end <= existing.end)
    );
    if (!hasOverlap) {
      nonOverlapping.push(token);
    }
  }

  // Build final token list with plain text gaps
  const result: Token[] = [];
  let lastEnd = 0;

  for (const token of nonOverlapping) {
    // Add plain text before this token
    if (token.start > lastEnd) {
      result.push({
        type: "plain",
        content: line.slice(lastEnd, token.start),
      });
    }
    result.push({
      type: token.type,
      content: token.content,
    });
    lastEnd = token.end;
  }

  // Add remaining plain text
  if (lastEnd < line.length) {
    result.push({
      type: "plain",
      content: line.slice(lastEnd),
    });
  }

  return result.length > 0 ? result : [{ type: "plain", content: line }];
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Render a single token with syntax highlighting
 */
interface TokenRendererProps {
  readonly token: Token;
}

function TokenRenderer({ token }: TokenRendererProps): React.ReactElement {
  const { theme } = useTheme();
  const syntax = theme.semantic.syntax;

  const colorMap: Record<TokenType, string> = {
    keyword: syntax.keyword,
    string: syntax.string,
    number: syntax.number,
    comment: syntax.comment,
    function: syntax.function,
    variable: syntax.variable,
    type: syntax.type,
    operator: syntax.operator,
    punctuation: syntax.punctuation,
    plain: theme.semantic.text.primary,
  };

  return <Text color={colorMap[token.type]}>{token.content}</Text>;
}

/**
 * Render a single line of code
 */
interface CodeLineProps {
  readonly lineNumber: number;
  readonly content: string;
  readonly language: string | undefined;
  readonly showLineNumbers: boolean;
  readonly isHighlighted: boolean;
  readonly lineNumberWidth: number;
}

function CodeLine({
  lineNumber,
  content,
  language,
  showLineNumbers,
  isHighlighted,
  lineNumberWidth,
}: CodeLineProps): React.ReactElement {
  const { theme } = useTheme();
  const tokens = useMemo(() => tokenizeLine(content, language), [content, language]);

  return (
    <Box>
      {showLineNumbers && (
        <Box width={lineNumberWidth + 1} marginRight={1}>
          <Text
            color={isHighlighted ? theme.colors.warning : theme.semantic.text.muted}
            dimColor={!isHighlighted}
          >
            {String(lineNumber).padStart(lineNumberWidth, " ")}
          </Text>
          <Text color={theme.semantic.border.muted}>│</Text>
        </Box>
      )}
      <Box flexGrow={1}>
        {isHighlighted && (
          <Text backgroundColor={theme.semantic.background.elevated} color={theme.colors.warning}>
            {"▶ "}
          </Text>
        )}
        {tokens.map((token, index) => (
          <TokenRenderer key={`${lineNumber}-${index}-${token.type}`} token={token} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Code block header with language label and copy button
 */
interface CodeHeaderProps {
  readonly language: string | undefined;
  readonly showCopyButton: boolean;
  readonly onCopy?: () => void;
}

function CodeHeader({ language, showCopyButton }: CodeHeaderProps): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  if (!language && !showCopyButton) {
    return null;
  }

  return (
    <Box
      borderStyle="single"
      borderColor={theme.semantic.border.default}
      borderBottom={false}
      paddingX={1}
      justifyContent="space-between"
    >
      {language ? (
        <Text color={theme.semantic.text.secondary} bold>
          {language}
        </Text>
      ) : (
        <Text> </Text>
      )}
      {showCopyButton && <Text color={theme.semantic.text.muted}>{t("code.copy")}</Text>}
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * CodeBlock - Renders code with syntax highlighting
 *
 * Features:
 * - Shiki-based syntax highlighting (when available)
 * - Regex-based fallback highlighting for common languages
 * - Optional line numbers
 * - Line highlighting support
 * - Copy button (when clipboard API available)
 * - Scrollable for long code (respects maxHeight)
 *
 * @example
 * ```tsx
 * <CodeBlock
 *   code={sourceCode}
 *   language="typescript"
 *   showLineNumbers
 *   highlight={[5, 6, 7]}
 * />
 * ```
 */
export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  showCopyButton = false,
  maxHeight,
  highlight = [],
  useShiki = true,
  onCopy,
}: CodeBlockProps): React.ReactElement {
  const { theme } = useTheme();
  const [shikiOutput, setShikiOutput] = useState<string | null>(null);
  const [highlighterReady, setHighlighterReady] = useState(isHighlighterReady());

  // Preload highlighter on mount
  useEffect(() => {
    if (useShiki && !highlighterReady) {
      preloadHighlighter();
      // Check periodically if highlighter is ready
      const interval = setInterval(() => {
        if (isHighlighterReady()) {
          setHighlighterReady(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [useShiki, highlighterReady]);

  // Try Shiki highlighting when ready
  useEffect(() => {
    if (useShiki && highlighterReady) {
      const result = highlightCodeSync(code, { lang: language });
      if (result?.success) {
        setShikiOutput(result.output);
      }
    }
  }, [code, language, useShiki, highlighterReady]);

  // Parse code into lines (for fallback rendering)
  const lines = useMemo(() => {
    const result = code.split("\n");
    // Remove trailing empty line if present
    if (result.length > 0 && result[result.length - 1] === "") {
      result.pop();
    }
    return result;
  }, [code]);

  // Calculate line number width
  const lineNumberWidth = useMemo(() => String(lines.length).length, [lines.length]);

  // Set of highlighted lines for O(1) lookup
  const highlightSet = useMemo(() => new Set(highlight), [highlight]);

  // Apply maxHeight constraint
  const displayLines = useMemo(() => {
    if (maxHeight !== undefined && lines.length > maxHeight) {
      return lines.slice(0, maxHeight);
    }
    return lines;
  }, [lines, maxHeight]);

  const hasMoreLines = maxHeight !== undefined && lines.length > maxHeight;

  // Determine if header should be shown
  const showHeader = Boolean(language) || showCopyButton;

  // Handle copy
  const handleCopy = useCallback(() => {
    onCopy?.(code);
  }, [code, onCopy]);

  // Use Shiki output if available, otherwise fall back to regex highlighting
  const useShikiOutput = shikiOutput !== null && !showLineNumbers && highlight.length === 0;

  // For Shiki output with maxHeight, we need to truncate
  const shikiLines = useMemo(() => {
    if (!shikiOutput) return [];
    const result = shikiOutput.split("\n");
    if (maxHeight !== undefined && result.length > maxHeight) {
      return result.slice(0, maxHeight);
    }
    return result;
  }, [shikiOutput, maxHeight]);

  return (
    <Box flexDirection="column">
      {showHeader && (
        <CodeHeader language={language} showCopyButton={showCopyButton} onCopy={handleCopy} />
      )}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.semantic.border.default}
        borderTop={!showHeader}
        paddingX={1}
      >
        {useShikiOutput
          ? // Shiki-highlighted output (pre-colored ANSI)
            // biome-ignore lint/suspicious/noArrayIndexKey: shiki lines are stable ANSI output from highlighter
            shikiLines.map((line, index) => <Text key={`shiki-line-${index}`}>{line}</Text>)
          : // Fallback regex highlighting
            displayLines.map((line, index) => {
              const lineNumber = index + 1;
              return (
                <CodeLine
                  key={`line-${lineNumber}`}
                  lineNumber={lineNumber}
                  content={line}
                  language={language}
                  showLineNumbers={showLineNumbers}
                  isHighlighted={highlightSet.has(lineNumber)}
                  lineNumberWidth={lineNumberWidth}
                />
              );
            })}
        {hasMoreLines && (
          <Box marginTop={0}>
            <Text color={theme.semantic.text.muted} dimColor>
              ... {lines.length - (maxHeight ?? 0)} more lines
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default CodeBlock;

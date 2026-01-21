/**
 * Syntax Highlighter Service
 *
 * Provides Shiki-based syntax highlighting with ANSI output for terminal rendering.
 * Uses lazy initialization and singleton pattern to minimize startup overhead.
 *
 * @module tui/services/syntax-highlighter
 */

import chalk, { type ChalkInstance } from "chalk";
import {
  type BundledLanguage,
  type BundledTheme,
  createHighlighter,
  type HighlighterGeneric,
  type ThemedToken,
} from "shiki";

// =============================================================================
// Types
// =============================================================================

/**
 * Supported languages for syntax highlighting
 */
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "json"
  | "yaml"
  | "bash"
  | "markdown"
  | "css"
  | "html"
  | "sql"
  | "dockerfile"
  | "toml"
  | "tsx"
  | "jsx";

/**
 * Options for highlighting code
 */
export interface HighlightOptions {
  /** Programming language (auto-detected if not provided) */
  readonly lang?: string;
  /** Include line numbers in output */
  readonly lineNumbers?: boolean;
  /** Lines to highlight (1-indexed) */
  readonly highlightLines?: number[];
}

/**
 * Result of syntax highlighting
 */
export interface SyntaxHighlightResult {
  /** ANSI-colored output string */
  readonly output: string;
  /** Detected or specified language */
  readonly language: string;
  /** Whether highlighting was successful */
  readonly success: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default languages to preload
 */
const DEFAULT_LANGUAGES: BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "rust",
  "go",
  "json",
  "yaml",
  "bash",
  "markdown",
  "css",
  "html",
  "sql",
  "dockerfile",
  "toml",
];

/**
 * Theme to use for highlighting
 */
const THEME = "github-dark";

/**
 * Language aliases for common variations
 */
const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  fish: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  golang: "go",
  docker: "dockerfile",
};

/**
 * File extension to language mapping for auto-detection
 */
const EXTENSION_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".htm": "html",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".toml": "toml",
};

/**
 * Patterns for language auto-detection from code content
 */
const LANGUAGE_PATTERNS: Array<{ pattern: RegExp; lang: BundledLanguage }> = [
  // TypeScript/JavaScript
  { pattern: /^import\s+.*\s+from\s+['"]|^export\s+(default\s+)?/m, lang: "typescript" },
  { pattern: /^const\s+\w+\s*:\s*\w+|^interface\s+\w+|^type\s+\w+\s*=/m, lang: "typescript" },
  { pattern: /^function\s+\w+|^const\s+\w+\s*=\s*\(|^let\s+|^var\s+/m, lang: "javascript" },
  // Python
  { pattern: /^def\s+\w+\s*\(|^class\s+\w+|^import\s+\w+|^from\s+\w+\s+import/m, lang: "python" },
  // Rust
  { pattern: /^fn\s+\w+|^struct\s+\w+|^impl\s+|^use\s+\w+::|^mod\s+\w+/m, lang: "rust" },
  // Go
  { pattern: /^package\s+\w+|^func\s+\w+|^import\s*\(|^type\s+\w+\s+struct/m, lang: "go" },
  // JSON
  { pattern: /^\s*\{[\s\S]*"[\w-]+":\s*[{"[\d]/m, lang: "json" },
  // YAML
  { pattern: /^[\w-]+:\s*[|>]?\s*$/m, lang: "yaml" },
  // Bash
  { pattern: /^#!\s*\/bin\/(ba)?sh|^#!/m, lang: "bash" },
  { pattern: /^\s*(if|for|while)\s+\[|^\s*echo\s+|^\s*export\s+\w+=/m, lang: "bash" },
  // SQL
  { pattern: /^SELECT\s+|^INSERT\s+INTO|^CREATE\s+(TABLE|DATABASE)|^ALTER\s+TABLE/im, lang: "sql" },
  // Dockerfile
  { pattern: /^FROM\s+\w+|^RUN\s+|^CMD\s+|^ENTRYPOINT\s+/m, lang: "dockerfile" },
  // HTML
  { pattern: /^<!DOCTYPE\s+html|^<html|^<head|^<body/im, lang: "html" },
  // CSS
  { pattern: /^[.#]?\w+\s*\{[\s\S]*:[^}]+\}/m, lang: "css" },
  // Markdown
  { pattern: /^#\s+\w+|^\*\*\w+\*\*|^\[.+\]\(.+\)/m, lang: "markdown" },
];

// =============================================================================
// Singleton State
// =============================================================================

let highlighterInstance: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null;
let initPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

// =============================================================================
// Color Conversion
// =============================================================================

/**
 * Convert hex color to chalk color function
 */
function hexToChalk(hex: string | undefined): ChalkInstance {
  if (!hex) return chalk;

  // Remove # if present
  const cleanHex = hex.replace(/^#/, "");

  // Parse hex to RGB
  const r = Number.parseInt(cleanHex.slice(0, 2), 16);
  const g = Number.parseInt(cleanHex.slice(2, 4), 16);
  const b = Number.parseInt(cleanHex.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return chalk;
  }

  return chalk.rgb(r, g, b);
}

/**
 * Convert Shiki tokens to ANSI-colored string
 */
function tokensToAnsi(tokens: ThemedToken[][]): string {
  const lines: string[] = [];

  for (const lineTokens of tokens) {
    let line = "";
    for (const token of lineTokens) {
      const colorFn = hexToChalk(token.color);
      // Apply font style if present
      let styled = colorFn;
      if (token.fontStyle) {
        if (token.fontStyle & 1) styled = styled.italic;
        if (token.fontStyle & 2) styled = styled.bold;
        if (token.fontStyle & 4) styled = styled.underline;
      }
      line += styled(token.content);
    }
    lines.push(line);
  }

  return lines.join("\n");
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Initialize the syntax highlighter
 *
 * Uses lazy loading - only initializes when first needed.
 * Returns cached instance on subsequent calls.
 */
export async function initializeHighlighter(): Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> {
  // Return cached instance
  if (highlighterInstance) {
    return highlighterInstance;
  }

  // Return pending initialization
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = createHighlighter({
    themes: [THEME],
    langs: DEFAULT_LANGUAGES,
  });

  try {
    highlighterInstance = await initPromise;
    return highlighterInstance;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

/**
 * Detect language from code content
 */
export function detectLanguage(code: string, filename?: string): BundledLanguage | undefined {
  // Try filename extension first
  if (filename) {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const langFromExt = EXTENSION_TO_LANGUAGE[ext];
    if (langFromExt) return langFromExt;
  }

  // Try content patterns
  for (const { pattern, lang } of LANGUAGE_PATTERNS) {
    if (pattern.test(code)) {
      return lang;
    }
  }

  return undefined;
}

/**
 * Resolve language alias to canonical name
 */
export function resolveLanguage(lang: string): BundledLanguage {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_ALIASES[normalized] ?? (normalized as BundledLanguage);
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(lang: string): boolean {
  const resolved = resolveLanguage(lang);
  return DEFAULT_LANGUAGES.includes(resolved) || Object.values(LANGUAGE_ALIASES).includes(resolved);
}

/**
 * Highlight code and return ANSI-colored string
 *
 * @param code - Source code to highlight
 * @param options - Highlighting options
 * @returns Highlighted code result
 *
 * @example
 * ```ts
 * const result = await highlightCode('const x = 42;', { lang: 'typescript' });
 * console.log(result.output);
 * ```
 */
export async function highlightCode(
  code: string,
  options: HighlightOptions = {}
): Promise<SyntaxHighlightResult> {
  const { lang, lineNumbers = false, highlightLines = [] } = options;

  try {
    const highlighter = await initializeHighlighter();

    // Resolve language
    let resolvedLang: BundledLanguage = "text" as BundledLanguage;
    if (lang) {
      resolvedLang = resolveLanguage(lang);
    } else {
      const detected = detectLanguage(code);
      if (detected) resolvedLang = detected;
    }

    // Get tokens
    const tokens = highlighter.codeToTokensBase(code, {
      lang: resolvedLang,
      theme: THEME,
    });

    // Convert to ANSI
    let output = tokensToAnsi(tokens);

    // Add line numbers if requested
    if (lineNumbers) {
      const lines = output.split("\n");
      const width = String(lines.length).length;
      const highlightSet = new Set(highlightLines);

      output = lines
        .map((line, i) => {
          const num = i + 1;
          const numStr = String(num).padStart(width, " ");
          const prefix = highlightSet.has(num)
            ? chalk.yellow.bold(`▶ ${numStr} │ `)
            : chalk.dim(`  ${numStr} │ `);
          return prefix + line;
        })
        .join("\n");
    }

    return {
      output,
      language: resolvedLang,
      success: true,
    };
  } catch (_error) {
    // Fallback to plain text on error
    let output = code;

    if (lineNumbers) {
      const lines = code.split("\n");
      const width = String(lines.length).length;
      output = lines
        .map((line, i) => {
          const numStr = String(i + 1).padStart(width, " ");
          return chalk.dim(`  ${numStr} │ `) + line;
        })
        .join("\n");
    }

    return {
      output,
      language: lang ?? "text",
      success: false,
    };
  }
}

/**
 * Synchronous highlight using cached highlighter
 *
 * Returns null if highlighter is not yet initialized.
 * Use this when you need synchronous rendering and can fall back to plain text.
 */
export function highlightCodeSync(
  code: string,
  options: HighlightOptions = {}
): SyntaxHighlightResult | null {
  if (!highlighterInstance) {
    return null;
  }

  const { lang, lineNumbers = false, highlightLines = [] } = options;

  try {
    // Resolve language
    let resolvedLang: BundledLanguage = "text" as BundledLanguage;
    if (lang) {
      resolvedLang = resolveLanguage(lang);
    } else {
      const detected = detectLanguage(code);
      if (detected) resolvedLang = detected;
    }

    // Get tokens
    const tokens = highlighterInstance.codeToTokensBase(code, {
      lang: resolvedLang,
      theme: THEME,
    });

    // Convert to ANSI
    let output = tokensToAnsi(tokens);

    // Add line numbers if requested
    if (lineNumbers) {
      const lines = output.split("\n");
      const width = String(lines.length).length;
      const highlightSet = new Set(highlightLines);

      output = lines
        .map((line, i) => {
          const num = i + 1;
          const numStr = String(num).padStart(width, " ");
          const prefix = highlightSet.has(num)
            ? chalk.yellow.bold(`▶ ${numStr} │ `)
            : chalk.dim(`  ${numStr} │ `);
          return prefix + line;
        })
        .join("\n");
    }

    return {
      output,
      language: resolvedLang,
      success: true,
    };
  } catch {
    return null;
  }
}

/**
 * Check if the highlighter is initialized
 */
export function isHighlighterReady(): boolean {
  return highlighterInstance !== null;
}

/**
 * Preload the highlighter in the background
 *
 * Call this early in app startup to warm up the cache.
 */
export function preloadHighlighter(): void {
  // Fire and forget
  initializeHighlighter().catch(() => {
    // Silently ignore preload errors
  });
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): readonly string[] {
  return [...DEFAULT_LANGUAGES, ...Object.keys(LANGUAGE_ALIASES)];
}

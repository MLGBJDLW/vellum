/**
 * Command Parser Module
 *
 * Tokenizes and parses slash command input into structured command data.
 * Handles:
 * - Command name extraction (from / prefix)
 * - Positional arguments
 * - Named arguments (flags: --flag, -f)
 * - Quote handling (double quotes with escapes, single quotes literal)
 *
 * @module cli/commands/parser
 */

import type { CommandErrorCode } from "./types.js";

// =============================================================================
// T013: Token Types and Tokenizer
// =============================================================================

/**
 * Token type discriminator
 */
export type TokenType = "command" | "string" | "flag" | "value" | "whitespace";

/**
 * Token produced by the tokenizer
 */
export interface Token {
  /** Token type for discrimination */
  readonly type: TokenType;
  /** Token value */
  readonly value: string;
  /** Start position in input (0-indexed) */
  readonly start: number;
  /** End position in input (exclusive) */
  readonly end: number;
}

/**
 * Tokenizer namespace for command input
 *
 * Breaks input into typed tokens for parsing.
 *
 * @example
 * ```typescript
 * const tokens = Tokenizer.tokenize('/help --verbose');
 * // [
 * //   { type: 'command', value: 'help', start: 0, end: 5 },
 * //   { type: 'whitespace', value: ' ', start: 5, end: 6 },
 * //   { type: 'flag', value: '--verbose', start: 6, end: 15 },
 * // ]
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Tokenizer provides a logical grouping for tokenization functionality
export class Tokenizer {
  /**
   * Tokenize input string into Token array
   *
   * @param input - Raw input string
   * @returns Array of tokens with type discrimination
   * @throws Never throws - returns empty array for empty input
   */
  static tokenize(input: string): Token[] {
    const ctx = new TokenizerContext(input);

    // Handle leading slash for command
    if (input.startsWith("/")) {
      ctx.tokenizeCommand();
    }

    // Process rest of input
    while (ctx.position < input.length) {
      ctx.tokenizeNext();
    }

    return ctx.tokens;
  }
}

/**
 * Check if character is whitespace
 */
function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

/**
 * Internal tokenizer context for managing state
 */
class TokenizerContext {
  readonly input: string;
  readonly tokens: Token[] = [];
  position = 0;

  constructor(input: string) {
    this.input = input;
  }

  /** Current character at position */
  get char(): string | undefined {
    return this.input[this.position];
  }

  /** Next character */
  get nextChar(): string | undefined {
    return this.input[this.position + 1];
  }

  /** Tokenize the command name after / */
  tokenizeCommand(): void {
    this.position = 1; // Skip the slash
    const commandStart = this.position;

    while (this.position < this.input.length && !isWhitespace(this.char)) {
      this.position++;
    }

    if (this.position > commandStart) {
      this.tokens.push({
        type: "command",
        value: this.input.slice(commandStart, this.position),
        start: 0, // Include the slash in position
        end: this.position,
      });
    }
  }

  /** Tokenize the next token */
  tokenizeNext(): void {
    // Whitespace
    if (isWhitespace(this.char)) {
      this.tokenizeWhitespace();
      return;
    }

    // Long flag (--flag)
    if (this.char === "-" && this.nextChar === "-") {
      this.tokenizeLongFlag();
      return;
    }

    // Short flag (-f)
    if (
      this.char === "-" &&
      this.nextChar &&
      !isWhitespace(this.nextChar) &&
      this.nextChar !== "-"
    ) {
      this.tokenizeShortFlag();
      return;
    }

    // Quoted string
    if (this.char === '"' || this.char === "'") {
      this.tokenizeQuotedString();
      return;
    }

    // Unquoted value
    this.tokenizeValue();
  }

  private tokenizeWhitespace(): void {
    const start = this.position;
    while (this.position < this.input.length && isWhitespace(this.char)) {
      this.position++;
    }
    this.tokens.push({
      type: "whitespace",
      value: this.input.slice(start, this.position),
      start,
      end: this.position,
    });
  }

  private tokenizeLongFlag(): void {
    const start = this.position;
    this.position += 2;
    while (this.position < this.input.length && !isWhitespace(this.char) && this.char !== "=") {
      this.position++;
    }
    this.tokens.push({
      type: "flag",
      value: this.input.slice(start, this.position),
      start,
      end: this.position,
    });

    // Handle --flag=value
    if (this.char === "=") {
      this.position++; // Skip =
      this.tokenizeFlagValue();
    }
  }

  private tokenizeShortFlag(): void {
    const start = this.position;
    this.position += 2; // -f
    this.tokens.push({
      type: "flag",
      value: this.input.slice(start, this.position),
      start,
      end: this.position,
    });
  }

  private tokenizeFlagValue(): void {
    const valueStart = this.position;
    // Value might be quoted
    if (this.char === '"' || this.char === "'") {
      const quoteResult = readQuotedString(this.input, this.position);
      this.tokens.push({
        type: "value",
        value: quoteResult.value,
        start: valueStart,
        end: quoteResult.end,
      });
      this.position = quoteResult.end;
    } else {
      while (this.position < this.input.length && !isWhitespace(this.char)) {
        this.position++;
      }
      this.tokens.push({
        type: "value",
        value: this.input.slice(valueStart, this.position),
        start: valueStart,
        end: this.position,
      });
    }
  }

  private tokenizeQuotedString(): void {
    const start = this.position;
    const quoteResult = readQuotedString(this.input, this.position);
    this.tokens.push({
      type: "string",
      value: quoteResult.value,
      start,
      end: quoteResult.end,
    });
    this.position = quoteResult.end;
  }

  private tokenizeValue(): void {
    const start = this.position;
    while (
      this.position < this.input.length &&
      !isWhitespace(this.char) &&
      this.char !== '"' &&
      this.char !== "'"
    ) {
      this.position++;
    }
    if (this.position > start) {
      this.tokens.push({
        type: "value",
        value: this.input.slice(start, this.position),
        start,
        end: this.position,
      });
    }
  }
}

/**
 * Read a quoted string from input
 *
 * @param input - Full input string
 * @param start - Position of opening quote
 * @returns Object with parsed value and end position
 */
function readQuotedString(
  input: string,
  start: number
): { value: string; end: number; error?: boolean } {
  const quoteChar = input[start];
  const isDouble = quoteChar === '"';
  let result = "";
  let i = start + 1;

  while (i < input.length) {
    const char = input[i];

    // End of quoted string
    if (char === quoteChar) {
      return { value: result, end: i + 1 };
    }

    // T014: Escape handling for double quotes only
    if (isDouble && char === "\\") {
      const nextChar = input[i + 1];
      switch (nextChar) {
        case "n":
          result += "\n";
          i += 2;
          continue;
        case "t":
          result += "\t";
          i += 2;
          continue;
        case "\\":
          result += "\\";
          i += 2;
          continue;
        case '"':
          result += '"';
          i += 2;
          continue;
        default:
          // Unknown escape, keep backslash
          result += char;
          i++;
          continue;
      }
    }

    // Regular character (including backslash in single quotes)
    result += char;
    i++;
  }

  // Unclosed quote - return what we have with error flag
  return { value: result, end: i, error: true };
}

// =============================================================================
// T015: ParseResult Types
// =============================================================================

/**
 * Successfully parsed command
 */
export interface ParsedCommand {
  /** Command name (lowercase, without leading slash) */
  readonly command: string;
  /** Positional arguments in order */
  readonly positional: readonly string[];
  /** Named arguments (flags) */
  readonly named: ReadonlyMap<string, string | boolean>;
  /** Original raw input */
  readonly raw: string;
}

/**
 * Parse error with details
 */
export interface ParseError {
  /** Error discriminator */
  readonly error: true;
  /** Standardized error code */
  readonly code: CommandErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Position in input where error occurred */
  readonly position?: number;
}

/**
 * Result of parsing a command
 */
export type ParseResult = ParsedCommand | ParseError;

/**
 * Type guard for ParseError
 */
export function isParseError(result: ParseResult): result is ParseError {
  return "error" in result && result.error === true;
}

/**
 * Type guard for ParsedCommand
 */
export function isParsedCommand(result: ParseResult): result is ParsedCommand {
  return !isParseError(result);
}

// =============================================================================
// T015 & T016: CommandParser
// =============================================================================

/**
 * Command parser for slash commands
 *
 * Parses command strings into structured ParsedCommand objects.
 *
 * @example
 * ```typescript
 * const parser = new CommandParser();
 *
 * const result = parser.parse('/login provider --store keychain');
 * if (!isParseError(result)) {
 *   console.log(result.command); // 'login'
 *   console.log(result.positional); // ['provider']
 *   console.log(result.named.get('store')); // 'keychain'
 * }
 * ```
 */
export class CommandParser {
  /**
   * Parse a command input string
   *
   * @param input - Raw command input (should start with /)
   * @returns ParseResult - either ParsedCommand or ParseError
   *
   * @example
   * ```typescript
   * // Basic command
   * parser.parse('/help'); // { command: 'help', positional: [], named: Map {} }
   *
   * // With arguments
   * parser.parse('/login "my provider" --store keychain');
   * // { command: 'login', positional: ['my provider'], named: Map { 'store' => 'keychain' } }
   * ```
   */
  parse(input: string): ParseResult {
    const trimmed = input.trim();

    // Empty input
    if (!trimmed) {
      return {
        error: true,
        code: "INVALID_ARGUMENT",
        message: "Empty command input",
        position: 0,
      };
    }

    // Must start with /
    if (!trimmed.startsWith("/")) {
      return {
        error: true,
        code: "INVALID_ARGUMENT",
        message: "Command must start with /",
        position: 0,
      };
    }

    // Check for unclosed quotes before tokenizing
    const quoteError = this.checkQuotes(trimmed);
    if (quoteError) {
      return quoteError;
    }

    // Tokenize
    const tokens = Tokenizer.tokenize(trimmed);

    // Filter out whitespace tokens
    const significantTokens = tokens.filter((t) => t.type !== "whitespace");

    // Must have at least command
    if (significantTokens.length === 0) {
      return {
        error: true,
        code: "INVALID_ARGUMENT",
        message: "No command specified",
        position: 0,
      };
    }

    // First token should be command (safe: checked length > 0 above)
    const commandToken = significantTokens.at(0);
    if (!commandToken || commandToken.type !== "command") {
      return {
        error: true,
        code: "INVALID_ARGUMENT",
        message: "Invalid command format",
        position: 0,
      };
    }

    const command = commandToken.value.toLowerCase();
    const { positional, named } = this.processTokens(significantTokens);

    return {
      command,
      positional,
      named,
      raw: input,
    };
  }

  /**
   * Process tokens into positional and named arguments
   */
  private processTokens(tokens: Token[]): {
    positional: string[];
    named: Map<string, string | boolean>;
  } {
    const positional: string[] = [];
    const named = new Map<string, string | boolean>();

    let i = 1; // Skip command token
    while (i < tokens.length) {
      const token = tokens.at(i);
      if (!token) {
        i++;
        continue;
      }

      // T016: Flag handling
      if (token.type === "flag") {
        i = this.processFlag(tokens, i, named);
        continue;
      }

      // String or value = positional argument
      if (token.type === "string" || token.type === "value") {
        positional.push(token.value);
        i++;
        continue;
      }

      // Unknown token type - skip
      i++;
    }

    return { positional, named };
  }

  /**
   * Process a flag token and its potential value
   */
  private processFlag(
    tokens: Token[],
    index: number,
    named: Map<string, string | boolean>
  ): number {
    const token = tokens.at(index);
    if (!token) return index + 1;

    const flagName = token.value.startsWith("--") ? token.value.slice(2) : token.value.slice(1);

    // Look ahead for value
    const nextToken = tokens[index + 1];

    if (nextToken && (nextToken.type === "value" || nextToken.type === "string")) {
      // Flag with value
      named.set(flagName, nextToken.value);
      return index + 2;
    }
    // Boolean flag
    named.set(flagName, true);
    return index + 1;
  }

  /**
   * Check for unclosed quotes in input
   */
  private checkQuotes(input: string): ParseError | null {
    let inQuote = false;
    let quoteChar = "";
    let quoteStart = -1;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (!inQuote) {
        if (char === '"' || char === "'") {
          inQuote = true;
          quoteChar = char;
          quoteStart = i;
        }
      } else {
        // Check for escape in double quotes
        if (quoteChar === '"' && char === "\\") {
          i++; // Skip escaped character
          continue;
        }
        if (char === quoteChar) {
          inQuote = false;
          quoteChar = "";
          quoteStart = -1;
        }
      }
    }

    if (inQuote) {
      return {
        error: true,
        code: "INVALID_ARGUMENT",
        message: `Unclosed ${quoteChar === '"' ? "double" : "single"} quote`,
        position: quoteStart,
      };
    }

    return null;
  }
}

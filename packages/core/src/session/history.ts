// ============================================
// Command History Service
// ============================================

/**
 * Command history management for session commands.
 *
 * Provides persistent command history with:
 * - Sensitive data masking (API keys, passwords)
 * - Bash-style history expansion (!!, !n, !prefix)
 * - Search and retrieval operations
 *
 * @module @vellum/core/session/history
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// =============================================================================
// Constants
// =============================================================================

/** Default maximum number of history entries */
const DEFAULT_MAX_ENTRIES = 1000;

/** Default history file name */
const DEFAULT_HISTORY_FILE = ".command-history.json";

// =============================================================================
// Sensitive Data Patterns
// =============================================================================

/**
 * Patterns for detecting and masking sensitive data.
 * Each pattern has a regex and a replacement function.
 */
const SENSITIVE_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}> = [
  // OpenAI API keys: sk-xxx → sk-***
  {
    pattern: /\bsk-[a-zA-Z0-9]{20,}/g,
    replacement: "sk-***",
  },
  // GitHub Personal Access Tokens: ghp_xxx → ghp_***
  {
    pattern: /\bghp_[a-zA-Z0-9]{36,}/g,
    replacement: "ghp_***",
  },
  // GitHub OAuth tokens: gho_xxx → gho_***
  {
    pattern: /\bgho_[a-zA-Z0-9]{36,}/g,
    replacement: "gho_***",
  },
  // GitHub App tokens: ghu_xxx, ghs_xxx, ghr_xxx
  {
    pattern: /\b(ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}/g,
    replacement: (match: string) => `${match.slice(0, 4)}***`,
  },
  // Anthropic API keys: sk-ant-xxx → sk-ant-***
  {
    pattern: /\bsk-ant-[a-zA-Z0-9-]{20,}/g,
    replacement: "sk-ant-***",
  },
  // AWS Access Keys: AKIA... (20 chars)
  {
    pattern: /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: (match: string) => `${match.slice(0, 4)}***`,
  },
  // AWS Secret Keys (40 chars after common prefixes)
  {
    pattern: /(?<=aws_secret_access_key\s*[=:]\s*)[A-Za-z0-9+/]{40}/gi,
    replacement: "***",
  },
  // Generic API keys in URLs or assignments
  {
    pattern: /(?<=[?&]api[_-]?key=)[^&\s]+/gi,
    replacement: "***",
  },
  // Passwords in URLs: ://user:password@host
  {
    pattern: /:\/\/([^:]+):([^@]+)@/g,
    replacement: "://$1:***@",
  },
  // Bearer tokens
  {
    pattern: /\b(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,
    replacement: "$1***",
  },
  // Generic tokens/secrets in environment variable style
  {
    pattern: /(?<=(TOKEN|SECRET|PASSWORD|API_KEY)\s*[=:]\s*)[^\s;]+/gi,
    replacement: "***",
  },
];

// =============================================================================
// Types
// =============================================================================

/**
 * A single command history entry.
 *
 * Contains the command text, timestamp, and optional session context.
 */
export interface HistoryEntry {
  /** The command text (with sensitive data masked) */
  command: string;
  /** When the command was executed */
  timestamp: Date;
  /** Associated session ID (optional) */
  sessionId?: string;
}

/**
 * Serialized history entry for JSON storage.
 */
interface SerializedHistoryEntry {
  command: string;
  timestamp: string;
  sessionId?: string;
}

/**
 * Serialized history file structure.
 */
interface SerializedHistory {
  version: number;
  entries: SerializedHistoryEntry[];
}

/**
 * Result of history expansion.
 */
export interface HistoryExpansionResult {
  /** Whether expansion occurred */
  expanded: boolean;
  /** The resulting command (original or expanded) */
  command: string;
  /** Error message if expansion failed */
  error?: string;
}

// =============================================================================
// CommandHistory Class
// =============================================================================

/**
 * Manages command history with persistence and security features.
 *
 * Features:
 * - Automatic sensitive data masking
 * - Bash-style history expansion (!!, !n, !prefix)
 * - Persistent JSON storage
 * - Session-aware command tracking
 *
 * @example
 * ```typescript
 * const history = new CommandHistory('/path/to/history');
 * await history.load();
 *
 * // Add commands
 * await history.add('search files', 'session-123');
 *
 * // Get recent commands
 * const recent = history.getRecent(10);
 *
 * // History expansion
 * const result = history.expand('!!'); // Repeat last command
 * const result2 = history.expand('!5'); // Repeat command #5
 * const result3 = history.expand('!search'); // Last command starting with "search"
 * ```
 */
export class CommandHistory {
  /** History entries (most recent last) */
  private entries: HistoryEntry[] = [];

  /** Path to the history file */
  private readonly historyFile: string;

  /** Maximum number of entries to retain */
  public maxEntries: number;

  /** Whether history has been loaded */
  private loaded = false;

  /**
   * Creates a new CommandHistory instance.
   *
   * @param historyFile - Path to the history file (default: uses basePath)
   * @param maxEntries - Maximum entries to retain (default: 1000)
   */
  constructor(historyFile?: string, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.historyFile = historyFile ?? DEFAULT_HISTORY_FILE;
    this.maxEntries = maxEntries;
  }

  // ===========================================================================
  // Persistence Operations
  // ===========================================================================

  /**
   * Loads history from the persistent file.
   *
   * If the file doesn't exist, initializes with empty history.
   * Automatically prunes to maxEntries if file contains more.
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.historyFile, "utf-8");
      const data: SerializedHistory = JSON.parse(content);

      // Validate version
      if (data.version !== 1) {
        console.warn(`Unknown history version: ${data.version}, using empty history`);
        this.entries = [];
        this.loaded = true;
        return;
      }

      // Deserialize entries
      this.entries = data.entries.map((entry) => ({
        command: entry.command,
        timestamp: new Date(entry.timestamp),
        sessionId: entry.sessionId,
      }));

      // Prune if necessary
      if (this.entries.length > this.maxEntries) {
        this.entries = this.entries.slice(-this.maxEntries);
      }

      this.loaded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, start with empty history
        this.entries = [];
        this.loaded = true;
        return;
      }
      throw error;
    }
  }

  /**
   * Saves history to the persistent file.
   *
   * Creates the directory if it doesn't exist.
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.historyFile);
    await fs.mkdir(dir, { recursive: true });

    const data: SerializedHistory = {
      version: 1,
      entries: this.entries.map((entry) => ({
        command: entry.command,
        timestamp: entry.timestamp.toISOString(),
        sessionId: entry.sessionId,
      })),
    };

    await fs.writeFile(this.historyFile, JSON.stringify(data, null, 2), "utf-8");
  }

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Adds a command to history.
   *
   * - Masks sensitive data before storing
   * - Skips empty commands and duplicates of the last command
   * - Automatically prunes to maxEntries
   * - Persists changes to disk
   *
   * @param command - The command text to add
   * @param sessionId - Optional session ID for context
   */
  async add(command: string, sessionId?: string): Promise<void> {
    // Skip empty commands
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    // Mask sensitive data
    const maskedCommand = this.maskSensitiveData(trimmed);

    // Skip if duplicate of last command
    const lastEntry = this.entries[this.entries.length - 1];
    if (lastEntry && lastEntry.command === maskedCommand) {
      return;
    }

    // Create entry
    const entry: HistoryEntry = {
      command: maskedCommand,
      timestamp: new Date(),
      sessionId,
    };

    // Add entry
    this.entries.push(entry);

    // Prune if necessary
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Persist
    await this.save();
  }

  /**
   * Gets recent commands from history.
   *
   * @param limit - Maximum number of commands to return (default: 10)
   * @returns Array of history entries, most recent first
   */
  getRecent(limit = 10): HistoryEntry[] {
    const count = Math.min(limit, this.entries.length);
    return this.entries.slice(-count).reverse();
  }

  /**
   * Clears all history entries.
   *
   * Persists the empty history to disk.
   */
  async clear(): Promise<void> {
    this.entries = [];
    await this.save();
  }

  /**
   * Searches history for commands matching a prefix.
   *
   * @param prefix - The prefix to search for
   * @returns Array of matching history entries, most recent first
   */
  search(prefix: string): HistoryEntry[] {
    const normalizedPrefix = prefix.toLowerCase();
    return this.entries
      .filter((entry) => entry.command.toLowerCase().startsWith(normalizedPrefix))
      .reverse();
  }

  /**
   * Gets the total number of history entries.
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Gets a specific entry by index (0-based, oldest first).
   *
   * @param index - The entry index
   * @returns The history entry or undefined if out of bounds
   */
  get(index: number): HistoryEntry | undefined {
    return this.entries[index];
  }

  // ===========================================================================
  // History Expansion (Bash-style)
  // ===========================================================================

  /**
   * Expands bash-style history references.
   *
   * Supported expansions:
   * - `!!` - Repeat the last command
   * - `!n` - Repeat command number n (1-based)
   * - `!-n` - Repeat nth previous command
   * - `!prefix` - Repeat most recent command starting with prefix
   *
   * @param input - The input string potentially containing history references
   * @returns Expansion result with the final command
   *
   * @example
   * ```typescript
   * history.expand('!!');        // Last command
   * history.expand('!5');        // Command #5
   * history.expand('!-2');       // 2nd most recent command
   * history.expand('!git');      // Most recent command starting with "git"
   * history.expand('echo !!');   // "echo" + last command (inline expansion)
   * ```
   */
  expand(input: string): HistoryExpansionResult {
    if (!input.includes("!")) {
      return { expanded: false, command: input };
    }

    let result = input;
    let expanded = false;
    let error: string | undefined;

    // Pattern: !! (repeat last command)
    const doubleResult = this.expandDoubleBang(result);
    if (doubleResult.error) {
      return { expanded: false, command: input, error: doubleResult.error };
    }
    if (doubleResult.expanded) {
      result = doubleResult.command;
      expanded = true;
    }

    // Pattern: !-n (nth previous command)
    const negativeResult = this.expandNegativeIndex(result);
    if (negativeResult.expanded) {
      result = negativeResult.command;
      expanded = true;
    }
    if (negativeResult.error) error = negativeResult.error;

    // Pattern: !n (command number n, 1-based)
    const numberResult = this.expandNumberIndex(result);
    if (numberResult.expanded) {
      result = numberResult.command;
      expanded = true;
    }
    if (numberResult.error) error = numberResult.error;

    // Pattern: !prefix (most recent command starting with prefix)
    const prefixResult = this.expandPrefix(result);
    if (prefixResult.expanded) {
      result = prefixResult.command;
      expanded = true;
    }
    if (prefixResult.error) error = prefixResult.error;

    return { expanded, command: result, error };
  }

  /**
   * Expands !! (last command).
   */
  private expandDoubleBang(input: string): HistoryExpansionResult {
    if (!input.includes("!!")) {
      return { expanded: false, command: input };
    }
    if (this.entries.length === 0) {
      return { expanded: false, command: input, error: "No commands in history" };
    }
    const lastEntry = this.entries[this.entries.length - 1];
    if (!lastEntry) {
      return { expanded: false, command: input, error: "No commands in history" };
    }
    return {
      expanded: true,
      command: input.replace(/!!/g, lastEntry.command),
    };
  }

  /**
   * Expands !-n (nth previous command).
   */
  private expandNegativeIndex(input: string): HistoryExpansionResult {
    const negativePattern = /!-(\d+)/g;
    let result = input;
    let expanded = false;
    let error: string | undefined;

    for (const match of result.matchAll(negativePattern)) {
      const matchGroup = match[1];
      if (!matchGroup) continue;
      const n = parseInt(matchGroup, 10);
      const index = this.entries.length - n;
      if (index < 0 || index >= this.entries.length) {
        error = `!-${n}: event not found`;
        continue;
      }
      const entry = this.entries[index];
      if (entry) {
        result = result.replace(match[0], entry.command);
        expanded = true;
      }
    }

    return { expanded, command: result, error };
  }

  /**
   * Expands !n (command number n, 1-based).
   */
  private expandNumberIndex(input: string): HistoryExpansionResult {
    const numberPattern = /!(\d+)(?!\d)/g;
    let result = input;
    let expanded = false;
    let error: string | undefined;

    for (const match of result.matchAll(numberPattern)) {
      const matchGroup = match[1];
      if (!matchGroup) continue;
      const n = parseInt(matchGroup, 10);
      const index = n - 1; // Convert to 0-based
      if (index < 0 || index >= this.entries.length) {
        error = `!${n}: event not found`;
        continue;
      }
      const entry = this.entries[index];
      if (entry) {
        result = result.replace(match[0], entry.command);
        expanded = true;
      }
    }

    return { expanded, command: result, error };
  }

  /**
   * Expands !prefix (most recent command starting with prefix).
   */
  private expandPrefix(input: string): HistoryExpansionResult {
    const prefixPattern = /!([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let result = input;
    let expanded = false;
    let error: string | undefined;

    for (const match of result.matchAll(prefixPattern)) {
      const prefix = match[1];
      if (!prefix) continue;
      const found = this.findByPrefix(prefix);
      if (!found) {
        error = `!${prefix}: event not found`;
        continue;
      }
      result = result.replace(match[0], found.command);
      expanded = true;
    }

    return { expanded, command: result, error };
  }

  /**
   * Finds the most recent command starting with a prefix.
   *
   * @param prefix - The prefix to search for
   * @returns The matching entry or undefined
   */
  private findByPrefix(prefix: string): HistoryEntry | undefined {
    const normalizedPrefix = prefix.toLowerCase();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry?.command.toLowerCase().startsWith(normalizedPrefix)) {
        return entry;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // Sensitive Data Masking
  // ===========================================================================

  /**
   * Masks sensitive data in a command string.
   *
   * Applies all configured patterns to detect and mask:
   * - API keys (OpenAI, Anthropic, GitHub, AWS)
   * - Passwords in URLs
   * - Bearer tokens
   * - Generic secrets and tokens
   *
   * @param command - The command to mask
   * @returns The command with sensitive data replaced
   */
  maskSensitiveData(command: string): string {
    let result = command;

    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      if (typeof replacement === "string") {
        result = result.replace(pattern, replacement);
      } else {
        result = result.replace(pattern, replacement);
      }
    }

    return result;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Gets all entries (for testing/debugging).
   *
   * @returns Copy of all history entries
   */
  getAllEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Gets the history file path.
   *
   * @returns The configured history file path
   */
  getHistoryFilePath(): string {
    return this.historyFile;
  }

  /**
   * Checks if history has been loaded.
   *
   * @returns True if load() has been called successfully
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}

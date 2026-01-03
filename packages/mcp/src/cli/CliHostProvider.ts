// ============================================
// T034: CLI Host Provider
// ============================================

/**
 * Host provider for CLI environments.
 * Provides colored console output and progress indicators.
 *
 * @module mcp/cli/CliHostProvider
 */

import { styleText } from "node:util";

// ============================================
// Types
// ============================================

/**
 * Progress spinner options.
 */
export interface ProgressOptions {
  /** Spinner text to display */
  text?: string;
  /** Whether to persist the spinner on success (default: false) */
  persist?: boolean;
}

/**
 * Progress spinner control interface.
 */
export interface ProgressSpinner {
  /** Update spinner text */
  update(text: string): void;
  /** Complete with success message */
  succeed(text?: string): void;
  /** Complete with failure message */
  fail(text?: string): void;
  /** Stop the spinner (preserves last state) */
  stop(): void;
}

/**
 * Configuration for CliHostProvider.
 */
export interface CliHostProviderConfig {
  /** Whether to use colors (default: auto-detect) */
  useColors?: boolean;
  /** Custom output stream for info/warning (default: stdout) */
  stdout?: NodeJS.WritableStream;
  /** Custom output stream for errors (default: stderr) */
  stderr?: NodeJS.WritableStream;
  /** Whether spinners are enabled (default: true in TTY) */
  spinnerEnabled?: boolean;
}

/**
 * Host provider interface for abstracting UI interactions.
 */
export interface IHostProvider {
  /** Display an informational message (blue) */
  showInfo(message: string): void;
  /** Display a warning message (yellow) */
  showWarning(message: string): void;
  /** Display an error message (red to stderr) */
  showError(message: string): void;
  /** Create and start a progress spinner */
  showProgress(options?: ProgressOptions): ProgressSpinner;
}

// ============================================
// Simple Spinner Implementation
// ============================================

/**
 * Simple CLI spinner using ora-style frames.
 * Falls back to simple dots in non-TTY environments.
 */
class SimpleSpinner implements ProgressSpinner {
  private static readonly FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private static readonly INTERVAL_MS = 80;

  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private text: string;
  private readonly stream: NodeJS.WritableStream;
  private readonly isInteractive: boolean;
  private readonly useColors: boolean;

  constructor(
    text: string,
    stream: NodeJS.WritableStream,
    isInteractive: boolean,
    useColors: boolean
  ) {
    this.text = text;
    this.stream = stream;
    this.isInteractive = isInteractive;
    this.useColors = useColors;
  }

  /**
   * Start the spinner animation.
   */
  start(): void {
    if (this.isInteractive) {
      this.render();
      this.intervalId = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % SimpleSpinner.FRAMES.length;
        this.render();
      }, SimpleSpinner.INTERVAL_MS);
    } else {
      // Non-interactive: just print the message
      this.stream.write(`... ${this.text}\n`);
    }
  }

  /**
   * Update the spinner text.
   */
  update(text: string): void {
    this.text = text;
    if (!this.isInteractive) {
      this.stream.write(`... ${text}\n`);
    }
  }

  /**
   * Complete with success.
   */
  succeed(text?: string): void {
    this.stop();
    const finalText = text ?? this.text;
    const symbol = this.useColors ? styleText("green", "✔") : "✔";
    this.stream.write(`${symbol} ${finalText}\n`);
  }

  /**
   * Complete with failure.
   */
  fail(text?: string): void {
    this.stop();
    const finalText = text ?? this.text;
    const symbol = this.useColors ? styleText("red", "✖") : "✖";
    this.stream.write(`${symbol} ${finalText}\n`);
  }

  /**
   * Stop the spinner.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isInteractive) {
      // Clear the line
      this.stream.write("\r\x1b[K");
    }
  }

  /**
   * Render the current frame.
   */
  private render(): void {
    const frame = SimpleSpinner.FRAMES[this.frameIndex] ?? "⠋";
    const coloredFrame = this.useColors ? styleText("cyan", frame) : frame;
    // Move to beginning of line and clear, then write frame + text
    this.stream.write(`\r\x1b[K${coloredFrame} ${this.text}`);
  }
}

// ============================================
// CliHostProvider Implementation
// ============================================

/**
 * CLI Host Provider
 *
 * Provides colored output and progress indicators for CLI environments:
 * - `showInfo()`: Blue prefix for informational messages
 * - `showWarning()`: Yellow prefix for warning messages
 * - `showError()`: Red prefix, output to stderr
 * - `showProgress()`: Animated spinner (ora-style)
 *
 * @example
 * ```typescript
 * import { CliHostProvider } from '@vellum/mcp/cli';
 *
 * const host = new CliHostProvider();
 *
 * host.showInfo('Connecting to server...');
 * host.showWarning('Connection slow, retrying...');
 * host.showError('Connection failed');
 *
 * const spinner = host.showProgress({ text: 'Loading...' });
 * // ... async work ...
 * spinner.succeed('Loaded successfully');
 * ```
 */
export class CliHostProvider implements IHostProvider {
  private readonly useColors: boolean;
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;
  private readonly spinnerEnabled: boolean;
  private readonly isInteractive: boolean;

  /**
   * Create a new CLI host provider.
   *
   * @param config - Provider configuration
   */
  constructor(config?: CliHostProviderConfig) {
    this.stdout = config?.stdout ?? process.stdout;
    this.stderr = config?.stderr ?? process.stderr;

    // Auto-detect color support
    const isTTY = "isTTY" in this.stdout && (this.stdout as NodeJS.WriteStream).isTTY;
    this.useColors = config?.useColors ?? (isTTY && !process.env.NO_COLOR);
    this.isInteractive = isTTY;
    this.spinnerEnabled = config?.spinnerEnabled ?? this.isInteractive;
  }

  /**
   * Display an informational message with blue prefix.
   *
   * @param message - Message to display
   */
  showInfo(message: string): void {
    const prefix = this.useColors ? styleText("blue", "ℹ") : "ℹ";
    this.stdout.write(`${prefix} ${message}\n`);
  }

  /**
   * Display a warning message with yellow prefix.
   *
   * @param message - Warning message to display
   */
  showWarning(message: string): void {
    const prefix = this.useColors ? styleText("yellow", "⚠") : "⚠";
    this.stdout.write(`${prefix} ${message}\n`);
  }

  /**
   * Display an error message with red prefix to stderr.
   *
   * @param message - Error message to display
   */
  showError(message: string): void {
    const prefix = this.useColors ? styleText("red", "✖") : "✖";
    this.stderr.write(`${prefix} ${message}\n`);
  }

  /**
   * Create and start a progress spinner.
   *
   * @param options - Spinner options
   * @returns Progress spinner controller
   */
  showProgress(options?: ProgressOptions): ProgressSpinner {
    const text = options?.text ?? "";

    if (!this.spinnerEnabled) {
      // Return a no-op spinner for non-interactive environments
      return {
        update: (t: string) => this.stdout.write(`... ${t}\n`),
        succeed: (t?: string) => this.showInfo(t ?? text),
        fail: (t?: string) => this.showError(t ?? text),
        stop: () => {},
      };
    }

    const spinner = new SimpleSpinner(text, this.stdout, this.isInteractive, this.useColors);
    spinner.start();
    return spinner;
  }
}

/**
 * Create a default CLI host provider.
 *
 * @param config - Optional configuration
 * @returns Configured CliHostProvider instance
 */
export function createCliHostProvider(config?: CliHostProviderConfig): CliHostProvider {
  return new CliHostProvider(config);
}

export default CliHostProvider;

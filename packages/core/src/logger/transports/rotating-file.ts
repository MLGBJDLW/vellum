import * as fs from "node:fs";
import * as path from "node:path";
import { gzipSync } from "node:zlib";

import type { LogEntry, LogTransport } from "../types.js";

/**
 * Options for RotatingFileTransport.
 */
export interface RotatingFileOptions {
  /** Path to the log file */
  filepath: string;
  /** Maximum file size in bytes before rotation (default: 10MB) */
  maxSize?: number;
  /** Maximum number of rotated files to keep (default: 5) */
  maxFiles?: number;
  /** Whether to compress rotated files with gzip (default: true) */
  compress?: boolean;
}

/**
 * File transport with automatic rotation based on file size.
 * Rotates log files when they exceed maxSize, keeping up to maxFiles rotated copies.
 * Optionally compresses rotated files using gzip.
 *
 * @example
 * ```typescript
 * const transport = new RotatingFileTransport({
 *   filepath: './logs/app.log',
 *   maxSize: 10 * 1024 * 1024, // 10MB
 *   maxFiles: 5,
 *   compress: true,
 * });
 * logger.addTransport(transport);
 * ```
 */
export class RotatingFileTransport implements LogTransport {
  private readonly filepath: string;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private readonly compress: boolean;
  private currentSize = 0;

  constructor(options: RotatingFileOptions) {
    this.filepath = options.filepath;
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles ?? 5;
    this.compress = options.compress ?? true;
    this.ensureDirectory();
    this.currentSize = this.getFileSize();
  }

  /**
   * Write a log entry to the file.
   * Automatically rotates if the file exceeds maxSize.
   */
  log(entry: LogEntry): void {
    this.write(entry);
  }

  /**
   * Write a log entry to the file (alias for log).
   */
  write(entry: LogEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(line, "utf8");

    if (this.currentSize + bytes > this.maxSize) {
      this.rotate();
    }

    fs.appendFileSync(this.filepath, line, "utf8");
    this.currentSize += bytes;
  }

  /**
   * Rotate log files.
   * Shifts existing rotated files and compresses the current file.
   */
  private rotate(): void {
    const ext = this.compress ? ".gz" : "";

    // Shift existing files: .log.4 → .log.5, .log.3 → .log.4, etc.
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const from = `${this.filepath}.${i}${ext}`;
      const to = `${this.filepath}.${i + 1}${ext}`;

      if (fs.existsSync(from)) {
        if (i + 1 > this.maxFiles) {
          // Delete files beyond maxFiles limit
          fs.unlinkSync(from);
        } else {
          fs.renameSync(from, to);
        }
      }
    }

    // Delete the oldest file if it exists and exceeds maxFiles
    const oldestFile = `${this.filepath}.${this.maxFiles + 1}${ext}`;
    if (fs.existsSync(oldestFile)) {
      fs.unlinkSync(oldestFile);
    }

    // Compress and move current file to .1
    if (fs.existsSync(this.filepath)) {
      const content = fs.readFileSync(this.filepath);
      const targetPath = `${this.filepath}.1${ext}`;

      if (this.compress) {
        fs.writeFileSync(targetPath, gzipSync(content));
      } else {
        fs.writeFileSync(targetPath, content);
      }

      // Clear the current log file
      fs.writeFileSync(this.filepath, "");
    }

    this.currentSize = 0;
  }

  /**
   * Ensure the log directory exists.
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get the current file size, or 0 if file doesn't exist.
   */
  private getFileSize(): number {
    try {
      return fs.statSync(this.filepath).size;
    } catch {
      return 0;
    }
  }

  /**
   * Get the current log file path.
   */
  getFilepath(): string {
    return this.filepath;
  }

  /**
   * Get the current file size in bytes.
   */
  getCurrentSize(): number {
    return this.currentSize;
  }
}

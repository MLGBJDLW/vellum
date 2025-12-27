/**
 * Credential Security Utilities
 *
 * Provides secure memory handling for sensitive credential data.
 * Implements best practices for protecting secrets in memory.
 *
 * @module credentials/security
 */

// =============================================================================
// T006: SecureString Class
// =============================================================================

/**
 * SecureString - Memory-protected string for sensitive data
 *
 * Provides a way to store sensitive string data (like API keys, passwords)
 * with automatic cleanup when no longer needed. Uses Symbol.dispose for
 * integration with TypeScript's `using` declarations.
 *
 * Security features:
 * - Stores data in a Buffer that can be zeroed
 * - Implements Symbol.dispose for automatic cleanup
 * - Prevents accidental logging via custom toString()
 * - Tracks disposed state to prevent use-after-free
 *
 * @example
 * ```typescript
 * // Using with 'using' declaration (recommended)
 * {
 *   using secret = SecureString.from("sk-secret-key");
 *   await authenticate(secret.expose());
 * } // Automatically disposed here
 *
 * // Manual disposal
 * const secret = SecureString.from("sk-secret-key");
 * try {
 *   await authenticate(secret.expose());
 * } finally {
 *   secret.dispose();
 * }
 * ```
 */
export class SecureString implements Disposable {
  private buffer: Buffer;
  private disposed = false;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(data: string | Buffer) {
    if (typeof data === "string") {
      this.buffer = Buffer.from(data, "utf-8");
    } else {
      this.buffer = data;
    }
  }

  /**
   * Create a SecureString from a plain string
   *
   * @param value - The sensitive string value
   * @returns A new SecureString instance
   */
  static from(value: string): SecureString {
    return new SecureString(value);
  }

  /**
   * Create a SecureString from a Buffer
   *
   * Note: The buffer is copied, not referenced. The original
   * buffer should be zeroed after passing to this method.
   *
   * @param buffer - The buffer containing sensitive data
   * @returns A new SecureString instance
   */
  static fromBuffer(buffer: Buffer): SecureString {
    // Copy the buffer to ensure we own the memory
    const copy = Buffer.allocUnsafe(buffer.length);
    buffer.copy(copy);
    return new SecureString(copy);
  }

  /**
   * Get the length of the secure string
   *
   * @returns The length in bytes
   * @throws Error if already disposed
   */
  get length(): number {
    this.checkDisposed();
    return this.buffer.length;
  }

  /**
   * Check if this SecureString has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Expose the underlying string value
   *
   * WARNING: This creates a new string that cannot be securely erased.
   * Only call this when absolutely necessary (e.g., passing to an API).
   * Consider using exposeBuffer() when possible.
   *
   * @returns The underlying string value
   * @throws Error if already disposed
   */
  expose(): string {
    this.checkDisposed();
    return this.buffer.toString("utf-8");
  }

  /**
   * Expose the underlying buffer for reading
   *
   * WARNING: Returns a view of the internal buffer.
   * Do not modify or store references to this buffer.
   *
   * @returns Read-only view of the internal buffer
   * @throws Error if already disposed
   */
  exposeBuffer(): Readonly<Buffer> {
    this.checkDisposed();
    return this.buffer;
  }

  /**
   * Execute a callback with the exposed value
   *
   * Provides controlled access to the secret value with guaranteed
   * cleanup. The value is only exposed for the duration of the callback.
   *
   * @param fn - Callback that receives the exposed value
   * @returns The callback's return value
   * @throws Error if already disposed
   *
   * @example
   * ```typescript
   * const result = await secret.withExposed(async (value) => {
   *   return await api.authenticate(value);
   * });
   * ```
   */
  withExposed<T>(fn: (value: string) => T): T {
    this.checkDisposed();
    return fn(this.buffer.toString("utf-8"));
  }

  /**
   * Execute an async callback with the exposed value
   *
   * @param fn - Async callback that receives the exposed value
   * @returns Promise resolving to the callback's return value
   * @throws Error if already disposed
   */
  async withExposedAsync<T>(fn: (value: string) => Promise<T>): Promise<T> {
    this.checkDisposed();
    return fn(this.buffer.toString("utf-8"));
  }

  /**
   * Create a copy of this SecureString
   *
   * @returns A new SecureString with the same value
   * @throws Error if already disposed
   */
  clone(): SecureString {
    this.checkDisposed();
    return SecureString.fromBuffer(this.buffer);
  }

  /**
   * Compare with another SecureString in constant time
   *
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * @param other - The SecureString to compare with
   * @returns True if the values are equal
   * @throws Error if either SecureString is disposed
   */
  equals(other: SecureString): boolean {
    this.checkDisposed();
    other.checkDisposed();

    if (this.buffer.length !== other.buffer.length) {
      return false;
    }

    // Constant-time comparison
    let result = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      result |= this.buffer[i]! ^ other.buffer[i]!;
    }
    return result === 0;
  }

  /**
   * Dispose of the secure string, zeroing the buffer
   *
   * After disposal, the SecureString cannot be used.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    // Zero the buffer
    this.buffer.fill(0);
    this.disposed = true;
  }

  /**
   * Symbol.dispose implementation for 'using' declarations
   *
   * @example
   * ```typescript
   * {
   *   using secret = SecureString.from("password");
   *   // use secret...
   * } // Automatically disposed here
   * ```
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Custom toString that never exposes the value
   *
   * Prevents accidental logging of sensitive data.
   */
  toString(): string {
    if (this.disposed) {
      return "[SecureString: disposed]";
    }
    return "[SecureString: ****]";
  }

  /**
   * Custom inspect for Node.js console
   *
   * Prevents accidental logging in Node.js environment.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }

  /**
   * Custom toJSON that never exposes the value
   *
   * Prevents accidental serialization of sensitive data.
   */
  toJSON(): string {
    return "[SecureString]";
  }

  /**
   * Check if disposed and throw if so
   */
  private checkDisposed(): void {
    if (this.disposed) {
      throw new Error("SecureString has been disposed");
    }
  }
}

// =============================================================================
// Secure Memory Utilities
// =============================================================================

/**
 * Zero a buffer's contents
 *
 * Securely erases a buffer by filling it with zeros.
 * Use this to clean up sensitive data that was temporarily
 * stored in a buffer.
 *
 * @param buffer - The buffer to zero
 */
export function zeroBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * Zero a string by zeroing the underlying buffer
 *
 * Note: This only works for strings that were created from
 * Buffer.toString(). JavaScript's string interning means
 * this may not fully clear the string from memory.
 *
 * For maximum security, use SecureString throughout.
 *
 * @param _str - The string to attempt to zero
 * @deprecated Use SecureString instead for sensitive data
 */
export function zeroString(_str: string): void {
  // Note: JavaScript strings are immutable and this cannot truly
  // zero them. This function exists to document the limitation
  // and encourage use of SecureString.
  //
  // The only way to ensure a string is garbage collected is to:
  // 1. Remove all references to it
  // 2. Wait for GC (which cannot be forced)
  //
  // For sensitive data, always use SecureString instead.
}

/**
 * Create a masked version of a credential for display
 *
 * @param value - The credential value to mask
 * @param visibleStart - Number of characters to show at start (default: 3)
 * @param visibleEnd - Number of characters to show at end (default: 3)
 * @returns Masked string (e.g., "sk-...abc")
 */
export function maskCredential(value: string, visibleStart = 3, visibleEnd = 3): string {
  const minLength = visibleStart + visibleEnd + 3; // 3 for "..."

  if (value.length <= minLength) {
    return "***";
  }

  const start = value.slice(0, visibleStart);
  const end = value.slice(-visibleEnd);

  return `${start}...${end}`;
}

/**
 * Constant-time string comparison
 *
 * Compares two strings in constant time to prevent timing attacks.
 * The comparison time depends only on the length of the strings,
 * not on when the first difference occurs.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if the strings are equal
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");

  if (bufA.length !== bufB.length) {
    // Still need to do constant-time comparison to avoid
    // revealing length difference through timing
    const dummy = Buffer.alloc(bufA.length);
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i]! ^ dummy[i]!;
    }
    // Always false but timing is consistent
    return false && result === 0;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }
  return result === 0;
}

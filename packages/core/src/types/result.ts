/**
 * Result Type Module
 *
 * Provides a comprehensive Result<T, E> type for type-safe error handling.
 * Implements functional programming patterns for composing operations
 * that may fail without throwing exceptions.
 *
 * @module result
 */

// =============================================================================
// T019: Result Type with Ok/Err Constructors
// =============================================================================

/**
 * Successful result variant
 *
 * @template T - Type of the success value
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Error result variant
 *
 * @template E - Type of the error value
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type - discriminated union of Ok and Err
 *
 * Represents the outcome of an operation that may fail.
 * Use `ok` field to discriminate between success and failure.
 *
 * @template T - Type of the success value
 * @template E - Type of the error value
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err("Division by zero");
 *   return Ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Create a successful Result
 *
 * @template T - Type of the success value
 * @param value - The success value
 * @returns An Ok result containing the value
 *
 * @example
 * ```typescript
 * const result = Ok(42);
 * // { ok: true, value: 42 }
 * ```
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error Result
 *
 * @template E - Type of the error value
 * @param error - The error value
 * @returns An Err result containing the error
 *
 * @example
 * ```typescript
 * const result = Err("Something went wrong");
 * // { ok: false, error: "Something went wrong" }
 * ```
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is Ok
 *
 * @template T - Type of the success value
 * @template E - Type of the error value
 * @param result - The result to check
 * @returns True if the result is Ok, with type narrowing
 *
 * @example
 * ```typescript
 * const result: Result<number, string> = Ok(42);
 * if (isOk(result)) {
 *   // result.value is accessible here (type narrowed to Ok<number>)
 *   console.log(result.value);
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is Err
 *
 * @template T - Type of the success value
 * @template E - Type of the error value
 * @param result - The result to check
 * @returns True if the result is Err, with type narrowing
 *
 * @example
 * ```typescript
 * const result: Result<number, string> = Err("failed");
 * if (isErr(result)) {
 *   // result.error is accessible here (type narrowed to Err<string>)
 *   console.error(result.error);
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// =============================================================================
// T020: unwrap and unwrapOr Functions
// =============================================================================

/**
 * Extract the value from an Ok result, or throw if Err
 *
 * @template T - Type of the success value
 * @template E - Type of the error value
 * @param result - The result to unwrap
 * @returns The unwrapped value
 * @throws Error if the result is Err
 *
 * @example
 * ```typescript
 * const ok = Ok(42);
 * unwrap(ok); // 42
 *
 * const err = Err("failed");
 * unwrap(err); // throws Error: Result.unwrap called on Err: failed
 * ```
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Result.unwrap called on Err: ${String(result.error)}`);
}

/**
 * Extract the value from an Ok result, or return a fallback if Err
 *
 * @template T - Type of the success value
 * @template E - Type of the error value
 * @param result - The result to unwrap
 * @param fallback - The value to return if result is Err
 * @returns The unwrapped value or the fallback
 *
 * @example
 * ```typescript
 * const ok = Ok(42);
 * unwrapOr(ok, 0); // 42
 *
 * const err = Err("failed");
 * unwrapOr(err, 0); // 0
 * ```
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  if (result.ok) {
    return result.value;
  }
  return fallback;
}

// =============================================================================
// T021: map and mapErr Functions
// =============================================================================

/**
 * Transform the success value of a Result
 *
 * If the result is Ok, applies the function to the value and returns a new Ok.
 * If the result is Err, returns the Err unchanged.
 *
 * @template T - Original success type
 * @template U - Transformed success type
 * @template E - Error type
 * @param result - The result to map
 * @param fn - Function to apply to the success value
 * @returns A new Result with the transformed value or the original error
 *
 * @example
 * ```typescript
 * const ok = Ok(5);
 * map(ok, x => x * 2); // Ok(10)
 *
 * const err = Err("failed");
 * map(err, x => x * 2); // Err("failed")
 * ```
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return Ok(fn(result.value));
  }
  return result;
}

/**
 * Transform the error value of a Result
 *
 * If the result is Err, applies the function to the error and returns a new Err.
 * If the result is Ok, returns the Ok unchanged.
 *
 * @template T - Success type
 * @template E - Original error type
 * @template F - Transformed error type
 * @param result - The result to map
 * @param fn - Function to apply to the error value
 * @returns A new Result with the transformed error or the original value
 *
 * @example
 * ```typescript
 * const err = Err("failed");
 * mapErr(err, e => new Error(e)); // Err(Error("failed"))
 *
 * const ok = Ok(42);
 * mapErr(ok, e => new Error(e)); // Ok(42)
 * ```
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {
    return result;
  }
  return Err(fn(result.error));
}

// =============================================================================
// T022: flatMap Function
// =============================================================================

/**
 * Chain Result-returning operations
 *
 * If the result is Ok, applies the function to the value and returns its result.
 * If the result is Err, returns the Err unchanged.
 * This is useful for chaining operations that may fail.
 *
 * @template T - Original success type
 * @template U - New success type
 * @template E - Error type
 * @param result - The result to flatMap
 * @param fn - Function that takes the success value and returns a new Result
 * @returns The result of fn if Ok, or the original Err
 *
 * @example
 * ```typescript
 * const parse = (s: string): Result<number, string> => {
 *   const n = Number(s);
 *   return isNaN(n) ? Err("not a number") : Ok(n);
 * };
 *
 * const divide = (n: number): Result<number, string> => {
 *   return n === 0 ? Err("division by zero") : Ok(100 / n);
 * };
 *
 * // Chain operations
 * flatMap(parse("10"), divide); // Ok(10)
 * flatMap(parse("0"), divide);  // Err("division by zero")
 * flatMap(parse("abc"), divide); // Err("not a number")
 * ```
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

// =============================================================================
// T023: match and all Functions
// =============================================================================

/**
 * Pattern match on a Result
 *
 * Provides exhaustive handling of both Ok and Err cases.
 * Returns the result of whichever handler matches.
 *
 * @template T - Success type
 * @template E - Error type
 * @template U - Return type
 * @param result - The result to match
 * @param handlers - Object with ok and err handler functions
 * @returns The result of the matching handler
 *
 * @example
 * ```typescript
 * const result: Result<number, string> = Ok(42);
 *
 * const message = match(result, {
 *   ok: v => `Success: ${v}`,
 *   err: e => `Error: ${e}`
 * });
 * // "Success: 42"
 * ```
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => U; err: (error: E) => U }
): U {
  if (result.ok) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

/**
 * Combine multiple Results into a single Result
 *
 * If all results are Ok, returns Ok with an array of all values.
 * If any result is Err, returns the first Err encountered.
 *
 * @template T - Success type of each result
 * @template E - Error type
 * @param results - Array of results to combine
 * @returns Ok with all values if all succeed, or the first Err
 *
 * @example
 * ```typescript
 * all([Ok(1), Ok(2), Ok(3)]); // Ok([1, 2, 3])
 * all([Ok(1), Err("fail"), Ok(3)]); // Err("fail")
 * all([]); // Ok([])
 * ```
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

// =============================================================================
// T024: tryCatch Async Wrapper
// =============================================================================

/**
 * Execute a function and wrap the result in a Result type
 *
 * Catches any thrown errors and wraps them in an Err.
 * Successful execution is wrapped in Ok.
 *
 * @template T - Return type of the function
 * @param fn - Function to execute
 * @returns Ok with the result or Err with the caught Error
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => JSON.parse('{"a":1}'));
 * // Ok({ a: 1 })
 *
 * const err = tryCatch(() => JSON.parse('invalid'));
 * // Err(SyntaxError: ...)
 * ```
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return Ok(fn());
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Execute an async function and wrap the result in a Result type
 *
 * Catches any thrown or rejected errors and wraps them in an Err.
 * Successful execution is wrapped in Ok.
 *
 * @template T - Return type of the async function
 * @param fn - Async function to execute
 * @returns Promise of Ok with the result or Err with the caught Error
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(async () => {
 *   const response = await fetch('/api/data');
 *   return response.json();
 * });
 *
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await fn());
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

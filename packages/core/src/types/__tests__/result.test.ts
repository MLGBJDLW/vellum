/**
 * Unit tests for Result type
 *
 * @see packages/core/src/types/result.ts
 */

import { describe, expect, it } from "vitest";
import {
  all,
  Err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  match,
  Ok,
  type Result,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
} from "../result.js";

// =============================================================================
// T019: Ok/Err Constructors
// =============================================================================
describe("Ok/Err Constructors", () => {
  describe("Ok", () => {
    it("should create an Ok result with a value", () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it("should create an Ok result with null", () => {
      const result = Ok(null);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(null);
      }
    });

    it("should create an Ok result with undefined", () => {
      const result = Ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(undefined);
      }
    });

    it("should create an Ok result with an object", () => {
      const data = { name: "test", value: 123 };
      const result = Ok(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });

    it("should create an Ok result with an array", () => {
      const data = [1, 2, 3];
      const result = Ok(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(data);
      }
    });
  });

  describe("Err", () => {
    it("should create an Err result with a string error", () => {
      const result = Err("Something went wrong");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Something went wrong");
      }
    });

    it("should create an Err result with an Error object", () => {
      const error = new Error("Test error");
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it("should create an Err result with an object error", () => {
      const error = { code: 404, message: "Not found" };
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual(error);
      }
    });
  });
});

// =============================================================================
// T019: isOk/isErr Type Guards
// =============================================================================
describe("isOk/isErr Type Guards", () => {
  describe("isOk", () => {
    it("should return true for Ok result", () => {
      const result = Ok(42);
      expect(isOk(result)).toBe(true);
    });

    it("should return false for Err result", () => {
      const result = Err("error");
      expect(isOk(result)).toBe(false);
    });

    it("should narrow type correctly for Ok", () => {
      const result: Result<number, string> = Ok(42);
      if (isOk(result)) {
        // TypeScript should know result.value is number here
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe("isErr", () => {
    it("should return true for Err result", () => {
      const result = Err("error");
      expect(isErr(result)).toBe(true);
    });

    it("should return false for Ok result", () => {
      const result = Ok(42);
      expect(isErr(result)).toBe(false);
    });

    it("should narrow type correctly for Err", () => {
      const result: Result<number, string> = Err("failed");
      if (isErr(result)) {
        // TypeScript should know result.error is string here
        const error: string = result.error;
        expect(error).toBe("failed");
      }
    });
  });
});

// =============================================================================
// T020: unwrap Function
// =============================================================================
describe("unwrap", () => {
  it("should return value for Ok result", () => {
    const result = Ok(42);
    expect(unwrap(result)).toBe(42);
  });

  it("should return value for Ok result with object", () => {
    const data = { name: "test" };
    const result = Ok(data);
    expect(unwrap(result)).toEqual(data);
  });

  it("should throw for Err result with string error", () => {
    const result = Err("Something failed");
    expect(() => unwrap(result)).toThrow("Result.unwrap called on Err: Something failed");
  });

  it("should throw for Err result with Error object", () => {
    const error = new Error("Test error");
    const result = Err(error);
    expect(() => unwrap(result)).toThrow("Result.unwrap called on Err:");
  });

  it("should throw for Err result with object error", () => {
    const result = Err({ code: 500 });
    expect(() => unwrap(result)).toThrow("Result.unwrap called on Err:");
  });
});

// =============================================================================
// T020: unwrapOr Function
// =============================================================================
describe("unwrapOr", () => {
  it("should return value for Ok result", () => {
    const result = Ok(42);
    expect(unwrapOr(result, 0)).toBe(42);
  });

  it("should return fallback for Err result", () => {
    const result = Err("error");
    expect(unwrapOr(result, 0)).toBe(0);
  });

  it("should return complex fallback for Err result", () => {
    const result: Result<{ name: string }, string> = Err("not found");
    const fallback = { name: "default" };
    expect(unwrapOr(result, fallback)).toEqual(fallback);
  });

  it("should return null fallback for Err result", () => {
    const result: Result<string | null, string> = Err("error");
    expect(unwrapOr(result, null)).toBe(null);
  });
});

// =============================================================================
// T021: map Function
// =============================================================================
describe("map", () => {
  it("should transform value for Ok result", () => {
    const result = Ok(5);
    const mapped = map(result, (x) => x * 2);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe(10);
    }
  });

  it("should chain multiple transformations", () => {
    const result = Ok(2);
    const mapped = map(
      map(result, (x) => x + 3),
      (x) => x * 2
    );
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe(10);
    }
  });

  it("should pass through Err unchanged", () => {
    const result: Result<number, string> = Err("failed");
    const mapped = map(result, (x) => x * 2);
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBe("failed");
    }
  });

  it("should transform to different type", () => {
    const result = Ok(42);
    const mapped = map(result, (x) => `Value: ${x}`);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe("Value: 42");
    }
  });
});

// =============================================================================
// T021: mapErr Function
// =============================================================================
describe("mapErr", () => {
  it("should transform error for Err result", () => {
    const result = Err("failed");
    const mapped = mapErr(result, (e) => new Error(e));
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toBeInstanceOf(Error);
      expect(mapped.error.message).toBe("failed");
    }
  });

  it("should pass through Ok unchanged", () => {
    const result: Result<number, string> = Ok(42);
    const mapped = mapErr(result, (e) => new Error(e));
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      expect(mapped.value).toBe(42);
    }
  });

  it("should transform error to different type", () => {
    const result: Result<number, string> = Err("not found");
    const mapped = mapErr(result, (e) => ({ code: 404, message: e }));
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error).toEqual({ code: 404, message: "not found" });
    }
  });
});

// =============================================================================
// T022: flatMap Function
// =============================================================================
describe("flatMap", () => {
  const parse = (s: string): Result<number, string> => {
    const n = Number(s);
    return Number.isNaN(n) ? Err("not a number") : Ok(n);
  };

  const divide = (n: number): Result<number, string> => {
    return n === 0 ? Err("division by zero") : Ok(100 / n);
  };

  it("should chain successful operations", () => {
    const result = flatMap(parse("10"), divide);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(10);
    }
  });

  it("should return first error in chain", () => {
    const result = flatMap(parse("abc"), divide);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe("not a number");
    }
  });

  it("should return second error in chain", () => {
    const result = flatMap(parse("0"), divide);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe("division by zero");
    }
  });

  it("should pass through initial Err", () => {
    const initial: Result<string, string> = Err("initial error");
    const result = flatMap(initial, parse);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe("initial error");
    }
  });
});

// =============================================================================
// T023: match Function
// =============================================================================
describe("match", () => {
  it("should call ok handler for Ok result", () => {
    const result: Result<number, string> = Ok(42);
    const message = match(result, {
      ok: (v) => `Success: ${v}`,
      err: (e) => `Error: ${e}`,
    });
    expect(message).toBe("Success: 42");
  });

  it("should call err handler for Err result", () => {
    const result: Result<number, string> = Err("failed");
    const message = match(result, {
      ok: (v) => `Success: ${v}`,
      err: (e) => `Error: ${e}`,
    });
    expect(message).toBe("Error: failed");
  });

  it("should return different types from handlers", () => {
    const okResult: Result<number, string> = Ok(10);
    const errResult: Result<number, string> = Err("error");

    const okNum = match(okResult, {
      ok: (v) => v * 2,
      err: () => -1,
    });
    expect(okNum).toBe(20);

    const errNum = match(errResult, {
      ok: (v) => v * 2,
      err: () => -1,
    });
    expect(errNum).toBe(-1);
  });

  it("should handle complex transformations", () => {
    interface User {
      name: string;
    }
    type SuccessOutput = { status: "found"; user: User };
    type ErrorOutput = { status: "error"; code: number };

    const result: Result<User, { code: number }> = Ok({ name: "Alice" });
    const output = match<User, { code: number }, SuccessOutput | ErrorOutput>(result, {
      ok: (user) => ({ status: "found", user }),
      err: (e) => ({ status: "error", code: e.code }),
    });
    expect(output).toEqual({ status: "found", user: { name: "Alice" } });
  });
});

// =============================================================================
// T023: all Function
// =============================================================================
describe("all", () => {
  it("should return Ok with all values when all results are Ok", () => {
    const results = [Ok(1), Ok(2), Ok(3)];
    const combined = all(results);
    expect(isOk(combined)).toBe(true);
    if (isOk(combined)) {
      expect(combined.value).toEqual([1, 2, 3]);
    }
  });

  it("should return first Err when any result is Err", () => {
    const results: Result<number, string>[] = [
      Ok(1),
      Err("first error"),
      Ok(3),
      Err("second error"),
    ];
    const combined = all(results);
    expect(isErr(combined)).toBe(true);
    if (isErr(combined)) {
      expect(combined.error).toBe("first error");
    }
  });

  it("should return Ok with empty array for empty input", () => {
    const results: Result<number, string>[] = [];
    const combined = all(results);
    expect(isOk(combined)).toBe(true);
    if (isOk(combined)) {
      expect(combined.value).toEqual([]);
    }
  });

  it("should handle single Ok result", () => {
    const results = [Ok(42)];
    const combined = all(results);
    expect(isOk(combined)).toBe(true);
    if (isOk(combined)) {
      expect(combined.value).toEqual([42]);
    }
  });

  it("should handle single Err result", () => {
    const results: Result<number, string>[] = [Err("only error")];
    const combined = all(results);
    expect(isErr(combined)).toBe(true);
    if (isErr(combined)) {
      expect(combined.error).toBe("only error");
    }
  });
});

// =============================================================================
// T024: tryCatch Function (Sync)
// =============================================================================
describe("tryCatch", () => {
  it("should return Ok for successful function", () => {
    const result = tryCatch(() => JSON.parse('{"a":1}'));
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ a: 1 });
    }
  });

  it("should return Err for throwing function", () => {
    const result = tryCatch(() => JSON.parse("invalid json"));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("should wrap non-Error throws in Error", () => {
    const result = tryCatch(() => {
      throw "string error";
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string error");
    }
  });

  it("should preserve Error objects", () => {
    const originalError = new TypeError("type mismatch");
    const result = tryCatch(() => {
      throw originalError;
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe(originalError);
    }
  });

  it("should return Ok with void for functions returning undefined", () => {
    const result = tryCatch(() => {
      // No-op function
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeUndefined();
    }
  });
});

// =============================================================================
// T024: tryCatchAsync Function
// =============================================================================
describe("tryCatchAsync", () => {
  it("should return Ok for successful async function", async () => {
    const result = await tryCatchAsync(async () => {
      return Promise.resolve(42);
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it("should return Err for rejected promise", async () => {
    const result = await tryCatchAsync(async () => {
      return Promise.reject(new Error("async error"));
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("async error");
    }
  });

  it("should return Err for thrown error in async function", async () => {
    const result = await tryCatchAsync(async () => {
      throw new Error("thrown in async");
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe("thrown in async");
    }
  });

  it("should wrap non-Error rejections in Error", async () => {
    const result = await tryCatchAsync(async () => {
      return Promise.reject("string rejection");
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string rejection");
    }
  });

  it("should handle async operations that resolve", async () => {
    const result = await tryCatchAsync(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "delayed result";
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe("delayed result");
    }
  });
});

// =============================================================================
// Type Narrowing Tests
// =============================================================================
describe("Type Narrowing", () => {
  it("should narrow type with direct ok check", () => {
    const result: Result<number, string> = Ok(42);
    if (result.ok) {
      // TypeScript knows this is Ok<number>
      const value: number = result.value;
      expect(value).toBe(42);
    } else {
      // TypeScript knows this is Err<string>
      const error: string = result.error;
      expect(error).toBeDefined();
    }
  });

  it("should narrow type with negated ok check", () => {
    const result: Result<number, string> = Err("error");
    if (!result.ok) {
      // TypeScript knows this is Err<string>
      const error: string = result.error;
      expect(error).toBe("error");
    }
  });

  it("should maintain type safety through map chain", () => {
    const result: Result<string, Error> = Ok("hello");
    const mapped: Result<number, Error> = map(result, (s) => s.length);
    expect(isOk(mapped)).toBe(true);
    if (isOk(mapped)) {
      const len: number = mapped.value;
      expect(len).toBe(5);
    }
  });

  it("should maintain type safety through flatMap chain", () => {
    const toNumber = (s: string): Result<number, string> => {
      const n = Number.parseInt(s, 10);
      return Number.isNaN(n) ? Err("not a number") : Ok(n);
    };

    const initial: Result<string, string> = Ok("42");
    const final: Result<number, string> = flatMap(initial, toNumber);

    expect(isOk(final)).toBe(true);
    if (isOk(final)) {
      const n: number = final.value;
      expect(n).toBe(42);
    }
  });
});

// =============================================================================
// Integration Tests
// =============================================================================
describe("Result Integration", () => {
  it("should compose multiple operations", () => {
    // Simulate a realistic workflow
    const fetchUser = (id: number): Result<{ id: number; name: string }, string> => {
      if (id <= 0) return Err("Invalid ID");
      return Ok({ id, name: `User ${id}` });
    };

    const validateAge = (age: number): Result<number, string> => {
      if (age < 0 || age > 150) return Err("Invalid age");
      return Ok(age);
    };

    // Chain operations
    const userId = 1;
    const userResult = fetchUser(userId);

    const message = match(userResult, {
      ok: (user) => {
        const ageResult = validateAge(25);
        return match(ageResult, {
          ok: (age) => `${user.name} is ${age} years old`,
          err: (e) => `Age error: ${e}`,
        });
      },
      err: (e) => `User error: ${e}`,
    });

    expect(message).toBe("User 1 is 25 years old");
  });

  it("should handle error propagation correctly", () => {
    const results = all([Ok(1), Ok(2), Err("third failed"), Ok(4)] as Result<number, string>[]);

    const message = match(results, {
      ok: (values) => `Sum: ${values.reduce((a, b) => a + b, 0)}`,
      err: (e) => `Failed: ${e}`,
    });

    expect(message).toBe("Failed: third failed");
  });
});

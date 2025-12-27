import { describe, expect, it } from "vitest";
import { RequestContext, sanitizeData, serializeError } from "../decorators.js";

describe("RequestContext", () => {
  describe("constructor", () => {
    it("should store requestId", () => {
      const ctx = new RequestContext("req-123");
      expect(ctx.requestId).toBe("req-123");
    });

    it("should use provided startTime", () => {
      const startTime = 1000;
      const ctx = new RequestContext("req-123", startTime);
      expect(ctx.startTime).toBe(startTime);
    });

    it("should default startTime to Date.now()", () => {
      const before = Date.now();
      const ctx = new RequestContext("req-123");
      const after = Date.now();

      expect(ctx.startTime).toBeGreaterThanOrEqual(before);
      expect(ctx.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe("getDuration()", () => {
    it("should return elapsed time", () => {
      const startTime = Date.now() - 100; // 100ms ago
      const ctx = new RequestContext("req-123", startTime);
      const duration = ctx.getDuration();

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200); // Allow some margin
    });

    it("should return increasing duration over time", async () => {
      const ctx = new RequestContext("req-123");
      const duration1 = ctx.getDuration();

      await new Promise((r) => setTimeout(r, 10));
      const duration2 = ctx.getDuration();

      expect(duration2).toBeGreaterThan(duration1);
    });
  });

  describe("toLogContext()", () => {
    it("should return object with requestId and durationMs", () => {
      const startTime = Date.now() - 50;
      const ctx = new RequestContext("req-abc", startTime);
      const logContext = ctx.toLogContext();

      expect(logContext).toHaveProperty("requestId", "req-abc");
      expect(logContext).toHaveProperty("durationMs");
      expect(typeof logContext.durationMs).toBe("number");
      expect(logContext.durationMs).toBeGreaterThanOrEqual(50);
    });

    it("should be suitable for spreading into log data", () => {
      const ctx = new RequestContext("req-xyz");
      const logData = { action: "test", ...ctx.toLogContext() } as Record<string, unknown>;

      expect(logData.action).toBe("test");
      expect(logData.requestId).toBe("req-xyz");
      expect(logData.durationMs).toBeDefined();
    });
  });
});

describe("serializeError", () => {
  describe("Error objects", () => {
    it("should extract name, message, and stack from Error", () => {
      const error = new Error("Test error message");
      const result = serializeError(error);

      expect(result.name).toBe("Error");
      expect(result.message).toBe("Test error message");
      expect(result.stack).toBeDefined();
      expect(typeof result.stack).toBe("string");
    });

    it("should handle TypeError", () => {
      const error = new TypeError("Type mismatch");
      const result = serializeError(error);

      expect(result.name).toBe("TypeError");
      expect(result.message).toBe("Type mismatch");
    });

    it("should handle RangeError", () => {
      const error = new RangeError("Out of range");
      const result = serializeError(error);

      expect(result.name).toBe("RangeError");
      expect(result.message).toBe("Out of range");
    });

    it("should handle custom error classes", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }
      const error = new CustomError("Custom message");
      const result = serializeError(error);

      expect(result.name).toBe("CustomError");
      expect(result.message).toBe("Custom message");
    });
  });

  describe("non-Error values", () => {
    it("should wrap string in raw property", () => {
      const result = serializeError("string error");
      expect(result).toEqual({ raw: "string error" });
    });

    it("should convert number to string", () => {
      const result = serializeError(42);
      expect(result).toEqual({ raw: "42" });
    });

    it("should handle null", () => {
      const result = serializeError(null);
      expect(result).toEqual({ raw: "null" });
    });

    it("should handle undefined", () => {
      const result = serializeError(undefined);
      expect(result).toEqual({ raw: "undefined" });
    });

    it("should handle object without Error prototype", () => {
      const obj = { code: "ERR_001", reason: "Unknown" };
      const result = serializeError(obj);
      expect(result).toEqual({ raw: "[object Object]" });
    });

    it("should handle boolean", () => {
      expect(serializeError(true)).toEqual({ raw: "true" });
      expect(serializeError(false)).toEqual({ raw: "false" });
    });
  });
});

describe("sanitizeData", () => {
  describe("primitives", () => {
    it("should pass through null", () => {
      expect(sanitizeData(null)).toBeNull();
    });

    it("should pass through undefined", () => {
      expect(sanitizeData(undefined)).toBeUndefined();
    });

    it("should pass through numbers", () => {
      expect(sanitizeData(42)).toBe(42);
      expect(sanitizeData(3.14)).toBe(3.14);
      expect(sanitizeData(-100)).toBe(-100);
    });

    it("should pass through booleans", () => {
      expect(sanitizeData(true)).toBe(true);
      expect(sanitizeData(false)).toBe(false);
    });

    it("should pass through short strings", () => {
      expect(sanitizeData("hello")).toBe("hello");
      expect(sanitizeData("")).toBe("");
    });

    it("should convert bigint to string", () => {
      expect(sanitizeData(BigInt(12345))).toBe("12345");
    });

    it("should convert symbol to string", () => {
      const sym = Symbol("test");
      expect(sanitizeData(sym)).toBe("Symbol(test)");
    });

    it("should convert function to string representation", () => {
      function namedFn() {}
      expect(sanitizeData(namedFn)).toBe("[Function: namedFn]");

      const anon = () => {};
      expect(sanitizeData(anon)).toBe("[Function: anon]");
    });
  });

  describe("string truncation", () => {
    it("should truncate strings exceeding maxStringLength", () => {
      const longString = "x".repeat(2000);
      const result = sanitizeData(longString, 3, 1000) as string;

      expect(result.length).toBeLessThan(2000);
      expect(result).toContain("...[truncated");
      expect(result).toContain("chars]");
    });

    it("should not truncate strings within limit", () => {
      const shortString = "x".repeat(500);
      const result = sanitizeData(shortString, 3, 1000);

      expect(result).toBe(shortString);
    });

    it("should use custom maxStringLength", () => {
      const str = "x".repeat(100);
      const result = sanitizeData(str, 3, 50) as string;

      expect(result).toContain("...[truncated");
    });
  });

  describe("depth limiting", () => {
    it("should limit nested object depth", () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              level4: "too deep",
            },
          },
        },
      };

      const result = sanitizeData(deep, 3) as Record<string, unknown>;

      expect(result.level1).toBeDefined();
      const l1 = result.level1 as Record<string, unknown>;
      expect(l1.level2).toBeDefined();
      const l2 = l1.level2 as Record<string, unknown>;
      expect(l2.level3).toBe("[Max depth exceeded]");
    });

    it("should respect custom maxDepth", () => {
      const nested = { a: { b: { c: "value" } } };

      const result1 = sanitizeData(nested, 1) as Record<string, unknown>;
      expect(result1.a).toBe("[Max depth exceeded]");

      const result2 = sanitizeData(nested, 2) as Record<string, unknown>;
      const r2a = result2.a as Record<string, unknown>;
      expect(r2a.b).toBe("[Max depth exceeded]");
    });
  });

  describe("arrays", () => {
    it("should sanitize array elements", () => {
      const arr = [1, "hello", true];
      const result = sanitizeData(arr);

      expect(result).toEqual([1, "hello", true]);
    });

    it("should truncate long strings in arrays", () => {
      const arr = ["short", "x".repeat(2000)];
      const result = sanitizeData(arr, 3, 100) as unknown[];

      expect(result[0]).toBe("short");
      expect(result[1] as string).toContain("...[truncated");
    });

    it("should limit depth in nested arrays", () => {
      const nested = [[[[["too deep"]]]]];
      const result = sanitizeData(nested, 3) as unknown[];

      expect(result[0]).toBeDefined();
      const l1 = result[0] as unknown[];
      expect(l1[0]).toBeDefined();
      const l2 = l1[0] as unknown[];
      expect(l2[0]).toBe("[Max depth exceeded]");
    });
  });

  describe("special objects", () => {
    it("should convert Date to ISO string", () => {
      const date = new Date("2025-12-26T10:00:00.000Z");
      const result = sanitizeData(date);

      expect(result).toBe("2025-12-26T10:00:00.000Z");
    });

    it("should serialize Error objects", () => {
      const error = new Error("test");
      const result = sanitizeData(error) as Record<string, unknown>;

      expect(result.name).toBe("Error");
      expect(result.message).toBe("test");
    });
  });

  describe("circular references", () => {
    it("should handle circular references", () => {
      const obj: Record<string, unknown> = { name: "test" };
      obj.self = obj;

      const result = sanitizeData(obj) as Record<string, unknown>;

      expect(result.name).toBe("test");
      expect(result.self).toBe("[Circular reference]");
    });

    it("should handle circular references in arrays", () => {
      const arr: unknown[] = [1, 2];
      arr.push(arr);

      const result = sanitizeData(arr) as unknown[];

      expect(result[0]).toBe(1);
      expect(result[1]).toBe(2);
      expect(result[2]).toBe("[Circular reference]");
    });
  });

  describe("plain objects", () => {
    it("should sanitize object values", () => {
      const obj = {
        num: 42,
        str: "hello",
        bool: true,
        nested: { inner: "value" },
      };

      const result = sanitizeData(obj) as Record<string, unknown>;

      expect(result.num).toBe(42);
      expect(result.str).toBe("hello");
      expect(result.bool).toBe(true);
      expect((result.nested as Record<string, unknown>).inner).toBe("value");
    });
  });
});

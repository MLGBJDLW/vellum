/**
 * Chain and Pipe Parser Unit Tests
 *
 * Tests for command chain and pipe parsing including:
 * - Chain operators (&&, ||, ;)
 * - Pipe operators (|, >, >>)
 * - Quote handling
 * - Execution semantics
 *
 * @module cli/commands/__tests__/chain-pipe-parser
 */

import { describe, expect, it, vi } from "vitest";

import {
  ChainedCommandExecutor,
  ChainParser,
  PipedCommandExecutor,
  PipeParser,
} from "../parser/index.js";
import type { CommandResult } from "../types.js";

// =============================================================================
// T053: Chain Parser Tests
// =============================================================================

describe("ChainParser", () => {
  describe("parse", () => {
    it("should parse single command without operators", () => {
      const result = ChainParser.parse("/help");

      expect(result.isChained).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toMatchObject({
        command: "/help",
      });
    });

    it("should parse empty input", () => {
      const result = ChainParser.parse("");

      expect(result.isChained).toBe(false);
      expect(result.segments).toHaveLength(0);
    });

    it("should parse AND operator (&&)", () => {
      const result = ChainParser.parse("/build && /test");

      expect(result.isChained).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        command: "/build",
        operator: "&&",
      });
      expect(result.segments[1]).toMatchObject({
        command: "/test",
      });
    });

    it("should parse OR operator (||)", () => {
      const result = ChainParser.parse("/check || /fallback");

      expect(result.isChained).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        command: "/check",
        operator: "||",
      });
      expect(result.segments[1]).toMatchObject({
        command: "/fallback",
      });
    });

    it("should parse SEQUENCE operator (;)", () => {
      const result = ChainParser.parse("/cmd1 ; /cmd2");

      expect(result.isChained).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        command: "/cmd1",
        operator: ";",
      });
      expect(result.segments[1]).toMatchObject({
        command: "/cmd2",
      });
    });

    it("should parse multiple operators", () => {
      const result = ChainParser.parse("/build && /test || /rollback ; /cleanup");

      expect(result.isChained).toBe(true);
      expect(result.segments).toHaveLength(4);
      expect(result.segments[0]).toMatchObject({ command: "/build", operator: "&&" });
      expect(result.segments[1]).toMatchObject({ command: "/test", operator: "||" });
      expect(result.segments[2]).toMatchObject({ command: "/rollback", operator: ";" });
      expect(result.segments[3]).toMatchObject({ command: "/cleanup" });
    });

    it("should NOT split on && inside double quotes", () => {
      const result = ChainParser.parse('/echo "foo && bar"');

      expect(result.isChained).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.command).toBe('/echo "foo && bar"');
    });

    it("should NOT split on || inside single quotes", () => {
      const result = ChainParser.parse("/echo 'foo || bar'");

      expect(result.isChained).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.command).toBe("/echo 'foo || bar'");
    });

    it("should NOT split on ; inside quotes", () => {
      const result = ChainParser.parse('/echo "a; b"');

      expect(result.isChained).toBe(false);
      expect(result.segments).toHaveLength(1);
    });

    it("should preserve command arguments", () => {
      const result = ChainParser.parse("/cmd1 arg1 --flag && /cmd2 arg2");

      expect(result.segments[0]?.command).toBe("/cmd1 arg1 --flag");
      expect(result.segments[1]?.command).toBe("/cmd2 arg2");
    });
  });

  describe("hasChainOperators", () => {
    it("should return true for &&", () => {
      expect(ChainParser.hasChainOperators("/a && /b")).toBe(true);
    });

    it("should return true for ||", () => {
      expect(ChainParser.hasChainOperators("/a || /b")).toBe(true);
    });

    it("should return true for ;", () => {
      expect(ChainParser.hasChainOperators("/a ; /b")).toBe(true);
    });

    it("should return false for single command", () => {
      expect(ChainParser.hasChainOperators("/help")).toBe(false);
    });

    it("should return false for quoted operators", () => {
      expect(ChainParser.hasChainOperators('/echo "&&"')).toBe(false);
    });
  });
});

describe("ChainedCommandExecutor", () => {
  describe("execute", () => {
    it("should execute single command", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        kind: "success",
        message: "OK",
      } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/help");

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(executeFn).toHaveBeenCalledWith("/help", undefined);
      expect(result.executedCount).toBe(1);
      expect(result.completed).toBe(true);
    });

    it("should continue after && when previous succeeds", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        kind: "success",
        message: "OK",
      } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 && /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(result.executedCount).toBe(2);
      expect(result.completed).toBe(true);
    });

    it("should STOP after && when previous fails", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          kind: "error",
          code: "INTERNAL_ERROR",
          message: "Failed",
        } satisfies CommandResult)
        .mockResolvedValueOnce({
          kind: "success",
          message: "Should not run",
        } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 && /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result.executedCount).toBe(1);
      expect(result.completed).toBe(false);
    });

    it("should continue after || when previous fails", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          kind: "error",
          code: "INTERNAL_ERROR",
          message: "Failed",
        } satisfies CommandResult)
        .mockResolvedValueOnce({
          kind: "success",
          message: "OK",
        } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 || /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(result.executedCount).toBe(2);
      expect(result.completed).toBe(true);
    });

    it("should SKIP after || when previous succeeds", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          kind: "success",
          message: "OK",
        } satisfies CommandResult)
        .mockResolvedValueOnce({
          kind: "success",
          message: "Should not run",
        } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 || /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result.executedCount).toBe(1);
      // Note: completed is based on lastExecutedIndex vs total
    });

    it("should ALWAYS continue after ; regardless of result", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          kind: "error",
          code: "INTERNAL_ERROR",
          message: "Failed",
        } satisfies CommandResult)
        .mockResolvedValueOnce({
          kind: "success",
          message: "OK",
        } satisfies CommandResult);

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 ; /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(result.executedCount).toBe(2);
      expect(result.completed).toBe(true);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const executeFn = vi.fn();
      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 && /cmd2", controller.signal);

      expect(executeFn).not.toHaveBeenCalled();
      expect(result.result.kind).toBe("error");
      expect(result.completed).toBe(false);
    });

    it("should execute complex chain correctly", async () => {
      // /build && /test || /notify ; /cleanup
      // build succeeds -> test runs
      // test fails -> notify runs (|| condition met)
      // cleanup always runs
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({ kind: "success", message: "Build OK" }) // /build
        .mockResolvedValueOnce({
          kind: "error",
          code: "INTERNAL_ERROR",
          message: "Test failed",
        }) // /test
        .mockResolvedValueOnce({ kind: "success", message: "Notified" }) // /notify
        .mockResolvedValueOnce({ kind: "success", message: "Cleaned" }); // /cleanup

      const executor = new ChainedCommandExecutor(executeFn);
      const result = await executor.execute("/build && /test || /notify ; /cleanup");

      expect(executeFn).toHaveBeenCalledTimes(4);
      expect(result.executedCount).toBe(4);
      expect(result.completed).toBe(true);
    });
  });

  describe("shouldExecute", () => {
    it("should return true for first command", () => {
      expect(ChainedCommandExecutor.shouldExecute(true, undefined)).toBe(true);
      expect(ChainedCommandExecutor.shouldExecute(false, undefined)).toBe(true);
    });

    it("should return correct value for && operator", () => {
      expect(ChainedCommandExecutor.shouldExecute(true, "&&")).toBe(true);
      expect(ChainedCommandExecutor.shouldExecute(false, "&&")).toBe(false);
    });

    it("should return correct value for || operator", () => {
      expect(ChainedCommandExecutor.shouldExecute(true, "||")).toBe(false);
      expect(ChainedCommandExecutor.shouldExecute(false, "||")).toBe(true);
    });

    it("should return true for ; operator", () => {
      expect(ChainedCommandExecutor.shouldExecute(true, ";")).toBe(true);
      expect(ChainedCommandExecutor.shouldExecute(false, ";")).toBe(true);
    });
  });
});

// =============================================================================
// T054: Pipe Parser Tests
// =============================================================================

describe("PipeParser", () => {
  describe("parse", () => {
    it("should parse single command without operators", () => {
      const result = PipeParser.parse("/list");

      expect(result.isPiped).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toMatchObject({
        type: "command",
        value: "/list",
      });
      expect(result.hasRedirect).toBe(false);
    });

    it("should parse empty input", () => {
      const result = PipeParser.parse("");

      expect(result.isPiped).toBe(false);
      expect(result.segments).toHaveLength(0);
    });

    it("should parse pipe operator (|)", () => {
      const result = PipeParser.parse("/list | /filter");

      expect(result.isPiped).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        type: "command",
        value: "/list",
        operator: "|",
      });
      expect(result.segments[1]).toMatchObject({
        type: "command",
        value: "/filter",
      });
      expect(result.hasRedirect).toBe(false);
    });

    it("should parse write redirect (>)", () => {
      const result = PipeParser.parse("/list > output.txt");

      expect(result.isPiped).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toMatchObject({
        type: "command",
        value: "/list",
        operator: ">",
      });
      expect(result.segments[1]).toMatchObject({
        type: "file",
        value: "output.txt",
      });
      expect(result.hasRedirect).toBe(true);
      expect(result.redirectMode).toBe("overwrite");
      expect(result.redirectTarget).toBe("output.txt");
    });

    it("should parse append redirect (>>)", () => {
      const result = PipeParser.parse("/log >> history.txt");

      expect(result.isPiped).toBe(true);
      expect(result.hasRedirect).toBe(true);
      expect(result.redirectMode).toBe("append");
      expect(result.redirectTarget).toBe("history.txt");
    });

    it("should parse pipe with redirect", () => {
      const result = PipeParser.parse("/list | /filter pattern > output.txt");

      expect(result.isPiped).toBe(true);
      expect(result.segments).toHaveLength(3);
      expect(result.segments[0]).toMatchObject({
        type: "command",
        value: "/list",
        operator: "|",
      });
      expect(result.segments[1]).toMatchObject({
        type: "command",
        value: "/filter pattern",
        operator: ">",
      });
      expect(result.segments[2]).toMatchObject({
        type: "file",
        value: "output.txt",
      });
      expect(result.hasRedirect).toBe(true);
    });

    it("should NOT split on | inside quotes", () => {
      const result = PipeParser.parse('/echo "foo | bar"');

      expect(result.isPiped).toBe(false);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.value).toBe('/echo "foo | bar"');
    });

    it("should NOT split on > inside quotes", () => {
      const result = PipeParser.parse("/echo 'a > b'");

      expect(result.isPiped).toBe(false);
      expect(result.segments).toHaveLength(1);
    });

    it("should NOT confuse || (chain) with | (pipe)", () => {
      const result = PipeParser.parse("/cmd || /other");

      // || is a chain operator, not a pipe operator
      expect(result.isPiped).toBe(false);
      expect(result.hasRedirect).toBe(false);
    });

    it("should preserve command arguments", () => {
      const result = PipeParser.parse("/list --all | /filter --pattern test");

      expect(result.segments[0]?.value).toBe("/list --all");
      expect(result.segments[1]?.value).toBe("/filter --pattern test");
    });
  });

  describe("hasPipeOperators", () => {
    it("should return true for |", () => {
      expect(PipeParser.hasPipeOperators("/a | /b")).toBe(true);
    });

    it("should return true for >", () => {
      expect(PipeParser.hasPipeOperators("/a > file")).toBe(true);
    });

    it("should return true for >>", () => {
      expect(PipeParser.hasPipeOperators("/a >> file")).toBe(true);
    });

    it("should return false for single command", () => {
      expect(PipeParser.hasPipeOperators("/help")).toBe(false);
    });

    it("should return false for || (chain operator)", () => {
      expect(PipeParser.hasPipeOperators("/a || /b")).toBe(false);
    });
  });

  describe("hasRedirection", () => {
    it("should return true for >", () => {
      expect(PipeParser.hasRedirection("/cmd > file")).toBe(true);
    });

    it("should return true for >>", () => {
      expect(PipeParser.hasRedirection("/cmd >> file")).toBe(true);
    });

    it("should return false for |", () => {
      expect(PipeParser.hasRedirection("/cmd1 | /cmd2")).toBe(false);
    });

    it("should return false for no operators", () => {
      expect(PipeParser.hasRedirection("/cmd")).toBe(false);
    });
  });
});

describe("PipedCommandExecutor", () => {
  describe("execute", () => {
    it("should execute single command", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        result: { kind: "success", message: "OK" },
        output: "Hello",
      });

      const executor = new PipedCommandExecutor(executeFn);
      const result = await executor.execute("/echo Hello");

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(executeFn).toHaveBeenCalledWith("/echo Hello", undefined, undefined);
      expect(result.output).toBe("Hello");
      expect(result.executedCount).toBe(1);
    });

    it("should pass output through pipe", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "line1\nline2\nline3",
        })
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "line2",
        });

      const executor = new PipedCommandExecutor(executeFn);
      const result = await executor.execute("/list | /filter line2");

      expect(executeFn).toHaveBeenCalledTimes(2);
      // Second call should receive first output as input
      expect(executeFn).toHaveBeenNthCalledWith(
        2,
        "/filter line2",
        "line1\nline2\nline3",
        undefined
      );
      expect(result.output).toBe("line2");
    });

    it("should write output to file with >", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        result: { kind: "success", message: "OK" },
        output: "File content",
      });

      const writeFileFn = vi.fn().mockResolvedValue(undefined);

      const executor = new PipedCommandExecutor(executeFn, writeFileFn);
      const result = await executor.execute("/echo content > output.txt");

      expect(writeFileFn).toHaveBeenCalledWith("output.txt", "File content", "overwrite");
      expect(result.writtenFile).toBe("output.txt");
      expect(result.completed).toBe(true);
    });

    it("should append output to file with >>", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        result: { kind: "success", message: "OK" },
        output: "New line",
      });

      const writeFileFn = vi.fn().mockResolvedValue(undefined);

      const executor = new PipedCommandExecutor(executeFn, writeFileFn);
      const result = await executor.execute("/log >> history.txt");

      expect(writeFileFn).toHaveBeenCalledWith("history.txt", "New line", "append");
      expect(result.writtenFile).toBe("history.txt");
    });

    it("should fail if no file writer configured for redirect", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        result: { kind: "success", message: "OK" },
        output: "content",
      });

      const executor = new PipedCommandExecutor(executeFn); // No writeFileFn
      const result = await executor.execute("/cmd > file.txt");

      expect(result.result.kind).toBe("error");
      expect(result.completed).toBe(false);
    });

    it("should handle file write errors", async () => {
      const executeFn = vi.fn().mockResolvedValue({
        result: { kind: "success", message: "OK" },
        output: "content",
      });

      const writeFileFn = vi.fn().mockRejectedValue(new Error("Permission denied"));

      const executor = new PipedCommandExecutor(executeFn, writeFileFn);
      const result = await executor.execute("/cmd > protected.txt");

      expect(result.result.kind).toBe("error");
      expect(result.completed).toBe(false);
    });

    it("should stop pipe on command error", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          result: { kind: "error", code: "INTERNAL_ERROR", message: "Failed" },
          output: "",
        })
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "Should not run",
        });

      const executor = new PipedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 | /cmd2");

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result.result.kind).toBe("error");
      expect(result.completed).toBe(false);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const executeFn = vi.fn();
      const executor = new PipedCommandExecutor(executeFn);
      const result = await executor.execute("/cmd1 | /cmd2", controller.signal);

      expect(executeFn).not.toHaveBeenCalled();
      expect(result.result.kind).toBe("error");
      expect(result.completed).toBe(false);
    });

    it("should execute complex pipe chain correctly", async () => {
      const executeFn = vi
        .fn()
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "a\nb\nc\nd",
        })
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "b\nc",
        })
        .mockResolvedValueOnce({
          result: { kind: "success", message: "OK" },
          output: "2 lines",
        });

      const writeFileFn = vi.fn().mockResolvedValue(undefined);

      const executor = new PipedCommandExecutor(executeFn, writeFileFn);
      const result = await executor.execute("/list | /filter | /count > result.txt");

      expect(executeFn).toHaveBeenCalledTimes(3);
      expect(writeFileFn).toHaveBeenCalledWith("result.txt", "2 lines", "overwrite");
      expect(result.executedCount).toBe(3);
      expect(result.completed).toBe(true);
    });
  });
});

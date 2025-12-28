import { describe, expect, it } from "vitest";
import { createToolCall } from "../doom.js";
import {
  createLoopDetectionContext,
  DEFAULT_LOOP_DETECTION_CONFIG,
  detectLoop,
  detectLoopAsync,
  getLoopWarningLevel,
} from "../loop-detection.js";

describe("Loop Detection", () => {
  describe("detectLoop", () => {
    it("should return type=none when no loop detected", () => {
      const result = detectLoop({
        toolCalls: [],
        responses: [],
      });

      expect(result.type).toBe("none");
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(1.0);
      expect(result.suggestedAction).toBe("continue");
    });

    it("should detect doom loop with repeated tool calls", () => {
      const result = detectLoop({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
          createToolCall("3", "read_file", { path: "test.txt" }),
        ],
        responses: [],
      });

      expect(result.type).toBe("doom_loop");
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.suggestedAction).toBe("terminate");
      expect(result.doomLoop?.detected).toBe(true);
    });

    it("should detect LLM stuck with similar responses", () => {
      const result = detectLoop({
        toolCalls: [],
        responses: [
          "I cannot access that file.",
          "I cannot access that file.",
          "I cannot access that file.",
        ],
      });

      expect(result.type).toBe("llm_stuck");
      expect(result.detected).toBe(true);
      expect(result.stuckDetection?.isStuck).toBe(true);
    });

    it("should prioritize doom loop over stuck when both detected", () => {
      const result = detectLoop({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
          createToolCall("3", "read_file", { path: "test.txt" }),
        ],
        responses: ["Cannot read file.", "Cannot read file.", "Cannot read file."],
      });

      expect(result.type).toBe("doom_loop");
      expect(result.detected).toBe(true);
    });

    it("should respect enableDoomLoop=false", () => {
      const result = detectLoop(
        {
          toolCalls: [
            createToolCall("1", "read_file", { path: "test.txt" }),
            createToolCall("2", "read_file", { path: "test.txt" }),
            createToolCall("3", "read_file", { path: "test.txt" }),
          ],
          responses: [],
        },
        { enableDoomLoop: false }
      );

      expect(result.type).toBe("none");
      expect(result.detected).toBe(false);
    });

    it("should respect enableStuckDetection=false", () => {
      const result = detectLoop(
        {
          toolCalls: [],
          responses: ["Same response", "Same response", "Same response"],
        },
        { enableStuckDetection: false }
      );

      expect(result.type).toBe("none");
      expect(result.detected).toBe(false);
    });

    it("should include description for doom loop", () => {
      const result = detectLoop({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
          createToolCall("3", "read_file", { path: "test.txt" }),
        ],
        responses: [],
      });

      expect(result.description).toBeDefined();
      expect(result.description).toContain("read_file");
    });

    it("should include description for stuck detection", () => {
      const result = detectLoop({
        toolCalls: [],
        responses: [
          "I cannot access that file.",
          "I cannot access that file.",
          "I cannot access that file.",
        ],
      });

      expect(result.description).toBeDefined();
      expect(result.description).toContain("similarity");
    });
  });

  describe("detectLoopAsync", () => {
    it("should work like detectLoop for basic cases", async () => {
      const result = await detectLoopAsync({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
          createToolCall("3", "read_file", { path: "test.txt" }),
        ],
        responses: [],
      });

      expect(result.type).toBe("doom_loop");
      expect(result.detected).toBe(true);
    });
  });

  describe("createLoopDetectionContext", () => {
    it("should extract text from messages", () => {
      const context = createLoopDetectionContext(
        [createToolCall("1", "test", {})],
        [{ text: "hello" }, { content: "world" }]
      );

      expect(context.toolCalls).toHaveLength(1);
      expect(context.responses).toEqual(["hello", "world"]);
    });
  });

  describe("getLoopWarningLevel", () => {
    it("should return none when no issues", () => {
      const level = getLoopWarningLevel({
        toolCalls: [createToolCall("1", "different", { a: 1 })],
        responses: [],
      });

      expect(level).toBe("none");
    });

    it("should return detected when loop found", () => {
      const level = getLoopWarningLevel({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
          createToolCall("3", "read_file", { path: "test.txt" }),
        ],
        responses: [],
      });

      expect(level).toBe("detected");
    });

    it("should return approaching when near doom loop threshold", () => {
      const level = getLoopWarningLevel({
        toolCalls: [
          createToolCall("1", "read_file", { path: "test.txt" }),
          createToolCall("2", "read_file", { path: "test.txt" }),
        ],
        responses: [],
      });

      expect(level).toBe("approaching");
    });
  });

  describe("DEFAULT_LOOP_DETECTION_CONFIG", () => {
    it("should have expected defaults", () => {
      expect(DEFAULT_LOOP_DETECTION_CONFIG.enableDoomLoop).toBe(true);
      expect(DEFAULT_LOOP_DETECTION_CONFIG.doomLoopThreshold).toBe(3);
      expect(DEFAULT_LOOP_DETECTION_CONFIG.enableStuckDetection).toBe(true);
    });
  });
});

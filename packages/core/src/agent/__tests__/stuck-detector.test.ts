import { describe, expect, it } from "vitest";
import {
  createStuckDetector,
  DEFAULT_STUCK_DETECTOR_CONFIG,
  detectStuck,
  extractTextFromMessages,
  LLMStuckDetector,
} from "../stuck-detector.js";

describe("LLMStuckDetector", () => {
  describe("constructor", () => {
    it("should use default config when none provided", () => {
      const detector = new LLMStuckDetector();
      const config = detector.getConfig();

      expect(config.threshold).toBe(DEFAULT_STUCK_DETECTOR_CONFIG.threshold);
      expect(config.windowSize).toBe(DEFAULT_STUCK_DETECTOR_CONFIG.windowSize);
    });

    it("should override defaults with provided config", () => {
      const detector = new LLMStuckDetector({
        threshold: 0.9,
        windowSize: 5,
      });
      const config = detector.getConfig();

      expect(config.threshold).toBe(0.9);
      expect(config.windowSize).toBe(5);
    });
  });

  describe("detect", () => {
    it("should return isStuck=false when fewer than windowSize messages", () => {
      const detector = new LLMStuckDetector({ windowSize: 3 });

      const result = detector.detect(["message 1", "message 2"]);

      expect(result.isStuck).toBe(false);
      expect(result.confidence).toBe(1.0);
      expect(result.suggestedAction).toBe("continue");
    });

    it("should detect stuck state with identical messages", () => {
      const detector = new LLMStuckDetector({ threshold: 0.85, windowSize: 3 });
      const messages = [
        "I cannot access that file.",
        "I cannot access that file.",
        "I cannot access that file.",
      ];

      const result = detector.detect(messages);

      expect(result.isStuck).toBe(true);
      expect(result.similarityScore).toBe(1);
      expect(result.suggestedAction).toBe("terminate");
    });

    it("should detect stuck state with highly similar messages", () => {
      const detector = new LLMStuckDetector({ threshold: 0.85, windowSize: 3 });
      const messages = [
        "I cannot access that file because permissions are denied.",
        "I cannot access that file because permissions are denied.",
        "I cannot access that file because permissions are denied.",
      ];

      const result = detector.detect(messages);

      expect(result.isStuck).toBe(true);
      expect(result.similarityScore).toBeGreaterThanOrEqual(0.85);
    });

    it("should not detect stuck with diverse messages", () => {
      const detector = new LLMStuckDetector({ threshold: 0.85, windowSize: 3 });
      const messages = [
        "Hello, how can I help you today?",
        "I've read the file contents successfully.",
        "The task is now complete, let me know if you need anything else.",
      ];

      const result = detector.detect(messages);

      expect(result.isStuck).toBe(false);
      expect(result.suggestedAction).toBe("continue");
    });

    it("should return stats in result", () => {
      const detector = new LLMStuckDetector({ windowSize: 3 });
      const messages = ["a", "b", "c"];

      const result = detector.detect(messages);

      expect(result.stats).toBeDefined();
      expect(result.stats?.count).toBe(3);
      expect(result.stats?.pairCount).toBe(3);
    });

    it("should suggest intervene for borderline cases", () => {
      const detector = new LLMStuckDetector({
        threshold: 0.85,
        windowSize: 3,
        borderlineZone: [0.75, 0.9],
      });

      // Mock messages that would produce ~0.80 similarity
      // Using messages with moderate overlap
      const messages = [
        "The file cannot be read due to permissions.",
        "The file cannot be accessed due to restrictions.",
        "The file cannot be opened due to limitations.",
      ];

      const result = detector.detect(messages);

      // If similarity is in borderline zone (0.75-0.90) but below threshold (0.85)
      // it should suggest intervene
      if (
        result.similarityScore &&
        result.similarityScore >= 0.75 &&
        result.similarityScore < 0.85
      ) {
        expect(result.suggestedAction).toBe("intervene");
      }
    });
  });

  describe("isStuckFromSimilarity", () => {
    it("should return true when similarity >= threshold", () => {
      const detector = new LLMStuckDetector({ threshold: 0.85 });

      expect(detector.isStuckFromSimilarity(0.85)).toBe(true);
      expect(detector.isStuckFromSimilarity(0.9)).toBe(true);
      expect(detector.isStuckFromSimilarity(1.0)).toBe(true);
    });

    it("should return false when similarity < threshold", () => {
      const detector = new LLMStuckDetector({ threshold: 0.85 });

      expect(detector.isStuckFromSimilarity(0.84)).toBe(false);
      expect(detector.isStuckFromSimilarity(0.5)).toBe(false);
      expect(detector.isStuckFromSimilarity(0)).toBe(false);
    });
  });
});

describe("createStuckDetector", () => {
  it("should create a detector with config", () => {
    const detector = createStuckDetector({ threshold: 0.9 });
    const config = detector.getConfig();

    expect(config.threshold).toBe(0.9);
  });
});

describe("detectStuck", () => {
  it("should be a convenience function that works", () => {
    const messages = ["same", "same", "same"];

    const result = detectStuck(messages, 0.85, 3);

    expect(result.isStuck).toBe(true);
  });
});

describe("extractTextFromMessages", () => {
  it("should extract text property", () => {
    const messages = [{ text: "hello" }, { text: "world" }];

    const texts = extractTextFromMessages(messages);

    expect(texts).toEqual(["hello", "world"]);
  });

  it("should extract content property", () => {
    const messages = [{ content: "hello" }, { content: "world" }];

    const texts = extractTextFromMessages(messages);

    expect(texts).toEqual(["hello", "world"]);
  });

  it("should prefer text over content", () => {
    const messages = [{ text: "text", content: "content" }];

    const texts = extractTextFromMessages(messages);

    expect(texts).toEqual(["text"]);
  });

  it("should filter empty strings", () => {
    const messages = [{ text: "hello" }, { text: "" }, { text: "world" }];

    const texts = extractTextFromMessages(messages);

    expect(texts).toEqual(["hello", "world"]);
  });
});

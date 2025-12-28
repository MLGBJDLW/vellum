/**
 * @file benchmark.test.ts
 * @description Performance benchmark tests for streaming components - T039
 *
 * Tests measure:
 * - StreamCollector: Process 10,000 text events
 * - NewlineGate: Feed 100KB of mixed newline/partial content
 * - BackpressureController: Send/receive 10,000 items
 *
 * Note: bench() calls are commented out for regular test runs.
 * To run as benchmarks: pnpm vitest bench packages/core/src/streaming/__tests__/benchmark.test.ts
 */

import { describe, it, expect } from "vitest";
import type { StreamEvent } from "@vellum/provider";
import { StreamCollector } from "../collector.js";
import { NewlineGate } from "../newline-gate.js";
import { BackpressureController } from "../backpressure.js";

// =============================================================================
// T039: Performance Benchmark Tests
// =============================================================================

describe("Performance Benchmarks", () => {
  // ===========================================================================
  // StreamCollector Benchmarks
  // ===========================================================================

  describe("StreamCollector Performance", () => {
    it("should process 10,000 text events efficiently", async () => {
      const collector = new StreamCollector();
      const startTime = performance.now();

      // Process 10,000 text events with same index to accumulate into one buffer
      for (let i = 0; i < 10000; i++) {
        collector.processEvent({
          type: "text",
          content: `Chunk ${i}: Hello World! `,
          index: 0,
        });
      }

      collector.processEvent({ type: "end", stopReason: "end_turn" });
      const result = collector.build();

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify content was accumulated
        expect(result.value.parts.length).toBeGreaterThan(0);
        const textPart = result.value.parts.find((p) => p.type === "text");
        expect(textPart?.type).toBe("text");
        if (textPart?.type === "text") {
          expect(textPart.content.length).toBeGreaterThan(100000);
        }
      }

      // Performance assertion: should complete in reasonable time
      // Allow generous margin for CI environments
      expect(elapsedMs).toBeLessThan(5000); // 5 seconds max
      console.log(`StreamCollector 10k events: ${elapsedMs.toFixed(2)}ms`);
    });

    it("should handle mixed event types efficiently", async () => {
      const collector = new StreamCollector();
      const startTime = performance.now();

      // Process mixed events: text, reasoning, tool calls
      for (let i = 0; i < 2000; i++) {
        // Text
        collector.processEvent({ type: "text", content: `Text ${i} ` });

        // Reasoning
        collector.processEvent({ type: "reasoning", content: `Thinking ${i} ` });

        // Tool call lifecycle (every 100th iteration)
        if (i % 100 === 0) {
          const toolId = `tool_${i}`;
          collector.processEvent({
            type: "tool_call_start",
            id: toolId,
            name: "test_tool",
            index: i,
          });
          collector.processEvent({
            type: "tool_call_delta",
            id: toolId,
            arguments: `{"i": ${i}}`,
            index: i,
          });
          collector.processEvent({
            type: "tool_call_end",
            id: toolId,
            index: i,
          });
        }
      }

      collector.processEvent({ type: "end", stopReason: "end_turn" });
      const result = collector.build();

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have text, reasoning, and tool parts
        expect(result.value.parts.length).toBeGreaterThan(0);
      }

      expect(elapsedMs).toBeLessThan(5000);
      console.log(`StreamCollector mixed events: ${elapsedMs.toFixed(2)}ms`);
    });

    // Benchmark tests - run with: pnpm vitest bench
    // bench("StreamCollector: accumulate 10,000 text events", () => { ... });
    // bench("StreamCollector: single character chunks", () => { ... });
  });

  // ===========================================================================
  // NewlineGate Benchmarks
  // ===========================================================================

  describe("NewlineGate Performance", () => {
    it("should handle 100KB of mixed content efficiently", () => {
      const gate = new NewlineGate();
      const startTime = performance.now();

      // Generate ~100KB of mixed content
      const output: string[] = [];
      let totalBytes = 0;
      const targetBytes = 100 * 1024;

      while (totalBytes < targetBytes) {
        // Alternate between partial and complete lines
        const isCompleteLine = Math.random() > 0.5;
        const chunkSize = Math.floor(Math.random() * 100) + 10;
        let chunk = "x".repeat(chunkSize);

        if (isCompleteLine) {
          chunk += "\n";
        }

        totalBytes += chunk.length;
        const result = gate.feed(chunk);
        if (result) {
          output.push(result);
        }
      }

      // Flush remaining
      const remaining = gate.flush();
      if (remaining) {
        output.push(remaining);
      }

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      // Verify output
      const totalOutput = output.join("").length;
      expect(totalOutput).toBeGreaterThan(0);

      expect(elapsedMs).toBeLessThan(2000); // 2 seconds max
      console.log(
        `NewlineGate 100KB: ${elapsedMs.toFixed(2)}ms, ${totalBytes} bytes processed`
      );
    });

    it("should handle rapid small feeds efficiently", () => {
      const gate = new NewlineGate();
      const startTime = performance.now();

      // 50,000 small feeds
      for (let i = 0; i < 50000; i++) {
        gate.feed("x");
        if (i % 100 === 0) {
          gate.feed("\n");
        }
      }

      gate.flush();

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(elapsedMs).toBeLessThan(2000);
      console.log(`NewlineGate 50k feeds: ${elapsedMs.toFixed(2)}ms`);
    });

    // Benchmark tests - run with: pnpm vitest bench
    // bench("NewlineGate: process 100KB mixed content", () => { ... });
    // bench("NewlineGate: single character throughput", () => { ... });
    // bench("NewlineGate: bypass mode throughput", () => { ... });
  });

  // ===========================================================================
  // BackpressureController Benchmarks
  // ===========================================================================

  describe("BackpressureController Performance", () => {
    it("should handle 10,000 send/receive operations efficiently", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 100,
        strategy: "drop_oldest",
      });

      const startTime = performance.now();

      // Send 10,000 items with periodic draining
      for (let i = 0; i < 10000; i++) {
        await controller.send(i);

        // Drain periodically to prevent constant dropping
        if (i % 50 === 0) {
          while (controller.size > 50) {
            controller.receive();
          }
        }
      }

      // Drain remaining
      while (controller.hasItems()) {
        controller.receive();
      }

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(controller.size).toBe(0);
      expect(elapsedMs).toBeLessThan(5000);
      console.log(`BackpressureController 10k ops: ${elapsedMs.toFixed(2)}ms`);
    });

    it("should handle high throughput with drop_newest strategy", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 1000,
        strategy: "drop_newest",
      });

      const startTime = performance.now();

      let sentCount = 0;
      let droppedCount = 0;

      // Rapid sends
      for (let i = 0; i < 10000; i++) {
        const wasAdded = await controller.send(i);
        if (wasAdded) {
          sentCount++;
        } else {
          droppedCount++;
        }
      }

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(sentCount + droppedCount).toBe(10000);
      expect(elapsedMs).toBeLessThan(2000);
      console.log(
        `BackpressureController drop_newest: ${elapsedMs.toFixed(2)}ms, ` +
          `sent: ${sentCount}, dropped: ${droppedCount}`
      );
    });

    it("should handle concurrent operations efficiently", { timeout: 10000 }, async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 500,
        strategy: "drop_oldest",
      });

      const startTime = performance.now();

      // Simulate producer pattern with automatic draining
      for (let i = 0; i < 5000; i++) {
        await controller.send(i);
        // Drain every 10 items to prevent buildup
        if (i % 10 === 0) {
          while (controller.size > 250) {
            controller.receive();
          }
        }
      }

      // Final drain
      while (controller.hasItems()) {
        controller.receive();
      }

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(elapsedMs).toBeLessThan(5000);
      console.log(`BackpressureController concurrent: ${elapsedMs.toFixed(2)}ms`);
    });

    // Benchmark tests - run with: pnpm vitest bench
    // bench("BackpressureController: 10k send (drop_newest)", async () => { ... });
    // bench("BackpressureController: 10k send/receive cycle", async () => { ... });
    // bench("BackpressureController: state transition overhead", async () => { ... });
  });

  // ===========================================================================
  // Combined Throughput Test
  // ===========================================================================

  describe("Combined System Throughput", () => {
    it("should handle full pipeline efficiently", async () => {
      const collector = new StreamCollector();
      const gate = new NewlineGate();
      const controller = new BackpressureController<string>({
        maxQueueSize: 1000,
        strategy: "drop_oldest",
      });

      const startTime = performance.now();

      // Simulate streaming pipeline
      for (let i = 0; i < 5000; i++) {
        // Generate stream event
        const event: StreamEvent = {
          type: "text",
          content: `Message ${i}: Hello World!\n`,
        };

        // Process through collector
        const action = collector.processEvent(event);

        // If emitting text, pass through gate
        if (action.type === "emit_text") {
          const gated = gate.feed(action.content);
          if (gated) {
            // Send through backpressure controller
            await controller.send(gated);
          }
        }

        // Periodic drain
        if (i % 100 === 0) {
          while (controller.size > 500) {
            controller.receive();
          }
        }
      }

      // Finalize
      collector.processEvent({ type: "end", stopReason: "end_turn" });
      const remaining = gate.flush();
      if (remaining) {
        await controller.send(remaining);
      }

      // Drain remaining
      while (controller.hasItems()) {
        controller.receive();
      }

      const result = collector.build();

      const endTime = performance.now();
      const elapsedMs = endTime - startTime;

      expect(result.ok).toBe(true);
      expect(elapsedMs).toBeLessThan(5000);
      console.log(`Full pipeline 5k events: ${elapsedMs.toFixed(2)}ms`);
    });
  });
});

// =============================================================================
// Memory Efficiency Tests
// =============================================================================

describe("Memory Efficiency", () => {
  it("StreamCollector should handle large content without excessive memory", () => {
    const collector = new StreamCollector();

    // Feed 1MB of content in chunks with same index to accumulate
    const chunkSize = 10000;
    const totalChunks = 100;

    for (let i = 0; i < totalChunks; i++) {
      collector.processEvent({
        type: "text",
        content: "x".repeat(chunkSize),
        index: 0,
      });
    }

    collector.processEvent({ type: "end", stopReason: "end_turn" });
    const result = collector.build();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const textPart = result.value.parts.find((p) => p.type === "text");
      expect(textPart?.type).toBe("text");
      if (textPart?.type === "text") {
        expect(textPart.content.length).toBe(chunkSize * totalChunks);
      }
    }
  });

  it("NewlineGate should not leak memory on reset", () => {
    const gate = new NewlineGate();

    for (let cycle = 0; cycle < 100; cycle++) {
      // Feed large content
      gate.feed("x".repeat(10000));

      // Reset
      gate.reset();

      // Verify clean state
      expect(gate.bufferSize).toBe(0);
    }
  });

  it("BackpressureController should not leak on clear", async () => {
    const controller = new BackpressureController<string>();

    for (let cycle = 0; cycle < 100; cycle++) {
      // Fill with data
      for (let i = 0; i < 100; i++) {
        await controller.send(`item_${i}`);
      }

      // Clear
      controller.clear();

      // Verify clean state
      expect(controller.size).toBe(0);
    }
  });
});

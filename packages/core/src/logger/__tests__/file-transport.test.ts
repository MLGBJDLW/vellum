import { appendFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTransport } from "../transports/file.js";
import type { LogEntry } from "../types.js";

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

describe("FileTransport", () => {
  const mockEntry: LogEntry = {
    level: "info",
    message: "Test message",
    timestamp: new Date("2025-12-26T10:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("buffering", () => {
    it("buffers log entries without immediate write", () => {
      const transport = new FileTransport({ path: "/tmp/test.log" });
      transport.log(mockEntry);

      expect(appendFile).not.toHaveBeenCalled();
      transport.dispose();
    });

    it("flushes buffer on interval", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 1000,
      });

      transport.log(mockEntry);
      expect(appendFile).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);

      expect(appendFile).toHaveBeenCalledWith(
        "/tmp/test.log",
        expect.stringContaining("Test message"),
        "utf-8"
      );

      transport.dispose();
    });
  });

  describe("auto-flush on buffer size", () => {
    it("auto-flushes when buffer exceeds maxBufferSize", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        maxBufferSize: 3,
        flushInterval: 60000, // Long interval to ensure auto-flush triggers
      });

      transport.log({ ...mockEntry, message: "Message 1" });
      transport.log({ ...mockEntry, message: "Message 2" });
      expect(appendFile).not.toHaveBeenCalled();

      transport.log({ ...mockEntry, message: "Message 3" });

      // Wait for the async flush triggered by maxBufferSize
      await vi.waitFor(() => {
        expect(appendFile).toHaveBeenCalled();
      });

      expect(appendFile).toHaveBeenCalledTimes(1);
      expect(appendFile).toHaveBeenCalledWith(
        "/tmp/test.log",
        expect.stringContaining("Message 1"),
        "utf-8"
      );

      transport.dispose();
    });
  });

  describe("entry formatting", () => {
    it("formats entry with timestamp and level", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log(mockEntry);
      await vi.advanceTimersByTimeAsync(100);

      expect(appendFile).toHaveBeenCalledWith(
        "/tmp/test.log",
        expect.stringMatching(/\[2025-12-26T10:00:00\.000Z\] \[INFO \] Test message\n/),
        "utf-8"
      );

      transport.dispose();
    });

    it("includes context in formatted output", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log({
        ...mockEntry,
        context: { requestId: "123" },
      });
      await vi.advanceTimersByTimeAsync(100);

      expect(appendFile).toHaveBeenCalledWith(
        "/tmp/test.log",
        expect.stringContaining('context={"requestId":"123"}'),
        "utf-8"
      );

      transport.dispose();
    });

    it("includes data in formatted output", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log({ ...mockEntry, data: { key: "value" } });
      await vi.advanceTimersByTimeAsync(100);

      expect(appendFile).toHaveBeenCalledWith(
        "/tmp/test.log",
        expect.stringContaining('data={"key":"value"}'),
        "utf-8"
      );

      transport.dispose();
    });
  });

  describe("error handling", () => {
    it("calls onError callback on write failure", async () => {
      const writeError = new Error("Write failed");
      vi.mocked(appendFile).mockRejectedValueOnce(writeError);

      const onError = vi.fn();
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
        onError,
      });

      transport.log(mockEntry);
      await vi.advanceTimersByTimeAsync(100);

      expect(onError).toHaveBeenCalledWith(writeError);
      transport.dispose();
    });

    it("tracks lastError property", async () => {
      const writeError = new Error("Write failed");
      vi.mocked(appendFile).mockRejectedValueOnce(writeError);

      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      expect(transport.lastError).toBeNull();

      transport.log(mockEntry);
      await vi.advanceTimersByTimeAsync(100);

      expect(transport.lastError).toBe(writeError);
      transport.dispose();
    });

    it("clears lastError on successful write", async () => {
      const writeError = new Error("Write failed");
      vi.mocked(appendFile).mockRejectedValueOnce(writeError).mockResolvedValueOnce(undefined);

      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log(mockEntry);
      await vi.advanceTimersByTimeAsync(100);
      expect(transport.lastError).toBe(writeError);

      // Trigger another flush (entries were re-added to buffer)
      await vi.advanceTimersByTimeAsync(100);
      expect(transport.lastError).toBeNull();

      transport.dispose();
    });

    it("does not throw on write failure", async () => {
      const writeError = new Error("Write failed");
      vi.mocked(appendFile).mockRejectedValueOnce(writeError);

      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log(mockEntry);

      // Should not throw
      await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();

      transport.dispose();
    });
  });

  describe("flush method", () => {
    it("flushes buffer immediately when called", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 60000,
      });

      transport.log(mockEntry);
      expect(appendFile).not.toHaveBeenCalled();

      await transport.flush();

      expect(appendFile).toHaveBeenCalledTimes(1);
      transport.dispose();
    });

    it("does nothing when buffer is empty", async () => {
      const transport = new FileTransport({ path: "/tmp/test.log" });

      await transport.flush();

      expect(appendFile).not.toHaveBeenCalled();
      transport.dispose();
    });
  });

  describe("dispose", () => {
    it("stops the flush timer", async () => {
      const transport = new FileTransport({
        path: "/tmp/test.log",
        flushInterval: 100,
      });

      transport.log(mockEntry);
      transport.dispose();

      // Clear any pending flush from dispose
      await vi.runAllTimersAsync();
      vi.clearAllMocks();

      // Advance time past multiple intervals
      await vi.advanceTimersByTimeAsync(500);

      // No more writes should happen after dispose
      expect(appendFile).not.toHaveBeenCalled();
    });
  });
});

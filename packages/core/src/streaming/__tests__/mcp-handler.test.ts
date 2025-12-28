import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPStreamHandler } from "../mcp-handler.js";

describe("MCPStreamHandler", () => {
  let handler: MCPStreamHandler;

  beforeEach(() => {
    handler = new MCPStreamHandler();
  });

  describe("handleEvent()", () => {
    it("creates state for mcp_tool_start", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "filesystem",
        toolName: "read_file",
      });

      const state = handler.getToolState("tool-1");
      expect(state).toBeDefined();
      expect(state?.toolId).toBe("tool-1");
      expect(state?.serverName).toBe("filesystem");
      expect(state?.toolName).toBe("read_file");
      expect(state?.status).toBe("running");
      expect(state?.startTime).toBeGreaterThan(0);
    });

    it("updates progress for mcp_tool_progress", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "filesystem",
        toolName: "read_file",
      });

      await handler.handleEvent({
        type: "mcp_tool_progress",
        toolId: "tool-1",
        progress: 50,
        message: "Reading...",
      });

      const state = handler.getToolState("tool-1");
      expect(state?.progress).toBe(50);
      expect(state?.message).toBe("Reading...");
    });

    it("completes state for mcp_tool_end (success)", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "filesystem",
        toolName: "read_file",
      });

      await handler.handleEvent({
        type: "mcp_tool_end",
        toolId: "tool-1",
        result: { content: "file data" },
      });

      const state = handler.getToolState("tool-1");
      expect(state?.status).toBe("completed");
      expect(state?.result).toEqual({ content: "file data" });
      expect(state?.error).toBeUndefined();
      expect(state?.endTime).toBeGreaterThan(0);
    });

    it("sets error for mcp_tool_end (error)", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "filesystem",
        toolName: "read_file",
      });

      await handler.handleEvent({
        type: "mcp_tool_end",
        toolId: "tool-1",
        error: "File not found",
      });

      const state = handler.getToolState("tool-1");
      expect(state?.status).toBe("error");
      expect(state?.error).toBe("File not found");
      expect(state?.endTime).toBeGreaterThan(0);
    });

    it("ignores progress for unknown toolId", async () => {
      await handler.handleEvent({
        type: "mcp_tool_progress",
        toolId: "unknown",
        progress: 50,
      });

      expect(handler.getToolState("unknown")).toBeUndefined();
    });

    it("ignores end for unknown toolId", async () => {
      await handler.handleEvent({
        type: "mcp_tool_end",
        toolId: "unknown",
        result: "data",
      });

      expect(handler.getToolState("unknown")).toBeUndefined();
    });
  });

  describe("onToolStateChange()", () => {
    it("calls callback on tool start", async () => {
      const callback = vi.fn();
      handler.onToolStateChange(callback);

      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "test-server",
        toolName: "test-tool",
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: "tool-1",
          status: "running",
        })
      );
    });

    it("calls callback on progress", async () => {
      const callback = vi.fn();
      handler.onToolStateChange(callback);

      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "test-server",
        toolName: "test-tool",
      });
      await handler.handleEvent({
        type: "mcp_tool_progress",
        toolId: "tool-1",
        progress: 75,
      });

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          toolId: "tool-1",
          progress: 75,
        })
      );
    });

    it("calls callback on tool end", async () => {
      const callback = vi.fn();
      handler.onToolStateChange(callback);

      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "test-server",
        toolName: "test-tool",
      });
      await handler.handleEvent({
        type: "mcp_tool_end",
        toolId: "tool-1",
        result: "done",
      });

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          toolId: "tool-1",
          status: "completed",
          result: "done",
        })
      );
    });

    it("handles async callback", async () => {
      const results: string[] = [];
      handler.onToolStateChange(async (state) => {
        await new Promise((r) => setTimeout(r, 1));
        results.push(state.status);
      });

      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "test-server",
        toolName: "test-tool",
      });

      expect(results).toContain("running");
    });
  });

  describe("getToolState()", () => {
    it("returns state for existing tool", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "server",
        toolName: "tool",
      });

      const state = handler.getToolState("tool-1");
      expect(state).toBeDefined();
      expect(state?.toolId).toBe("tool-1");
    });

    it("returns undefined for non-existent tool", () => {
      const state = handler.getToolState("non-existent");
      expect(state).toBeUndefined();
    });
  });

  describe("getAllToolStates()", () => {
    it("returns empty array initially", () => {
      const states = handler.getAllToolStates();
      expect(states).toEqual([]);
    });

    it("returns all tracked tools", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "server1",
        toolName: "toolA",
      });
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-2",
        serverName: "server2",
        toolName: "toolB",
      });

      const states = handler.getAllToolStates();
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.toolId)).toContain("tool-1");
      expect(states.map((s) => s.toolId)).toContain("tool-2");
    });
  });

  describe("reset()", () => {
    it("clears all tool states", async () => {
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-1",
        serverName: "server",
        toolName: "tool",
      });
      await handler.handleEvent({
        type: "mcp_tool_start",
        toolId: "tool-2",
        serverName: "server",
        toolName: "tool",
      });

      expect(handler.getAllToolStates()).toHaveLength(2);

      handler.reset();

      expect(handler.getAllToolStates()).toHaveLength(0);
      expect(handler.getToolState("tool-1")).toBeUndefined();
      expect(handler.getToolState("tool-2")).toBeUndefined();
    });
  });
});

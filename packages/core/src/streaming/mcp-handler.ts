/**
 * MCP Stream Handler Module
 *
 * Provides types and classes for handling MCP (Model Context Protocol)
 * tool execution events within a stream.
 *
 * @module @vellum/core/streaming/mcp-handler
 */

// =============================================================================
// T017: MCPToolState and MCPStreamEvent Types
// =============================================================================

/** Status of an MCP tool execution */
export type MCPToolStatus = "pending" | "running" | "completed" | "error";

/** State of an MCP tool execution */
export interface MCPToolState {
  /** Unique identifier for this tool invocation */
  toolId: string;
  /** Name of the MCP server providing the tool */
  serverName: string;
  /** Name of the tool being executed */
  toolName: string;
  /** Current execution status */
  status: MCPToolStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Human-readable status message */
  message?: string;
  /** Result of the tool execution */
  result?: unknown;
  /** Error message if status is 'error' */
  error?: string;
  /** Timestamp when tool execution started */
  startTime: number;
  /** Timestamp when tool execution ended */
  endTime?: number;
}

/** Events related to MCP tool streaming */
export type MCPStreamEvent =
  | { type: "mcp_tool_start"; toolId: string; serverName: string; toolName: string }
  | { type: "mcp_tool_progress"; toolId: string; progress: number; message?: string }
  | { type: "mcp_tool_end"; toolId: string; result?: unknown; error?: string };

// =============================================================================
// T018: MCPStreamHandler Class
// =============================================================================

/** Callback for tool state changes */
export type MCPToolCallback = (state: MCPToolState) => void | Promise<void>;

/**
 * Handler for MCP tool stream events.
 *
 * Tracks the state of MCP tool executions and notifies registered
 * callbacks when tool state changes.
 *
 * @example
 * ```typescript
 * const handler = new MCPStreamHandler();
 *
 * handler.onToolStateChange((state) => {
 *   console.log(`Tool ${state.toolName}: ${state.status}`);
 * });
 *
 * await handler.handleEvent({
 *   type: 'mcp_tool_start',
 *   toolId: 'tool-1',
 *   serverName: 'filesystem',
 *   toolName: 'read_file',
 * });
 * ```
 */
export class MCPStreamHandler {
  private tools: Map<string, MCPToolState> = new Map();
  private callback?: MCPToolCallback;

  /**
   * Register callback for tool state changes.
   *
   * @param callback - Function to call when tool state changes
   */
  onToolStateChange(callback: MCPToolCallback): void {
    this.callback = callback;
  }

  /**
   * Handle an MCP stream event.
   *
   * Updates internal tool state and notifies the registered callback.
   *
   * @param event - The MCP stream event to handle
   */
  async handleEvent(event: MCPStreamEvent): Promise<void> {
    switch (event.type) {
      case "mcp_tool_start": {
        const state: MCPToolState = {
          toolId: event.toolId,
          serverName: event.serverName,
          toolName: event.toolName,
          status: "running",
          startTime: Date.now(),
        };
        this.tools.set(event.toolId, state);
        await this.callback?.(state);
        break;
      }
      case "mcp_tool_progress": {
        const state = this.tools.get(event.toolId);
        if (state) {
          state.progress = event.progress;
          state.message = event.message;
          await this.callback?.(state);
        }
        break;
      }
      case "mcp_tool_end": {
        const state = this.tools.get(event.toolId);
        if (state) {
          state.status = event.error ? "error" : "completed";
          state.result = event.result;
          state.error = event.error;
          state.endTime = Date.now();
          await this.callback?.(state);
        }
        break;
      }
    }
  }

  /**
   * Get state of a specific tool.
   *
   * @param toolId - The tool ID to look up
   * @returns The tool state, or undefined if not found
   */
  getToolState(toolId: string): MCPToolState | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all tool states.
   *
   * @returns Array of all tracked tool states
   */
  getAllToolStates(): MCPToolState[] {
    return [...this.tools.values()];
  }

  /**
   * Reset handler state.
   *
   * Clears all tracked tool states.
   */
  reset(): void {
    this.tools.clear();
  }
}

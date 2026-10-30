import { describe, expect, it, vi } from "vitest";
import { AgentLevel } from "../../../agent/level.js";
import type { AgentLoopConfig } from "../../../agent/loop.js";
import { bashTool } from "../../../builtin/bash.js";
import { createToolRegistry } from "../../../tool/registry.js";
import { createFilteredToolRegistry } from "../../session/filtered-tool-registry.js";
import type { WorkerContext } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

const capture = vi.hoisted(() => ({ config: undefined as AgentLoopConfig | undefined }));
vi.mock("../../../agent/loop.js", () => ({
  AgentLoop: class {
    constructor(config: AgentLoopConfig) {
      capture.config = config;
    }
    on() {}
    addMessage() {}
    async run() {}
    getState() {
      return "idle";
    }
    getIterationCount() {
      return 1;
    }
  },
}));

describe("worker tool schema export", () => {
  it("passes the same valid input contract to a delegated DeepSeek worker", async () => {
    const registry = createToolRegistry();
    registry.register(bashTool);
    const toolRegistry = createFilteredToolRegistry(registry, AgentLevel.worker);
    const context = {
      subsession: { toolRegistry, context: { localMemory: {}, sharedMemory: {} } },
      taskPacket: { task: "Inspect files" },
    } as unknown as WorkerContext;
    const result = await executeWorkerTask("coder", context, {
      providerType: "deepseek",
      model: "deepseek-flash",
    });
    expect(result.success).toBe(true);
    expect(capture.config?.tools).toEqual(
      registry.getDefinitions().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      }))
    );
    expect(capture.config?.tools?.[0]?.inputSchema).toMatchObject({
      properties: { timeout: { minimum: 0 } },
      required: ["command"],
    });
  });
});

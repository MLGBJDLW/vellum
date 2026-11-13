import { EventEmitter } from "node:events";
import type { AgentLoop, DelegationUpdate } from "@vellum/core";
import { Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubagentPanel } from "../components/Sidebar/SubagentPanel.js";
import { TaskWorkspacePanel } from "../components/Sidebar/TaskWorkspacePanel.js";
import { useSubagents } from "../hooks/useSubagents.js";
import { ThemeProvider } from "../theme/index.js";
import { getVisualWidth } from "../utils/text-width.js";

function worker(id: string, status: DelegationUpdate["status"] = "running"): DelegationUpdate {
  return { id, agent: id, task: `Task for ${id}`, status, startedAt: 1000, updatedAt: 2000 };
}

class TestLoop extends EventEmitter {
  entries: DelegationUpdate[];
  constructor(entries: DelegationUpdate[] = []) {
    super();
    this.entries = entries;
  }
  getDelegations() {
    return this.entries;
  }
  update(entry: DelegationUpdate) {
    this.entries = [...this.entries.filter((item) => item.id !== entry.id), entry];
    this.emit("delegationUpdate", entry);
  }
  asLoop() {
    return this as unknown as AgentLoop;
  }
}

afterEach(async () => {
  await act(async () => cleanup());
});

describe("live subagent task window", () => {
  it("coalesces concurrent streaming, preserves terminal outcomes and detaches when hidden", async () => {
    const loop = new TestLoop([worker("research"), worker("coder")]);
    const observed = vi.fn();
    function Harness({ source }: { source: TestLoop }) {
      const entries = useSubagents(source.asLoop());
      observed(entries);
      return (
        <Text>
          {entries.map((entry) => `${entry.id}:${entry.status}:${entry.message ?? ""}`).join("\n")}
        </Text>
      );
    }
    const screen = render(<Harness source={loop} />);
    await act(async () => {});
    observed.mockClear();
    await act(async () => {
      for (let i = 0; i < 500; i++) loop.update({ ...worker("research"), message: `chunk ${i}` });
    });
    expect(observed).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 125));
    });
    expect(screen.lastFrame()).toContain("research:running:chunk 499");
    expect(observed).toHaveBeenCalledOnce();
    observed.mockClear();
    await act(async () => {
      loop.update({ ...worker("coder", "failed"), error: "Permission denied" });
    });
    expect(screen.lastFrame()).toContain("research:running:chunk 499");
    expect(screen.lastFrame()).toContain("coder:failed:");
    expect(observed).toHaveBeenCalledOnce();
    await act(async () => {
      loop.update({ ...worker("research"), message: "pending" });
      screen.unmount();
    });
    expect(loop.listenerCount("delegationUpdate")).toBe(0);
    loop.update(worker("research", "completed"));
    const reopened = render(<Harness source={loop} />);
    expect(reopened.lastFrame()).toContain("research:completed:");
    const replacement = new TestLoop([worker("new-session", "queued")]);
    await act(async () => reopened.rerender(<Harness source={replacement} />));
    expect(reopened.lastFrame()).toContain("new-session:queued:");
    expect(reopened.lastFrame()).not.toContain("coder");
    expect(loop.listenerCount("delegationUpdate")).toBe(0);
  });

  it("renders waiting and failure separately and keeps narrow CJK rows inside the window", async () => {
    const entries = [
      worker("completed-agent", "completed"),
      { ...worker("校对代理", "running"), message: "检查移动端布局\n以及边界" },
      { ...worker("review", "failed"), error: "Access denied" },
      { ...worker("approval", "waiting"), message: "Approve shell command" },
    ];
    const screen = render(
      <ThemeProvider>
        <SubagentPanel
          entries={entries}
          width={24}
          maxHeight={12}
          isFocused
          mouseEnabled={false}
          onFocus={() => {}}
        />
      </ThemeProvider>
    );
    const frame = screen.lastFrame() ?? "";
    expect(frame).toContain("Subagents 2/4");
    expect(frame.indexOf("Waiting")).toBeLessThan(frame.indexOf("Working"));
    expect(frame).toContain("Failed");
    expect(frame).toContain("Access denied");
    expect(frame.split("\n").every((line) => getVisualWidth(line) <= 24)).toBe(true);
    expect(frame.split("\n").length).toBeLessThanOrEqual(12);
    await act(async () => screen.stdin.write("\r"));
    expect(screen.lastFrame()).toContain("Task for approval");
    expect(screen.lastFrame()).toContain("? turns");
  });

  it("pages through all workers and ignores composer keystrokes", async () => {
    const entries = Array.from({ length: 8 }, (_, i) => worker(`worker-${i}`));
    const view = (focused: boolean) => (
      <ThemeProvider>
        <SubagentPanel
          entries={entries}
          width={32}
          maxHeight={8}
          isFocused={focused}
          mouseEnabled={false}
          onFocus={() => {}}
        />
      </ThemeProvider>
    );
    const screen = render(view(false));
    await act(async () => screen.stdin.write("j\r"));
    expect(screen.lastFrame()).toContain("1-2/8");
    expect(screen.lastFrame()).not.toContain("? turns");
    await act(async () => screen.rerender(view(true)));
    for (let i = 0; i < 7; i++) await act(async () => screen.stdin.write("j"));
    expect(screen.lastFrame()).toContain("worker-7");
    expect(screen.lastFrame()).toContain("7-8/8");
  });

  it("switches short terminals between tasks and workers without losing either list", async () => {
    const loop = new TestLoop([worker("research", "running")]);
    const screen = render(
      <ThemeProvider>
        <TaskWorkspacePanel
          loop={loop.asLoop()}
          items={[
            {
              id: "plan",
              title: "Write the plan",
              status: "pending",
              createdAt: new Date().toISOString(),
            },
          ]}
          width={32}
          maxHeight={10}
          isFocused
          mouseEnabled={false}
        />
      </ThemeProvider>
    );
    expect(screen.lastFrame()).toContain("Write the plan");
    expect(screen.lastFrame()).toContain("Subagents 1/1");
    await act(async () => screen.stdin.write("a"));
    expect(screen.lastFrame()).toContain("Working · research");
    expect(screen.lastFrame()).toContain("Tasks (1)");
    expect((screen.lastFrame() ?? "").split("\n").length).toBeLessThanOrEqual(10);
    await act(async () => screen.stdin.write("a"));
    expect(screen.lastFrame()).toContain("Write the plan");
  });
});

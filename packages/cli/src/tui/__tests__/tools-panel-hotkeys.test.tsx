/**
 * Tools panel hotkey hint render tests
 *
 * Ensures the sidebar footer hint bar is present so users can discover shortcuts.
 *
 * @vitest-environment node
 */

import { createToolRegistry, type ToolExecutor } from "@vellum/core";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

describe("ToolsPanel", () => {
  it("renders common sidebar hotkey hints", async () => {
    const { RootProvider, ToolsPanel } = await import("../index.js");

    const registry = createToolRegistry();

    const executor: ToolExecutor = {
      registerTool: vi.fn(),
    } as unknown as ToolExecutor;

    const { lastFrame } = render(
      <RootProvider theme="dark" toolRegistry={registry} toolExecutor={executor}>
        <ToolsPanel />
      </RootProvider>
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Tools");

    // Footer hotkey hints (Alt primary)
    // Note: Only check the first few hints as remaining may be truncated by terminal width
    expect(frame).toContain("Alt+K");
    expect(frame).toContain("Alt+G");
    expect(frame).toContain("Alt+O");
    expect(frame).toContain("Alt+P");
    expect(frame).toContain("Alt+T");
  });
});

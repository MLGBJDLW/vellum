import type { DetectorOptions } from "@vellum/lsp";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { parseMouseEvent } from "../../utils/mouse-parser.js";
import { ConnectedLspSetupPanel } from "../ConnectedLspSetupPanel.js";

const fixtures = vi.hoisted(() => ({
  initialized: true,
  availableHub: true,
  refresh: vi.fn(),
  installed: new Set<string>(),
  getServers: vi.fn(),
  getConfig: vi.fn(),
  isServerInstalled: vi.fn(),
  isServerRunning: vi.fn(),
  installServer: vi.fn(),
  startServer: vi.fn(),
  triggerLanguageDetection: vi.fn(),
  createDetector: vi.fn(),
  detect: vi.fn(),
  detectorOptions: null as DetectorOptions | null,
}));
vi.mock("../../context/LspContext.js", () => ({
  useLsp: () => ({ isInitialized: fixtures.initialized, refresh: fixtures.refresh }),
}));
vi.mock("../../lsp-integration.js", () => ({
  getLspManager: () => ({ getHub: () => (fixtures.availableHub ? fixtures : null) }),
}));
vi.mock("@vellum/lsp", () => ({
  LanguageDetector: class {
    constructor(options: DetectorOptions) {
      fixtures.detectorOptions = options;
      fixtures.createDetector(options);
    }
    detect() {
      return fixtures.detect();
    }
  },
}));

function tree() {
  return (
    <ThemeProvider>
      <Box width={100} marginLeft={4} marginTop={2}>
        <ConnectedLspSetupPanel />
      </Box>
    </ThemeProvider>
  );
}
async function mount() {
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(tree());
  });
  return screen;
}
async function click(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}: ${screen.lastFrame()}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  await act(async () => {
    for (const suffix of ["M", "m"]) {
      const event = parseMouseEvent(`\x1b[<0;${col};${row + 1}${suffix}`);
      if (!event) throw new Error("Invalid click fixture");
      globalClickRegistry.dispatch(col, row + 1, event);
    }
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.initialized = true;
  fixtures.availableHub = true;
  fixtures.installed = new Set(["typescript"]);
  fixtures.detectorOptions = null;
  fixtures.getServers.mockReturnValue([
    { id: "typescript", name: "Configured TypeScript" },
    { id: "python", name: "Configured Python" },
  ]);
  fixtures.getConfig.mockReturnValue({
    servers: {
      typescript: {
        enabled: true,
        command: "tsserver",
        install: { method: "npm", package: "typescript-language-server" },
      },
      python: { enabled: true, command: "pyright", install: { method: "npm", package: "pyright" } },
      ruby: { enabled: true, command: "ruby-lsp", install: { method: "system" } },
    },
    disabled: ["ruby"],
  });
  fixtures.isServerInstalled.mockImplementation(async (id: string) => fixtures.installed.has(id));
  fixtures.isServerRunning.mockReturnValue(false);
  fixtures.installServer.mockResolvedValue(undefined);
  fixtures.detect.mockResolvedValue([{ serverId: "python", languageId: "python" }]);
});
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("connected LSP setup evidence", () => {
  it("displays exactly the hub catalog and authoritative installation probes", async () => {
    const screen = await mount();
    expect(fixtures.getServers).toHaveBeenCalledTimes(1);
    expect(fixtures.isServerInstalled.mock.calls.map(([id]) => id)).toEqual([
      "typescript",
      "python",
    ]);
    expect(screen.lastFrame()).toContain("Installed (1)");
    expect(screen.lastFrame()).toContain("Configured TypeScript");
    expect(screen.lastFrame()).toContain("Available (1)");
    expect(screen.lastFrame()).toContain("Configured Python");
    expect(screen.lastFrame()).not.toContain("Bash Language Server");
    expect(fixtures.installServer).not.toHaveBeenCalled();
  });
  it("does not report success when post-install verification still fails", async () => {
    const screen = await mount();
    await click(screen, "Configured Python");
    expect(fixtures.installServer).toHaveBeenCalledExactlyOnceWith("python");
    expect(fixtures.isServerInstalled.mock.calls.filter(([id]) => id === "python")).toHaveLength(2);
    expect(screen.lastFrame()).toContain(
      "Install failed: Installation completed but Configured Python is not available"
    );
    expect(screen.lastFrame()).toContain("Available (1)");
    expect(screen.lastFrame()).not.toContain("Installed (2)");
    expect(fixtures.refresh).not.toHaveBeenCalled();
  });
  it("updates installed status and refreshes only after successful verification", async () => {
    fixtures.installServer.mockImplementation(async (id: string) => {
      fixtures.installed.add(id);
    });
    const screen = await mount();
    await click(screen, "Configured Python");
    expect(fixtures.installServer).toHaveBeenCalledExactlyOnceWith("python");
    expect(screen.lastFrame()).toContain("Installed (2)");
    expect(screen.lastFrame()).not.toContain("Available (1)");
    expect(fixtures.refresh).toHaveBeenCalledTimes(1);
  });
  it("detects using read-only LanguageDetector configuration and never triggers hub auto mode", async () => {
    const screen = await mount();
    await click(screen, "d Detect");
    expect(fixtures.createDetector).toHaveBeenCalledTimes(1);
    expect(fixtures.detect).toHaveBeenCalledTimes(1);
    expect(fixtures.detectorOptions?.workspaceRoot).toBe(process.cwd());
    expect([...(fixtures.detectorOptions?.serverConfigs.keys() ?? [])]).toEqual([
      "typescript",
      "python",
    ]);
    expect(await fixtures.detectorOptions?.isServerInstalled?.("typescript")).toBe(true);
    expect(fixtures.detectorOptions?.isServerRunning?.("python")).toBe(false);
    expect(screen.lastFrame()).toContain("Configured Python ★");
    expect(screen.lastFrame()).not.toContain("Configured TypeScript ★");
    expect(fixtures.triggerLanguageDetection).not.toHaveBeenCalled();
    expect(fixtures.installServer).not.toHaveBeenCalled();
    expect(fixtures.startServer).not.toHaveBeenCalled();
  });
  it.each(["not initialized", "no hub"])("disables operations when %s", async (reason) => {
    fixtures.initialized = reason !== "not initialized";
    fixtures.availableHub = reason !== "no hub";
    const screen = await mount();
    await click(screen, "a Install All");
    await click(screen, "d Detect");
    await act(async () => {
      screen.stdin.write("a");
      screen.stdin.write("d");
    });
    expect(screen.lastFrame()).toContain("No language server status available");
    expect(screen.lastFrame()).toContain("Installation unavailable");
    expect(screen.lastFrame()).toContain("Project detection unavailable");
    expect(fixtures.getServers).not.toHaveBeenCalled();
    expect(fixtures.installServer).not.toHaveBeenCalled();
    expect(fixtures.createDetector).not.toHaveBeenCalled();
  });
  it("ignores a pending catalog response after the hub disappears", async () => {
    let complete!: (installed: boolean) => void;
    fixtures.isServerInstalled.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          complete = resolve;
        })
    );
    fixtures.getServers.mockReturnValue([{ id: "python", name: "Configured Python" }]);
    const screen = await mount();
    fixtures.availableHub = false;
    await act(async () => {
      screen.rerender(tree());
    });
    await act(async () => {
      complete(true);
    });
    expect(screen.lastFrame()).not.toContain("Configured Python");
    expect(screen.lastFrame()).toContain("Installation unavailable");
  });
});

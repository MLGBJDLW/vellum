import {
  createModeSelectStep,
  createProviderSelectStep,
  type OnboardingStep,
  type OnboardingWizard as WizardCore,
} from "@vellum/core";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import stringWidth from "string-width";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MouseContext } from "../../context/MouseContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { globalClickRegistry } from "../../utils/click-region.js";
import { type MouseEvent, parseMouseEvent } from "../../utils/mouse-parser.js";
import { OnboardingWizard } from "../OnboardingWizard.js";

vi.mock("../../i18n/index.js", () => ({ useTUITranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../hooks/useTerminalSize.js", () => ({
  useTerminalDimensions: () => ({ width: 100, height: 35, isNarrow: false, maxContentWidth: 98 }),
}));

function fixture(step: OnboardingStep) {
  return {
    loadState: vi.fn(async () => {}),
    getState: () => ({ currentStep: step, selectedProvider: "anthropic", selectedMode: "orch" }),
    executeWelcome: vi.fn(async () => ({ success: true, next: true })),
    executeProviderSelect: vi.fn(async (provider: string) => ({
      success: true,
      next: true,
      data: { provider },
    })),
    executeModeSelect: vi.fn(async (mode: string) => ({
      success: true,
      next: true,
      data: { mode },
    })),
    executeCredentialSetup: vi.fn(async () => ({ success: true, next: true })),
    executeComplete: vi.fn(async () => {}),
    saveConfig: vi.fn(async () => {}),
  };
}
async function mount(step: OnboardingStep) {
  const wizard = fixture(step);
  const cancel = vi.fn();
  const complete = vi.fn();
  const wheelHandlers = new Set<(event: MouseEvent) => void>();
  const mouse = {
    isMouseActive: true,
    lastPosition: null,
    onWheel: (handler: (event: MouseEvent) => void) => {
      wheelHandlers.add(handler);
      return () => {
        wheelHandlers.delete(handler);
      };
    },
    onClick: () => () => {},
    onPointer: () => () => {},
    cancelPointerCapture: () => {},
  };
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(
      <ThemeProvider>
        <MouseContext.Provider value={mouse}>
          <Box width={110} marginTop={2} marginLeft={3}>
            <OnboardingWizard
              wizard={wizard as unknown as WizardCore}
              onCancel={cancel}
              onComplete={complete}
            />
          </Box>
        </MouseContext.Provider>
      </ThemeProvider>
    );
  });
  return {
    wizard,
    cancel,
    complete,
    screen,
    wheel: (col: number, row: number, down = true) => {
      const event = parseMouseEvent(`\x1b[<${down ? 65 : 64};${col};${row}M`);
      if (!event) throw new Error("Invalid wheel fixture");
      for (const handler of wheelHandlers) handler(event);
    },
  };
}
function position(screen: ReturnType<typeof render>, label: string) {
  const lines = (screen.lastFrame() ?? "").split("\n");
  const row = lines.findIndex((line) => line.includes(label));
  expect(row, `Missing ${label}: ${screen.lastFrame()}`).toBeGreaterThanOrEqual(0);
  const line = lines[row] ?? "";
  const col = stringWidth(line.slice(0, line.indexOf(label))) + 1;
  return { col, row: row + 1 };
}
async function click(screen: ReturnType<typeof render>, label: string) {
  const { col, row } = position(screen, label);
  await act(async () => {
    for (const suffix of ["M", "m"]) {
      const event = parseMouseEvent(`\x1b[<0;${col};${row}${suffix}`);
      if (!event) throw new Error("Bad mouse fixture");
      globalClickRegistry.dispatch(col, row, event);
    }
  });
}
afterEach(async () => {
  await act(async () => cleanup());
  globalClickRegistry.clear();
});

describe("onboarding mouse actions", () => {
  it("scrolls provider focus only within the measured list and clamps without choosing", async () => {
    const { screen, wizard, wheel } = await mount("provider-select");
    const providers = createProviderSelectStep().getProviders();
    const first = providers[0];
    if (!first) throw new Error("Missing provider fixture");
    const target = position(screen, first.name);
    await act(async () => {
      wheel(1, target.row);
    });
    expect(screen.lastFrame()).toContain(`1/${providers.length}`);
    await act(async () => {
      for (let i = 0; i < providers.length * 2; i++) wheel(target.col, target.row);
    });
    expect(screen.lastFrame()).toContain(`${providers.length}/${providers.length}`);
    expect(wizard.executeProviderSelect).not.toHaveBeenCalled();
    await act(async () => {
      for (let i = 0; i < providers.length * 2; i++) wheel(target.col, target.row, false);
    });
    expect(screen.lastFrame()).toContain(`1/${providers.length}`);
    expect(wizard.executeCredentialSetup).not.toHaveBeenCalled();
  });
  it("selects the clicked provider once without submitting credentials", async () => {
    const { screen, wizard } = await mount("provider-select");
    const provider = createProviderSelectStep().getProviders()[1];
    if (!provider) throw new Error("Missing provider fixture");
    await click(screen, provider.name);
    expect(wizard.executeProviderSelect).toHaveBeenCalledExactlyOnceWith(provider.id);
    expect(wizard.executeCredentialSetup).not.toHaveBeenCalled();
    expect(wizard.saveConfig).not.toHaveBeenCalled();
  });
  it("continues with the keyboard focused provider instead of a default", async () => {
    const { screen, wizard } = await mount("provider-select");
    await act(async () => {
      screen.stdin.write("\x1b[B");
    });
    await click(screen, "Enter: Continue");
    expect(wizard.executeProviderSelect).toHaveBeenCalledExactlyOnceWith(
      createProviderSelectStep().getProviders()[1]?.id
    );
  });
  it("selects a mode by clicking its rendered description", async () => {
    const { screen, wizard } = await mount("mode-select");
    const mode = createModeSelectStep().getModes()[0];
    if (!mode) throw new Error("Missing mode fixture");
    await click(screen, mode.description);
    expect(wizard.executeModeSelect).toHaveBeenCalledExactlyOnceWith(mode.id);
    expect(wizard.executeComplete).not.toHaveBeenCalled();
  });
  it("exposes Continue, Back and Cancel using existing wizard transitions", async () => {
    const { screen, wizard, cancel } = await mount("welcome");
    await click(screen, "Enter: Continue");
    expect(wizard.executeWelcome).toHaveBeenCalledTimes(1);
    await click(screen, "Backspace: Back");
    expect(screen.lastFrame()).toContain("Step 1 of");
    await click(screen, "Esc: Cancel");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(wizard.saveConfig).not.toHaveBeenCalled();
  });
  it("only completes setup on the explicit final Continue", async () => {
    const { screen, wizard, complete } = await mount("complete");
    expect(wizard.saveConfig).not.toHaveBeenCalled();
    await click(screen, "Enter: Continue");
    expect(wizard.executeComplete).toHaveBeenCalledTimes(1);
    expect(wizard.saveConfig).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

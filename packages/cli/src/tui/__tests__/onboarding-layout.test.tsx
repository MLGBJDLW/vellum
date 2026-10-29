import { Ok, type OnboardingStep, OnboardingWizard as WizardCore } from "@vellum/core";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "../components/OnboardingWizard.js";
import { ThemeProvider } from "../theme/index.js";

vi.mock("../hooks/useTerminalSize.js", () => ({
  useTerminalDimensions: () => ({ width: 80, height: 24, isNarrow: true, maxContentWidth: 80 }),
}));

function renderStep(step: OnboardingStep) {
  const wizard = new WizardCore();
  const state = { ...wizard.getState(), currentStep: step };
  vi.spyOn(wizard, "loadState").mockResolvedValue(Ok(state));
  vi.spyOn(wizard, "getState").mockReturnValue(state);
  return render(
    <Box width={80}>
      <ThemeProvider>
        <OnboardingWizard wizard={wizard} initialStep={step} />
      </ThemeProvider>
    </Box>
  );
}

describe("first-run layout in an 80 by 24 terminal", () => {
  it("keeps the welcome message and continue controls visible", async () => {
    const { lastFrame, unmount } = renderStep("welcome");
    await vi.waitFor(() => expect(lastFrame()).toContain("personal AI assistant"));
    expect(lastFrame()).toContain("Enter: Continue");
    expect(lastFrame()?.split("\n").length).toBeLessThanOrEqual(24);
    unmount();
  });

  it("scrolls through all providers without moving the controls off screen", async () => {
    const { lastFrame, stdin, unmount } = renderStep("provider-select");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lastFrame()?.split("\n").length).toBeLessThanOrEqual(24);
    stdin.write("\u001b[A");
    await vi.waitFor(() => expect(lastFrame()).toContain("17/17"));
    expect(lastFrame()).toMatch(/lm.?studio/i);
    expect(lastFrame()).toContain("Enter: Continue");
    expect(lastFrame()?.split("\n").length).toBeLessThanOrEqual(24);
    unmount();
  });
});

import { Ok, type OnboardingStep, OnboardingWizard as WizardCore } from "@vellum/core";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "../components/OnboardingWizard.js";
import { BracketedPasteProvider } from "../context/BracketedPasteContext.js";
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
  it("submits a masked credential pasted immediately before Enter exactly once", async () => {
    const wizard = new WizardCore();
    const state = {
      ...wizard.getState(),
      currentStep: "credential-setup" as const,
      selectedProvider: "anthropic",
    };
    vi.spyOn(wizard, "loadState").mockResolvedValue(Ok(state));
    vi.spyOn(wizard, "getState").mockReturnValue(state);
    const save = vi.spyOn(wizard, "executeCredentialSetup").mockResolvedValue({
      success: false,
      next: false,
      back: false,
      skip: false,
      error: "Fixture validation stopped",
    });
    const { stdin, lastFrame, unmount } = render(
      <ThemeProvider>
        <BracketedPasteProvider>
          <OnboardingWizard wizard={wizard} initialStep="credential-setup" />
        </BracketedPasteProvider>
      </ThemeProvider>
    );
    await vi.waitFor(() => expect(lastFrame()).toContain("API Key:"));
    const secret = "sk-fixture-not-a-real-key";
    await act(async () => {
      stdin.write(`\x1b[200~${secret}\x1b[201~\r`);
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(secret, expect.any(String));
    expect(lastFrame()).not.toContain(secret);
    act(() => unmount());
  });

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

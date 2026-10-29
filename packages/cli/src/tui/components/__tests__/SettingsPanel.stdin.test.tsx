import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BracketedPasteProvider } from "../../context/BracketedPasteContext.js";
import { ThemeProvider } from "../../theme/index.js";
import { SettingsPanel } from "../SettingsPanel.js";

const { setThinkingSettings } = vi.hoisted(() => ({ setThinkingSettings: vi.fn() }));
vi.mock("../../i18n/index.js", () => ({
  getThinkingSettings: () => ({ enabled: true, budgetTokens: 10000 }),
  getModelSettings: () => ({}),
  getSavedLanguage: () => "en",
  getDiffViewMode: () => "unified",
  getAlternateBufferEnabled: () => true,
  getThemeFromSettings: () => "parchment",
  getModeFromSettings: () => "vibe",
  setThinkingSettings,
  setAlternateBufferEnabled: vi.fn(),
  setDiffViewMode: vi.fn(),
  setModeInSettings: vi.fn(),
  setThemeInSettings: vi.fn(),
}));

afterEach(() => {
  act(() => cleanup());
  vi.clearAllMocks();
});

function mount(isActive = true) {
  let result!: ReturnType<typeof render>;
  act(() => {
    result = render(
      <ThemeProvider>
        <BracketedPasteProvider>
          <SettingsPanel isActive={isActive} initialCategory="thinking" />
        </BracketedPasteProvider>
      </ThemeProvider>
    );
  });
  return result;
}

async function send(stdin: { write: (data: string) => void }, input: string) {
  await act(async () => {
    stdin.write(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("SettingsPanel terminal editing", () => {
  it("accepts bracketed paste and confirms its current value in the same input chunk", async () => {
    const { stdin, lastFrame } = mount();
    await send(stdin, "\x1b[B");
    await send(stdin, "\r");
    await send(stdin, "\x1b[200~999\x1b[201~\r");
    expect(setThinkingSettings).toHaveBeenCalledWith(
      expect.objectContaining({ budgetTokens: 10000999 })
    );
    expect(lastFrame()).not.toContain("[200~");
  });

  it("does not route pasted shortcut characters to inactive settings or navigation", async () => {
    const { stdin, lastFrame } = mount(false);
    await send(stdin, "\x1b[200~j\r999\x1b[201~");
    expect(setThinkingSettings).not.toHaveBeenCalled();
    expect(lastFrame()).not.toContain("999");
  });
});

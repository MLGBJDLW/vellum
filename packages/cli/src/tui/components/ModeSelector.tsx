/** Select an existing assistant workflow through the shared mode owner. */
import { BUILTIN_CODING_MODES, type CodingMode } from "@vellum/core";
import { Box, Text } from "ink";
import type React from "react";
import { useId, useRef, useState } from "react";
import { useInput } from "../hooks/useTerminalInput.js";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";
import { Clickable } from "./common/Clickable.js";

export interface ModeSelectorProps {
  readonly currentMode: CodingMode;
  readonly onSelect: (mode: CodingMode) => void;
  readonly isActive?: boolean;
  readonly showDescriptions?: boolean;
}

const MODES: readonly CodingMode[] = ["orch", "vibe", "plan", "spec"];

export function ModeSelector({
  currentMode,
  onSelect,
  isActive = true,
  showDescriptions = true,
}: ModeSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const selectorId = useId();
  const [selection, setSelection] = useState({ currentMode, index: MODES.indexOf(currentMode) });
  const selectedIndex =
    selection.currentMode === currentMode ? selection.index : MODES.indexOf(currentMode);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  if (selection.currentMode !== currentMode) {
    setSelection({ currentMode, index: selectedIndex });
  }
  const focusIndex = (index: number) => {
    const next = Math.max(0, Math.min(index, MODES.length - 1));
    selectedIndexRef.current = next;
    setSelection({ currentMode, index: next });
  };
  const selectIndex = (index: number) => {
    const mode = MODES[index];
    if (!mode) return;
    focusIndex(index);
    onSelect(mode);
  };
  useInput(
    (input, key) => {
      if (key.downArrow) focusIndex(selectedIndexRef.current + 1);
      else if (key.upArrow) focusIndex(selectedIndexRef.current - 1);
      else if (key.return) selectIndex(selectedIndexRef.current);
      else if (!key.ctrl && !key.meta && /^[1-4]$/.test(input)) selectIndex(Number(input) - 1);
    },
    { isActive }
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{t("modeSelector.title")}</Text>
      {MODES.map((mode, index) => (
        <Clickable
          key={mode}
          id={`${selectorId}-${mode}`}
          enabled={isActive}
          onClick={() => selectIndex(index)}
        >
          <Box flexDirection="column">
            <Text
              color={index === selectedIndex ? theme.colors.primary : theme.semantic.text.primary}
            >
              {isActive && index === selectedIndex ? "❯ " : "  "}[{index + 1}] {mode}
              {currentMode === mode ? ` ${t("modeSelector.current")}` : ""}
            </Text>
            {showDescriptions && <Text dimColor>{BUILTIN_CODING_MODES[mode].description}</Text>}
          </Box>
        </Clickable>
      ))}
      <Text dimColor>{t("modeSelector.keybindings")}</Text>
    </Box>
  );
}

export type { CodingMode };

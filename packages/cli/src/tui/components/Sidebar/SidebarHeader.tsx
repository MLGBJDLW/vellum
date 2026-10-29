import { Box, Text } from "ink";
import type React from "react";
import { useId } from "react";
import type { SidebarContent } from "../../hooks/useSidebarPanelData.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { Clickable } from "../common/Clickable.js";

export const SIDEBAR_PANELS: readonly SidebarContent[] = [
  "todo",
  "memory",
  "tools",
  "mcp",
  "snapshots",
  "lsp",
];

export interface SidebarHeaderProps {
  readonly panel: SidebarContent;
  readonly isFocused: boolean;
  readonly onSelectPanel?: (panel: SidebarContent) => void;
  readonly onClose?: () => void;
  readonly mouseEnabled?: boolean;
}

export function SidebarHeader({
  panel,
  isFocused,
  onSelectPanel,
  onClose,
  mouseEnabled = true,
}: SidebarHeaderProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const headerId = useId();
  const index = SIDEBAR_PANELS.indexOf(panel);
  const selectAdjacent = (direction: number) => {
    const next =
      SIDEBAR_PANELS[(index + direction + SIDEBAR_PANELS.length) % SIDEBAR_PANELS.length];
    if (next) onSelectPanel?.(next);
  };
  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1}>
      <Box justifyContent="space-between">
        <Box flexShrink={1}>
          <Text
            bold
            wrap="truncate"
            color={isFocused ? theme.colors.primary : theme.semantic.text.secondary}
          >
            {isFocused ? "▸ " : ""}
            {t(`sidebar.${panel}`)}
          </Text>
        </Box>
        <Box flexShrink={0} gap={1}>
          {onSelectPanel && (
            <Clickable
              id={`${headerId}-previous`}
              width="auto"
              enabled={mouseEnabled}
              onClick={() => selectAdjacent(-1)}
            >
              <Text color={theme.colors.primary}>[‹]</Text>
            </Clickable>
          )}
          <Text dimColor>
            {index + 1}/{SIDEBAR_PANELS.length}
          </Text>
          {onSelectPanel && (
            <Clickable
              id={`${headerId}-next`}
              width="auto"
              enabled={mouseEnabled}
              onClick={() => selectAdjacent(1)}
            >
              <Text color={theme.colors.primary}>[›]</Text>
            </Clickable>
          )}
          {onClose && (
            <Clickable
              id={`${headerId}-close`}
              width="auto"
              enabled={mouseEnabled}
              onClick={() => onClose()}
            >
              <Text color={theme.colors.primary}>[×]</Text>
            </Clickable>
          )}
        </Box>
      </Box>
      <Text dimColor wrap="truncate">
        {t(isFocused ? "sidebar.activeHint" : "sidebar.focusHint")}
      </Text>
    </Box>
  );
}

import { Box, Text } from "ink";
import type React from "react";
import type { SidebarContent } from "../../hooks/useSidebarPanelData.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";

export const SIDEBAR_PANELS: readonly SidebarContent[] = [
  "todo",
  "memory",
  "tools",
  "mcp",
  "snapshots",
  "lsp",
];

export function SidebarHeader({
  panel,
  isFocused,
}: {
  panel: SidebarContent;
  isFocused: boolean;
}): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const index = SIDEBAR_PANELS.indexOf(panel);
  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1}>
      <Box justifyContent="space-between">
        <Text bold color={isFocused ? theme.colors.primary : theme.semantic.text.secondary}>
          {isFocused ? "▸ " : ""}
          {t(`sidebar.${panel}`)}
        </Text>
        <Text dimColor>
          {index + 1}/{SIDEBAR_PANELS.length}
        </Text>
      </Box>
      <Text dimColor wrap="truncate">
        {t(isFocused ? "sidebar.activeHint" : "sidebar.focusHint")}
      </Text>
    </Box>
  );
}

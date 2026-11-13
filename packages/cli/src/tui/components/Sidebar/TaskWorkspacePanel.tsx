import type { AgentLoop } from "@vellum/core";
import { Box, Text } from "ink";
import { useId, useState } from "react";
import { MouseInteractionScope, useMouseInteractionActivate } from "../../context/MouseContext.js";
import { useSubagents } from "../../hooks/useSubagents.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTUITranslation } from "../../i18n/index.js";
import { Clickable } from "../common/Clickable.js";
import { TodoPanel, type TodoPanelProps } from "../TodoPanel.js";
import { SubagentPanel } from "./SubagentPanel.js";

export interface TaskWorkspacePanelProps extends TodoPanelProps {
  readonly loop?: AgentLoop;
}

/** Workers live inside Tasks, with a single focused section on short terminals. */
export function TaskWorkspacePanel({
  loop,
  isFocused = false,
  mouseEnabled = isFocused,
  width = 30,
  maxHeight = 20,
  ...todoProps
}: TaskWorkspacePanelProps): React.JSX.Element {
  const entries = useSubagents(loop);
  const activateSidebar = useMouseInteractionActivate();
  const { t } = useTUITranslation();
  const panelId = useId();
  const [focusAgents, setFocusAgents] = useState<boolean | null>(null);
  const hasAgents = entries.length > 0;
  const agentsFocused = hasAgents && (focusAgents ?? todoProps.items.length === 0);
  const compact = maxHeight < 16 || todoProps.items.length === 0;
  const agentHeight = !hasAgents
    ? 0
    : compact
      ? agentsFocused
        ? maxHeight - 1
        : 1
      : Math.max(6, Math.floor(maxHeight / 2));
  const taskHeight = Math.max(1, maxHeight - agentHeight);

  useInput(
    (input, key) => {
      if (input === "a" && !key.ctrl && !key.meta) setFocusAgents(!agentsFocused);
    },
    { isActive: isFocused && hasAgents }
  );

  return (
    <Box flexDirection="column" width={width} height={maxHeight} overflow="hidden">
      {compact && agentsFocused ? (
        <Clickable
          id={`${panelId}-tasks`}
          enabled={mouseEnabled}
          onClick={() => setFocusAgents(false)}
        >
          <Text dimColor wrap="truncate-end">
            {t("todo.title")} ({todoProps.items.length}) · {t("subagents.switch")}
          </Text>
        </Clickable>
      ) : null}
      <Box
        display={compact && agentsFocused ? "none" : "flex"}
        height={taskHeight}
        flexShrink={0}
        overflow="hidden"
      >
        <MouseInteractionScope
          enabled={mouseEnabled}
          onActivate={() => {
            activateSidebar?.();
            setFocusAgents(false);
          }}
        >
          <TodoPanel
            {...todoProps}
            width={width}
            maxHeight={taskHeight}
            isFocused={isFocused && !agentsFocused}
            mouseEnabled={mouseEnabled}
          />
        </MouseInteractionScope>
      </Box>
      {hasAgents && (
        <SubagentPanel
          entries={entries}
          width={width}
          maxHeight={agentHeight}
          isFocused={isFocused && agentsFocused}
          mouseEnabled={mouseEnabled}
          onFocus={() => setFocusAgents(true)}
        />
      )}
    </Box>
  );
}

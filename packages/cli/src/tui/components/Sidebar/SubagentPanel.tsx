import type { DelegationUpdate } from "@vellum/core";
import { Box, type DOMElement, Text } from "ink";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import { isSubagentActive } from "../../hooks/useSubagents.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { truncateToWidth } from "../../utils/text-width.js";
import { sanitize } from "../../utils/textSanitizer.js";
import { Clickable, getVisibleClickBounds } from "../common/Clickable.js";

export interface SubagentPanelProps {
  readonly entries: readonly DelegationUpdate[];
  readonly width: number;
  readonly maxHeight: number;
  readonly isFocused: boolean;
  readonly mouseEnabled: boolean;
  readonly onFocus: () => void;
}

const STATUS_ICONS: Record<DelegationUpdate["status"], string> = {
  queued: "o",
  running: "~",
  waiting: "?",
  completed: "+",
  failed: "!",
  cancelled: "-",
  interrupted: "!",
};

function priority(entry: DelegationUpdate): number {
  if (entry.status === "waiting") return 0;
  if (isSubagentActive(entry)) return 1;
  if (entry.status === "failed" || entry.status === "interrupted") return 2;
  return 3;
}

/** Keep concurrent workers stable while streaming; recent receipts follow them. */
function orderedEntries(entries: readonly DelegationUpdate[]): DelegationUpdate[] {
  return [...entries].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (isSubagentActive(a) ? a.startedAt - b.startedAt : b.updatedAt - a.updatedAt) ||
      a.id.localeCompare(b.id)
  );
}

function preview(value: string, width: number): string {
  return truncateToWidth(
    sanitize(value.slice(0, 2048), { stripAllAnsi: true })
      .replaceAll("\u001b", "")
      .replace(/\s+/gu, " ")
      .trim(),
    Math.max(1, width)
  );
}

/** Compact nested live worker list. No timers, model calls, or transcript copies. */
export function SubagentPanel({
  entries,
  width,
  maxHeight,
  isFocused,
  mouseEnabled,
  onFocus,
}: SubagentPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const panelId = useId();
  const panelNode = useRef<DOMElement>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const sorted = useMemo(() => orderedEntries(entries), [entries]);
  const activeCount = entries.filter(isSubagentActive).length;
  const index = Math.max(
    0,
    sorted.findIndex((entry) => entry.id === selectedId)
  );
  const selected = sorted[index];
  const expanded = selected && expandedId === selected.id && maxHeight >= 8;
  const visibleCount = Math.max(1, Math.floor((maxHeight - 3 - (expanded ? 3 : 0)) / 2));
  const offset = Math.floor(index / visibleCount) * visibleCount;
  const visible = sorted.slice(offset, offset + visibleCount);
  const move = useCallback(
    (delta: number) => {
      const next = sorted[Math.max(0, Math.min(sorted.length - 1, index + delta))];
      if (next) setSelectedId(next.id);
    },
    [index, sorted]
  );
  const bounds = useCallback(() => {
    const value = getVisibleClickBounds(panelNode.current);
    return value && { ...value, left: value.left - 1, top: value.top - 1 };
  }, []);
  useMouseScroll({
    enabled: mouseEnabled && maxHeight > 1,
    bounds,
    scrollSpeed: 1,
    onScroll: (delta) => {
      onFocus();
      move(delta);
    },
  });
  useInput(
    (input, key) => {
      if (key.downArrow || input === "j") move(1);
      else if (key.upArrow || input === "k") move(-1);
      else if (key.pageDown) move(visibleCount);
      else if (key.pageUp) move(-visibleCount);
      else if (key.return && selected)
        setExpandedId(expandedId === selected.id ? undefined : selected.id);
    },
    { isActive: isFocused }
  );

  const title = `${isFocused ? "> " : ""}${t("subagents.title")} ${activeCount}/${entries.length} [a]`;
  return (
    <Box
      ref={panelNode}
      flexDirection="column"
      width={width}
      maxHeight={maxHeight}
      overflow="hidden"
    >
      <Clickable id={`${panelId}-focus`} enabled={mouseEnabled} onClick={onFocus}>
        <Text bold color={theme.colors.primary}>
          {preview(title, width)}
        </Text>
      </Clickable>
      {maxHeight > 1 && entries.length === 0 && (
        <Text dimColor wrap="truncate-end">
          {t("subagents.empty")}
        </Text>
      )}
      {maxHeight > 1 &&
        visible.map((entry) => {
          const chosen = selected?.id === entry.id;
          const color =
            entry.status === "failed" || entry.status === "interrupted"
              ? theme.colors.error
              : entry.status === "waiting"
                ? theme.colors.warning
                : entry.status === "completed"
                  ? theme.colors.success
                  : theme.semantic.text.secondary;
          const activity =
            entry.error ||
            (entry.toolName
              ? `${entry.toolName}: ${entry.message || entry.task}`
              : entry.message || entry.task);
          return (
            <Box key={entry.id} flexDirection="column" flexShrink={0}>
              <Clickable
                id={`${panelId}-${entry.id}`}
                enabled={mouseEnabled}
                onClick={() => {
                  onFocus();
                  setSelectedId(entry.id);
                  setExpandedId(expandedId === entry.id ? undefined : entry.id);
                }}
              >
                <Text color={color} bold={chosen && isFocused}>
                  {preview(
                    `${chosen && isFocused ? ">" : " "}${STATUS_ICONS[entry.status]} ${t(`subagents.${entry.status}`)} · ${entry.agent}`,
                    width
                  )}
                </Text>
              </Clickable>
              <Text dimColor wrap="truncate-end">
                {preview(`  ${activity}`, width)}
              </Text>
            </Box>
          );
        })}
      {expanded && selected && (
        <Box flexDirection="column" flexShrink={0}>
          <Text wrap="truncate-end">{preview(selected.task, width)}</Text>
          <Text dimColor wrap="truncate-end">
            {preview(
              `${t("subagents.turns", { count: selected.iterations ?? "?" })} · ${t("subagents.tokens", { count: selected.tokensUsed ?? "?" })}`,
              width
            )}
          </Text>
          <Text dimColor wrap="truncate-end">
            {preview(
              selected.model ? `${selected.providerType ?? ""}/${selected.model}` : selected.id,
              width
            )}
          </Text>
        </Box>
      )}
      {maxHeight > 3 && entries.length > 0 && (
        <Text dimColor wrap="truncate-end">
          {preview(
            `${offset + 1}-${Math.min(offset + visibleCount, sorted.length)}/${sorted.length} · ${t(isFocused ? "subagents.keys" : "subagents.focus")}`,
            width
          )}
        </Text>
      )}
    </Box>
  );
}

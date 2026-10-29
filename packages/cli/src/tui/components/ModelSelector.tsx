/**
 * ModelSelector Component (Chain 22)
 *
 * TUI component for selecting AI models with keyboard navigation.
 * Similar to ModeSelector but for model selection.
 *
 * @module tui/components/ModelSelector
 */

import { getProviderModels, getSupportedProviders, type ModelInfo } from "@vellum/provider";
import { getIcons } from "@vellum/shared";
import { Box, type DOMElement, Text, useStdin } from "ink";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getThinkingDisplayMode,
  getThinkingState,
  setDisplayMode,
  subscribeToDisplayMode,
  subscribeToThinkingState,
  type ThinkingDisplayMode,
  toggleThinking,
} from "../../commands/think.js";
import { useMouseInteractionEnabled } from "../context/MouseContext.js";
import { useMouseScroll } from "../hooks/useMouseScroll.js";
import { useInput } from "../hooks/useTerminalInput.js";
import { useTerminalDimensions } from "../hooks/useTerminalSize.js";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";
import { isEndKey, isHomeKey } from "../types/ink-extended.js";
import { getCurrentTerminalKey } from "../utils/terminal-input.js";
import { Clickable, getVisibleClickBounds } from "./common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ModelSelector component.
 */
export interface ModelSelectorProps {
  /** Currently selected model ID */
  readonly currentModel: string;
  /** Currently selected provider */
  readonly currentProvider: string;
  /** Callback when a model is selected */
  readonly onSelect: (provider: string, model: string) => void;
  /** Whether the selector is focused/active */
  readonly isActive?: boolean;
  /** Whether to show model details (context window, pricing) */
  readonly showDetails?: boolean;
  /** Filter to specific providers (optional) */
  readonly providers?: readonly string[];
  /** Callback when thinking mode is toggled (optional) */
  readonly onThinkingToggle?: (enabled: boolean) => void;
}

/**
 * Internal type for flattened model list with provider info.
 */
interface ModelOption {
  provider: string;
  model: ModelInfo;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Provider display names and icons.
 */
const PROVIDER_INFO: Record<string, { name: string; icon: string }> = {
  anthropic: { name: "Anthropic", icon: "[A]" },
  openai: { name: "OpenAI", icon: "[O]" },
  google: { name: "Google", icon: "[G]" },
  copilot: { name: "GitHub Copilot", icon: "[C]" },
  deepseek: { name: "DeepSeek", icon: "[D]" },
  groq: { name: "Groq", icon: "[Q]" },
  xai: { name: "xAI", icon: "[X]" },
  qwen: { name: "Qwen", icon: "[W]" },
  ollama: { name: "Ollama", icon: "[L]" },
  lmstudio: { name: "LM Studio", icon: "[S]" },
  mistral: { name: "Mistral", icon: "[M]" },
  openrouter: { name: "OpenRouter", icon: "[R]" },
  moonshot: { name: "Moonshot", icon: "[O]" },
  zhipu: { name: "智谱 AI", icon: "[Z]" },
  yi: { name: "零一万物", icon: "[Y]" },
  baichuan: { name: "百川", icon: "[B]" },
  doubao: { name: "豆包", icon: "[D]" },
  minimax: { name: "MiniMax", icon: "[N]" },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format context window size for display.
 */
function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return `${tokens}`;
}

/**
 * Format price for display.
 */
function formatPrice(pricePer1M: number | undefined): string {
  if (pricePer1M === undefined) return "Unknown";
  if (pricePer1M === 0) {
    return "Free";
  }
  return `$${pricePer1M.toFixed(2)}/M`;
}

/**
 * Get provider info with fallback.
 */
function getProviderInfo(provider: string): { name: string; icon: string } {
  return (
    PROVIDER_INFO[provider.toLowerCase()] ?? {
      name: provider,
      icon: "📦",
    }
  );
}

// =============================================================================
// ModelSelector Component
// =============================================================================

/**
 * ModelSelector - Interactive component for selecting AI models.
 *
 * Features:
 * - Arrow key navigation (up/down or j/k)
 * - Enter to confirm selection
 * - Visual indication of current model
 * - Shows model details (context window, pricing)
 * - Scrolls a bounded window in provider order
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [provider, setProvider] = useState('anthropic');
 *   const [model, setModel] = useState('claude-sonnet-4-6');
 *
 *   return (
 *     <ModelSelector
 *       currentProvider={provider}
 *       currentModel={model}
 *       onSelect={(p, m) => {
 *         setProvider(p);
 *         setModel(m);
 *       }}
 *       isActive
 *     />
 *   );
 * }
 * ```
 */
export function ModelSelector({
  currentModel,
  currentProvider,
  onSelect,
  isActive = true,
  showDetails = true,
  providers,
  onThinkingToggle,
}: ModelSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const icons = getIcons();
  const { width, height, isNarrow } = useTerminalDimensions();
  const { stdin } = useStdin();
  const selectorId = useId();
  const modelListRef = useRef<DOMElement>(null);
  const mouseInteractionEnabled = useMouseInteractionEnabled();

  // Thinking state management
  const [thinkingEnabled, setThinkingEnabled] = useState(() => getThinkingState().enabled);
  const [displayMode, setLocalDisplayMode] = useState<ThinkingDisplayMode>(() =>
    getThinkingDisplayMode()
  );

  // Subscribe to thinking state changes
  useEffect(() => {
    const unsubscribe = subscribeToThinkingState((state) => {
      setThinkingEnabled(state.enabled);
    });
    return unsubscribe;
  }, []);

  // Subscribe to display mode changes
  useEffect(() => {
    const unsubscribe = subscribeToDisplayMode((mode) => {
      setLocalDisplayMode(mode);
    });
    return unsubscribe;
  }, []);

  // Handle thinking toggle
  const handleThinkingToggle = useCallback(() => {
    const newState = toggleThinking();
    onThinkingToggle?.(newState);
  }, [onThinkingToggle]);

  // Handle display mode toggle
  const handleDisplayModeToggle = useCallback(() => {
    const newMode: ThinkingDisplayMode = displayMode === "full" ? "compact" : "full";
    setDisplayMode(newMode);
  }, [displayMode]);

  // Build flattened list of model options
  const modelOptions = useMemo<ModelOption[]>(() => {
    const providerList = providers ?? getSupportedProviders();
    const options: ModelOption[] = [];

    for (const provider of providerList) {
      const models = getProviderModels(provider);
      for (const model of models) {
        options.push({ provider, model });
      }
    }

    return options;
  }, [providers]);

  // Find current index
  const currentIndex = useMemo(() => {
    return modelOptions.findIndex(
      (opt) => opt.provider === currentProvider && opt.model.id === currentModel
    );
  }, [modelOptions, currentProvider, currentModel]);

  // Track focused index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(currentIndex, 0));
  const focusedIndexRef = useRef(focusedIndex);
  const focusModel = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(index, modelOptions.length - 1));
      focusedIndexRef.current = next;
      setFocusedIndex(next);
    },
    [modelOptions.length]
  );
  useEffect(() => {
    focusModel(Math.max(currentIndex, 0));
  }, [currentIndex, focusModel]);

  // Reserve the existing overlay's top margin, border and wide-screen padding.
  // Every model occupies one row, so catalog growth cannot grow the overlay.
  const viewportHeight = Math.max(7, height - (isNarrow ? 6 : 10));
  const viewportWidth = Math.max(20, width - (isNarrow ? 4 : 24));
  const visibleCount = Math.min(
    modelOptions.length || 1,
    Math.max(1, viewportHeight - 5 - (showDetails ? 1 : 0))
  );
  const startIndex = Math.max(
    0,
    Math.min(focusedIndex - Math.floor(visibleCount / 2), modelOptions.length - visibleCount)
  );
  const visibleModels = modelOptions.slice(startIndex, startIndex + visibleCount);
  const focusedModel = modelOptions[focusedIndex];

  const getModelListBounds = useCallback(() => {
    const bounds = getVisibleClickBounds(modelListRef.current);
    return bounds ? { ...bounds, top: bounds.top - 1, left: bounds.left - 1 } : null;
  }, []);
  useMouseScroll({
    enabled: isActive && mouseInteractionEnabled && modelOptions.length > 0,
    scrollSpeed: 1,
    bounds: getModelListBounds,
    onScroll: useCallback(
      (delta: number) => focusModel(focusedIndexRef.current + delta),
      [focusModel]
    ),
  });

  // Handle keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        if (!isActive || modelOptions.length === 0) return;

        // Toggle thinking with 't' or 'T'
        if (input === "t" || input === "T") {
          handleThinkingToggle();
          return;
        }

        // Toggle display mode with 'd' or 'D'
        if (input === "d" || input === "D") {
          handleDisplayModeToggle();
          return;
        }

        // Arrow navigation
        if (key.upArrow || input === "k") {
          const index = focusedIndexRef.current;
          focusModel(index > 0 ? index - 1 : modelOptions.length - 1);
          return;
        }

        if (key.downArrow || input === "j") {
          const index = focusedIndexRef.current;
          focusModel(index < modelOptions.length - 1 ? index + 1 : 0);
          return;
        }

        if (key.pageUp || key.pageDown) {
          focusModel(focusedIndexRef.current + (key.pageDown ? visibleCount : -visibleCount));
          return;
        }
        const raw = getCurrentTerminalKey(stdin) ?? input;
        if (isHomeKey(raw) || input === "g") {
          focusModel(0);
          return;
        }
        if (isEndKey(raw) || input === "G") {
          focusModel(modelOptions.length - 1);
          return;
        }

        // Confirm selection
        if (key.return) {
          const selected = modelOptions[focusedIndexRef.current];
          if (selected) {
            onSelect(selected.provider, selected.model.id);
          }
        }
      },
      [
        isActive,
        focusModel,
        visibleCount,
        stdin,
        modelOptions,
        onSelect,
        handleThinkingToggle,
        handleDisplayModeToggle,
      ]
    ),
    { isActive }
  );

  return (
    <Box flexDirection="column" paddingX={1} width={viewportWidth} maxHeight={viewportHeight}>
      <Text bold wrap="truncate">
        {t("modelSelector.title")} {modelOptions.length ? focusedIndex + 1 : 0}/
        {modelOptions.length}
      </Text>
      <Text dimColor wrap="truncate">
        {t("modelSelector.current")}
        {getProviderInfo(currentProvider).name} /{" "}
        {modelOptions[currentIndex]?.model.name ?? currentModel}
      </Text>
      <Box marginBottom={1}>
        <Clickable
          id={`${selectorId}-thinking`}
          onClick={handleThinkingToggle}
          enabled={isActive}
          width="auto"
        >
          <Text wrap="truncate">
            Thinking:{" "}
            <Text color={thinkingEnabled ? "green" : "gray"}>
              {thinkingEnabled ? "◆ On" : "◇ Off"}
            </Text>{" "}
            [T]
          </Text>
        </Clickable>
        {thinkingEnabled && (
          <>
            <Text>{"  "}</Text>
            <Clickable
              id={`${selectorId}-display`}
              onClick={handleDisplayModeToggle}
              enabled={isActive}
              width="auto"
            >
              <Text wrap="truncate">{`Display: ${displayMode === "full" ? "Full" : "Compact"} [D]`}</Text>
            </Clickable>
          </>
        )}
      </Box>
      <Box ref={modelListRef} flexDirection="column" height={visibleCount} flexShrink={0}>
        {visibleModels.map((option, offset) => {
          const selected = startIndex + offset === focusedIndex;
          const current = option.provider === currentProvider && option.model.id === currentModel;
          return (
            <Clickable
              key={`${option.provider}/${option.model.id}`}
              id={`${selectorId}-${option.provider}/${option.model.id}`}
              enabled={isActive}
              onClick={() => {
                focusModel(startIndex + offset);
                onSelect(option.provider, option.model.id);
              }}
            >
              <Text
                wrap="truncate"
                color={
                  selected && isActive
                    ? theme.colors.info
                    : current
                      ? theme.colors.success
                      : undefined
                }
                bold={current}
              >
                {selected && isActive ? "❯ " : "  "}
                {current ? "✓ " : "  "}
                {getProviderInfo(option.provider).name}: {option.model.name}
              </Text>
            </Clickable>
          );
        })}
        {modelOptions.length === 0 && <Text dimColor>No models available</Text>}
      </Box>
      {showDetails && (
        <Text dimColor wrap="truncate">
          {focusedModel
            ? `${icons.context} ${formatContextWindow(focusedModel.model.contextWindow)} ctx • ${formatPrice(focusedModel.model.inputPrice)} in • ${formatPrice(focusedModel.model.outputPrice)} out`
            : " "}
        </Text>
      )}
      <Text dimColor wrap="truncate">
        {t("modelSelector.keybindings")} • PgUp/PgDn • Home/End
      </Text>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default ModelSelector;

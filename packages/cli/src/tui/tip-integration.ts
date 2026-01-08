/**
 * Tip Engine Integration
 *
 * Wires the TipEngine to the TUI application for contextual tips
 * and progressive disclosure of features.
 *
 * @module cli/tui/tip-integration
 */

import { useCallback, useMemo, useState } from "react";
import type { Tip, TipContext, TipState } from "../onboarding/index.js";
import { BUILTIN_TIPS, createTipEngine, TipEngine } from "../onboarding/index.js";

// =============================================================================
// Types
// =============================================================================

export interface TipIntegrationOptions {
  /** Enable tips display */
  enabled?: boolean;
  /** Maximum tips to show per session */
  maxTipsPerSession?: number;
  /** Minimum interval between tips (ms) */
  tipIntervalMs?: number;
  /** Categories to prioritize */
  priorityCategories?: string[];
  /** Callback when a tip is shown */
  onTipShown?: (tip: Tip) => void;
  /** Callback when a tip is dismissed */
  onTipDismissed?: (tipId: string) => void;
}

export interface TipIntegrationState {
  /** Current tip to display (null if none) */
  currentTip: Tip | null;
  /** Whether tips are enabled */
  tipsEnabled: boolean;
  /** Number of tips shown this session */
  tipsShownCount: number;
  /** Whether a tip is currently visible */
  tipVisible: boolean;
}

export interface TipIntegrationActions {
  /** Show a contextual tip based on current context */
  showTip: (context: TipContext) => Tip | null;
  /** Dismiss the current tip */
  dismissTip: () => void;
  /** Permanently dismiss a tip (won't show again) */
  dismissTipPermanently: (tipId: string) => void;
  /** Enable or disable tips */
  setTipsEnabled: (enabled: boolean) => void;
  /** Get a specific tip by ID */
  getTip: (tipId: string) => Tip | undefined;
  /** Check if a tip has been shown */
  hasTipBeenShown: (tipId: string) => boolean;
  /** Reset tip states (for testing) */
  resetTips: () => void;
}

export type UseTipEngineResult = TipIntegrationState & TipIntegrationActions;

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_OPTIONS: Required<TipIntegrationOptions> = {
  enabled: true,
  maxTipsPerSession: 10,
  tipIntervalMs: 60000, // 1 minute between tips
  priorityCategories: ["shortcuts", "features"],
  onTipShown: () => {},
  onTipDismissed: () => {},
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for tip engine integration.
 *
 * @param options - Tip integration options
 * @returns Tip integration state and actions
 *
 * @example
 * ```tsx
 * function AppContent() {
 *   const {
 *     currentTip,
 *     showTip,
 *     dismissTip,
 *     tipsEnabled,
 *   } = useTipEngine({ enabled: true });
 *
 *   // Show contextual tips based on user actions
 *   useEffect(() => {
 *     showTip({
 *       currentScreen: "main",
 *       featureUsageCount: 5,
 *       recentCommands: ["help", "mode"],
 *     });
 *   }, [showTip]);
 *
 *   return (
 *     <>
 *       {currentTip && (
 *         <TipBanner tip={currentTip} onDismiss={dismissTip} />
 *       )}
 *       <MainContent />
 *     </>
 *   );
 * }
 * ```
 */
export function useTipEngine(options: TipIntegrationOptions = {}): UseTipEngineResult {
  // Memoize config to prevent re-renders from changing object reference
  // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally use specific properties to prevent re-renders when only callbacks change
  const config = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options.enabled, options.maxTipsPerSession, options.tipIntervalMs]
  );
  const { onTipShown, onTipDismissed } = options;

  // Create tip engine instance
  const tipEngine = useMemo(() => createTipEngine(), []);

  // State
  const [currentTip, setCurrentTip] = useState<Tip | null>(null);
  const [tipsEnabled, setTipsEnabled] = useState(config.enabled);
  const [tipsShownCount, setTipsShownCount] = useState(0);
  const [tipVisible, setTipVisible] = useState(false);
  const [lastTipTime, setLastTipTime] = useState(0);
  const [permanentlyDismissed, setPermanentlyDismissed] = useState<Set<string>>(new Set());

  // Show a tip based on context
  const showTip = useCallback(
    (context: TipContext): Tip | null => {
      if (!tipsEnabled) return null;
      if (tipsShownCount >= config.maxTipsPerSession) return null;

      // Check tip interval
      const now = Date.now();
      if (now - lastTipTime < config.tipIntervalMs) return null;

      // Get a matching tip
      const tip = tipEngine.getTip(context);

      if (tip && !permanentlyDismissed.has(tip.id)) {
        setCurrentTip(tip);
        setTipVisible(true);
        setTipsShownCount((prev) => prev + 1);
        setLastTipTime(now);
        onTipShown?.(tip);
        return tip;
      }

      return null;
    },
    [
      tipsEnabled,
      tipsShownCount,
      lastTipTime,
      tipEngine,
      permanentlyDismissed,
      config.maxTipsPerSession,
      config.tipIntervalMs,
      onTipShown,
    ]
  );

  // Dismiss current tip
  const dismissTip = useCallback(() => {
    if (currentTip) {
      onTipDismissed?.(currentTip.id);
    }
    setCurrentTip(null);
    setTipVisible(false);
  }, [currentTip, onTipDismissed]);

  // Permanently dismiss a tip
  const dismissTipPermanently = useCallback(
    (tipId: string) => {
      setPermanentlyDismissed((prev) => new Set([...prev, tipId]));
      tipEngine.dismissTip(tipId);
      if (currentTip?.id === tipId) {
        dismissTip();
      }
    },
    [tipEngine, currentTip, dismissTip]
  );

  // Get a specific tip
  const getTip = useCallback(
    (tipId: string): Tip | undefined => {
      return tipEngine.getAllTips().find((t) => t.id === tipId);
    },
    [tipEngine]
  );

  // Check if a tip has been shown
  const hasTipBeenShown = useCallback(
    (tipId: string): boolean => {
      const state = tipEngine.getTipState(tipId);
      return state?.showCount !== undefined && state.showCount > 0;
    },
    [tipEngine]
  );

  // Reset tips (for testing)
  const resetTips = useCallback(() => {
    tipEngine.resetAllStates();
    setCurrentTip(null);
    setTipVisible(false);
    setTipsShownCount(0);
    setPermanentlyDismissed(new Set());
  }, [tipEngine]);

  return {
    // State
    currentTip,
    tipsEnabled,
    tipsShownCount,
    tipVisible,
    // Actions
    showTip,
    dismissTip,
    dismissTipPermanently,
    setTipsEnabled,
    getTip,
    hasTipBeenShown,
    resetTips,
  };
}

// =============================================================================
// Context Builders
// =============================================================================

/**
 * Build a tip context from application state.
 *
 * @param options - Context building options
 * @returns TipContext for tip matching
 *
 * @example
 * ```typescript
 * const context = buildTipContext({
 *   screen: "main",
 *   mode: "vibe",
 *   command: "/help",
 *   featuresUsedCount: 10,
 * });
 * const tip = tipEngine.getTip(context);
 * ```
 */
export function buildTipContext(options: {
  screen?: string;
  mode?: string;
  command?: string;
  featuresUsedCount?: number;
  sessionDuration?: number;
  hasError?: boolean;
  experienceLevel?: "new" | "beginner" | "intermediate" | "advanced";
  custom?: Record<string, unknown>;
}): TipContext {
  return {
    screen: options.screen ?? "main",
    mode: options.mode,
    command: options.command,
    featuresUsedCount: options.featuresUsedCount ?? 0,
    sessionDuration: options.sessionDuration,
    hasError: options.hasError,
    experienceLevel: options.experienceLevel ?? "new",
    custom: options.custom,
  };
}

/**
 * Get tips relevant to a specific feature or command.
 *
 * @param tipEngine - TipEngine instance
 * @param feature - Feature or command name
 * @returns Relevant tips
 */
export function getTipsForFeature(tipEngine: TipEngine, feature: string): Tip[] {
  const allTips = tipEngine.getAllTips();
  return allTips.filter(
    (tip) =>
      tip.trigger.commands?.includes(feature) ||
      tip.relatedLessonId === feature ||
      tip.content.toLowerCase().includes(feature.toLowerCase())
  );
}

// =============================================================================
// Exports
// =============================================================================

export { BUILTIN_TIPS, createTipEngine, TipEngine, type Tip, type TipContext, type TipState };

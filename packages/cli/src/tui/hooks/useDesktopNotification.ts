/**
 * useDesktopNotification Hook (T059)
 *
 * React hook for sending desktop notifications from the TUI.
 * Detects node-notifier availability and provides graceful fallback.
 *
 * @module @vellum/cli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Notification priority levels.
 */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * Notification type categorization.
 */
export type NotificationType =
  | "task-complete"
  | "permission-request"
  | "error"
  | "warning"
  | "info";

/**
 * Options for a notification.
 */
export interface NotificationOptions {
  /** Title of the notification */
  readonly title: string;
  /** Body message */
  readonly message: string;
  /** Optional subtitle (macOS) */
  readonly subtitle?: string;
  /** Notification type for categorization */
  readonly type?: NotificationType;
  /** Priority level */
  readonly priority?: NotificationPriority;
  /** Whether the notification should make a sound */
  readonly sound?: boolean;
  /** Time in ms after which to auto-dismiss (0 = no auto-dismiss) */
  readonly timeout?: number;
  /** Optional icon path */
  readonly icon?: string;
  /** Optional click action callback */
  readonly onClick?: () => void;
  /** Optional close action callback */
  readonly onClose?: () => void;
}

/**
 * Configuration for the notification hook.
 */
export interface UseDesktopNotificationOptions {
  /** Whether notifications are enabled (default: true) */
  readonly enabled?: boolean;
  /** Default sound setting (default: true) */
  readonly defaultSound?: boolean;
  /** Minimum time between notifications in ms (default: 1000) */
  readonly throttleMs?: number;
  /** Application name for notifications */
  readonly appName?: string;
  /** Whether to show notifications only when terminal is not focused */
  readonly onlyWhenUnfocused?: boolean;
}

/**
 * Return value of useDesktopNotification hook.
 */
export interface UseDesktopNotificationReturn {
  /** Whether notifications are available (node-notifier detected) */
  readonly isAvailable: boolean;
  /** Whether notifications are currently enabled */
  readonly isEnabled: boolean;
  /** Send a notification */
  readonly notify: (options: NotificationOptions) => void;
  /** Notify when a long task completes */
  readonly notifyTaskComplete: (taskName: string, duration?: number) => void;
  /** Notify for a permission request */
  readonly notifyPermissionRequest: (permission: string) => void;
  /** Notify for an error */
  readonly notifyError: (message: string) => void;
  /** Toggle notifications on/off */
  readonly toggle: () => void;
  /** Enable notifications */
  readonly enable: () => void;
  /** Disable notifications */
  readonly disable: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default throttle time between notifications */
const DEFAULT_THROTTLE_MS = 1000;

/** Default app name */
const DEFAULT_APP_NAME = "Vellum";

/** Icons for different notification types */
const TYPE_ICONS: Record<NotificationType, string> = {
  "task-complete": "✅",
  "permission-request": "🔐",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

// =============================================================================
// Node-Notifier Detection & Wrapper
// =============================================================================

/**
 * Lazy-loaded notifier module.
 */
let notifierModule: NotifierModule | null = null;
let notifierChecked = false;

interface NotifierModule {
  notify(
    options: {
      title?: string;
      message?: string;
      subtitle?: string;
      sound?: boolean;
      icon?: string;
      timeout?: number;
      appID?: string;
    },
    callback?: (err: Error | null, response: string) => void
  ): void;
}

/**
 * Attempt to load node-notifier dynamically.
 */
async function loadNotifier(): Promise<NotifierModule | null> {
  if (notifierChecked) {
    return notifierModule;
  }

  notifierChecked = true;

  try {
    // Dynamic import to avoid hard dependency
    // Using a variable to prevent TypeScript from resolving the module at compile time
    const moduleName = "node-notifier";
    const module = await import(moduleName);
    notifierModule = module.default ?? module;
    return notifierModule;
  } catch {
    // node-notifier not available - that's fine
    return null;
  }
}

/**
 * Check if we're running in a focused terminal.
 * This is a heuristic check - not 100% reliable.
 */
function isTerminalFocused(): boolean {
  // Check if running interactively
  if (!process.stdin.isTTY) {
    return false;
  }

  // In most cases, if we're running in a TTY and stdout is a TTY,
  // the terminal is likely focused. This is imperfect but reasonable.
  return process.stdout.isTTY ?? false;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for sending desktop notifications.
 *
 * Automatically detects if node-notifier is available and provides
 * a graceful fallback when it's not. Useful for notifying users
 * when long-running tasks complete or when permission is needed.
 *
 * @example
 * ```tsx
 * function LongTaskRunner() {
 *   const { notify, notifyTaskComplete, isAvailable } = useDesktopNotification({
 *     appName: 'Vellum',
 *   });
 *
 *   const runTask = async () => {
 *     const start = Date.now();
 *     await performLongTask();
 *     notifyTaskComplete('Build', Date.now() - start);
 *   };
 *
 *   return (
 *     <Box>
 *       <Text>Notifications: {isAvailable ? 'Available' : 'Not available'}</Text>
 *     </Box>
 *   );
 * }
 * ```
 */
export function useDesktopNotification(
  options: UseDesktopNotificationOptions = {}
): UseDesktopNotificationReturn {
  const {
    enabled: initialEnabled = true,
    defaultSound = true,
    throttleMs = DEFAULT_THROTTLE_MS,
    appName = DEFAULT_APP_NAME,
    onlyWhenUnfocused = true,
  } = options;

  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const lastNotificationTime = useRef(0);
  const notifierRef = useRef<NotifierModule | null>(null);

  // Load notifier on mount
  useEffect(() => {
    let mounted = true;

    loadNotifier().then((notifier) => {
      if (mounted && notifier) {
        notifierRef.current = notifier;
        setIsAvailable(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Core notification function
  const notify = useCallback(
    (notifOptions: NotificationOptions) => {
      // Check if we should notify
      if (!isEnabled || !isAvailable || !notifierRef.current) {
        return;
      }

      // Check focus state
      if (onlyWhenUnfocused && isTerminalFocused()) {
        return;
      }

      // Throttle notifications
      const now = Date.now();
      if (now - lastNotificationTime.current < throttleMs) {
        return;
      }
      lastNotificationTime.current = now;

      const {
        title,
        message,
        subtitle,
        type,
        sound = defaultSound,
        timeout,
        icon,
        onClick,
        onClose,
      } = notifOptions;

      // Build notification title with type icon
      const typeIcon = type ? TYPE_ICONS[type] : "";
      const fullTitle = typeIcon ? `${typeIcon} ${title}` : title;

      // Send notification
      notifierRef.current.notify(
        {
          title: fullTitle,
          message,
          subtitle,
          sound,
          icon,
          timeout,
          appID: appName,
        },
        (err, response) => {
          if (err) {
            // Silently handle errors - notifications are non-critical
            return;
          }

          // Handle click/close callbacks based on response
          if (response === "activate" || response === "clicked") {
            onClick?.();
          } else if (response === "dismissed" || response === "timeout") {
            onClose?.();
          }
        }
      );
    },
    [isEnabled, isAvailable, onlyWhenUnfocused, throttleMs, defaultSound, appName]
  );

  // Convenience: Notify task completion
  const notifyTaskComplete = useCallback(
    (taskName: string, duration?: number) => {
      const durationText = duration ? ` (${formatDuration(duration)})` : "";
      notify({
        title: "Task Complete",
        message: `${taskName} finished${durationText}`,
        type: "task-complete",
        priority: "normal",
      });
    },
    [notify]
  );

  // Convenience: Notify permission request
  const notifyPermissionRequest = useCallback(
    (permission: string) => {
      notify({
        title: "Permission Required",
        message: `${permission} - please review and approve`,
        type: "permission-request",
        priority: "high",
        sound: true,
      });
    },
    [notify]
  );

  // Convenience: Notify error
  const notifyError = useCallback(
    (message: string) => {
      notify({
        title: "Error",
        message,
        type: "error",
        priority: "urgent",
        sound: true,
      });
    },
    [notify]
  );

  // Toggle/enable/disable
  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const enable = useCallback(() => {
    setIsEnabled(true);
  }, []);

  const disable = useCallback(() => {
    setIsEnabled(false);
  }, []);

  return useMemo(
    () => ({
      isAvailable,
      isEnabled,
      notify,
      notifyTaskComplete,
      notifyPermissionRequest,
      notifyError,
      toggle,
      enable,
      disable,
    }),
    [
      isAvailable,
      isEnabled,
      notify,
      notifyTaskComplete,
      notifyPermissionRequest,
      notifyError,
      toggle,
      enable,
      disable,
    ]
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

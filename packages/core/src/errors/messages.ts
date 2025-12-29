// ============================================
// Vellum Error Messages
// ============================================

/**
 * User plan types for quota messaging.
 */
export type UserPlan = "free" | "plus" | "pro" | "enterprise" | string;

/**
 * Options for formatting quota exceeded messages.
 */
export interface QuotaMessageOptions {
  /** User's current plan (defaults to 'unknown') */
  plan?: UserPlan;
  /** Time until retry is allowed in milliseconds */
  retryAfterMs?: number;
  /** URL for plan upgrade */
  upgradeUrl?: string;
}

/**
 * Formats a user-friendly quota exceeded message based on the user's plan.
 *
 * Provides plan-specific upgrade suggestions:
 * - Free plan → "Consider upgrading to Plus" (AC-011-1)
 * - Plus plan → "Upgrade to Pro" (AC-011-2)
 * - Pro/Enterprise → "Contact support" (AC-011-3)
 * - Unknown plan → Generic message (AC-011-4)
 *
 * @param options - Quota message configuration
 * @returns Formatted user-friendly message
 *
 * @example
 * ```typescript
 * formatQuotaMessage({ plan: 'free', retryAfterMs: 60000 });
 * // "API quota exceeded. Try again in 60 seconds. Consider upgrading to Plus for higher limits."
 *
 * formatQuotaMessage({ plan: 'plus', upgradeUrl: 'https://example.com/upgrade' });
 * // "API quota exceeded. Upgrade to Pro for even higher limits. https://example.com/upgrade"
 * ```
 */
export function formatQuotaMessage(options: QuotaMessageOptions = {}): string {
  const { plan = "unknown", retryAfterMs, upgradeUrl } = options;

  // Base message
  let message = "API quota exceeded.";

  // Add retry info if available
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    const seconds = Math.ceil(retryAfterMs / 1000);
    message += ` Try again in ${seconds} seconds.`;
  }

  // Add plan-specific suggestion
  const normalizedPlan = plan.toLowerCase();
  switch (normalizedPlan) {
    case "free":
      message += " Consider upgrading to Plus for higher limits."; // AC-011-1
      break;
    case "plus":
      message += " Upgrade to Pro for even higher limits."; // AC-011-2
      break;
    case "pro":
    case "enterprise":
      message += " Contact support for limit increases."; // AC-011-3
      break;
    default:
      message += " Check your plan limits."; // AC-011-4
  }

  // Add upgrade link if provided (only for free and plus plans)
  if (upgradeUrl && (normalizedPlan === "free" || normalizedPlan === "plus")) {
    message += ` ${upgradeUrl}`;
  }

  return message;
}

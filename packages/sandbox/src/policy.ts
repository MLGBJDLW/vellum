/**
 * Execution policy engine.
 *
 * Provides allow/prompt/forbidden decisions based on command patterns.
 */

import type { DangerousCommandDetector, DetectionResult } from "./detector.js";

export type PolicyDecision = "allow" | "prompt" | "forbidden";

export interface ExecPolicyRule {
  name: string;
  pattern: RegExp;
  decision: PolicyDecision;
  reason: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  matchedRule: ExecPolicyRule | null;
  reason: string;
  command: string;
}

export class ExecPolicyEngine {
  private readonly rules: ExecPolicyRule[];

  constructor(rules: ExecPolicyRule[]) {
    this.rules = rules;
  }

  evaluate(command: string): PolicyResult {
    for (const rule of this.rules) {
      if (rule.pattern.test(command)) {
        return {
          decision: rule.decision,
          matchedRule: rule,
          reason: rule.reason,
          command,
        };
      }
    }

    return {
      decision: "prompt",
      matchedRule: null,
      reason: "No policy rule matched",
      command,
    };
  }
}

/**
 * Combined security check: dangerous patterns first, then policy engine.
 */
export async function securityCheck(
  command: string,
  policyEngine: ExecPolicyEngine,
  detector: DangerousCommandDetector
): Promise<{
  allowed: boolean;
  policyResult: PolicyResult;
  detectionResult: DetectionResult;
  reason: string;
}> {
  const detection = detector.detect(command);
  if (detection.dangerous) {
    const critical = detection.matches.find((m) => m.pattern.severity === "critical");
    return {
      allowed: false,
      policyResult: {
        decision: "forbidden",
        matchedRule: null,
        reason: "",
        command,
      },
      detectionResult: detection,
      reason: critical ? `Blocked: ${critical.pattern.description}` : "Dangerous pattern detected",
    };
  }

  const policy = policyEngine.evaluate(command);
  return {
    allowed: policy.decision !== "forbidden",
    policyResult: policy,
    detectionResult: detection,
    reason: policy.reason,
  };
}

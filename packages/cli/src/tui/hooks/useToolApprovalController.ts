/**
 * useToolApprovalController
 *
 * Bridges ToolsContext pending approvals to an optional AgentLoop instance.
 *
 * - Source of truth for UI is ToolsContext.
 * - When a user approves/rejects, we update ToolsContext and (if provided)
 *   signal the AgentLoop to resume via grantPermission/denyPermission.
 */

import { useCallback, useMemo } from "react";
import type { RiskLevel } from "../components/Tools/PermissionDialog.js";
import { useTools } from "../context/ToolsContext.js";

export interface PermissionGate {
  grantPermission: () => void;
  denyPermission: () => void;
}

export interface UseToolApprovalControllerOptions {
  readonly agentLoop?: PermissionGate;
}

export interface ToolApprovalViewModel {
  readonly activeApproval: ReturnType<typeof useTools>["pendingApproval"][number] | null;
  readonly activeRiskLevel: RiskLevel;
  readonly approveActive: (mode?: "once" | "always") => void;
  readonly rejectActive: () => void;
}

function inferRiskLevel(toolName: string): RiskLevel {
  const normalized = toolName.toLowerCase();

  // Conservative defaults: most tool calls are medium risk.
  // Elevate for tools that can mutate the system or run commands.
  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("exec") ||
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("delete")
  ) {
    return "high";
  }

  return "medium";
}

export function useToolApprovalController(
  options: UseToolApprovalControllerOptions = {}
): ToolApprovalViewModel {
  const { agentLoop } = options;
  const { pendingApproval, respondToPermissionRequest } = useTools();

  const activeApproval = pendingApproval[0] ?? null;

  const activeRiskLevel = useMemo<RiskLevel>(() => {
    if (!activeApproval) return "medium";
    return inferRiskLevel(activeApproval.toolName);
  }, [activeApproval]);

  const approveActive = useCallback(
    (mode: "once" | "always" = "once") => {
      if (!activeApproval) return;

      // Resolve any core permission prompt associated with this execution.
      // (No-op if none is pending.)
      respondToPermissionRequest(activeApproval.id, mode);

      // If an AgentLoop is driving tool execution, resume it.
      // AgentLoop only supports a single pending permission at a time.
      agentLoop?.grantPermission();
    },
    [activeApproval, respondToPermissionRequest, agentLoop]
  );

  const rejectActive = useCallback(() => {
    if (!activeApproval) return;

    respondToPermissionRequest(activeApproval.id, "reject");
    agentLoop?.denyPermission();
  }, [activeApproval, respondToPermissionRequest, agentLoop]);

  return {
    activeApproval,
    activeRiskLevel,
    approveActive,
    rejectActive,
  };
}

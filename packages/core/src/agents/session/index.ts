// ============================================
// Session Module - Barrel Export
// ============================================

export {
  type ApprovalRoute,
  type ApprovalRouter,
  createApprovalRouter,
} from "./approval-routing.js";

export {
  type ContextIsolator,
  createContextIsolator,
  type IsolatedContext,
} from "./context-isolator.js";

export {
  createFilteredToolRegistry,
  type FilteredToolRegistry,
  WORKER_BLOCKED_TOOLS,
} from "./filtered-tool-registry.js";

export {
  createPermissionInheritance,
  type PermissionInheritance,
  type PermissionSet,
} from "./permission-inheritance.js";

export {
  createResourceQuotaManager,
  type QuotaStatus,
  type ResourceQuota,
  type ResourceQuotaManager,
  type ResourceUsage,
} from "./resource-quota.js";

export {
  createSubsessionManager,
  type Subsession,
  type SubsessionCreateConfig,
  type SubsessionManager,
  type SubsessionStatus,
} from "./subsession-manager.js";

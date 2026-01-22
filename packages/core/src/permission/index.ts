/**
 * Permission system module for Vellum
 * Handles tool permission policies and access control
 */

// ============================================
// Always Allow Manager
// ============================================
export {
  type AlwaysAllowEntry,
  AlwaysAllowManager,
  type AlwaysAllowManagerOptions,
} from "./always-allow.js";
// ============================================
// Permission Ask Service (REQ-009)
// ============================================
export {
  type AskContext,
  type AskResult,
  createPermissionAskService,
  DEFAULT_ASK_TIMEOUT_MS,
  type PermissionAskHandler,
  PermissionAskService,
  type PermissionAskServiceOptions,
} from "./ask-service.js";
// ============================================
// Auto-Approval Limits (REQ-012)
// ============================================
export {
  type AutoApprovalConfig,
  AutoApprovalLimitsHandler,
  type AutoApprovalLimitsHandlerOptions,
  type AutoApprovalResult,
  type AutoApprovalState,
  type AutoApprovalStats,
  createAutoApprovalLimitsHandler,
  DEFAULT_AUTO_APPROVAL_COST_LIMIT,
  DEFAULT_AUTO_APPROVAL_LIMIT,
  DEFAULT_AUTO_APPROVAL_REQUEST_LIMIT,
  type RecordApprovalOptions,
} from "./auto-approval.js";
// ============================================
// Permission Checker (REQ-014)
// ============================================
export {
  createDefaultPermissionChecker,
  DefaultPermissionChecker,
  type DefaultPermissionCheckerOptions,
  type PermissionResolutionResult,
} from "./checker.js";
// ============================================
// Command Safety Classifier
// ============================================
export {
  type ClassificationResult,
  CommandSafetyClassifier,
  DANGEROUS_PATTERNS,
  SAFE_PATTERNS,
  type SafetyLevel,
} from "./command-safety.js";
// ============================================
// Dangerous Operation Detector
// ============================================
export {
  type CommandCheckOptions,
  type DangerCheckResult,
  DangerousOperationDetector,
  type DangerSeverity,
  type FileCheckOptions,
  type OperationType,
} from "./danger-detector.js";
// ============================================
// Tool Permission Defaults
// ============================================
export { LSP_TOOL_PERMISSIONS } from "./defaults.js";
// ============================================
// Permission Event Bus (REQ-013)
// ============================================
export {
  createPermissionCheckEvent,
  createPermissionDeniedEvent,
  createPermissionEventBus,
  createPermissionGrantedEvent,
  createTrustChangedEvent,
  type PermissionCheckEvent,
  PermissionCheckEventSchema,
  type PermissionDeniedEvent,
  PermissionDeniedEventSchema,
  PermissionEventBus,
  type PermissionEventListener,
  type PermissionEventPayloads,
  type PermissionEventType,
  type PermissionGrantedEvent,
  PermissionGrantedEventSchema,
  type SubscribeOptions,
  type TrustChangedEvent,
  TrustChangedEventSchema,
} from "./event-bus.js";
// ============================================
// MCP Permission Bridge
// ============================================
export {
  getTrustLevelDescription,
  hasTrustEnabled,
  inferReadOperation,
  type McpTrustLevel,
  shouldBypassPermission,
} from "./mcp-permission-bridge.js";
// ============================================
// Protected Files Manager
// ============================================
export {
  DEFAULT_PROTECTED_PATTERNS,
  formatFileListWithProtection,
  formatFileWithProtection,
  PROTECTED_FILE_INDICATOR,
  ProtectedFilesManager,
} from "./protected-files.js";
// ============================================
// Session Permission Manager
// ============================================
export {
  type GrantOptions,
  type PermissionCheckResult,
  type PermissionKey,
  type SessionPermission,
  SessionPermissionManager,
  type SessionPermissionManagerOptions,
} from "./session-manager.js";
// ============================================
// Storage
// ============================================
export {
  createDefaultData,
  PermissionStorage,
  type PermissionStorageOptions,
  type StoredPermissionData,
  StoredPermissionDataSchema,
} from "./storage.js";
// ============================================
// Tool Group Permissions
// ============================================
export {
  findToolGroupForTool,
  getDefaultGroupsForMode,
  getToolsInPermissionGroup,
  isReadOnlyFilesystemTool,
  isToolAllowedByGroups,
  PERMISSION_TOOL_GROUP_NAMES,
  PERMISSION_TOOL_GROUPS,
  type PermissionToolGroupConfig,
  PermissionToolGroupConfigSchema,
  type PermissionToolGroupName,
  PermissionToolGroupNameSchema,
  PLAN_MODE_GROUPS,
  READ_ONLY_FILESYSTEM_TOOLS,
  SPEC_MODE_GROUPS,
  type ToolGroupCheckResult,
  type ToolGroupDefinition,
  VIBE_MODE_GROUPS,
} from "./tool-groups.js";
// ============================================
// Trust Preset Manager
// ============================================
export {
  createTrustPresetManager,
  createTrustPresetManager as createTrustManager,
  TRUST_ENV_VAR,
  TrustPresetManager,
  // Backward compatibility aliases (deprecated)
  TrustPresetManager as TrustManager,
  type TrustPresetManagerOptions,
  type TrustPresetManagerOptions as TrustManagerOptions,
  type TrustResult,
  type TrustSource,
  type YoloConfirmResult,
} from "./trust-manager.js";
// ============================================
// Trusted Folders Manager
// ============================================
export { TrustedFoldersManager } from "./trusted-folders.js";
// ============================================
// Types & Schemas
// ============================================
export {
  createPermissionInfo,
  isAllowed,
  isDenied,
  type PatternPermission,
  // Pattern Permission
  PatternPermissionSchema,
  PERMISSION_LEVELS,
  PERMISSION_RESPONSES,
  type PermissionConfig,
  // Permission Config
  PermissionConfigSchema,
  type PermissionDecisionResult,
  // Permission Decision Result
  PermissionDecisionResultSchema,
  type PermissionInfo,
  // Permission Info
  PermissionInfoSchema,
  type PermissionLevel,
  // Permission Level
  PermissionLevelSchema,
  type PermissionRecord,
  // Permission Record
  PermissionRecordSchema,
  type PermissionResponse,
  // Permission Response
  PermissionResponseSchema,
  requiresConfirmation,
  // Helper Functions
  resolvePermissionConfig,
  TRUST_MODE_INFO,
  TRUST_PRESET_CONFIGS,
  TRUST_PRESETS,
  type TrustModeInfo,
  type TrustPreset,
  // Trust Presets
  TrustPresetSchema,
} from "./types.js";
// ============================================
// Wildcard Pattern Matching
// ============================================
export { Wildcard } from "./wildcard.js";

// ============================================
// Protocol Module - Barrel Export
// ============================================

export {
  // Delegation target types
  type BuiltinTarget,
  // Inferred types
  type BuiltinTargetInferred,
  // Delegation schemas
  BuiltinTargetSchema,
  type CustomAgentTarget,
  type CustomAgentTargetInferred,
  CustomAgentTargetSchema,
  type CustomModeTarget,
  type CustomModeTargetInferred,
  CustomModeTargetSchema,
  type DelegationTarget,
  type DelegationTargetInferred,
  DelegationTargetSchema,
  // Type guards
  isBuiltinTarget,
  isCustomAgentTarget,
  isCustomModeTarget,
  isMcpTarget,
  type McpTarget,
  type McpTargetInferred,
  McpTargetSchema,
} from "./delegation.js";

export {
  // Handoff factory function
  createHandoff,
  // Handoff types
  type HandoffRequest,
  // Handoff inferred types
  type HandoffRequestInferred,
  // Handoff schemas
  HandoffRequestSchema,
  type HandoffResult,
  type HandoffResultInferred,
  HandoffResultSchema,
} from "./handoff.js";

export {
  type CreateTaskPacketOptions,
  // Factory function
  createTaskPacket,
  type TaskConstraints,
  type TaskConstraintsInferred,
  TaskConstraintsSchema,
  type TaskContext,
  type TaskContextInferred,
  TaskContextSchema,
  // TaskPacket types
  type TaskPacket,
  // TaskPacket inferred types
  type TaskPacketInferred,
  // TaskPacket schemas
  TaskPacketSchema,
} from "./task-packet.js";

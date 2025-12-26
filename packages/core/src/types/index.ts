/**
 * Core type definitions for @vellum/core
 *
 * This barrel file exports all core types.
 * Types will be added as the architecture is implemented.
 */

export {
  createMessage,
  type FilePart,
  // File and Image Parts (T006)
  FilePartSchema,
  type ImagePart,
  ImagePartSchema,
  type Message,
  type MessageContent,
  // Message Content Union (T007)
  MessageContentSchema,
  // Message Schema (T008)
  MessageSchema,
  type PartBase,
  // Part Base
  PartBaseSchema,
  // T009: Parts Factory
  Parts,
  type ReasoningPart,
  ReasoningPartSchema,
  type Role,
  // Role
  RoleSchema,
  type TextPart,
  // Text and Tool Parts (T004)
  TextPartSchema,
  type ToolPart,
  ToolPartSchema,
  type ToolResultPart,
  // Tool Result and Reasoning Parts (T005)
  ToolResultPartSchema,
  type ToolState,
  ToolStateCompletedSchema,
  ToolStateErrorSchema,
  // Tool State (T003)
  ToolStatePendingSchema,
  ToolStateRunningSchema,
  ToolStateSchema,
  // T010: ToolStates Helper
  ToolStates,
} from "./message.js";
// T019-T024: Result Type and Utilities
export {
  all,
  type Err as ErrType,
  Err,
  // T022: flatMap
  flatMap,
  isErr,
  isOk,
  // T021: map utilities
  map,
  mapErr,
  // T023: match and all
  match,
  type Ok as OkType,
  Ok,
  // T019: Result type and constructors
  type Result,
  // T024: try-catch wrappers
  tryCatch,
  tryCatchAsync,
  // T020: unwrap utilities
  unwrap,
  unwrapOr,
} from "./result.js";
export {
  // T017: defineTool Factory
  type DefineToolConfig,
  defineTool,
  fail,
  ok,
  // T016: Tool Interface
  type Tool,
  // T014: Tool Context
  type ToolContext,
  // T013: Tool Definition
  type ToolDefinition,
  type ToolKind,
  // T012: Tool Kind
  ToolKindSchema,
  // T015: Tool Result and Helpers
  type ToolResult,
} from "./tool.js";

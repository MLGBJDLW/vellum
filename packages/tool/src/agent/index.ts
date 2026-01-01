// ============================================
// Agent Tools Module
// ============================================

/**
 * @module agent
 *
 * Tools for multi-agent orchestration including delegation and handoff.
 */

export {
  canDelegate,
  DEFAULT_DELEGATION_TIMEOUT,
  type DelegateTaskContext,
  type DelegateTaskParams,
  type DelegateTaskParamsInferred,
  DelegateTaskParamsSchema,
  type DelegateTaskResult,
  type DelegateTaskResultInferred,
  DelegateTaskResultSchema,
  type DelegationHandler,
  delegateTaskTool,
  executeDelegateTask,
  getDelegationHandler,
  setDelegationHandler,
  WorkerDelegationError,
} from "./delegate-task.js";

export {
  type NewTaskParams,
  type NewTaskParamsInferred,
  NewTaskParamsSchema,
  newTaskTool,
} from "./new-task.js";

export {
  canSwitchMode,
  executeSwitchMode,
  getModeSwitchHandler,
  type ModeChangeEvent,
  ModeNotFoundError,
  type ModeSwitchHandler,
  ModeSwitchNotAllowedError,
  type SwitchModeContext,
  type SwitchModeParams,
  type SwitchModeParamsInferred,
  SwitchModeParamsSchema,
  type SwitchModeResult,
  type SwitchModeResultInferred,
  SwitchModeResultSchema,
  setModeSwitchHandler,
  switchModeTool,
  validateModeExists,
} from "./switch-mode.js";

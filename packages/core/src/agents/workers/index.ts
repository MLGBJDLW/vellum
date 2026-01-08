// ============================================
// Workers Module
// ============================================
// REQ-027: Worker agent interfaces and implementations
// REQ-028: Worker factory for instantiation and management
// REQ-029: Builtin worker implementations
// REQ-030: Builtin worker registration

// ============================================
// Base Worker Types and Factory
// ============================================

export type {
  BaseWorker,
  BaseWorkerConfig,
  WorkerCapabilities,
  WorkerContext,
  WorkerResult,
} from "./base.js";

export { createBaseWorker } from "./base.js";

// ============================================
// Worker Factory
// ============================================

export type { WorkerFactory, WorkerMetadata } from "./factory.js";

export {
  createWorkerFactory,
  DuplicateWorkerError,
  UnknownWorkerError,
} from "./factory.js";

// ============================================
// Worker Executor
// ============================================

export type { WorkerExecutionConfig } from "./worker-executor.js";

export {
  executeWorkerTask,
  getWorkerPrompt,
  getWorkerToolSet,
  WORKER_PROMPTS,
  WORKER_TOOL_SETS,
} from "./worker-executor.js";

// ============================================
// Builtin Workers Registry
// ============================================

export {
  BUILTIN_WORKERS,
  getBuiltinWorkerCapabilities,
  registerBuiltinWorkers,
} from "./builtin/index.js";

// ============================================
// Builtin Worker Instances
// ============================================

export {
  analystWorker,
  architectWorker,
  coderWorker,
  devopsWorker,
  qaWorker,
  researcherWorker,
  securityWorker,
  writerWorker,
} from "./builtin/index.js";

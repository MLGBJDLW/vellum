import type { SandboxErrorCode } from "./sandbox-codes.js";

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: SandboxErrorCode, context?: Record<string, unknown>) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
    this.context = context;
  }
}

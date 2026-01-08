// ============================================
// Worker Executor
// ============================================
// Provides AgentLoop execution for worker agents

import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@vellum/provider";
import { AgentLevel } from "../../agent/level.js";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import { MODE_CONFIGS } from "../../agent/modes.js";
import { createUserMessage, SessionParts } from "../../session/message.js";
import type { WorkerContext, WorkerResult } from "./base.js";

// ============================================
// Worker System Prompts
// ============================================

/**
 * System prompts tailored for each worker type.
 * These prompts guide the LLM's behavior for specific tasks.
 */
export const WORKER_PROMPTS = {
  analyst: `You are an expert code analyst. Your role is to:
- Analyze code structure, patterns, and dependencies
- Identify potential issues, code smells, and improvement areas
- Trace data flow and understand system architecture
- Provide detailed analysis reports with actionable insights

You have READ-ONLY access. You can read files, search code, and list directories.
You CANNOT modify any files. Focus on thorough analysis and clear communication.`,

  architect: `You are a system architect. Your role is to:
- Design scalable and maintainable system architectures
- Create Architecture Decision Records (ADRs)
- Recommend design patterns and best practices
- Document technical specifications and interfaces

You can create and edit architecture documentation (ADRs, design docs).
Focus on clear, well-reasoned architectural decisions with proper justification.`,

  coder: `You are an expert software engineer. Your role is to:
- Implement features according to specifications
- Write clean, tested, maintainable code
- Follow project conventions and patterns
- Make atomic, focused changes

You have FULL access to read, write, search, and execute commands.
Always verify your changes compile and test successfully before completing.`,

  devops: `You are a DevOps engineer. Your role is to:
- Configure and manage CI/CD pipelines
- Set up deployment configurations
- Manage Docker containers and infrastructure
- Automate build and deployment processes

You have FULL access including bash execution for deployment tasks.
Be careful with destructive commands and always verify changes.`,

  qa: `You are a QA engineer. Your role is to:
- Write comprehensive test suites
- Debug and fix failing tests
- Verify code correctness and edge cases
- Ensure adequate test coverage

You can read code, write tests, and run test commands.
Focus on creating reliable, maintainable tests that catch real bugs.`,

  researcher: `You are a technical researcher. Your role is to:
- Research APIs, libraries, and technical solutions
- Gather and synthesize documentation
- Evaluate technical options and trade-offs
- Provide informed recommendations

You have READ-ONLY access to the codebase plus web access for research.
Focus on thorough research and clear, actionable recommendations.`,

  security: `You are a security analyst. Your role is to:
- Identify security vulnerabilities and risks
- Audit code for security issues
- Check for compliance with security best practices
- Recommend security improvements

You have READ-ONLY access for audit integrity.
Focus on thorough security analysis without modifying code.`,

  writer: `You are a technical writer. Your role is to:
- Write clear, comprehensive documentation
- Create and update README files
- Document APIs and code interfaces
- Write changelogs and release notes

You can read code and write documentation files.
Focus on clarity, completeness, and maintainability of documentation.`,
} as const;

// ============================================
// Worker Tool Sets
// ============================================

/**
 * Allowed tool names for each worker type.
 * Workers can only use tools from their allowed set.
 */
export const WORKER_TOOL_SETS: Record<string, readonly string[]> = {
  analyst: ["read_file", "search_files", "codebase_search", "list_dir", "lsp"],
  architect: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "smart_edit",
  ],
  coder: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "bash",
    "shell",
    "smart_edit",
    "apply_diff",
    "apply_patch",
    "search_and_replace",
    "lsp",
  ],
  devops: ["read_file", "write_file", "search_files", "list_dir", "bash", "shell", "smart_edit"],
  qa: [
    "read_file",
    "write_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "bash",
    "shell",
    "smart_edit",
    "lsp",
  ],
  researcher: [
    "read_file",
    "search_files",
    "codebase_search",
    "list_dir",
    "web_fetch",
    "web_search",
    "doc_lookup",
  ],
  security: ["read_file", "search_files", "codebase_search", "list_dir", "lsp"],
  writer: ["read_file", "write_file", "search_files", "codebase_search", "list_dir", "smart_edit"],
} as const;

// ============================================
// Worker Execution Configuration
// ============================================

/**
 * Configuration options for worker execution.
 */
export interface WorkerExecutionConfig {
  /** Maximum iterations for the agent loop */
  maxIterations?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Provider type to use (defaults to subsession config) */
  providerType?: string;
  /** Model to use (defaults to subsession config) */
  model?: string;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<WorkerExecutionConfig> = {
  maxIterations: 15,
  timeout: 120000, // 2 minutes
  providerType: "anthropic",
  model: "claude-sonnet-4-20250514",
};

// ============================================
// Worker Executor
// ============================================

/**
 * Execute a task using an AgentLoop with worker-specific configuration.
 *
 * This function creates an AgentLoop instance with:
 * - Worker-specific system prompt
 * - Filtered tool set based on worker type
 * - Proper context isolation
 *
 * @param workerSlug - The worker's slug identifier
 * @param context - Worker execution context
 * @param config - Optional execution configuration
 * @returns Promise resolving to WorkerResult
 *
 * @example
 * ```typescript
 * const result = await executeWorkerTask(
 *   'coder',
 *   { subsession, taskPacket, signal },
 *   { maxIterations: 20 }
 * );
 * ```
 */
export async function executeWorkerTask(
  workerSlug: string,
  context: WorkerContext,
  config?: WorkerExecutionConfig
): Promise<WorkerResult> {
  const { subsession, taskPacket, signal } = context;

  // Check for cancellation
  if (signal?.aborted) {
    return {
      success: false,
      error: new Error("Task cancelled before execution"),
    };
  }

  // Merge config with defaults
  const execConfig = { ...DEFAULT_CONFIG, ...config };

  // Get worker-specific prompt
  const systemPrompt =
    WORKER_PROMPTS[workerSlug as keyof typeof WORKER_PROMPTS] ?? WORKER_PROMPTS.coder;

  // Get allowed tools for this worker
  const allowedToolNames = WORKER_TOOL_SETS[workerSlug] ?? WORKER_TOOL_SETS.coder ?? [];

  // Filter tools from the subsession's registry
  const availableTools = subsession.toolRegistry.list();
  const filteredTools = availableTools.filter((tool) =>
    allowedToolNames.includes(tool.definition.name)
  );

  // Convert tools to LLM tool definitions
  const toolDefinitions: ToolDefinition[] = filteredTools.map((tool) => ({
    name: tool.definition.name,
    description: tool.definition.description,
    // Convert Zod schema to JSON schema for the LLM
    inputSchema: tool.definition.parameters._def
      ? ((
          tool.definition.parameters as unknown as {
            _def: { jsonSchema?: Record<string, unknown> };
          }
        )._def.jsonSchema ?? {})
      : {},
  }));

  // Create session ID for this worker execution
  const sessionId = `worker-${workerSlug}-${randomUUID()}`;

  // Get working directory from context
  const cwd =
    (subsession.context.localMemory.cwd as string) ??
    (subsession.context.sharedMemory.cwd as string) ??
    process.cwd();

  // Create AgentLoop configuration
  const loopConfig: AgentLoopConfig = {
    sessionId,
    mode: {
      ...MODE_CONFIGS.code,
      prompt: systemPrompt,
    },
    providerType: execConfig.providerType,
    model: execConfig.model,
    cwd,
    tools: toolDefinitions,
    agentLevel: AgentLevel.worker,
    terminationLimits: {
      maxSteps: execConfig.maxIterations,
      maxTimeMs: execConfig.timeout,
    },
  };

  // Create the agent loop
  const loop = new AgentLoop(loopConfig);

  // Track results
  const filesModified: string[] = [];
  let output = "";
  let tokensUsed = 0;
  let error: Error | undefined;

  // Set up event handlers
  loop.on("text", (text) => {
    output += text;
  });

  loop.on("usage", (usage) => {
    tokensUsed += usage.inputTokens + usage.outputTokens;
  });

  loop.on("toolEnd", (_callId, name, result) => {
    // Track file modifications
    if (
      (name === "write_file" || name === "smart_edit" || name === "apply_diff") &&
      result.result.success
    ) {
      const filePath = (result.result as { path?: string }).path;
      if (filePath && !filesModified.includes(filePath)) {
        filesModified.push(filePath);
      }
    }
  });

  loop.on("error", (err) => {
    error = err;
  });

  // Handle abort signal
  if (signal) {
    signal.addEventListener("abort", () => {
      loop.cancel();
    });
  }

  try {
    // Add the task as a user message
    const userMessage = createUserMessage([SessionParts.text(taskPacket.task)]);
    loop.addMessage(userMessage);

    // Run the agent loop
    await loop.run();

    // Check final state
    const finalState = loop.getState();
    const success = finalState !== "terminated" && !error;

    return {
      success,
      data: {
        output,
        finalState,
        iterations: loop.getTerminationContext().stepCount,
      },
      filesModified,
      tokensUsed,
      error,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
      filesModified,
      tokensUsed,
    };
  }
}

/**
 * Get the system prompt for a worker type.
 *
 * @param workerSlug - The worker's slug identifier
 * @returns The system prompt string
 */
export function getWorkerPrompt(workerSlug: string): string {
  return WORKER_PROMPTS[workerSlug as keyof typeof WORKER_PROMPTS] ?? WORKER_PROMPTS.coder;
}

/**
 * Get the allowed tool names for a worker type.
 *
 * @param workerSlug - The worker's slug identifier
 * @returns Array of allowed tool names
 */
export function getWorkerToolSet(workerSlug: string): readonly string[] {
  return WORKER_TOOL_SETS[workerSlug] ?? WORKER_TOOL_SETS.coder ?? [];
}

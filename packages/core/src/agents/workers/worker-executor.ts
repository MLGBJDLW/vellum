// ============================================
// Worker Executor
// ============================================
// Provides AgentLoop execution for worker agents
// Supports markdown prompts via PromptLoader with TypeScript fallback
// @see REQ-001, REQ-019

import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@vellum/provider";
import { z } from "zod";
import { AgentLevel } from "../../agent/level.js";
import { AgentLoop, type AgentLoopConfig } from "../../agent/loop.js";
import { MODE_CONFIGS } from "../../agent/modes.js";
import { CONFIG_DEFAULTS } from "../../config/defaults.js";
import { PromptLoader } from "../../prompts/prompt-loader.js";
import { createUserMessage, SessionParts } from "../../session/message.js";
import type { WorkerContext, WorkerResult } from "./base.js";

// ============================================
// Prompt Loader Instance
// ============================================

/**
 * Shared PromptLoader instance for worker prompts.
 * Uses LRU caching to avoid repeated file reads.
 */
const promptLoader = new PromptLoader({
  enableFallback: true,
  maxCacheSize: 20,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
});

// ============================================
// Worker System Prompts (TypeScript Fallback)
// ============================================

/**
 * System prompts tailored for each worker type.
 * These prompts serve as fallback when markdown files are not found.
 *
 * @deprecated Use getWorkerPrompt() or getWorkerPromptAsync() instead.
 * Direct access to WORKER_PROMPTS may be removed in a future version.
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
  timeout: CONFIG_DEFAULTS.timeouts.shell, // 2 minutes
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

  // Get worker-specific prompt (async with markdown support and fallback)
  const systemPrompt = await getWorkerPromptAsync(workerSlug);

  // Get allowed tools for this worker
  const allowedToolNames = WORKER_TOOL_SETS[workerSlug] ?? WORKER_TOOL_SETS.coder ?? [];

  // Filter tools from the subsession's registry
  const availableTools = subsession.toolRegistry.list();
  const filteredTools = availableTools.filter(
    (tool) => allowedToolNames.includes(tool.definition.name) && tool.definition.enabled !== false
  );

  // Convert tools to LLM tool definitions
  const toolDefinitions: ToolDefinition[] = filteredTools.map((tool) => ({
    name: tool.definition.name,
    description: tool.definition.description,
    // Convert Zod schema to JSON schema for the LLM
    inputSchema: z.toJSONSchema(tool.definition.parameters, {
      target: "openapi-3.0",
      unrepresentable: "any",
    }) as Record<string, unknown>,
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
 * Get the system prompt for a worker type (synchronous, TypeScript fallback only).
 *
 * Returns the hardcoded TypeScript prompt for the specified worker type.
 * For markdown file support with caching, use `getWorkerPromptAsync()`.
 *
 * @param workerSlug - The worker's slug identifier
 * @returns The system prompt string from TypeScript definitions
 */
export function getWorkerPrompt(workerSlug: string): string {
  return WORKER_PROMPTS[workerSlug as keyof typeof WORKER_PROMPTS] ?? WORKER_PROMPTS.coder;
}

/**
 * Get the system prompt for a worker type (async, with markdown support).
 *
 * Attempts to load the prompt from markdown files via PromptLoader.
 * Falls back to TypeScript definitions if markdown file is not found.
 *
 * @param workerSlug - The worker's slug identifier
 * @returns Promise resolving to the system prompt string
 *
 * @example
 * ```typescript
 * // Load worker prompt with markdown support
 * const prompt = await getWorkerPromptAsync('coder');
 * ```
 */
export async function getWorkerPromptAsync(workerSlug: string): Promise<string> {
  try {
    const loaded = await promptLoader.load(workerSlug, "worker");
    return loaded.content;
  } catch {
    // TypeScript fallback - return hardcoded constant
    return WORKER_PROMPTS[workerSlug as keyof typeof WORKER_PROMPTS] ?? WORKER_PROMPTS.coder;
  }
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

/**
 * Set the workspace path for worker prompt discovery.
 *
 * Configures the PromptLoader to look for prompts in the specified workspace.
 * This affects `getWorkerPromptAsync()` calls.
 *
 * @param path - Absolute path to the workspace root
 */
export function setWorkerPromptWorkspace(path: string): void {
  promptLoader.setWorkspacePath(path);
}

/**
 * Invalidate cached worker prompts.
 *
 * Forces the next `getWorkerPromptAsync()` call to reload from disk.
 *
 * @param workerSlug - Optional worker slug to invalidate. If omitted, invalidates all.
 */
export function invalidateWorkerPromptCache(workerSlug?: string): void {
  if (workerSlug) {
    promptLoader.invalidate(workerSlug);
  } else {
    promptLoader.invalidateAll();
  }
}

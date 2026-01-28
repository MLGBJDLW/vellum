// ============================================
// Task Decomposer for Multi-Agent Orchestration
// ============================================

import { z } from "zod";

// ============================================
// Types and Schemas
// ============================================

/**
 * Dependency definition for a subtask.
 */
export interface SubtaskDependency {
  /** ID of the task this dependency belongs to */
  taskId: string;
  /** IDs of tasks that must complete before this task can start */
  dependsOn: string[];
}

/**
 * Zod schema for SubtaskDependency validation.
 */
export const SubtaskDependencySchema = z.object({
  taskId: z.string().min(1),
  dependsOn: z.array(z.string().min(1)),
});

/**
 * Effort estimation for a subtask.
 */
export type EstimatedEffort = "small" | "medium" | "large";

/**
 * Zod schema for EstimatedEffort validation.
 */
export const EstimatedEffortSchema = z.enum(["small", "medium", "large"]);

/**
 * Definition of a subtask created from decomposition.
 */
export interface SubtaskDefinition {
  /** Unique identifier for this subtask */
  id: string;
  /** Human-readable description of the subtask */
  description: string;
  /** Recommended agent slug to execute this subtask */
  suggestedAgent?: string;
  /** Estimated effort/complexity of the subtask */
  estimatedEffort: EstimatedEffort;
  /** Dependency information for this subtask */
  dependencies: SubtaskDependency;
}

/**
 * Zod schema for SubtaskDefinition validation.
 */
export const SubtaskDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  suggestedAgent: z.string().min(1).optional(),
  estimatedEffort: EstimatedEffortSchema,
  dependencies: SubtaskDependencySchema,
});

/**
 * Result of decomposing a complex task into subtasks.
 */
export interface DecompositionResult {
  /** The original task that was decomposed */
  originalTask: string;
  /** List of subtasks created from decomposition */
  subtasks: SubtaskDefinition[];
  /** Topologically sorted task IDs for execution order */
  executionOrder: string[];
  /** Groups of task IDs that can run in parallel */
  canParallelize: string[][];
}

/**
 * Zod schema for DecompositionResult validation.
 */
export const DecompositionResultSchema = z.object({
  originalTask: z.string().min(1),
  subtasks: z.array(SubtaskDefinitionSchema),
  executionOrder: z.array(z.string().min(1)),
  canParallelize: z.array(z.array(z.string().min(1))),
});

/**
 * Complexity level of a task.
 */
export type TaskComplexity = "simple" | "moderate" | "complex";

/**
 * Zod schema for TaskComplexity validation.
 */
export const TaskComplexitySchema = z.enum(["simple", "moderate", "complex"]);

/**
 * Analysis of a task to determine decomposition strategy.
 */
export interface TaskAnalysis {
  /** Estimated complexity of the task */
  complexity: TaskComplexity;
  /** Whether the task should be decomposed into subtasks */
  shouldDecompose: boolean;
  /** Keywords extracted from the task description */
  keywords: string[];
  /** Agent slugs suggested for handling this task */
  suggestedAgents: string[];
}

/**
 * Zod schema for TaskAnalysis validation.
 */
export const TaskAnalysisSchema = z.object({
  complexity: TaskComplexitySchema,
  shouldDecompose: z.boolean(),
  keywords: z.array(z.string()),
  suggestedAgents: z.array(z.string()),
});

/**
 * Interface for decomposing complex tasks into manageable subtasks.
 */
export interface TaskDecomposer {
  /**
   * Analyze a task to determine its complexity and decomposition strategy.
   *
   * @param task - The task description to analyze
   * @returns Analysis containing complexity, keywords, and suggested agents
   */
  analyze(task: string): TaskAnalysis;

  /**
   * Decompose a complex task into subtasks with dependencies.
   *
   * @param task - The task description to decompose
   * @returns Decomposition result with subtasks and execution order
   */
  decompose(task: string): DecompositionResult;
}

// ============================================
// Keyword Definitions
// ============================================

/**
 * Keywords that indicate implementation work.
 */
const IMPLEMENT_KEYWORDS = [
  "implement",
  "create",
  "build",
  "develop",
  "add",
  "make",
  "write",
  "code",
];

/**
 * Keywords that indicate testing work.
 */
const TEST_KEYWORDS = ["test", "verify", "validate", "check", "assert", "spec"];

/**
 * Keywords that indicate documentation work.
 */
const DOCUMENT_KEYWORDS = ["document", "doc", "readme", "comment", "explain", "describe"];

/**
 * Keywords that indicate deployment work.
 */
const DEPLOY_KEYWORDS = ["deploy", "release", "publish", "ship", "launch", "rollout"];

/**
 * Keywords that indicate refactoring work.
 */
const REFACTOR_KEYWORDS = ["refactor", "restructure", "reorganize", "clean", "optimize"];

/**
 * Keywords that indicate review work.
 */
const REVIEW_KEYWORDS = ["review", "audit", "inspect", "analyze", "examine"];

/**
 * Mapping of keyword categories to suggested agent slugs.
 */
const KEYWORD_TO_AGENT: Record<string, string> = {
  implement: "coder",
  create: "coder",
  build: "coder",
  develop: "coder",
  add: "coder",
  make: "coder",
  write: "coder",
  code: "coder",
  test: "tester",
  verify: "tester",
  validate: "tester",
  check: "tester",
  assert: "tester",
  spec: "tester",
  document: "documenter",
  doc: "documenter",
  readme: "documenter",
  comment: "documenter",
  explain: "documenter",
  describe: "documenter",
  deploy: "devops",
  release: "devops",
  publish: "devops",
  ship: "devops",
  launch: "devops",
  rollout: "devops",
  refactor: "coder",
  restructure: "coder",
  reorganize: "coder",
  clean: "coder",
  optimize: "coder",
  review: "reviewer",
  audit: "reviewer",
  inspect: "reviewer",
  analyze: "analyst",
  examine: "analyst",
};

/**
 * All recognized keywords for task analysis.
 */
const ALL_KEYWORDS = [
  ...IMPLEMENT_KEYWORDS,
  ...TEST_KEYWORDS,
  ...DOCUMENT_KEYWORDS,
  ...DEPLOY_KEYWORDS,
  ...REFACTOR_KEYWORDS,
  ...REVIEW_KEYWORDS,
];

// ============================================
// Implementation
// ============================================

/**
 * Extract keywords from a task description.
 *
 * @param task - The task description to analyze
 * @returns Array of matched keywords
 */
function extractKeywords(task: string): string[] {
  const normalizedTask = task.toLowerCase();
  const foundKeywords: string[] = [];

  for (const keyword of ALL_KEYWORDS) {
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(normalizedTask)) {
      foundKeywords.push(keyword);
    }
  }

  return [...new Set(foundKeywords)]; // Remove duplicates
}

/**
 * Get suggested agents based on keywords.
 *
 * @param keywords - Keywords extracted from task
 * @returns Array of unique suggested agent slugs
 */
function getSuggestedAgents(keywords: string[]): string[] {
  const agents: string[] = [];

  for (const keyword of keywords) {
    const agent = KEYWORD_TO_AGENT[keyword];
    if (agent && !agents.includes(agent)) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Determine task complexity based on analysis.
 *
 * @param keywords - Keywords found in task
 * @param taskLength - Length of task description
 * @returns Complexity level
 */
function determineComplexity(keywords: string[], taskLength: number): TaskComplexity {
  const keywordCount = keywords.length;
  const agentCount = new Set(getSuggestedAgents(keywords)).size;

  // Complex: multiple agent types or many keywords
  if (agentCount >= 3 || keywordCount >= 5 || taskLength > 500) {
    return "complex";
  }

  // Moderate: 2 agent types or several keywords
  if (agentCount === 2 || keywordCount >= 3 || taskLength > 200) {
    return "moderate";
  }

  // Simple: single focus
  return "simple";
}

/**
 * Estimate effort for a subtask based on its description.
 *
 * @param description - Subtask description
 * @returns Estimated effort level
 */
function estimateEffort(description: string): EstimatedEffort {
  const length = description.length;
  const keywords = extractKeywords(description);

  // Large effort indicators
  if (
    keywords.some((k) =>
      ["implement", "build", "develop", "refactor", "restructure"].includes(k)
    ) &&
    length > 100
  ) {
    return "large";
  }

  // Small effort indicators
  if (keywords.some((k) => ["document", "comment", "check", "verify"].includes(k))) {
    return "small";
  }

  return "medium";
}

/**
 * Perform topological sort on subtasks based on dependencies.
 *
 * @param subtasks - Array of subtask definitions
 * @returns Topologically sorted array of task IDs
 * @throws Error if circular dependency is detected
 */
function topologicalSort(subtasks: SubtaskDefinition[]): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  // Build adjacency map
  const taskMap = new Map<string, SubtaskDefinition>();
  for (const subtask of subtasks) {
    taskMap.set(subtask.id, subtask);
  }

  function visit(taskId: string): void {
    if (visited.has(taskId)) {
      return;
    }

    if (visiting.has(taskId)) {
      throw new Error(`Circular dependency detected involving task: ${taskId}`);
    }

    visiting.add(taskId);

    const subtask = taskMap.get(taskId);
    if (subtask) {
      for (const depId of subtask.dependencies.dependsOn) {
        visit(depId);
      }
    }

    visiting.delete(taskId);
    visited.add(taskId);
    result.push(taskId);
  }

  for (const subtask of subtasks) {
    visit(subtask.id);
  }

  return result;
}

/**
 * Find groups of tasks that can run in parallel.
 *
 * @param subtasks - Array of subtask definitions
 * @param executionOrder - Topologically sorted task IDs
 * @returns Array of task ID groups that can run in parallel
 */
function findParallelGroups(subtasks: SubtaskDefinition[], executionOrder: string[]): string[][] {
  const groups: string[][] = [];
  const completed = new Set<string>();

  // Build dependency map for quick lookup
  const dependencyMap = new Map<string, Set<string>>();
  for (const subtask of subtasks) {
    dependencyMap.set(subtask.id, new Set(subtask.dependencies.dependsOn));
  }

  // Process tasks in execution order, grouping those that can run together
  const remaining = new Set(executionOrder);

  while (remaining.size > 0) {
    const currentGroup: string[] = [];

    // Find all tasks whose dependencies are satisfied
    for (const taskId of remaining) {
      const deps = dependencyMap.get(taskId) ?? new Set();
      const allDepsCompleted = [...deps].every((depId) => completed.has(depId));

      if (allDepsCompleted) {
        currentGroup.push(taskId);
      }
    }

    if (currentGroup.length === 0) {
      // This should not happen if topological sort succeeded
      throw new Error("Unable to make progress - possible circular dependency");
    }

    // Mark current group as completed
    for (const taskId of currentGroup) {
      remaining.delete(taskId);
      completed.add(taskId);
    }

    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Generate subtask ID.
 *
 * @param index - Index of the subtask
 * @returns Formatted subtask ID
 */
function generateSubtaskId(index: number): string {
  return `subtask-${String(index + 1).padStart(3, "0")}`;
}

/**
 * Create subtasks from a task based on keyword categories.
 *
 * @param task - Original task description
 * @param keywords - Keywords found in task
 * @returns Array of subtask definitions
 */
function createSubtasksFromKeywords(task: string, keywords: string[]): SubtaskDefinition[] {
  const subtasks: SubtaskDefinition[] = [];
  const agentCategories = new Map<string, string[]>();

  // Group keywords by agent
  for (const keyword of keywords) {
    const agent = KEYWORD_TO_AGENT[keyword];
    if (agent) {
      const existing = agentCategories.get(agent) ?? [];
      existing.push(keyword);
      agentCategories.set(agent, existing);
    }
  }

  // Define standard execution order for agent types
  const agentOrder = ["analyst", "coder", "tester", "documenter", "reviewer", "devops"];
  const sortedAgents = [...agentCategories.keys()].sort(
    (a, b) => agentOrder.indexOf(a) - agentOrder.indexOf(b)
  );

  let index = 0;
  const previousIds: string[] = [];

  for (const agent of sortedAgents) {
    const agentKeywords = agentCategories.get(agent) ?? [];
    const id = generateSubtaskId(index);

    // Create description based on agent type and keywords
    const description = createSubtaskDescription(task, agent, agentKeywords);

    // Only depend on immediate predecessor to allow parallelization
    // when tasks are actually independent (findParallelGroups can now detect parallel groups)
    const immediatePredecessor =
      previousIds.length > 0 ? previousIds[previousIds.length - 1] : null;

    const subtask: SubtaskDefinition = {
      id,
      description,
      suggestedAgent: agent,
      estimatedEffort: estimateEffort(description),
      dependencies: {
        taskId: id,
        dependsOn: immediatePredecessor ? [immediatePredecessor] : [],
      },
    };

    subtasks.push(subtask);
    previousIds.push(id);
    index++;
  }

  // If no keywords matched, create a single subtask
  if (subtasks.length === 0) {
    const id = generateSubtaskId(0);
    subtasks.push({
      id,
      description: task,
      estimatedEffort: "medium",
      dependencies: {
        taskId: id,
        dependsOn: [],
      },
    });
  }

  return subtasks;
}

/**
 * Create a description for a subtask based on agent type.
 *
 * @param originalTask - Original task description
 * @param agent - Agent slug
 * @param keywords - Keywords associated with this agent
 * @returns Subtask description
 */
function createSubtaskDescription(originalTask: string, agent: string, keywords: string[]): string {
  const keywordList = keywords.join(", ");

  switch (agent) {
    case "analyst":
      return `Analyze and examine: ${originalTask} (keywords: ${keywordList})`;
    case "coder":
      return `Implement code changes: ${originalTask} (keywords: ${keywordList})`;
    case "tester":
      return `Write and run tests: ${originalTask} (keywords: ${keywordList})`;
    case "documenter":
      return `Create documentation: ${originalTask} (keywords: ${keywordList})`;
    case "reviewer":
      return `Review and audit: ${originalTask} (keywords: ${keywordList})`;
    case "devops":
      return `Deploy and release: ${originalTask} (keywords: ${keywordList})`;
    default:
      return `${agent}: ${originalTask}`;
  }
}

/**
 * Create a TaskDecomposer instance.
 *
 * @returns TaskDecomposer implementation
 */
export function createTaskDecomposer(): TaskDecomposer {
  return {
    analyze(task: string): TaskAnalysis {
      const keywords = extractKeywords(task);
      const suggestedAgents = getSuggestedAgents(keywords);
      const complexity = determineComplexity(keywords, task.length);

      // Decomposition is recommended for moderate or complex tasks
      const shouldDecompose = complexity !== "simple" || suggestedAgents.length > 1;

      return {
        complexity,
        shouldDecompose,
        keywords,
        suggestedAgents,
      };
    },

    decompose(task: string): DecompositionResult {
      const keywords = extractKeywords(task);
      const subtasks = createSubtasksFromKeywords(task, keywords);
      const executionOrder = topologicalSort(subtasks);
      const canParallelize = findParallelGroups(subtasks, executionOrder);

      return {
        originalTask: task,
        subtasks,
        executionOrder,
        canParallelize,
      };
    },
  };
}

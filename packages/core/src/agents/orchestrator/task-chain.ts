/**
 * TaskChain Management
 *
 * Tracks delegation depth and ancestry for multi-agent orchestration.
 * Enforces maximum delegation depth to prevent infinite recursion.
 */

/**
 * Maximum allowed delegation depth (root = 0, max child depth = 3)
 */
export const MAX_DELEGATION_DEPTH = 3;

/**
 * Represents a single node in a task chain
 */
export interface TaskChainNode {
  taskId: string;
  parentTaskId?: string;
  agentSlug: string;
  depth: number;
  createdAt: Date;
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * Represents a complete task chain from root to all descendants
 */
export interface TaskChain {
  chainId: string;
  rootTaskId: string;
  nodes: Map<string, TaskChainNode>;
  maxDepth: number;
}

/**
 * Manager interface for task chain operations
 */
export interface TaskChainManager {
  /**
   * Create a new task chain with a root task
   */
  createTaskChain(rootTaskId: string, agentSlug: string): TaskChain;

  /**
   * Add a child task to an existing chain
   * @returns The new node, or null if depth exceeds MAX_DELEGATION_DEPTH
   */
  addTask(
    chainId: string,
    taskId: string,
    parentTaskId: string,
    agentSlug: string
  ): TaskChainNode | null;

  /**
   * Get the depth of a task in the chain
   */
  getDepth(chainId: string, taskId: string): number;

  /**
   * Get all ancestor nodes from root to parent (excluding the task itself)
   */
  getAncestors(chainId: string, taskId: string): TaskChainNode[];

  /**
   * Update the status of a task in the chain
   */
  updateStatus(chainId: string, taskId: string, status: TaskChainNode["status"]): void;

  /**
   * Get a chain by ID
   */
  getChain(chainId: string): TaskChain | undefined;

  /**
   * Delete a chain by ID
   * @returns true if chain was deleted, false if not found
   */
  deleteChain(chainId: string): boolean;
}

/**
 * Create a new TaskChainManager instance
 */
export function createTaskChainManager(): TaskChainManager {
  const chains = new Map<string, TaskChain>();

  function generateChainId(): string {
    return `chain-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  function createTaskChain(rootTaskId: string, agentSlug: string): TaskChain {
    const chainId = generateChainId();

    const rootNode: TaskChainNode = {
      taskId: rootTaskId,
      parentTaskId: undefined,
      agentSlug,
      depth: 0,
      createdAt: new Date(),
      status: "pending",
    };

    const chain: TaskChain = {
      chainId,
      rootTaskId,
      nodes: new Map([[rootTaskId, rootNode]]),
      maxDepth: 0,
    };

    chains.set(chainId, chain);
    return chain;
  }

  function addTask(
    chainId: string,
    taskId: string,
    parentTaskId: string,
    agentSlug: string
  ): TaskChainNode | null {
    const chain = chains.get(chainId);
    if (!chain) {
      return null;
    }

    const parentNode = chain.nodes.get(parentTaskId);
    if (!parentNode) {
      return null;
    }

    const newDepth = parentNode.depth + 1;

    // Reject if depth exceeds maximum
    if (newDepth > MAX_DELEGATION_DEPTH) {
      return null;
    }

    const newNode: TaskChainNode = {
      taskId,
      parentTaskId,
      agentSlug,
      depth: newDepth,
      createdAt: new Date(),
      status: "pending",
    };

    chain.nodes.set(taskId, newNode);

    // Update chain's max depth if needed
    if (newDepth > chain.maxDepth) {
      chain.maxDepth = newDepth;
    }

    return newNode;
  }

  function getDepth(chainId: string, taskId: string): number {
    const chain = chains.get(chainId);
    if (!chain) {
      return -1;
    }

    const node = chain.nodes.get(taskId);
    if (!node) {
      return -1;
    }

    return node.depth;
  }

  function getAncestors(chainId: string, taskId: string): TaskChainNode[] {
    const chain = chains.get(chainId);
    if (!chain) {
      return [];
    }

    const node = chain.nodes.get(taskId);
    if (!node) {
      return [];
    }

    const ancestors: TaskChainNode[] = [];
    let currentParentId = node.parentTaskId;

    // Walk up the chain collecting ancestors
    while (currentParentId) {
      const parentNode = chain.nodes.get(currentParentId);
      if (!parentNode) {
        break;
      }
      ancestors.unshift(parentNode); // Add to front to maintain root-first order
      currentParentId = parentNode.parentTaskId;
    }

    return ancestors;
  }

  function updateStatus(chainId: string, taskId: string, status: TaskChainNode["status"]): void {
    const chain = chains.get(chainId);
    if (!chain) {
      return;
    }

    const node = chain.nodes.get(taskId);
    if (!node) {
      return;
    }

    node.status = status;
  }

  function getChain(chainId: string): TaskChain | undefined {
    return chains.get(chainId);
  }

  function deleteChain(chainId: string): boolean {
    return chains.delete(chainId);
  }

  return {
    createTaskChain,
    addTask,
    getDepth,
    getAncestors,
    updateStatus,
    getChain,
    deleteChain,
  };
}

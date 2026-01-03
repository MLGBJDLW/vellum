export interface TodoModeConfig {
  autoCreate: boolean; // Auto-create todo list on first add
  checkpointOnComplete: boolean; // Stop for review when task completes
  requireValidation: boolean; // Require validation before marking done
  confirmDestructive: boolean; // Ask before clear/remove
}

export const MODE_TODO_CONFIGS: Record<string, TodoModeConfig> = {
  vibe: {
    autoCreate: false,
    checkpointOnComplete: false,
    requireValidation: false,
    confirmDestructive: false,
  },
  plan: {
    autoCreate: true,
    checkpointOnComplete: true,
    requireValidation: false,
    confirmDestructive: true,
  },
  spec: {
    autoCreate: true,
    checkpointOnComplete: true,
    requireValidation: true,
    confirmDestructive: true,
  },
};

export function getTodoConfig(mode: string): TodoModeConfig {
  // biome-ignore lint/style/noNonNullAssertion: vibe is always defined above
  return MODE_TODO_CONFIGS[mode] ?? MODE_TODO_CONFIGS.vibe!;
}

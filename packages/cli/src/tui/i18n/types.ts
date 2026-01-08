/**
 * TUI i18n Namespace Types
 *
 * Type definitions for the TUI translation namespace.
 * These types provide strong typing for translation keys.
 *
 * @module tui/i18n/types
 */

/**
 * TUI namespace translation keys organized by category.
 */
export interface TUITranslations {
  status: {
    model: string;
    mode: string;
    tokens: string;
    cost: string;
    ready: string;
    loading: string;
    streaming: string;
    waiting: string;
    error: string;
    idle: string;
    connected: string;
    disconnected: string;
    session: string;
    elapsed: string;
    noInfo: string;
  };
  input: {
    placeholder: string;
    multilinePlaceholder: string;
    commandHint: string;
    emptyMessage: string;
    submit: string;
    cancel: string;
    clear: string;
  };
  permission: {
    title: string;
    description: string;
    toolName: string;
    action: string;
    allow: string;
    allowOnce: string;
    allowAlways: string;
    deny: string;
    denyAlways: string;
    abort: string;
    details: string;
    reason: string;
    path: string;
    command: string;
    file: {
      read: string;
      write: string;
      delete: string;
    };
    shell: {
      execute: string;
    };
    mcp: {
      connect: string;
      call: string;
    };
    // New permission dialog keys
    approve: string;
    reject: string;
    alwaysAllow: string;
    tool: string;
    parameters: string;
    requestTitle: string;
  };
  vim: {
    normal: string;
    insert: string;
    visual: string;
    command: string;
    replace: string;
    modeIndicator: string;
  };
  messages: {
    thinking: string;
    generating: string;
    user: string;
    assistant: string;
    system: string;
    error: string;
    empty: string;
    copied: string;
    copyFailed: string;
  };
  tools: {
    executing: string;
    completed: string;
    failed: string;
    pending: string;
    approved: string;
    rejected: string;
    name: string;
    duration: string;
    result: string;
  };
  commands: {
    help: string;
    clear: string;
    exit: string;
    model: string;
    theme: string;
    history: string;
    compact: string;
  };
  errors: {
    connectionFailed: string;
    timeout: string;
    invalidInput: string;
    unknown: string;
    // New error keys
    somethingWrong: string;
    retryHint: string;
  };
  common: {
    yes: string;
    no: string;
    ok: string;
    confirm: string;
    retry: string;
    close: string;
    loading: string;
    processing: string;
  };
  language: {
    current: string;
    available: string;
    switchedTo: string;
    autoDetect: string;
    invalid: string;
    invalidHint: string;
    saved: string;
  };
  onboarding: {
    selectProvider: string;
    providerNav: string;
    apiKeyRequired: string;
    noApiKeyNeeded: string;
  };
  providers: {
    [key: string]: {
      name: string;
      description: string;
      shortcut: string;
    };
  };
  update: {
    available: string;
    current: string;
    latest: string;
    upgradeHint: string;
    dismissHint: string;
    dismissInstructions: string;
  };
  todo: {
    title: string;
    empty: string;
    emptyHint: string;
    filter: string;
    filterHint: string;
    keybindings: string;
    created: string;
    completed: string;
    noMatch: string;
    changeFilter: string;
  };
  memory: {
    title: string;
    empty: string;
    emptyHint: string;
    created: string;
    updated: string;
    tags: string;
    importance: string;
    keybindings: string;
    entry: string;
    entries: string;
  };
  modelSelector: {
    title: string;
    current: string;
    keybindings: string;
  };
  modeSelector: {
    title: string;
    current: string;
    keybindings: string;
  };
  session: {
    closeHint: string;
    selectHint: string;
    closeKey: string;
  };
  thinking: {
    expandHint: string;
    collapseHint: string;
    label: string;
  };
  splash: {
    initializing: string;
    banner: string;
  };
  help: {
    closeHint: string;
  };
  approval: {
    empty: string;
    pending: string;
    approveAll: string;
    rejectAll: string;
    navigate: string;
    approve: string;
    reject: string;
  };
  cost: {
    input: string;
    output: string;
    total: string;
    tokens: string;
    cacheRead: string;
    cacheWrite: string;
    reasoning: string;
    cost: string;
    sessionCost: string;
  };
  agent: {
    progress: string;
    noTasks: string;
    taskChain: string;
  };
  backtrack: {
    keybindings: string;
    selectBranch: string;
    current: string;
    undo: string;
    redo: string;
    fork: string;
    forks: string;
    switchBranch: string;
    newBranch: string;
  };
  code: {
    copy: string;
  };
}

/**
 * Flattened translation key type for dot notation access.
 * Generates union type of all valid translation key paths.
 *
 * @example
 * type Key = TUITranslationKey;
 * // "status.model" | "status.mode" | "input.placeholder" | ...
 */
export type TUITranslationKey = FlattenKeys<TUITranslations>;

/**
 * Helper type to flatten nested object keys into dot notation.
 */
type FlattenKeys<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? T[K] extends { [key: string]: string }
            ? FlattenKeys<T[K], `${Prefix}${K}.`>
            : FlattenKeys<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Translation function type with interpolation support.
 *
 * Translate a key from the TUI namespace.
 *
 * @param key - The translation key (dot notation)
 * @param options - Optional interpolation values
 * @returns Translated string
 *
 * @example
 * t('status.model') // → "Model"
 * t('vim.modeIndicator', { mode: 'NORMAL' }) // → "Mode: NORMAL"
 */
export type TranslationFunction = (
  key: string,
  options?: Record<string, string | number>
) => string;

/**
 * Return type of useTUITranslation hook.
 */
export interface UseTUITranslationReturn {
  /** Translation function for TUI namespace */
  t: TranslationFunction;
  /** Current locale code */
  locale: string;
  /** Change the current locale */
  changeLocale: (locale: string) => void;
  /** Check if a locale is available */
  isLocaleAvailable: (locale: string) => boolean;
  /** List of available locales */
  availableLocales: readonly string[];
}

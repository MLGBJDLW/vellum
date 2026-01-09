/**
 * TUI i18n Namespace Hook
 *
 * Provides internationalization support for TUI components.
 * Wraps the translation system with the 'tui' namespace for type-safe access.
 *
 * @module tui/i18n/tui-namespace
 */

import { useCallback, useMemo, useState } from "react";
import type { TranslationFunction, UseTUITranslationReturn } from "./types.js";

/**
 * English translations (embedded for bundling compatibility).
 */
const EN_TRANSLATIONS: Record<string, unknown> = {
  status: {
    model: "Model",
    mode: "Mode",
    tokens: "Tokens",
    cost: "Cost",
    ready: "Ready",
    loading: "Loading...",
    streaming: "Streaming...",
    waiting: "Waiting for response...",
    error: "Error",
    idle: "Idle",
    connected: "Connected",
    disconnected: "Disconnected",
    session: "Session",
    elapsed: "Elapsed",
  },
  input: {
    placeholder: "Type a message...",
    multilinePlaceholder: "Type a message... (Shift+Enter for newline)",
    commandHint: "Type / for commands",
    emptyMessage: "Message cannot be empty",
    submit: "Send",
    cancel: "Cancel",
    clear: "Clear",
  },
  permission: {
    title: "Permission Required",
    description: "The following action requires your approval:",
    toolName: "Tool",
    action: "Action",
    allow: "Allow",
    allowOnce: "Allow Once",
    allowAlways: "Always Allow",
    deny: "Deny",
    denyAlways: "Always Deny",
    abort: "Abort",
    details: "Details",
    reason: "Reason",
    path: "Path",
    command: "Command",
    file: {
      read: "Read file",
      write: "Write file",
      delete: "Delete file",
    },
    shell: {
      execute: "Execute command",
    },
    mcp: {
      connect: "Connect to MCP server",
      call: "Call MCP tool",
    },
  },
  vim: {
    normal: "NORMAL",
    insert: "INSERT",
    visual: "VISUAL",
    command: "COMMAND",
    replace: "REPLACE",
    modeIndicator: "Mode: {{mode}}",
  },
  messages: {
    thinking: "Thinking...",
    generating: "Generating...",
    user: "You",
    assistant: "Assistant",
    system: "System",
    error: "Error",
    empty: "No messages yet",
    copied: "Copied to clipboard",
    copyFailed: "Failed to copy",
  },
  tools: {
    executing: "Executing...",
    completed: "Completed",
    failed: "Failed",
    pending: "Pending approval",
    approved: "Approved",
    rejected: "Rejected",
    name: "Tool",
    duration: "Duration",
    result: "Result",
  },
  commands: {
    help: "Show available commands",
    clear: "Clear messages",
    exit: "Exit application",
    model: "Change model",
    theme: "Change theme",
    history: "Show history",
    compact: "Toggle compact mode",
  },
  errors: {
    connectionFailed: "Connection failed",
    timeout: "Request timed out",
    invalidInput: "Invalid input",
    unknown: "An unknown error occurred",
  },
  common: {
    yes: "Yes",
    no: "No",
    ok: "OK",
    confirm: "Confirm",
    retry: "Retry",
    close: "Close",
    loading: "Loading...",
    processing: "Processing...",
  },
  language: {
    current: "Current language: {{name}}",
    available: "Available languages:",
    switchedTo: "Switched to {{name}}",
    autoDetect: "Language set to auto-detect ({{locale}})",
    invalid: "Invalid language code: {{code}}",
    invalidHint: "Available: {{codes}}",
    saved: "Language preference saved",
  },
  onboarding: {
    selectProvider: "Select your AI Provider:",
    providerNav: "Use ↑/↓ to navigate, Enter to select",
    apiKeyRequired: "(requires API key)",
    noApiKeyNeeded: "(local, no key needed)",
    selectMode: "Choose Your Coding Mode:",
    modeNav: "Use ↑/↓ to navigate, Enter to select",
    modeSwitchHint: "Tip: Use /mode command or Ctrl+1/2/3 to switch modes later",
  },
  providers: {
    anthropic: {
      name: "Anthropic",
      shortcut: "[A]",
      description: "Claude 4.5 Opus - Best for coding tasks",
    },
    openai: { name: "OpenAI", shortcut: "[O]", description: "GPT 5.2 - Versatile and powerful" },
    google: {
      name: "Google AI",
      shortcut: "[G]",
      description: "Gemini 3 Pro - Latest Google model",
    },
    mistral: { name: "Mistral AI", shortcut: "[M]", description: "Open weight models" },
    groq: { name: "Groq", shortcut: "[R]", description: "Ultra-fast inference" },
    openrouter: { name: "OpenRouter", shortcut: "[X]", description: "Multi-provider gateway" },
    deepseek: { name: "DeepSeek", shortcut: "[D]", description: "DeepSeek-V3 - Chinese AI model" },
    qwen: { name: "Qwen", shortcut: "[Q]", description: "Alibaba Qwen-72B" },
    moonshot: { name: "Moonshot", shortcut: "[S]", description: "Moonshot-v1" },
    ollama: { name: "Ollama", shortcut: "[L]", description: "Local models" },
  },
};

/**
 * Chinese translations (embedded for bundling compatibility).
 */
const ZH_TRANSLATIONS: Record<string, unknown> = {
  status: {
    model: "模型",
    mode: "模式",
    tokens: "令牌",
    cost: "费用",
    ready: "就绪",
    loading: "加载中...",
    streaming: "流式输出中...",
    waiting: "等待响应...",
    error: "错误",
    idle: "空闲",
    connected: "已连接",
    disconnected: "已断开",
    session: "会话",
    elapsed: "已用时间",
  },
  input: {
    placeholder: "输入消息...",
    multilinePlaceholder: "输入消息... (Shift+Enter 换行)",
    commandHint: "输入 / 打开命令菜单",
    emptyMessage: "消息不能为空",
    submit: "发送",
    cancel: "取消",
    clear: "清除",
  },
  permission: {
    title: "需要权限",
    description: "以下操作需要您的批准：",
    toolName: "工具",
    action: "操作",
    allow: "允许",
    allowOnce: "允许一次",
    allowAlways: "始终允许",
    deny: "拒绝",
    denyAlways: "始终拒绝",
    abort: "中止",
    details: "详情",
    reason: "原因",
    path: "路径",
    command: "命令",
    file: {
      read: "读取文件",
      write: "写入文件",
      delete: "删除文件",
    },
    shell: {
      execute: "执行命令",
    },
    mcp: {
      connect: "连接 MCP 服务器",
      call: "调用 MCP 工具",
    },
  },
  vim: {
    normal: "普通",
    insert: "插入",
    visual: "可视",
    command: "命令",
    replace: "替换",
    modeIndicator: "模式: {{mode}}",
  },
  messages: {
    thinking: "思考中...",
    generating: "生成中...",
    user: "你",
    assistant: "助手",
    system: "系统",
    error: "错误",
    empty: "暂无消息",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败",
  },
  tools: {
    executing: "执行中...",
    completed: "已完成",
    failed: "失败",
    pending: "等待批准",
    approved: "已批准",
    rejected: "已拒绝",
    name: "工具",
    duration: "耗时",
    result: "结果",
  },
  commands: {
    help: "显示可用命令",
    clear: "清除消息",
    exit: "退出应用",
    model: "切换模型",
    theme: "切换主题",
    history: "显示历史",
    compact: "切换紧凑模式",
  },
  errors: {
    connectionFailed: "连接失败",
    timeout: "请求超时",
    invalidInput: "无效输入",
    unknown: "发生未知错误",
  },
  common: {
    yes: "是",
    no: "否",
    ok: "确定",
    confirm: "确认",
    retry: "重试",
    close: "关闭",
    loading: "加载中...",
    processing: "处理中...",
  },
  language: {
    current: "当前语言: {{name}}",
    available: "可用语言:",
    switchedTo: "已切换到 {{name}}",
    autoDetect: "语言设置为自动检测 ({{locale}})",
    invalid: "无效的语言代码: {{code}}",
    invalidHint: "可用: {{codes}}",
    saved: "语言偏好已保存",
  },
  onboarding: {
    selectProvider: "选择您的 AI 提供商：",
    providerNav: "使用 ↑/↓ 导航，Enter 选择",
    apiKeyRequired: "(需要 API 密钥)",
    noApiKeyNeeded: "(本地运行，无需密钥)",
    selectMode: "选择编码模式：",
    modeNav: "使用 ↑/↓ 导航，Enter 选择",
    modeSwitchHint: "提示：之后可使用 /mode 命令或 Ctrl+1/2/3 快捷键切换模式",
  },
  providers: {
    anthropic: {
      name: "Anthropic",
      shortcut: "[A]",
      description: "Claude 4.5 Opus - 最适合编程任务",
    },
    openai: { name: "OpenAI", shortcut: "[O]", description: "GPT 5.2 - 多功能且强大" },
    google: { name: "Google AI", shortcut: "[G]", description: "Gemini 3 Pro - 最新谷歌模型" },
    mistral: { name: "Mistral AI", shortcut: "[M]", description: "开源权重模型" },
    groq: { name: "Groq", shortcut: "[R]", description: "超快推理" },
    openrouter: { name: "OpenRouter", shortcut: "[X]", description: "多提供商网关" },
    deepseek: { name: "DeepSeek", shortcut: "[D]", description: "DeepSeek-V3 - 中国 AI 模型" },
    qwen: { name: "Qwen", shortcut: "[Q]", description: "阿里巴巴 Qwen-72B" },
    moonshot: { name: "Moonshot", shortcut: "[S]", description: "Moonshot-v1" },
    ollama: { name: "Ollama", shortcut: "[L]", description: "本地模型" },
  },
};

/**
 * Available locales and their translations.
 */
const TRANSLATIONS: Record<string, Record<string, unknown>> = {
  en: EN_TRANSLATIONS,
  zh: ZH_TRANSLATIONS,
};

/**
 * List of available locale codes.
 */
const AVAILABLE_LOCALES = Object.keys(TRANSLATIONS) as readonly string[];

/**
 * Default locale when none is specified.
 */
const DEFAULT_LOCALE = "en";

/**
 * Global locale state for the application.
 * In a full implementation, this would be managed by a context provider.
 */
let globalLocale = DEFAULT_LOCALE;

/**
 * Get a nested value from an object using dot notation.
 *
 * @param obj - The object to traverse
 * @param path - Dot-notation path (e.g., "status.model")
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate variables in a translation string.
 *
 * @param template - The translation template with {{variable}} placeholders
 * @param values - Object containing variable values
 * @returns Interpolated string
 *
 * @example
 * interpolate("Mode: {{mode}}", { mode: "NORMAL" }) // → "Mode: NORMAL"
 */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Create a translation function for a specific locale.
 *
 * @param locale - The locale to use
 * @returns Translation function
 */
function createTranslationFunction(locale: string): TranslationFunction {
  const translations = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  const fallback = TRANSLATIONS[DEFAULT_LOCALE];

  return (key: string, options?: Record<string, string | number>): string => {
    // Try current locale first
    let value = translations ? getNestedValue(translations, key) : undefined;

    // Fall back to default locale if not found
    if (value === undefined && fallback) {
      value = getNestedValue(fallback, key);
    }

    // Return key if no translation found
    if (value === undefined) {
      return key;
    }

    // Interpolate any variables
    return interpolate(value, options);
  };
}

/**
 * Hook for accessing TUI translations.
 *
 * Provides a type-safe translation function scoped to the 'tui' namespace.
 * Includes locale management and fallback support.
 *
 * @returns Translation utilities for TUI components
 *
 * @example
 * ```tsx
 * function StatusBar() {
 *   const { t } = useTUITranslation();
 *
 *   return (
 *     <Box>
 *       <Text>{t('status.model')}: GPT-4</Text>
 *       <Text>{t('vim.modeIndicator', { mode: 'NORMAL' })}</Text>
 *     </Box>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * function LanguageSwitcher() {
 *   const { locale, changeLocale, availableLocales } = useTUITranslation();
 *
 *   return (
 *     <Select
 *       value={locale}
 *       onChange={(value) => changeLocale(value)}
 *       options={availableLocales.map(l => ({ label: l, value: l }))}
 *     />
 *   );
 * }
 * ```
 */
export function useTUITranslation(): UseTUITranslationReturn {
  // Local state to trigger re-renders on locale change
  const [locale, setLocale] = useState(globalLocale);

  // Create memoized translation function
  const t = useMemo(() => createTranslationFunction(locale), [locale]);

  // Change locale callback
  const changeLocale = useCallback((newLocale: string) => {
    if (AVAILABLE_LOCALES.includes(newLocale)) {
      globalLocale = newLocale;
      setLocale(newLocale);
    }
  }, []);

  // Check if locale is available
  const isLocaleAvailable = useCallback((checkLocale: string) => {
    return AVAILABLE_LOCALES.includes(checkLocale);
  }, []);

  return {
    t,
    locale,
    changeLocale,
    isLocaleAvailable,
    availableLocales: AVAILABLE_LOCALES,
  };
}

/**
 * Set the global locale without using the hook.
 * Useful for initialization before React renders.
 *
 * @param locale - The locale to set
 */
export function setGlobalLocale(locale: string): void {
  if (AVAILABLE_LOCALES.includes(locale)) {
    globalLocale = locale;
  }
}

/**
 * Get the current global locale.
 *
 * @returns Current locale code
 */
export function getGlobalLocale(): string {
  return globalLocale;
}

/**
 * Get a translation directly without using the hook.
 * Useful for non-React code or server-side rendering.
 *
 * @param key - Translation key
 * @param options - Interpolation values
 * @returns Translated string
 */
export function translate(key: string, options?: Record<string, string | number>): string {
  const t = createTranslationFunction(globalLocale);
  return t(key, options);
}

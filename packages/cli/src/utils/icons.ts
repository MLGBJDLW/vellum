/**
 * Text-based icons to replace emojis throughout the CLI.
 * Using bracketed text for better terminal compatibility.
 *
 * @module cli/utils/icons
 */

/**
 * Unified icon system for CLI output.
 * All values are text-based for maximum terminal compatibility.
 */
export const ICONS = {
  // Status indicators
  success: "[OK]",
  error: "[ERR]",
  warning: "[WARN]",
  info: "[INFO]",

  // Actions/hints
  hint: "Hint:",
  tip: "Tip:",
  note: "Note:",
  tools: "Tools:",

  // Progress indicators
  skip: "[SKIP]",
  running: "[...]",
  done: "[DONE]",
  interrupted: "[INT]",
  pending: "[...]",

  // File types (for mentions)
  file: {
    code: "[Code]",
    docs: "[Doc]",
    config: "[Cfg]",
    web: "[Web]",
    style: "[Style]",
    default: "[File]",
    folder: "[Dir]",
  },

  // Providers (bracketed names)
  provider: {
    anthropic: "[Anthropic]",
    openai: "[OpenAI]",
    google: "[Google]",
    copilot: "[Copilot]",
    deepseek: "[DeepSeek]",
    groq: "[Groq]",
    xai: "[xAI]",
    qwen: "[Qwen]",
    ollama: "[Ollama]",
    lmstudio: "[LMStudio]",
    default: "[Provider]",
  },

  // Modes
  mode: {
    vibe: "[Vibe]",
    plan: "[Plan]",
    spec: "[Spec]",
  },

  // Spec phases
  phase: {
    research: "[Research]",
    requirements: "[Reqs]",
    design: "[Design]",
    tasks: "[Tasks]",
    implementation: "[Impl]",
    validation: "[Valid]",
  },

  // Tips/onboarding icons
  tips: {
    hint: "Hint:",
    vibe: "[Vibe]",
    edit: "[Edit]",
    tools: "Tools:",
    target: "[Goal]",
    plan: "[Plan]",
    search: "[Search]",
    rocket: "[Start]",
  },

  // Misc
  current: "*", // Mark current item
  bullet: "-",
  workflow: "[Flow]",
  migrate: "[Migrate]",
  package: "[Pkg]",
  git: "[Git]",
  cwd: "[CWD]",
  checkpoint: "[Ckpt]",
  celebration: "[Done!]",
  reset: "[Reset]",
} as const;

/**
 * Get provider icon text
 */
export function getProviderIcon(provider: string): string {
  const key = provider.toLowerCase() as keyof typeof ICONS.provider;
  return ICONS.provider[key] ?? ICONS.provider.default;
}

/**
 * Get mode icon text
 */
export function getModeIcon(mode: string): string {
  const key = mode.toLowerCase() as keyof typeof ICONS.mode;
  return ICONS.mode[key] ?? `[${mode}]`;
}

/**
 * Get phase icon text
 */
export function getPhaseIcon(phase: string): string {
  const key = phase.toLowerCase() as keyof typeof ICONS.phase;
  return ICONS.phase[key] ?? `[${phase}]`;
}

/**
 * Get file type icon text
 */
export function getFileIcon(type: string): string {
  const key = type.toLowerCase() as keyof typeof ICONS.file;
  return ICONS.file[key] ?? ICONS.file.default;
}

// ============================================
// Skills Integration for AgentLoop
// ============================================
// Encapsulates skills system integration: loading, matching, and prompt building.
// Extracted from AgentLoop to improve modularity and testability.

import { setSkillConfig, setSkillManager } from "../builtin/skill-tool.js";
import type { Logger } from "../logger/logger.js";
import type { SessionMessage } from "../session/index.js";
import { SkillManager, type SkillManagerOptions } from "../skill/manager.js";
import type { MatchContext } from "../skill/matcher.js";
import type { SkillConfig, SkillLoaded } from "../skill/types.js";

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for skills integration.
 */
export interface AgentSkillsIntegrationConfig {
  /** Enable skills integration */
  enabled: boolean;
  /** Working directory for skill discovery */
  cwd?: string;
  /** Skill manager options */
  skillManagerOptions?: SkillManagerOptions;
  /** Skill configuration */
  skillConfig?: SkillConfig;
  /** Provider type for context matching */
  providerType?: string;
  /** Model name for context matching */
  model?: string;
  /** Mode name for context matching */
  modeName?: string;
}

/**
 * Dependencies for skills integration.
 */
export interface AgentSkillsIntegrationDeps {
  /** Logger instance */
  logger?: Logger;
  /** Function to get current message history */
  getMessages: () => SessionMessage[];
}

// ============================================
// Skills Integration Class
// ============================================

/**
 * Manages skills system integration for the agent loop.
 *
 * Responsibilities:
 * - Initialize and manage SkillManager lifecycle
 * - Match skills against current context
 * - Build skill sections for system prompt
 * - Track active skills for the session
 */
export class AgentSkillsIntegration {
  /** SkillManager instance */
  private skillManager?: SkillManager;

  /** Promise that resolves when skillManager initialization completes (race fix) */
  private skillManagerInitPromise?: Promise<void>;

  /** Currently active skills for this session */
  private activeSkills: SkillLoaded[] = [];

  /** Configuration */
  private readonly config: AgentSkillsIntegrationConfig;

  /** Dependencies */
  private readonly deps: AgentSkillsIntegrationDeps;

  constructor(config: AgentSkillsIntegrationConfig, deps: AgentSkillsIntegrationDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Initialize the skills system.
   * Creates and initializes the SkillManager if enabled.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.cwd) {
      return;
    }

    this.skillManager = new SkillManager({
      ...this.config.skillManagerOptions,
      logger: this.deps.logger,
      config: this.config.skillConfig,
      loader: {
        ...this.config.skillManagerOptions?.loader,
        discovery: {
          ...this.config.skillManagerOptions?.loader?.discovery,
          workspacePath: this.config.cwd,
        },
      },
    });

    // Initialize asynchronously - store promise to await before first use (race fix)
    this.skillManagerInitPromise = this.skillManager
      .initialize()
      .then((count) => {
        this.deps.logger?.debug("Skills System initialized", {
          skillCount: count,
        });
        // Wire up skill-tool module
        if (this.skillManager) {
          setSkillManager(this.skillManager);
        }
        if (this.config.skillConfig) {
          setSkillConfig(this.config.skillConfig);
        }
      })
      .catch((error) => {
        this.deps.logger?.warn("Failed to initialize Skills System", { error });
        // Clear manager on failure to avoid partial state
        this.skillManager = undefined;
      });

    // Wait for initialization to complete
    await this.skillManagerInitPromise;
  }

  /**
   * Ensure skill manager is initialized before use.
   * Awaits the init promise if still pending.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.skillManagerInitPromise) {
      await this.skillManagerInitPromise;
    }
  }

  /**
   * Returns the SkillManager instance if enabled.
   */
  getSkillManager(): SkillManager | undefined {
    return this.skillManager;
  }

  /**
   * Returns currently active skills for this session.
   */
  getActiveSkills(): SkillLoaded[] {
    return [...this.activeSkills];
  }

  /**
   * Set active skills directly (used when skills are matched externally).
   */
  setActiveSkills(skills: SkillLoaded[]): void {
    this.activeSkills = skills;
  }

  /**
   * Check if skills integration is ready for use.
   */
  isReady(): boolean {
    return this.skillManager?.isInitialized() ?? false;
  }

  /**
   * Match and load skills for the current context.
   * Updates activeSkills and returns the skill prompt section.
   *
   * @returns Skill prompt section to append to system prompt, or undefined if no skills
   */
  async matchAndBuildPrompt(): Promise<string | undefined> {
    await this.ensureInitialized();

    if (!this.skillManager?.isInitialized()) {
      return undefined;
    }

    try {
      const matchContext = this.buildSkillMatchContext();
      this.activeSkills = await this.skillManager.getActiveSkills(matchContext);

      if (this.activeSkills.length > 0) {
        const skillPrompt = this.skillManager.buildCombinedPrompt(this.activeSkills);
        if (skillPrompt) {
          this.deps.logger?.debug("Added skill sections to system prompt", {
            skillCount: this.activeSkills.length,
            skillNames: this.activeSkills.map((s) => s.name),
          });
          return skillPrompt;
        }
      }
    } catch (error) {
      this.deps.logger?.warn("Failed to match skills", { error });
    }

    return undefined;
  }

  /**
   * Get tool restrictions from active skills.
   * Returns allowed and denied tool lists based on skill compatibility settings.
   */
  getSkillToolRestrictions(): { allowed: string[]; denied: string[] } {
    if (!this.skillManager || this.activeSkills.length === 0) {
      return { allowed: [], denied: [] };
    }

    return this.skillManager.getToolRestrictions(this.activeSkills);
  }

  /**
   * Build match context from current session state.
   * Used to match skills against the current request.
   */
  buildSkillMatchContext(): MatchContext {
    const messages = this.deps.getMessages();

    // Extract the last user message as the request
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

    // Extract text from parts
    const request =
      lastUserMessage?.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? "";

    // Extract file paths from tool results
    const files = this.extractFilePathsFromMessages(messages);

    // Extract slash command if present
    const command = request.startsWith("/") ? request.split(/\s/)[0]?.slice(1) : undefined;

    // Build project context from available config
    const projectContext: Record<string, string> = {};

    // Provider info (e.g., "anthropic", "openai")
    if (this.config.providerType) {
      projectContext.provider = this.config.providerType;
    }

    // Model info (e.g., "claude-3-5-sonnet-20241022")
    if (this.config.model) {
      projectContext.model = this.config.model;
    }

    // Current coding mode (e.g., "code", "plan", "spec")
    if (this.config.modeName) {
      projectContext.mode = this.config.modeName;
    }

    return {
      request,
      files,
      command,
      projectContext: Object.keys(projectContext).length > 0 ? projectContext : undefined,
      mode: this.config.modeName,
    };
  }

  /**
   * Extracts file paths from tool invocations in messages.
   * Used by buildSkillMatchContext to determine files involved in the session.
   */
  private extractFilePathsFromMessages(messages: SessionMessage[]): string[] {
    const files: string[] = [];
    for (const msg of messages) {
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool") {
            const input = part.input as Record<string, unknown>;
            if (input.path && typeof input.path === "string") {
              files.push(input.path);
            }
            if (input.paths && Array.isArray(input.paths)) {
              files.push(...input.paths.filter((p): p is string => typeof p === "string"));
            }
          }
        }
      }
    }
    return files;
  }
}

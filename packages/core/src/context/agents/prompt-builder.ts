// ============================================
// Agents Prompt Builder
// ============================================
// Builds system prompt sections from AgentsConfig.
// Implements REQ-015 (prompt integration).

import type { AgentsConfig, AgentsWarning } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Represents a section of the system prompt built from AgentsConfig.
 */
export interface PromptSection {
  /** The formatted content for this section */
  content: string;
  /** Priority for ordering (higher = earlier in prompt) */
  priority: number;
  /** Source file(s) that contributed to this section */
  source: string;
}

/**
 * Options for building prompt sections.
 */
export interface PromptBuilderOptions {
  /** Include source file attribution in output (default: true) */
  includeSourceAttribution?: boolean;
  /** Include config metadata header (default: true) */
  includeMetadataHeader?: boolean;
  /** Maximum content length per section (0 = unlimited) */
  maxSectionLength?: number;
}

/**
 * Result from prompt building.
 */
export interface PromptBuildResult {
  /** Built sections, sorted by priority (highest first) */
  sections: PromptSection[];
  /** Any warnings during building */
  warnings: AgentsWarning[];
}

// ============================================
// Constants
// ============================================

/** Default priority for main instructions */
const INSTRUCTIONS_PRIORITY = 100;

/** Default priority for metadata header */
const METADATA_PRIORITY = 200;

/** Section header template */
const SECTION_HEADER = "<!-- AGENTS.md Configuration -->";

/** Source attribution template */
const SOURCE_ATTRIBUTION_TEMPLATE = "<!-- Source: {sources} -->";

// ============================================
// AgentsPromptBuilder Class
// ============================================

/**
 * Builds system prompt sections from AgentsConfig.
 *
 * AgentsPromptBuilder transforms merged agents configuration into
 * formatted markdown sections suitable for injection into system prompts.
 * It handles prioritization, source attribution, and graceful handling
 * of empty/null configurations.
 *
 * @example
 * ```typescript
 * const builder = new AgentsPromptBuilder();
 *
 * const config: AgentsConfig = {
 *   name: 'My Project',
 *   instructions: 'Follow these rules...',
 *   sources: ['AGENTS.md', 'child/AGENTS.md'],
 *   priority: 100,
 *   // ...
 * };
 *
 * const sections = builder.buildSystemPromptSections(config);
 * const prompt = builder.formatAsSystemPrompt(sections);
 * ```
 */
export class AgentsPromptBuilder {
  private readonly options: Required<PromptBuilderOptions>;

  /**
   * Creates a new AgentsPromptBuilder.
   *
   * @param options - Builder configuration options
   */
  constructor(options: PromptBuilderOptions = {}) {
    this.options = {
      includeSourceAttribution: options.includeSourceAttribution ?? true,
      includeMetadataHeader: options.includeMetadataHeader ?? true,
      maxSectionLength: options.maxSectionLength ?? 0,
    };
  }

  /**
   * Builds system prompt sections from agents configuration.
   *
   * Extracts relevant parts of the configuration and formats them
   * as prioritized sections for the system prompt.
   *
   * @param config - Merged agents configuration (can be null)
   * @returns Build result with sections and warnings
   *
   * @remarks
   * - Empty/null config returns empty sections array
   * - Sections are sorted by priority (highest first)
   * - Source attribution is optional per builder options
   */
  buildSystemPromptSections(config: AgentsConfig | null): PromptBuildResult {
    const warnings: AgentsWarning[] = [];

    // Handle null/undefined config gracefully
    if (!config) {
      return { sections: [], warnings };
    }

    const sections: PromptSection[] = [];

    // Build metadata header section (highest priority)
    if (this.options.includeMetadataHeader && this.hasMetadata(config)) {
      const metadataSection = this.buildMetadataSection(config);
      if (metadataSection) {
        sections.push(metadataSection);
      }
    }

    // Build main instructions section
    if (config.instructions?.trim()) {
      const instructionsSection = this.buildInstructionsSection(config);
      if (instructionsSection) {
        sections.push(instructionsSection);
      }
    }

    // Sort sections by priority (highest first)
    sections.sort((a, b) => b.priority - a.priority);

    return { sections, warnings };
  }

  /**
   * Formats sections as a single system prompt string.
   *
   * @param sections - Array of prompt sections to format
   * @returns Formatted system prompt string
   *
   * @remarks
   * - Sections are joined with double newlines
   * - Empty sections array returns empty string
   */
  formatAsSystemPrompt(sections: PromptSection[]): string {
    if (!sections || sections.length === 0) {
      return "";
    }

    // Join all section contents with double newlines
    return sections.map((s) => s.content).join("\n\n");
  }

  /**
   * Convenience method to build and format in one call.
   *
   * @param config - Merged agents configuration
   * @returns Formatted system prompt string
   */
  build(config: AgentsConfig | null): string {
    const { sections } = this.buildSystemPromptSections(config);
    return this.formatAsSystemPrompt(sections);
  }

  /**
   * Gets section content strings from config (for simple access).
   *
   * @param config - Merged agents configuration
   * @returns Array of content strings
   */
  getSectionContents(config: AgentsConfig | null): string[] {
    const { sections } = this.buildSystemPromptSections(config);
    return sections.map((s) => s.content);
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Checks if config has meaningful metadata to display.
   */
  private hasMetadata(config: AgentsConfig): boolean {
    return !!(config.name || config.description || config.version);
  }

  /**
   * Builds the metadata header section.
   */
  private buildMetadataSection(config: AgentsConfig): PromptSection | null {
    const parts: string[] = [SECTION_HEADER];

    if (config.name) {
      parts.push(`**Project**: ${config.name}`);
    }

    if (config.description) {
      parts.push(`**Description**: ${config.description}`);
    }

    if (config.version) {
      parts.push(`**Version**: ${config.version}`);
    }

    // Add source attribution if enabled
    if (this.options.includeSourceAttribution && config.sources.length > 0) {
      const sourcesStr = config.sources.join(", ");
      parts.push(SOURCE_ATTRIBUTION_TEMPLATE.replace("{sources}", sourcesStr));
    }

    const content = parts.join("\n");

    return {
      content: this.truncateContent(content),
      priority: METADATA_PRIORITY,
      source: config.sources.join(", ") || "unknown",
    };
  }

  /**
   * Builds the main instructions section.
   */
  private buildInstructionsSection(config: AgentsConfig): PromptSection | null {
    let content = config.instructions.trim();

    if (!content) {
      return null;
    }

    // Add source attribution if enabled and not already in metadata
    if (
      this.options.includeSourceAttribution &&
      !this.options.includeMetadataHeader &&
      config.sources.length > 0
    ) {
      const sourcesStr = config.sources.join(", ");
      content = `${SOURCE_ATTRIBUTION_TEMPLATE.replace("{sources}", sourcesStr)}\n\n${content}`;
    }

    return {
      content: this.truncateContent(content),
      priority: INSTRUCTIONS_PRIORITY,
      source: config.sources.join(", ") || "unknown",
    };
  }

  /**
   * Truncates content if maxSectionLength is set.
   */
  private truncateContent(content: string): string {
    if (this.options.maxSectionLength <= 0) {
      return content;
    }

    if (content.length <= this.options.maxSectionLength) {
      return content;
    }

    // Truncate with ellipsis indicator
    const truncateAt = this.options.maxSectionLength - 20;
    return `${content.slice(0, truncateAt)}\n\n<!-- Content truncated -->`;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates an AgentsPromptBuilder with default options.
 *
 * @returns New AgentsPromptBuilder instance
 */
export function createPromptBuilder(options?: PromptBuilderOptions): AgentsPromptBuilder {
  return new AgentsPromptBuilder(options);
}

/**
 * JSON Schema Generation (T030a)
 *
 * Generates JSON Schema for custom agent definitions.
 * Enables IDE autocompletion and validation support.
 *
 * @module core/agents/custom/schema-generator
 * @see REQ-003
 */

import { z } from "zod";
import { CustomAgentDefinitionSchema } from "./schema.js";

// =============================================================================
// Types
// =============================================================================

/**
 * JSON Schema object type
 */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title: string;
  description: string;
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  definitions?: Record<string, unknown>;
}

/**
 * Options for JSON Schema generation
 */
export interface GenerateSchemaOptions {
  /** Schema ID URL */
  id?: string;
  /** Schema title */
  title?: string;
  /** Schema description */
  description?: string;
  /** Include $schema reference */
  includeSchemaRef?: boolean;
}

// =============================================================================
// Schema Generation
// =============================================================================

/**
 * Generate JSON Schema from the Zod schema.
 *
 * This schema can be used for:
 * - IDE autocompletion in YAML/JSON files
 * - Pre-validation before loading agents
 * - API documentation
 *
 * @param options - Generation options
 * @returns Valid JSON Schema object
 *
 * @example
 * ```typescript
 * import { generateJsonSchema } from "@vellum/core";
 *
 * // Generate schema
 * const schema = generateJsonSchema();
 *
 * // Save to file for IDE support
 * fs.writeFileSync("agent-schema.json", JSON.stringify(schema, null, 2));
 *
 * // Configure VS Code for YAML validation:
 * // settings.json:
 * // {
 * //   "yaml.schemas": {
 * //     "./agent-schema.json": ".vellum/agents/*.yaml"
 * //   }
 * // }
 * ```
 */
export function generateJsonSchema(options: GenerateSchemaOptions = {}): JsonSchema {
  const {
    id = "https://vellum.dev/schemas/custom-agent.json",
    title = "Custom Agent Definition",
    description = "Schema for Vellum custom agent definition files",
    includeSchemaRef = true,
  } = options;

  // Convert Zod schema to JSON Schema using native Zod v4 function
  const result = z.toJSONSchema(CustomAgentDefinitionSchema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });

  // Build the final schema
  const schema: JsonSchema = {
    ...(includeSchemaRef && { $schema: "http://json-schema.org/draft-07/schema#" }),
    $id: id,
    title,
    description,
    type: (result.type as string) ?? "object",
    properties: (result.properties ?? {}) as Record<string, unknown>,
  };

  // Copy over required if present
  if (result.required) {
    schema.required = result.required as string[];
  }

  // Add helpful metadata
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    enhanceSchemaProperties(schema.properties as Record<string, SchemaProperty>);
  }

  return schema;
}

// =============================================================================
// Schema Enhancement
// =============================================================================

interface SchemaProperty {
  description?: string;
  type?: string;
  examples?: unknown[];
  default?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

/**
 * Enhance schema properties with examples and better descriptions
 */
function enhanceSchemaProperties(properties: Record<string, SchemaProperty>): void {
  const enhancements: Record<string, Partial<SchemaProperty>> = {
    slug: {
      description: "Unique identifier for the agent. Must be lowercase alphanumeric with hyphens.",
      examples: ["my-agent", "code-reviewer", "test-writer"],
      pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$",
    },
    name: {
      description: "Human-readable display name for the agent.",
      examples: ["My Custom Agent", "Code Reviewer", "Test Writer"],
    },
    mode: {
      description: "Base mode that defines core behavior.",
      examples: ["code", "plan", "draft", "debug", "ask"],
      enum: ["code", "plan", "draft", "debug", "ask"],
    },
    extends: {
      description: "Parent agent slug to inherit configuration from.",
      examples: ["coder", "security-reviewer"],
    },
    description: {
      description: "Brief description of the agent's purpose (max 500 characters).",
      examples: ["Specialized agent for writing and reviewing tests"],
    },
    icon: {
      description: "Emoji or icon identifier for UI display.",
      examples: ["🤖", "🧪", "🔒", "📝"],
    },
    color: {
      description: "Hex color code for UI theming.",
      examples: ["#3b82f6", "#22c55e", "#dc2626"],
      pattern: "^#[0-9a-fA-F]{6}$",
    },
    version: {
      description: "Semantic version for tracking agent changes.",
      examples: ["1.0.0", "2.1.0"],
      pattern: "^\\d+\\.\\d+\\.\\d+$",
    },
    author: {
      description: "Creator or maintainer identifier.",
      examples: ["user", "team-name", "org/user"],
    },
    tags: {
      description: "Categorization tags for organization and filtering.",
      examples: [
        ["testing", "qa"],
        ["frontend", "react"],
      ],
    },
    hidden: {
      description: "Whether to hide this agent from listings.",
      default: false,
    },
    systemPrompt: {
      description:
        "Custom system prompt that defines the agent's personality and instructions. In Markdown files, this is the body content after the frontmatter.",
    },
  };

  // Apply enhancements
  for (const [key, value] of Object.entries(enhancements)) {
    if (properties[key]) {
      Object.assign(properties[key], value);
    }
  }
}

/**
 * Generate a minimal schema for frontmatter-only validation
 */
export function generateFrontmatterSchema(): JsonSchema {
  return generateJsonSchema({
    id: "https://vellum.dev/schemas/agent-frontmatter.json",
    title: "Agent Frontmatter",
    description: "Schema for the YAML frontmatter section of agent definition files",
  });
}

/**
 * Export schema to string
 */
export function schemaToString(schema: JsonSchema, pretty = true): string {
  return pretty ? JSON.stringify(schema, null, 2) : JSON.stringify(schema);
}

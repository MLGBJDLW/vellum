/**
 * Config Parser Module
 * Handles parsing and validation of AGENTS.md configuration files
 *
 * @module config-parser
 */

// Frontmatter Parser
export {
  FrontmatterParser,
  type FrontmatterParserOptions,
  type ParseResult,
  type ParseResultFailure,
  type ParseResultSuccess,
} from "./frontmatter-parser.js";
// All schemas
export * from "./schemas/index.js";

// Schema Registry
export {
  type CreateParserOptions,
  schemaRegistry,
  type ValidationResult,
  ZodSchemaRegistry,
} from "./zod-schema-registry.js";

// =============================================================================
// JSON Schema Sanitizer for Provider Compatibility
// =============================================================================

/**
 * JSON Schema type for sanitization operations
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Provider-specific sanitization options
 */
export interface SanitizeOptions {
  /**
   * Target provider for optimization.
   * Different providers support different subsets of JSON Schema.
   */
  provider?: "google" | "anthropic" | "openai";
}

// =============================================================================
// Fields unsupported by different providers
// =============================================================================

/**
 * Fields to completely remove (cannot be converted)
 */
const GEMINI_UNSUPPORTED_FIELDS = new Set([
  // JSON Schema meta fields
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",

  // Property constraints not supported
  "propertyNames",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "additionalItems",

  // Conditional schemas not supported
  "if",
  "then",
  "else",
  "not",

  // Content encoding not supported
  "contentEncoding",
  "contentMediaType",
  "contentSchema",

  // Annotation keywords not needed for API
  "$comment",
  "examples",
  "default", // Gemini doesn't use default values

  // Draft-2019/2020 keywords
  "$anchor",
  "$dynamicAnchor",
  "$dynamicRef",
  "$vocabulary",
  "deprecated",

  // Other unsupported keywords
  "readOnly",
  "writeOnly",
  "const", // Use enum with single value instead
]);

/**
 * Fields to convert rather than strip
 */
const GEMINI_CONVERTIBLE_FIELDS = new Set(["exclusiveMinimum", "exclusiveMaximum"]);

// =============================================================================
// Main Sanitizer Function
// =============================================================================

/**
 * Sanitizes JSON Schema to be compatible with Gemini API
 *
 * Removes unsupported fields and converts advanced constraints to simpler forms:
 * - `exclusiveMinimum: n` → `minimum: n` (slightly less precise but compatible)
 * - `exclusiveMaximum: n` → `maximum: n`
 * - Strips all meta fields, conditional schemas, etc.
 *
 * @param schema - The JSON Schema to sanitize
 * @param options - Optional sanitization options
 * @returns A new sanitized schema (original is not modified)
 *
 * @example
 * ```typescript
 * const originalSchema = {
 *   type: "object",
 *   properties: {
 *     age: { type: "number", exclusiveMinimum: 0 }
 *   },
 *   $schema: "https://json-schema.org/draft/2020-12/schema"
 * };
 *
 * const sanitized = sanitizeJsonSchemaForGemini(originalSchema);
 * // Result:
 * // {
 * //   type: "object",
 * //   properties: {
 * //     age: { type: "number", minimum: 0 }
 * //   }
 * // }
 * ```
 */
export function sanitizeJsonSchemaForGemini(
  schema: JsonSchema,
  options?: SanitizeOptions
): JsonSchema {
  // Handle null/undefined
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // Don't modify arrays at the top level (shouldn't happen but be safe)
  if (Array.isArray(schema)) {
    return schema.map((item) =>
      typeof item === "object" && item !== null
        ? sanitizeJsonSchemaForGemini(item as JsonSchema, options)
        : item
    ) as unknown as JsonSchema;
  }

  // Deep clone and sanitize
  return sanitizeSchemaObject(schema, options);
}

/**
 * Recursively sanitize a schema object
 */
function sanitizeSchemaObject(schema: JsonSchema, options?: SanitizeOptions): JsonSchema {
  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported fields entirely
    if (GEMINI_UNSUPPORTED_FIELDS.has(key)) {
      continue;
    }

    // Handle convertible fields
    if (GEMINI_CONVERTIBLE_FIELDS.has(key)) {
      handleConvertibleField(result, key, value);
      continue;
    }

    // Handle composition keywords (anyOf, oneOf, allOf)
    // Keep simple cases, warn about complex ones
    if (key === "anyOf" || key === "oneOf" || key === "allOf") {
      result[key] = sanitizeCompositionArray(value, options);
      continue;
    }

    // Recursively handle nested schemas
    if (isNestedSchemaField(key)) {
      result[key] = sanitizeNestedSchema(key, value, options);
      continue;
    }

    // Pass through other values
    result[key] = value;
  }

  return result;
}

/**
 * Handle fields that can be converted to compatible alternatives
 */
function handleConvertibleField(result: JsonSchema, key: string, value: unknown): void {
  switch (key) {
    case "exclusiveMinimum":
      // Convert exclusiveMinimum to minimum
      // Note: This is slightly less precise (>n becomes >=n)
      // but maintains API compatibility
      if (typeof value === "number" && !("minimum" in result)) {
        result.minimum = value;
      }
      break;

    case "exclusiveMaximum":
      // Convert exclusiveMaximum to maximum
      if (typeof value === "number" && !("maximum" in result)) {
        result.maximum = value;
      }
      break;
  }
}

/**
 * Check if a field contains nested schemas that need sanitization
 */
function isNestedSchemaField(key: string): boolean {
  return [
    "properties",
    "additionalProperties",
    "items",
    "prefixItems",
    "contains",
    "propertyNames",
  ].includes(key);
}

/**
 * Sanitize an object of schemas (like "properties")
 */
function sanitizePropertiesObject(value: unknown, options?: SanitizeOptions): JsonSchema {
  const props: JsonSchema = {};
  for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
    if (typeof propSchema === "object" && propSchema !== null) {
      props[propName] = sanitizeJsonSchemaForGemini(propSchema as JsonSchema, options);
    } else {
      props[propName] = propSchema;
    }
  }
  return props;
}

/**
 * Sanitize an array of schemas
 */
function sanitizeSchemaArray(value: unknown[], options?: SanitizeOptions): unknown[] {
  return value.map((item) =>
    typeof item === "object" && item !== null
      ? sanitizeJsonSchemaForGemini(item as JsonSchema, options)
      : item
  );
}

/**
 * Sanitize a single schema value
 */
function sanitizeSingleSchema(value: unknown, options?: SanitizeOptions): unknown {
  if (typeof value === "object" && value !== null) {
    return sanitizeJsonSchemaForGemini(value as JsonSchema, options);
  }
  return value;
}

/**
 * Sanitize nested schema structures
 */
function sanitizeNestedSchema(key: string, value: unknown, options?: SanitizeOptions): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  switch (key) {
    case "properties":
      // properties is an object of schemas
      if (typeof value === "object" && !Array.isArray(value)) {
        return sanitizePropertiesObject(value, options);
      }
      return value;

    case "additionalProperties":
      // Can be boolean or schema
      return sanitizeSingleSchema(value, options);

    case "items":
      // items can be a single schema or array of schemas
      if (Array.isArray(value)) {
        return sanitizeSchemaArray(value, options);
      }
      return sanitizeSingleSchema(value, options);

    case "prefixItems":
    case "contains":
      // Array of schemas or single schema
      if (Array.isArray(value)) {
        return sanitizeSchemaArray(value, options);
      }
      return sanitizeSingleSchema(value, options);

    default:
      return value;
  }
}

/**
 * Sanitize composition arrays (anyOf, oneOf, allOf)
 */
function sanitizeCompositionArray(value: unknown, options?: SanitizeOptions): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((schema) => {
    if (typeof schema === "object" && schema !== null) {
      return sanitizeJsonSchemaForGemini(schema as JsonSchema, options);
    }
    return schema;
  });
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Generic sanitizer that routes to provider-specific implementation
 *
 * @param schema - The JSON Schema to sanitize
 * @param provider - Target provider
 * @returns Sanitized schema
 */
export function sanitizeJsonSchema(
  schema: JsonSchema,
  provider: "google" | "anthropic" | "openai"
): JsonSchema {
  switch (provider) {
    case "google":
      return sanitizeJsonSchemaForGemini(schema, { provider });

    case "anthropic":
    case "openai":
      // Anthropic and OpenAI have better JSON Schema support
      // For now, just strip meta fields
      return stripMetaFields(schema);

    default:
      return schema;
  }
}

/**
 * Meta fields to strip from JSON Schema for provider compatibility.
 * These fields are safe to remove for all providers:
 * - $schema: JSON Schema version declaration
 * - $id: Schema identifier
 * - $comment: Comments
 * - $defs / definitions: Definition references (when not using $ref)
 * - examples: Example values (not used by any provider for validation)
 * - default: Default values (providers handle differently)
 */
const BASIC_META_FIELDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "definitions",
  "examples",
  "default",
]);

/**
 * Basic sanitization - strips JSON Schema meta fields.
 * Safe for all providers (Anthropic, OpenAI, etc.)
 *
 * @param schema - The JSON Schema to sanitize
 * @returns A new sanitized schema (original is not modified)
 *
 * @example
 * ```typescript
 * const originalSchema = {
 *   type: "object",
 *   $schema: "https://json-schema.org/draft/2020-12/schema",
 *   properties: {
 *     name: { type: "string", default: "" }
 *   },
 *   examples: [{ name: "test" }]
 * };
 *
 * const sanitized = stripSchemaMetaFields(originalSchema);
 * // Result:
 * // {
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string" }
 * //   }
 * // }
 * ```
 */
export function stripSchemaMetaFields(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  return stripMetaFieldsRecursive(schema);
}

/**
 * Strip meta fields from a properties object
 * @internal
 */
function stripMetaFieldsFromProperties(value: unknown): JsonSchema {
  const props: JsonSchema = {};
  for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
    if (typeof propSchema === "object" && propSchema !== null) {
      props[propName] = stripMetaFieldsRecursive(propSchema as JsonSchema);
    } else {
      props[propName] = propSchema;
    }
  }
  return props;
}

/**
 * Strip meta fields from an array of schemas
 * @internal
 */
function stripMetaFieldsFromArray(value: unknown[]): unknown[] {
  return value.map((item) =>
    typeof item === "object" && item !== null ? stripMetaFieldsRecursive(item as JsonSchema) : item
  );
}

/**
 * Strip only meta fields ($schema, $id, etc.) for providers with better support
 * @internal
 */
function stripMetaFieldsRecursive(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    if (BASIC_META_FIELDS.has(key)) {
      continue;
    }

    result[key] = processMetaFieldValue(key, value);
  }

  return result;
}

/**
 * Process a value based on its field key for meta field stripping.
 * @internal
 */
function processMetaFieldValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Properties object
  if (key === "properties" && typeof value === "object" && !Array.isArray(value)) {
    return stripMetaFieldsFromProperties(value);
  }

  // Items can be array or single schema
  if (key === "items" && typeof value === "object") {
    return Array.isArray(value)
      ? stripMetaFieldsFromArray(value)
      : stripMetaFieldsRecursive(value as JsonSchema);
  }

  // Single nested schemas
  if ((key === "additionalProperties" || key === "contains") && typeof value === "object") {
    return stripMetaFieldsRecursive(value as JsonSchema);
  }

  // Composition arrays
  if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
    return stripMetaFieldsFromArray(value);
  }

  return value;
}

/**
 * @deprecated Use stripSchemaMetaFields instead
 */
function stripMetaFields(schema: JsonSchema): JsonSchema {
  return stripSchemaMetaFields(schema);
}

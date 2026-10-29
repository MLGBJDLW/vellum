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

  // Normalize legacy OpenAPI input and resolve local references before the
  // Gemini subset removes definition containers. Never erase a live reference.
  const normalized = stripSchemaMetaFields(schema);
  return sanitizeSchemaObject(resolveLocalReferences(normalized), options);
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

  // Apply bounds after all fields so insertion order cannot weaken a constraint.
  handleConvertibleField(result, "exclusiveMinimum", schema.exclusiveMinimum);
  handleConvertibleField(result, "exclusiveMaximum", schema.exclusiveMaximum);
  if ("const" in schema) {
    result.enum = [schema.const];
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
      if (typeof value === "number") {
        const bound = result.type === "integer" ? Math.floor(value) + 1 : value;
        result.minimum =
          typeof result.minimum === "number" ? Math.max(result.minimum, bound) : bound;
      }
      break;

    case "exclusiveMaximum":
      // Convert exclusiveMaximum to maximum
      if (typeof value === "number") {
        const bound = result.type === "integer" ? Math.ceil(value) - 1 : value;
        result.maximum =
          typeof result.maximum === "number" ? Math.min(result.maximum, bound) : bound;
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
 * - $comment: Comments
 * - examples: Example values (not used by any provider for validation)
 * - default: Default values (providers handle differently)
 */
// $id is not an annotation: it defines the base URI for relative references.
const BASIC_META_FIELDS = new Set(["$schema", "$comment", "examples", "default"]);

/**
 * Normalize legacy OpenAPI bounds/nullability and strip annotations.
 * Keep definition containers: removing them leaves dangling MCP $ref values.
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

  return normalizeTupleSchemas(stripMetaFieldsRecursive(schema));
}

/**
 * Strip meta fields from a properties object
 * @internal
 */
function stripMetaFieldsFromProperties(value: unknown): JsonSchema {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([name, child]) => [
      name,
      typeof child === "object" && child !== null
        ? stripMetaFieldsRecursive(child as JsonSchema)
        : child,
    ])
  );
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
 * Strip annotations while preserving reference scopes for JSON Schema transports.
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

  for (const [exclusive, inclusive] of [
    ["exclusiveMinimum", "minimum"],
    ["exclusiveMaximum", "maximum"],
  ] as const) {
    if (typeof result[exclusive] === "boolean") {
      if (result[exclusive] && typeof result[inclusive] === "number") {
        result[exclusive] = result[inclusive];
        delete result[inclusive];
      } else {
        delete result[exclusive];
      }
    }
  }
  if ("nullable" in result) {
    const nullable = result.nullable === true;
    delete result.nullable;
    if (nullable && typeof result.type === "string" && result.type !== "null") {
      // Extend the type in place so local JSON pointers keep their targets.
      result.type = [result.type, "null"];
    } else if (nullable && Array.isArray(result.type) && !result.type.includes("null")) {
      result.type = [...result.type, "null"];
    }
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
  if (SCHEMA_MAP_FIELDS.has(key) && typeof value === "object" && !Array.isArray(value)) {
    return stripMetaFieldsFromProperties(value);
  }

  // Items can be array or single schema
  if ((key === "items" || key === "prefixItems") && typeof value === "object") {
    return Array.isArray(value)
      ? stripMetaFieldsFromArray(value)
      : stripMetaFieldsRecursive(value as JsonSchema);
  }

  // Single nested schemas
  if (SINGLE_SCHEMA_FIELDS.has(key) && typeof value === "object") {
    return stripMetaFieldsRecursive(value as JsonSchema);
  }

  // Composition arrays
  if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
    return stripMetaFieldsFromArray(value);
  }

  return value;
}

// Traverse schema-bearing fields only. User keys and enum/const values are data.
const SCHEMA_MAP_FIELDS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);
const SINGLE_SCHEMA_FIELDS = new Set([
  "additionalProperties",
  "additionalItems",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contentSchema",
]);
const SCHEMA_ARRAY_FIELDS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);

/**
 * All JSON Schema transports require schema-valued items, not draft-7 tuple
 * arrays. Preserve tuple constraints and references when their locations move.
 * Each nested $id establishes a resource scope for relative JSON pointers.
 */
function normalizeTupleSchemas(schema: JsonSchema): JsonSchema {
  interface Scope {
    uri: string;
    moves: [string, string][];
  }
  interface Location {
    scope: Scope;
    from: string;
    to: string;
  }
  const root: Scope = { uri: "https://vellum.invalid/schema-root.json", moves: [] };
  const resources = new Map<string, Scope>([[root.uri, root]]);
  const references: { node: JsonSchema; key: string; base: string; scope: Scope }[] = [];
  const pointerKey = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

  function visit(value: unknown, locations: Location[], base: string, isRoot = false): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const source = value as JsonSchema;
    if (typeof source.$id === "string") {
      try {
        const id = new URL(source.$id, base);
        base = id.href;
        if (!id.hash) {
          const scope: Scope = isRoot ? root : { uri: id.href, moves: [] };
          scope.uri = id.href;
          resources.set(id.href, scope);
          if (!isRoot) locations = [...locations, { scope, from: "#", to: "#" }];
        }
      } catch {
        /* Keep invalid IDs untouched for the provider to validate. */
      }
    }
    const current = locations[locations.length - 1];
    if (!current) return value;
    const result: JsonSchema = {};
    const tuple = Array.isArray(source.items);
    for (const [key, child] of Object.entries(source)) {
      const targetKey =
        tuple && key === "items"
          ? "prefixItems"
          : tuple && key === "additionalItems"
            ? "items"
            : key;
      const children = locations.map(({ scope, from, to }) => {
        const next = {
          scope,
          from: `${from}/${pointerKey(key)}`,
          to: `${to}/${pointerKey(targetKey)}`,
        };
        if (targetKey !== key) scope.moves.push([next.from, next.to]);
        return next;
      });
      if (
        SCHEMA_MAP_FIELDS.has(key) &&
        child &&
        typeof child === "object" &&
        !Array.isArray(child)
      ) {
        result[targetKey] = Object.fromEntries(
          Object.entries(child).map(([name, item]) => [
            name,
            visit(
              item,
              children.map(({ scope, from, to }) => ({
                scope,
                from: `${from}/${pointerKey(name)}`,
                to: `${to}/${pointerKey(name)}`,
              })),
              base
            ),
          ])
        );
      } else if ((SCHEMA_ARRAY_FIELDS.has(key) || key === "items") && Array.isArray(child)) {
        result[targetKey] = child.map((item, index) =>
          visit(
            item,
            children.map(({ scope, from, to }) => ({
              scope,
              from: `${from}/${index}`,
              to: `${to}/${index}`,
            })),
            base
          )
        );
      } else if (SINGLE_SCHEMA_FIELDS.has(key) || key === "items") {
        result[targetKey] = visit(child, children, base);
      } else {
        // enum/const values and property names are data, never schema keywords.
        result[targetKey] = child;
      }
    }
    for (const key of ["$ref", "$dynamicRef", "$recursiveRef"]) {
      if (typeof result[key] === "string")
        references.push({ node: result, key, base, scope: current.scope });
    }
    return result;
  }

  const result = visit(schema, [{ scope: root, from: "#", to: "#" }], root.uri, true) as JsonSchema;
  for (const scope of new Set(resources.values()))
    scope.moves.sort(([left], [right]) => right.length - left.length);
  for (const reference of references) {
    const ref = reference.node[reference.key] as string;
    const hash = ref.indexOf("#");
    if (hash < 0) continue;
    let target: URL;
    let pointer: string;
    try {
      target = new URL(ref, reference.base);
      pointer = `#${decodeURIComponent(target.hash.slice(1))}`;
    } catch {
      continue;
    }
    if (!pointer.startsWith("#/")) continue;
    target.hash = "";
    const scope = ref.startsWith("#") ? reference.scope : resources.get(target.href);
    const moved = scope?.moves.find(([from]) => pointer === from || pointer.startsWith(`${from}/`));
    if (moved)
      reference.node[reference.key] =
        `${ref.slice(0, hash)}${encodeURI(`${moved[1]}${pointer.slice(moved[0].length)}`)}`;
  }
  return result;
}

/** Gemini's Schema transport cannot carry recursive/external JSON references. */
function resolveLocalReferences(root: JsonSchema): JsonSchema {
  let visited = 0;
  function visit(value: unknown, active: Set<string>): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    if (++visited > 10000)
      throw new Error("Tool schema reference expansion exceeds the Gemini limit");
    const schema = value as JsonSchema;
    if (typeof schema.$ref === "string") {
      const ref = schema.$ref;
      if (active.has(ref))
        throw new Error(`Recursive tool schema reference is unsupported by Gemini: ${ref}`);
      if (ref !== "#" && !ref.startsWith("#/")) {
        throw new Error(`External tool schema reference is unsupported by Gemini: ${ref}`);
      }
      let target: unknown = root;
      for (const segment of ref === "#" ? [] : ref.slice(2).split("/")) {
        const key = decodeURIComponent(segment).replace(/~1/g, "/").replace(/~0/g, "~");
        if (!target || typeof target !== "object" || !Object.hasOwn(target, key)) {
          throw new Error(`Unresolved tool schema reference: ${ref}`);
        }
        target = (target as JsonSchema)[key];
      }
      const next = new Set(active).add(ref);
      const { $ref: _ref, $defs: _defs, definitions: _definitions, ...siblings } = schema;
      const resolved = visit(target, next) as JsonSchema;
      if (Object.keys(siblings).length === 0) return resolved;
      // Preserve intersection semantics when references have validation siblings.
      return { allOf: [resolved, visit(siblings, active)] };
    }
    return Object.fromEntries(
      Object.entries(schema).map(([key, child]) => {
        if (key === "$defs" || key === "definitions") return [key, child];
        if (SCHEMA_MAP_FIELDS.has(key) && child && typeof child === "object") {
          return [
            key,
            Object.fromEntries(
              Object.entries(child).map(([name, item]) => [name, visit(item, active)])
            ),
          ];
        }
        if (SINGLE_SCHEMA_FIELDS.has(key) || key === "items") {
          return [
            key,
            Array.isArray(child) ? child.map((item) => visit(item, active)) : visit(child, active),
          ];
        }
        if (SCHEMA_ARRAY_FIELDS.has(key) && Array.isArray(child))
          return [key, child.map((item) => visit(item, active))];
        return [key, child];
      })
    );
  }
  return visit(root, new Set()) as JsonSchema;
}

/**
 * @deprecated Use stripSchemaMetaFields instead
 */
function stripMetaFields(schema: JsonSchema): JsonSchema {
  return stripSchemaMetaFields(schema);
}

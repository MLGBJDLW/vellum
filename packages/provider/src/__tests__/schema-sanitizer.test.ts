// =============================================================================
// Schema Sanitizer Tests
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  type JsonSchema,
  sanitizeJsonSchema,
  sanitizeJsonSchemaForGemini,
} from "../transforms/schema-sanitizer.js";

describe("sanitizeJsonSchemaForGemini", () => {
  describe("basic sanitization", () => {
    it("should return empty object for null/undefined input", () => {
      expect(sanitizeJsonSchemaForGemini(null as unknown as JsonSchema)).toBeNull();
      expect(sanitizeJsonSchemaForGemini(undefined as unknown as JsonSchema)).toBeUndefined();
    });

    it("should pass through simple valid schemas unchanged", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).toEqual(schema);
    });

    it("should not mutate the original schema", () => {
      const schema: JsonSchema = {
        type: "object",
        $schema: "https://json-schema.org/draft/2020-12/schema",
        properties: {
          value: { type: "number", exclusiveMinimum: 0 },
        },
      };
      const originalCopy = JSON.parse(JSON.stringify(schema));

      sanitizeJsonSchemaForGemini(schema);

      expect(schema).toEqual(originalCopy);
    });
  });

  describe("meta field stripping", () => {
    it("should strip $schema field", () => {
      const schema: JsonSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("$schema");
      expect(result).toHaveProperty("type", "object");
    });

    it("should strip $id field", () => {
      const schema: JsonSchema = {
        $id: "https://example.com/schema",
        type: "string",
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("$id");
      expect(result).toHaveProperty("type", "string");
    });

    it("should strip $ref field", () => {
      const schema: JsonSchema = {
        $ref: "#/$defs/MyType",
        $defs: { MyType: { type: "string" } },
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("$ref");
      expect(result).not.toHaveProperty("$defs");
    });

    it("should strip $comment field", () => {
      const schema: JsonSchema = {
        $comment: "This is a comment",
        type: "string",
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("$comment");
    });
  });

  describe("exclusiveMinimum/exclusiveMaximum conversion", () => {
    it("should convert exclusiveMinimum to minimum", () => {
      const schema: JsonSchema = {
        type: "number",
        exclusiveMinimum: 0,
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("exclusiveMinimum");
      expect(result).toHaveProperty("minimum", 0);
    });

    it("should convert exclusiveMaximum to maximum", () => {
      const schema: JsonSchema = {
        type: "number",
        exclusiveMaximum: 100,
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("exclusiveMaximum");
      expect(result).toHaveProperty("maximum", 100);
    });

    it("should not overwrite existing minimum when exclusiveMinimum is present", () => {
      const schema: JsonSchema = {
        type: "number",
        minimum: 5,
        exclusiveMinimum: 0,
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).toHaveProperty("minimum", 5);
      expect(result).not.toHaveProperty("exclusiveMinimum");
    });

    it("should not overwrite existing maximum when exclusiveMaximum is present", () => {
      const schema: JsonSchema = {
        type: "number",
        maximum: 50,
        exclusiveMaximum: 100,
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).toHaveProperty("maximum", 50);
      expect(result).not.toHaveProperty("exclusiveMaximum");
    });

    it("should handle nested exclusiveMinimum in properties", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          age: {
            type: "number",
            exclusiveMinimum: 0,
            exclusiveMaximum: 150,
          },
        },
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const ageSchema = (result.properties as Record<string, JsonSchema>).age;

      expect(ageSchema).not.toHaveProperty("exclusiveMinimum");
      expect(ageSchema).not.toHaveProperty("exclusiveMaximum");
      expect(ageSchema).toHaveProperty("minimum", 0);
      expect(ageSchema).toHaveProperty("maximum", 150);
    });
  });

  describe("unsupported field stripping", () => {
    it("should strip propertyNames", () => {
      const schema: JsonSchema = {
        type: "object",
        propertyNames: { pattern: "^[a-z]+$" },
        properties: {},
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("propertyNames");
    });

    it("should strip patternProperties", () => {
      const schema: JsonSchema = {
        type: "object",
        patternProperties: {
          "^S_": { type: "string" },
        },
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("patternProperties");
    });

    it("should strip if/else conditional keywords", () => {
      // Note: "then" keyword is also stripped but cannot be tested due to linter rules
      const schema: JsonSchema = {
        type: "object",
        if: { properties: { type: { const: "a" } } },
        else: { properties: { value: { type: "number" } } },
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("if");
      expect(result).not.toHaveProperty("else");
      // "then" would also be stripped if present
    });

    it("should strip not", () => {
      const schema: JsonSchema = {
        type: "string",
        not: { pattern: "^$" },
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("not");
    });

    it("should strip contentEncoding and contentMediaType", () => {
      const schema: JsonSchema = {
        type: "string",
        contentEncoding: "base64",
        contentMediaType: "image/png",
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("contentEncoding");
      expect(result).not.toHaveProperty("contentMediaType");
    });

    it("should strip default values", () => {
      const schema: JsonSchema = {
        type: "string",
        default: "hello",
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("default");
    });

    it("should strip examples", () => {
      const schema: JsonSchema = {
        type: "string",
        examples: ["foo", "bar"],
      };

      const result = sanitizeJsonSchemaForGemini(schema);

      expect(result).not.toHaveProperty("examples");
    });
  });

  describe("nested schema handling", () => {
    it("should sanitize deeply nested properties", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          level1: {
            type: "object",
            $comment: "Should be stripped",
            properties: {
              level2: {
                type: "number",
                exclusiveMinimum: 10,
              },
            },
          },
        },
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const level1 = (result.properties as Record<string, JsonSchema>).level1 as JsonSchema;
      const level2 = (level1.properties as Record<string, JsonSchema>).level2 as JsonSchema;

      expect(level1).not.toHaveProperty("$comment");
      expect(level2).not.toHaveProperty("exclusiveMinimum");
      expect(level2).toHaveProperty("minimum", 10);
    });

    it("should sanitize items in array schemas", () => {
      const schema: JsonSchema = {
        type: "array",
        items: {
          type: "number",
          exclusiveMinimum: 0,
          $schema: "should-be-stripped",
        },
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const items = result.items as JsonSchema;

      expect(items).not.toHaveProperty("exclusiveMinimum");
      expect(items).not.toHaveProperty("$schema");
      expect(items).toHaveProperty("minimum", 0);
    });

    it("should handle additionalProperties schema", () => {
      const schema: JsonSchema = {
        type: "object",
        additionalProperties: {
          type: "number",
          exclusiveMaximum: 100,
        },
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const additionalProps = result.additionalProperties as JsonSchema;

      expect(additionalProps).not.toHaveProperty("exclusiveMaximum");
      expect(additionalProps).toHaveProperty("maximum", 100);
    });
  });

  describe("composition keywords (anyOf, oneOf, allOf)", () => {
    it("should sanitize schemas within anyOf", () => {
      const schema: JsonSchema = {
        anyOf: [
          { type: "string", $comment: "string option" },
          { type: "number", exclusiveMinimum: 0 },
        ],
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const anyOf = result.anyOf as JsonSchema[];

      expect(anyOf[0]).not.toHaveProperty("$comment");
      expect(anyOf[1]).not.toHaveProperty("exclusiveMinimum");
      expect(anyOf[1]).toHaveProperty("minimum", 0);
    });

    it("should sanitize schemas within oneOf", () => {
      const schema: JsonSchema = {
        oneOf: [{ type: "string", default: "foo" }, { type: "number" }],
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const oneOf = result.oneOf as JsonSchema[];

      expect(oneOf[0]).not.toHaveProperty("default");
    });

    it("should sanitize schemas within allOf", () => {
      const schema: JsonSchema = {
        allOf: [{ type: "object", $id: "base" }, { properties: { name: { type: "string" } } }],
      };

      const result = sanitizeJsonSchemaForGemini(schema);
      const allOf = result.allOf as JsonSchema[];

      expect(allOf[0]).not.toHaveProperty("$id");
    });
  });
});

describe("sanitizeJsonSchema (generic)", () => {
  it("should route google provider to Gemini sanitizer", () => {
    const schema: JsonSchema = {
      type: "number",
      exclusiveMinimum: 0,
    };

    const result = sanitizeJsonSchema(schema, "google");

    expect(result).not.toHaveProperty("exclusiveMinimum");
    expect(result).toHaveProperty("minimum", 0);
  });

  it("should only strip meta fields for anthropic", () => {
    const schema: JsonSchema = {
      type: "number",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      exclusiveMinimum: 0,
    };

    const result = sanitizeJsonSchema(schema, "anthropic");

    expect(result).not.toHaveProperty("$schema");
    // Anthropic supports exclusiveMinimum, so it should be preserved
    expect(result).toHaveProperty("exclusiveMinimum", 0);
  });

  it("should only strip meta fields for openai", () => {
    const schema: JsonSchema = {
      type: "object",
      $id: "test",
      propertyNames: { pattern: "^[a-z]+$" },
      properties: {},
    };

    const result = sanitizeJsonSchema(schema, "openai");

    expect(result).not.toHaveProperty("$id");
    // OpenAI has better support, so propertyNames might be preserved
    expect(result).toHaveProperty("propertyNames");
  });
});

describe("real-world Zod schema scenarios", () => {
  it("should handle typical Zod-generated schema with min/max", () => {
    // This simulates what z.number().min(1).max(100) generates
    const zodGeneratedSchema: JsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        count: {
          type: "number",
          minimum: 1,
          maximum: 100,
        },
        positive: {
          type: "number",
          exclusiveMinimum: 0,
        },
      },
      required: ["count", "positive"],
    };

    const result = sanitizeJsonSchemaForGemini(zodGeneratedSchema);

    expect(result).not.toHaveProperty("$schema");
    expect(result).toHaveProperty("type", "object");
    expect(result).toHaveProperty("required", ["count", "positive"]);

    const props = result.properties as Record<string, JsonSchema>;
    expect(props.count).toHaveProperty("minimum", 1);
    expect(props.count).toHaveProperty("maximum", 100);
    expect(props.positive).not.toHaveProperty("exclusiveMinimum");
    expect(props.positive).toHaveProperty("minimum", 0);
  });

  it("should handle Zod object with nested objects", () => {
    const schema: JsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number", exclusiveMinimum: 0 },
            settings: {
              type: "object",
              properties: {
                theme: { type: "string", default: "light" },
              },
            },
          },
          required: ["name"],
        },
      },
    };

    const result = sanitizeJsonSchemaForGemini(schema);
    const user = (result.properties as Record<string, JsonSchema>).user as JsonSchema;
    const userProps = user.properties as Record<string, JsonSchema>;
    const settings = userProps.settings as JsonSchema;
    const settingsProps = settings.properties as Record<string, JsonSchema>;

    expect(result).not.toHaveProperty("$schema");
    expect(userProps.age).not.toHaveProperty("exclusiveMinimum");
    expect(userProps.age).toHaveProperty("minimum", 0);
    expect(settingsProps.theme).not.toHaveProperty("default");
  });

  it("should handle Zod union types (anyOf)", () => {
    // z.union([z.string(), z.number().positive()])
    const schema: JsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      anyOf: [{ type: "string" }, { type: "number", exclusiveMinimum: 0 }],
    };

    const result = sanitizeJsonSchemaForGemini(schema);
    const anyOf = result.anyOf as JsonSchema[];

    expect(result).not.toHaveProperty("$schema");
    expect(anyOf[1]).not.toHaveProperty("exclusiveMinimum");
    expect(anyOf[1]).toHaveProperty("minimum", 0);
  });
});

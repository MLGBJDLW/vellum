import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  sanitizeJsonSchemaForGemini,
  stripSchemaMetaFields,
} from "../transforms/schema-sanitizer.js";

describe("tool schema dialect compatibility", () => {
  it("preserves nested id scopes for relative MCP references", () => {
    const schema = {
      $id: "https://schemas.example/tools",
      type: "object",
      $defs: { node: { $id: "node", type: "string" } },
      properties: { value: { $ref: "node" } },
    };
    expect(stripSchemaMetaFields(schema)).toEqual(schema);
  });
  it("converts the legacy bash timeout schema to numeric JSON Schema bounds", () => {
    const schema = z.toJSONSchema(
      z.object({ command: z.string(), timeout: z.number().int().positive().default(120000) }),
      { target: "openapi-3.0" }
    );
    expect(schema.properties?.timeout).toHaveProperty("exclusiveMinimum", true);
    const actual = stripSchemaMetaFields(schema);
    expect(actual).toMatchObject({
      properties: { timeout: { type: "integer", exclusiveMinimum: 0 } },
    });
    expect(schema.properties?.timeout).toHaveProperty("exclusiveMinimum", true);
  });

  it("normalizes nested bounds and nullable without changing user property names or enum data", () => {
    const literal = { default: "keep", exclusiveMinimum: true };
    const schema = {
      type: "object",
      properties: {
        default: { type: "string", nullable: true },
        exclusiveMinimum: { type: "number", maximum: 5, exclusiveMaximum: true },
        value: { enum: [literal] },
        list: { type: "array", items: { type: "number", minimum: 0, exclusiveMinimum: false } },
      },
      required: ["default"],
    };
    expect(stripSchemaMetaFields(schema)).toEqual({
      type: "object",
      properties: {
        default: { type: ["string", "null"] },
        exclusiveMinimum: { type: "number", exclusiveMaximum: 5 },
        value: { enum: [literal] },
        list: { type: "array", items: { type: "number", minimum: 0 } },
      },
      required: ["default"],
    });
  });

  it("retains definitions needed by nested and recursive MCP references", () => {
    const schema = {
      type: "object",
      properties: { node: { $ref: "#/$defs/node" } },
      $defs: {
        node: {
          type: "object",
          properties: { next: { $ref: "#/$defs/node" }, size: { type: "integer", default: 1 } },
        },
      },
    };
    expect(stripSchemaMetaFields(schema)).toEqual({
      ...schema,
      $defs: {
        node: {
          type: "object",
          properties: { next: { $ref: "#/$defs/node" }, size: { type: "integer" } },
        },
      },
    });
  });

  it("normalizes every schema-bearing location, including tuples and pattern properties", () => {
    const legacy = { type: "number", minimum: 2, exclusiveMinimum: true };
    const normalized = { type: "number", exclusiveMinimum: 2 };
    const schema = {
      prefixItems: [legacy],
      patternProperties: { "^x": legacy },
      dependentSchemas: { x: legacy },
      if: legacy,
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema conditional keyword, not a promise.
      then: legacy,
      else: legacy,
      not: legacy,
      allOf: [legacy],
      definitions: { legacy },
    };
    expect(stripSchemaMetaFields(schema)).toEqual({
      prefixItems: [normalized],
      patternProperties: { "^x": normalized },
      dependentSchemas: { x: normalized },
      if: normalized,
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema conditional keyword, not a promise.
      then: normalized,
      else: normalized,
      not: normalized,
      allOf: [normalized],
      definitions: { legacy: normalized },
    });
  });

  it("keeps local JSON pointer targets in place when normalizing nullable schemas", () => {
    const schema = {
      type: "object",
      nullable: true,
      properties: { source: { type: "string" }, copy: { $ref: "#/properties/source" } },
    };
    expect(stripSchemaMetaFields(schema)).toEqual({
      type: ["object", "null"],
      properties: schema.properties,
    });
  });
});

describe("Gemini schema constraints", () => {
  it("resolves local references before removing definitions", () => {
    expect(
      sanitizeJsonSchemaForGemini({
        type: "object",
        properties: { mode: { $ref: "#/$defs/mode" } },
        $defs: { mode: { type: "string", const: "safe" } },
      })
    ).toEqual({ type: "object", properties: { mode: { type: "string", enum: ["safe"] } } });
  });

  it("preserves integer exclusivity and uses the strongest bound regardless of key order", () => {
    expect(
      sanitizeJsonSchemaForGemini({ type: "integer", minimum: -5, exclusiveMinimum: 0 })
    ).toEqual({ type: "integer", minimum: 1 });
    expect(
      sanitizeJsonSchemaForGemini({ type: "number", exclusiveMinimum: 0, minimum: 5 })
    ).toEqual({ type: "number", minimum: 5 });
    expect(
      sanitizeJsonSchemaForGemini({ type: "integer", maximum: 9, exclusiveMaximum: 5 })
    ).toEqual({ type: "integer", maximum: 4 });
  });

  it("rejects unresolved or recursive references instead of silently erasing constraints", () => {
    expect(() => sanitizeJsonSchemaForGemini({ $ref: "#/$defs/missing" })).toThrow(/reference/i);
    expect(() =>
      sanitizeJsonSchemaForGemini({
        $ref: "#/$defs/node",
        $defs: { node: { type: "object", properties: { next: { $ref: "#/$defs/node" } } } },
      })
    ).toThrow(/recursive/i);
  });
});

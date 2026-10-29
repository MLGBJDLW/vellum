import { describe, expect, it } from "vitest";
import { stripSchemaMetaFields } from "../transforms/schema-sanitizer.js";

describe("shared tuple schema dialect conversion", () => {
  it("normalizes legacy tuples without changing literal data or modern arrays", () => {
    const literal = { items: [{ type: "string" }], additionalItems: false };
    const schema = {
      type: "object",
      properties: {
        tuple: {
          type: "array",
          items: [{ type: "string" }, { type: "number" }],
          additionalItems: { type: "integer" },
          minItems: 2,
        },
        modern: { type: "array", prefixItems: [{ type: "boolean" }], items: false },
        literal: { enum: [literal] },
        first: { $ref: "#/properties/tuple/items/0" },
        rest: { $ref: "#/properties/tuple/additionalItems" },
      },
    };
    const original = structuredClone(schema);
    expect(stripSchemaMetaFields(schema)).toEqual({
      type: "object",
      properties: {
        tuple: {
          type: "array",
          prefixItems: [{ type: "string" }, { type: "number" }],
          items: { type: "integer" },
          minItems: 2,
        },
        modern: schema.properties.modern,
        literal: { enum: [literal] },
        first: { $ref: "#/properties/tuple/prefixItems/0" },
        rest: { $ref: "#/properties/tuple/items" },
      },
    });
    expect(schema).toEqual(original);
  });

  it("rebases nested tuple references within their own id resource and references from the root", () => {
    const schema = {
      $id: "https://schemas.example/root.json",
      type: "object",
      properties: {
        sibling: { $ref: "child.json#/properties/range/items/0/items/0" },
        rootPointer: { $ref: "#/$defs/child/properties/range/items/0/items/0" },
        external: { $ref: "external.json#/items/0" },
      },
      $defs: {
        child: {
          $id: "child.json",
          type: "object",
          properties: {
            range: {
              type: "array",
              items: [{ type: "array", items: [{ type: "string" }], additionalItems: false }],
              additionalItems: false,
            },
            first: { $ref: "#/properties/range/items/0/items/0" },
          },
        },
      },
    };
    expect(stripSchemaMetaFields(schema)).toMatchObject({
      $id: schema.$id,
      properties: {
        sibling: { $ref: "child.json#/properties/range/prefixItems/0/prefixItems/0" },
        rootPointer: { $ref: "#/$defs/child/properties/range/prefixItems/0/prefixItems/0" },
        external: { $ref: "external.json#/items/0" },
      },
      $defs: {
        child: {
          $id: "child.json",
          properties: { first: { $ref: "#/properties/range/prefixItems/0/prefixItems/0" } },
        },
      },
    });
  });

  it("rebases encoded pointer tokens and leaves same-spelled ordinary properties intact", () => {
    const schema = {
      properties: {
        "a/b": { type: "array", items: [{ type: "string" }] },
        items: { type: "string" },
        ref: { $ref: "#/properties/a~1b/items/0" },
        ordinary: { $ref: "#/properties/items" },
      },
    };
    expect(stripSchemaMetaFields(schema)).toMatchObject({
      properties: {
        ref: { $ref: "#/properties/a~1b/prefixItems/0" },
        ordinary: { $ref: "#/properties/items" },
      },
    });
  });
});

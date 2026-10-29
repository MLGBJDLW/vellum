import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleProvider } from "../google.js";
import { googleTransform } from "../transforms/google.js";
import type { CompletionParams } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    node: { $ref: "#/$defs/node" },
    coordinates: {
      type: "array",
      items: [{ type: "number" }, { type: "number" }],
      additionalItems: false,
      minItems: 2,
      maxItems: 2,
    },
    options: {
      type: "object",
      properties: { timeout: { type: "integer", minimum: 0, exclusiveMinimum: true } },
      additionalProperties: false,
    },
  },
  $defs: {
    node: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  required: ["coordinates"],
  additionalProperties: false,
};

describe("Google JSON Schema tool request compatibility", () => {
  it.each([false, true])(
    "preserves schemas in the actual SDK request (stream=%s)",
    async (stream) => {
      const response = {
        candidates: [
          { content: { role: "model", parts: [{ text: "Done" }] }, finishReason: "STOP" },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      };
      let request: Record<string, unknown> | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: unknown, init: RequestInit) => {
          request = JSON.parse(String(init.body));
          return new Response(
            stream ? `data: ${JSON.stringify(response)}\n\n` : JSON.stringify(response),
            {
              headers: { "content-type": stream ? "text/event-stream" : "application/json" },
            }
          );
        })
      );
      const original = structuredClone(schema);
      const provider = new GoogleProvider();
      await provider.initialize({ apiKey: "fixture" });
      const params: CompletionParams = {
        model: "gemini-3.8-flash",
        messages: [{ role: "user", content: "Use the tool" }],
        tools: [{ name: "lookup", description: "Inspect coordinates", inputSchema: schema }],
      };
      if (stream) {
        for await (const _event of provider.stream(params)) {
          /* Drain the actual SDK stream. */
        }
      } else {
        expect((await provider.complete(params)).content).toBe("Done");
      }
      const declarations = (
        (request?.tools ?? []) as { functionDeclarations: Record<string, unknown>[] }[]
      )[0]?.functionDeclarations;
      expect(declarations).toHaveLength(1);
      const declaration = declarations?.[0];
      expect(declaration).not.toHaveProperty("parameters");
      expect(declaration?.parametersJsonSchema).toEqual({
        type: "object",
        properties: {
          node: { $ref: "#/$defs/node" },
          coordinates: {
            type: "array",
            prefixItems: [{ type: "number" }, { type: "number" }],
            items: false,
            minItems: 2,
            maxItems: 2,
          },
          options: {
            type: "object",
            properties: { timeout: { type: "integer", exclusiveMinimum: 0 } },
            additionalProperties: false,
          },
        },
        $defs: schema.$defs,
        required: ["coordinates"],
        additionalProperties: false,
      });
      expect(schema).toEqual(original);
    }
  );

  it("normalizes tuples only at schema locations and preserves modern item schemas", () => {
    const literal = { items: [{ type: "number" }], additionalItems: false };
    const inputSchema = {
      type: "object",
      properties: {
        literal: { const: literal },
        modern: { type: "array", prefixItems: [{ type: "string" }], items: { type: "number" } },
        nested: {
          anyOf: [
            { type: "array", items: [{ type: "string" }], additionalItems: { type: "integer" } },
            { type: "null" },
          ],
        },
      },
    };
    const result = googleTransform.transformTools(
      [{ name: "read", description: "Read", inputSchema }],
      { provider: "google" }
    );
    expect(result.data[0]?.functionDeclarations[0]?.parametersJsonSchema).toEqual({
      type: "object",
      properties: {
        literal: { const: literal },
        modern: inputSchema.properties.modern,
        nested: {
          anyOf: [
            { type: "array", prefixItems: [{ type: "string" }], items: { type: "integer" } },
            { type: "null" },
          ],
        },
      },
    });
  });

  it("retains optional recursive references for the native JSON Schema transport", () => {
    const inputSchema = {
      type: "object",
      properties: { node: { $ref: "#/$defs/node" } },
      $defs: { node: { type: "object", properties: { next: { $ref: "#/$defs/node" } } } },
    };
    const result = googleTransform.transformTools(
      [{ name: "read", description: "Read", inputSchema }],
      { provider: "google" }
    );
    expect(result.data[0]?.functionDeclarations[0]?.parametersJsonSchema).toEqual(inputSchema);
  });

  it("keeps local references valid when tuple schema locations move", () => {
    const inputSchema = {
      type: "object",
      properties: {
        tuple: { type: "array", items: [{ type: "string" }], additionalItems: { type: "number" } },
        first: { $ref: "#/properties/tuple/items/0" },
        rest: { $ref: "#/properties/tuple/additionalItems" },
        items: { type: "string" },
        ordinary: { $ref: "#/properties/items" },
      },
    };
    const result = googleTransform.transformTools(
      [{ name: "read", description: "Read", inputSchema }],
      { provider: "google" }
    );
    expect(result.data[0]?.functionDeclarations[0]?.parametersJsonSchema).toMatchObject({
      properties: {
        first: { $ref: "#/properties/tuple/prefixItems/0" },
        rest: { $ref: "#/properties/tuple/items" },
        ordinary: { $ref: "#/properties/items" },
      },
    });
  });
});

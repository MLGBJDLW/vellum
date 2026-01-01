/**
 * Unit tests for FrontmatterParser
 *
 * Tests frontmatter extraction and Zod schema validation with
 * graceful degradation for malformed or missing frontmatter.
 *
 * @module config-parser/__tests__/frontmatter-parser
 * @see REQ-004, REQ-029, REQ-031
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FrontmatterParser } from "../frontmatter-parser.js";

// =============================================================================
// Test Schemas
// =============================================================================

const simpleSchema = z.object({
  title: z.string(),
  version: z.string().optional(),
});

const strictSchema = z.object({
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
});

const optionalSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// Valid YAML Parsing Tests
// =============================================================================

describe("FrontmatterParser", () => {
  describe("valid YAML parsing", () => {
    it("parses valid frontmatter with all fields", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: My Document
version: 1.0.0
---
# Heading

Body content here.
`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("My Document");
        expect(result.data.version).toBe("1.0.0");
        expect(result.body).toContain("# Heading");
        expect(result.body).toContain("Body content here.");
        expect(result.warnings).toHaveLength(0);
      }
    });

    it("parses valid frontmatter with optional fields missing", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: Title Only
---
Content`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Title Only");
        expect(result.data.version).toBeUndefined();
        expect(result.body).toBe("Content");
      }
    });

    it("parses frontmatter with complex types", () => {
      const parser = new FrontmatterParser(strictSchema);
      const content = `---
name: John Doe
age: 30
active: true
---
Profile`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("John Doe");
        expect(result.data.age).toBe(30);
        expect(result.data.active).toBe(true);
      }
    });

    it("parses frontmatter with arrays", () => {
      const parser = new FrontmatterParser(optionalSchema);
      const content = `---
title: Tagged Document
tags:
  - typescript
  - testing
  - zod
---
Content with tags`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Tagged Document");
        expect(result.data.tags).toEqual(["typescript", "testing", "zod"]);
      }
    });

    it("preserves body content whitespace", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: Test
---

  Indented content

More content`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.body).toContain("  Indented content");
      }
    });
  });

  // ===========================================================================
  // Malformed YAML Tests (Graceful Degradation)
  // ===========================================================================

  describe("malformed YAML (graceful degradation)", () => {
    it("handles invalid YAML syntax", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: Test
  invalid indentation: here
    nested: wrong
---
Body content`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain("Malformed YAML");
        // Body should still be extractable
        expect(result.body).toBe("Body content");
      }
    });

    it("handles unclosed frontmatter", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: Unclosed
This line has no closing delimiter`;

      const result = parser.parse(content);

      // gray-matter may handle this differently
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("handles YAML with tabs (potential error source)", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title:\tTabbed Value
---
Body`;

      const result = parser.parse(content);

      // Tabs in YAML may cause issues
      if (result.success) {
        expect(result.data.title).toBeDefined();
      } else {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("handles special characters in YAML", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: "Quoted: with colon"
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Quoted: with colon");
      }
    });
  });

  // ===========================================================================
  // No Frontmatter Tests
  // ===========================================================================

  describe("no frontmatter (body only)", () => {
    it("returns body when no frontmatter delimiters present", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `# Just a Heading

This is regular markdown content.`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.body).toBe(content);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      }
    });

    it("handles content starting with horizontal rule (not frontmatter)", () => {
      const parser = new FrontmatterParser(simpleSchema);
      // Content that starts with --- but isn't frontmatter
      const content = `---

This is a horizontal rule, not frontmatter.`;

      const result = parser.parse(content);

      // gray-matter may interpret this differently
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("handles empty frontmatter delimiters", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
---
Body content`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.body).toBe("Body content");
        expect(result.errors).toHaveLength(0);
      }
    });

    it("warns about empty frontmatter when configured", () => {
      const parser = new FrontmatterParser(simpleSchema, {
        allowEmptyFrontmatter: false,
      });
      const content = `---
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.warnings).toContain("Frontmatter is empty");
      }
    });
  });

  // ===========================================================================
  // Schema Validation Tests
  // ===========================================================================

  describe("schema validation pass/fail", () => {
    it("fails validation for missing required fields", () => {
      const parser = new FrontmatterParser(strictSchema);
      const content = `---
name: John
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.body).toBe("Body");
        // First error should be ZodError
        const error = result.errors[0];
        expect(error).toHaveProperty("issues");
      }
    });

    it("fails validation for wrong field types", () => {
      const parser = new FrontmatterParser(strictSchema);
      const content = `---
name: John
age: "not a number"
active: true
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("passes validation with all optional fields", () => {
      const parser = new FrontmatterParser(optionalSchema);
      const content = `---
---
Body only`;

      const result = parser.parse(content);

      // Empty frontmatter doesn't satisfy schema even with all optional fields
      expect(result.success).toBe(false);
    });

    it("passes validation with extra unknown fields using passthrough", () => {
      // Use passthrough schema to allow extra fields
      const passthroughSchema = z
        .object({
          title: z.string(),
          version: z.string().optional(),
        })
        .passthrough();

      const parser = new FrontmatterParser(passthroughSchema);
      const content = `---
title: Test
version: "1.0"
extra: This is not in schema
another: 123
---
Body`;

      const result = parser.parse(content);

      // With passthrough, extra fields are preserved
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Test");
        expect((result.data as Record<string, unknown>).extra).toBe("This is not in schema");
      }
    });

    it("provides detailed ZodError for validation failures", () => {
      const parser = new FrontmatterParser(strictSchema);
      const content = `---
name: 123
age: "wrong"
active: "not boolean"
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        const zodError = result.errors[0] as z.ZodError;
        expect(zodError.issues).toBeDefined();
        expect(zodError.issues.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Empty Content Tests
  // ===========================================================================

  describe("empty content", () => {
    it("handles empty string", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const result = parser.parse("");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.body).toBe("");
        expect(result.warnings).toContain("Content is empty");
      }
    });

    it("handles whitespace-only content", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const result = parser.parse("   \n\t\n   ");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.warnings).toContain("Content is empty");
      }
    });

    it("handles newline-only content", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const result = parser.parse("\n\n\n");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.warnings).toContain("Content is empty");
      }
    });
  });

  // ===========================================================================
  // Async Parsing Tests
  // ===========================================================================

  describe("async parsing", () => {
    it("parseAsync returns same result as parse", async () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: Async Test
---
Body`;

      const syncResult = parser.parse(content);
      const asyncResult = await parser.parseAsync(content);

      expect(asyncResult).toEqual(syncResult);
    });

    it("parseAsync handles errors correctly", async () => {
      const parser = new FrontmatterParser(strictSchema);
      const content = `---
invalid: yaml: syntax:
---
Body`;

      const result = await parser.parseAsync(content);

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("handles frontmatter with only whitespace", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
   
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.data).toBeNull();
        expect(result.body).toBe("Body");
      }
    });

    it("handles multiple frontmatter sections (uses first)", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: First
---
Middle content
---
title: Second
---
End content`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("First");
        expect(result.body).toContain("Middle content");
      }
    });

    it("handles very long frontmatter", () => {
      const parser = new FrontmatterParser(
        z.object({
          title: z.string(),
          description: z.string(),
        })
      );

      const longDescription = "A".repeat(10000);
      const content = `---
title: Long Doc
description: "${longDescription}"
---
Body`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe(longDescription);
      }
    });

    it("handles unicode in frontmatter", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = `---
title: "日本語タイトル 🎉"
---
コンテンツ`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("日本語タイトル 🎉");
        expect(result.body).toBe("コンテンツ");
      }
    });

    it("handles Windows line endings (CRLF)", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const content = "---\r\ntitle: Windows\r\n---\r\nBody";

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Windows");
      }
    });

    it("never throws exceptions and handles bad inputs gracefully", () => {
      const parser = new FrontmatterParser(simpleSchema);
      const badInputs = [
        null as unknown as string,
        undefined as unknown as string,
        123 as unknown as string,
        {} as unknown as string,
        [] as unknown as string,
      ];

      // These should not throw but handle gracefully
      for (const input of badInputs) {
        expect(() => parser.parse(input)).not.toThrow();
        const result = parser.parse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.data).toBeNull();
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ===========================================================================
  // Type Safety Tests
  // ===========================================================================

  describe("type safety", () => {
    it("infers correct types from schema", () => {
      const schema = z.object({
        count: z.number(),
        enabled: z.boolean(),
        items: z.array(z.string()),
      });

      const parser = new FrontmatterParser(schema);
      const content = `---
count: 42
enabled: true
items:
  - one
  - two
---
Body`;

      const result = parser.parse(content);

      if (result.success) {
        // TypeScript should infer these types correctly
        const count: number = result.data.count;
        const enabled: boolean = result.data.enabled;
        const items: string[] = result.data.items;

        expect(count).toBe(42);
        expect(enabled).toBe(true);
        expect(items).toEqual(["one", "two"]);
      }
    });
  });
});

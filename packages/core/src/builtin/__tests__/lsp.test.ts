/**
 * Tests for lsp tool
 *
 * @module builtin/__tests__/lsp.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import {
  getCurrentLspConnection,
  type LspCompletionItem,
  type LspDiagnostic,
  type LspHoverInfo,
  type LspLocation,
  type LspOutput,
  lspTool,
  setLspConnection,
} from "../lsp.js";

describe("lspTool", () => {
  const mockContext: ToolContext = {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset LSP connection
    setLspConnection(null);
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(lspTool.definition.name).toBe("lsp");
    });

    it("should have correct kind", () => {
      expect(lspTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(lspTool.definition.description).toBeTruthy();
    });

    it("should have correct category", () => {
      expect(lspTool.definition.category).toBe("code");
    });
  });

  describe("execute - LSP not available", () => {
    it("should return graceful error when LSP is not available", async () => {
      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("LSP server is not available");
      }
    });

    it("should suggest starting language server", async () => {
      const result = await lspTool.execute(
        { action: "diagnostics", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("language server");
      }
    });
  });

  describe("execute - validation", () => {
    it("should fail definition without line/column", async () => {
      // Mock a connected LSP
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Line and column are required");
      }
    });

    it("should fail references without line/column", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "references", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Line and column are required");
      }
    });

    it("should fail hover without line/column", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute({ action: "hover", file: "src/index.ts" }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Line and column are required");
      }
    });

    it("should fail completion without line/column", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "completion", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Line and column are required");
      }
    });

    it("should allow diagnostics without line/column", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn().mockResolvedValue([]),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "diagnostics", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(true);
    });
  });

  describe("execute - with mock LSP connection", () => {
    const mockDefinitions: LspLocation[] = [
      { file: "/test/workspace/src/types.ts", line: 15, column: 1 },
    ];

    const mockReferences: LspLocation[] = [
      { file: "/test/workspace/src/index.ts", line: 10, column: 5 },
      { file: "/test/workspace/src/utils.ts", line: 25, column: 10 },
    ];

    const mockDiagnostics: LspDiagnostic[] = [
      {
        message: "Type 'string' is not assignable to type 'number'",
        severity: "error",
        location: { file: "/test/workspace/src/index.ts", line: 10, column: 5 },
        source: "typescript",
        code: 2322,
      },
    ];

    const mockHover: LspHoverInfo = {
      content: "```typescript\nfunction example(): void\n```",
      contentType: "markdown",
      range: {
        start: { line: 10, column: 1 },
        end: { line: 10, column: 8 },
      },
    };

    const mockCompletions: LspCompletionItem[] = [
      {
        label: "example",
        kind: "function",
        detail: "(): void",
        documentation: "An example function",
      },
    ];

    beforeEach(() => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn().mockResolvedValue(mockDefinitions),
        references: vi.fn().mockResolvedValue(mockReferences),
        diagnostics: vi.fn().mockResolvedValue(mockDiagnostics),
        hover: vi.fn().mockResolvedValue(mockHover),
        completion: vi.fn().mockResolvedValue(mockCompletions),
      };
      setLspConnection(mockConnection);
    });

    it("should return definition results", async () => {
      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.action).toBe("definition");
        expect(output.definitions).toEqual(mockDefinitions);
      }
    });

    it("should return references results", async () => {
      const result = await lspTool.execute(
        { action: "references", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.action).toBe("references");
        expect(output.references).toEqual(mockReferences);
      }
    });

    it("should return diagnostics results", async () => {
      const result = await lspTool.execute(
        { action: "diagnostics", file: "src/index.ts" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.action).toBe("diagnostics");
        expect(output.diagnostics).toEqual(mockDiagnostics);
      }
    });

    it("should return hover results", async () => {
      const result = await lspTool.execute(
        { action: "hover", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.action).toBe("hover");
        expect(output.hover).toEqual(mockHover);
      }
    });

    it("should return completion results", async () => {
      const result = await lspTool.execute(
        { action: "completion", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.action).toBe("completion");
        expect(output.completions).toEqual(mockCompletions);
      }
    });

    it("should handle null hover result", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn().mockResolvedValue(null),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "hover", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const output = result.output as LspOutput;
        expect(output.hover).toBeUndefined();
      }
    });
  });

  describe("execute - error handling", () => {
    it("should handle LSP query errors", async () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn().mockRejectedValue(new Error("Connection lost")),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("LSP query failed");
        expect(result.error).toContain("Connection lost");
      }
    });

    it("should handle disconnected LSP", async () => {
      const mockConnection = {
        isConnected: () => false,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not available");
      }
    });
  });

  describe("execute - permission denied", () => {
    it("should fail when permission denied", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("execute - cancellation", () => {
    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await lspTool.execute(
        { action: "definition", file: "src/index.ts", line: 10, column: 5 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation for read-only LSP queries", () => {
      expect(
        lspTool.shouldConfirm?.(
          { action: "definition", file: "src/index.ts", line: 10, column: 5 },
          mockContext
        )
      ).toBe(false);
    });
  });

  describe("parameter validation", () => {
    it("should accept valid action types", () => {
      const schema = lspTool.definition.parameters;

      const actions = ["definition", "references", "diagnostics", "hover", "completion"];
      for (const action of actions) {
        const result = schema.safeParse({ action, file: "test.ts" });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid action type", () => {
      const schema = lspTool.definition.parameters;
      const result = schema.safeParse({
        action: "invalid",
        file: "test.ts",
      });
      expect(result.success).toBe(false);
    });

    it("should require file parameter", () => {
      const schema = lspTool.definition.parameters;
      const result = schema.safeParse({
        action: "definition",
      });
      expect(result.success).toBe(false);
    });

    it("should validate line as positive integer", () => {
      const schema = lspTool.definition.parameters;

      // Valid positive integer
      let result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: 10,
        column: 5,
      });
      expect(result.success).toBe(true);

      // Invalid: zero
      result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: 0,
        column: 5,
      });
      expect(result.success).toBe(false);

      // Invalid: negative
      result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: -1,
        column: 5,
      });
      expect(result.success).toBe(false);

      // Invalid: non-integer
      result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: 10.5,
        column: 5,
      });
      expect(result.success).toBe(false);
    });

    it("should validate column as positive integer", () => {
      const schema = lspTool.definition.parameters;

      // Valid positive integer
      let result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: 10,
        column: 1,
      });
      expect(result.success).toBe(true);

      // Invalid: zero
      result = schema.safeParse({
        action: "definition",
        file: "test.ts",
        line: 10,
        column: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("connection management", () => {
    it("should get current connection", () => {
      expect(getCurrentLspConnection()).toBeNull();

      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);

      expect(getCurrentLspConnection()).toBe(mockConnection);
    });

    it("should allow clearing connection", () => {
      const mockConnection = {
        isConnected: () => true,
        definition: vi.fn(),
        references: vi.fn(),
        diagnostics: vi.fn(),
        hover: vi.fn(),
        completion: vi.fn(),
      };
      setLspConnection(mockConnection);
      expect(getCurrentLspConnection()).toBe(mockConnection);

      setLspConnection(null);
      expect(getCurrentLspConnection()).toBeNull();
    });
  });
});

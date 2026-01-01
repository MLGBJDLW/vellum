// ============================================
// Context Isolator Tests
// ============================================

import { describe, expect, it } from "vitest";
import { createContextIsolator } from "../context-isolator.js";

describe("ContextIsolator", () => {
  describe("createContextIsolator", () => {
    it("should create a ContextIsolator instance", () => {
      const isolator = createContextIsolator();
      expect(isolator).toBeDefined();
      expect(isolator.createIsolated).toBeInstanceOf(Function);
      expect(isolator.merge).toBeInstanceOf(Function);
      expect(isolator.fork).toBeInstanceOf(Function);
      expect(isolator.getShared).toBeInstanceOf(Function);
      expect(isolator.setLocal).toBeInstanceOf(Function);
    });
  });

  describe("createIsolated", () => {
    it("should create root context with empty memories", () => {
      const isolator = createContextIsolator();
      const root = isolator.createIsolated();

      expect(root.id).toBeDefined();
      expect(root.parentId).toBeUndefined();
      expect(root.sharedMemory).toEqual({});
      expect(root.localMemory).toEqual({});
      expect(root.files).toEqual([]);
      expect(root.createdAt).toBeInstanceOf(Date);
    });

    it("should create unique IDs for each context", () => {
      const isolator = createContextIsolator();
      const ctx1 = isolator.createIsolated();
      const ctx2 = isolator.createIsolated();

      expect(ctx1.id).not.toBe(ctx2.id);
    });

    it("should create child context with parent's local as shared", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "config", { debug: true });
      isolator.setLocal(parent, "apiKey", "secret123");

      const child = isolator.createIsolated(parent);

      expect(child.parentId).toBe(parent.id);
      expect(child.sharedMemory).toEqual({
        config: { debug: true },
        apiKey: "secret123",
      });
      expect(child.localMemory).toEqual({});
    });

    it("should inherit files by default", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      parent.files.push("src/index.ts", "src/utils.ts");

      const child = isolator.createIsolated(parent);

      expect(child.files).toEqual(["src/index.ts", "src/utils.ts"]);
    });

    it("should not inherit files when inheritFiles is false", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      parent.files.push("src/index.ts");

      const child = isolator.createIsolated(parent, false);

      expect(child.files).toEqual([]);
    });

    it("should create defensive copy of shared memory", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      const configValue = { debug: true, nested: { level: 1 } };
      isolator.setLocal(parent, "config", configValue);

      const child = isolator.createIsolated(parent);

      // Modify original - should not affect child
      configValue.debug = false;
      configValue.nested.level = 2;

      expect((child.sharedMemory.config as Record<string, unknown>).debug).toBe(true);
      expect(
        ((child.sharedMemory.config as Record<string, unknown>).nested as Record<string, number>)
          .level
      ).toBe(1);
    });
  });

  describe("fork", () => {
    it("should create child with combined shared and local memory", () => {
      const isolator = createContextIsolator();

      // Simulate parent having shared memory (from grandparent)
      const grandparent = isolator.createIsolated();
      isolator.setLocal(grandparent, "inherited", "from-grandparent");

      const parentWithShared = isolator.createIsolated(grandparent);
      isolator.setLocal(parentWithShared, "localData", "from-parent");

      const forked = isolator.fork(parentWithShared);

      expect(forked.parentId).toBe(parentWithShared.id);
      expect(forked.sharedMemory).toEqual({
        inherited: "from-grandparent",
        localData: "from-parent",
      });
      expect(forked.localMemory).toEqual({});
    });

    it("should inherit files when forking", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      parent.files.push("src/main.ts");

      const forked = isolator.fork(parent);

      expect(forked.files).toEqual(["src/main.ts"]);
    });

    it("should create frozen shared memory", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "data", { value: 1 });

      const forked = isolator.fork(parent);

      expect(Object.isFrozen(forked.sharedMemory)).toBe(true);
    });
  });

  describe("merge", () => {
    it("should merge child local memory into parent", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "parentData", "original");

      const child = isolator.createIsolated(parent);
      isolator.setLocal(child, "childResult", "completed");

      const merged = isolator.merge(child, parent);

      expect(merged.localMemory).toEqual({
        parentData: "original",
        childResult: "completed",
      });
    });

    it("should preserve parent ID and shared memory", () => {
      const isolator = createContextIsolator();
      const root = isolator.createIsolated();
      const parent = isolator.createIsolated(root);
      const child = isolator.createIsolated(parent);

      const merged = isolator.merge(child, parent);

      expect(merged.id).toBe(parent.id);
      expect(merged.parentId).toBe(root.id);
      expect(merged.sharedMemory).toBe(parent.sharedMemory);
    });

    it("should merge files without duplicates", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      parent.files.push("src/index.ts", "src/shared.ts");

      const child = isolator.createIsolated(parent);
      child.files.push("src/new.ts", "src/shared.ts");

      const merged = isolator.merge(child, parent);

      expect(merged.files).toEqual(["src/index.ts", "src/shared.ts", "src/new.ts"]);
    });

    it("should not mutate original contexts", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "original", true);
      const parentLocalBefore = { ...parent.localMemory };

      const child = isolator.createIsolated(parent);
      isolator.setLocal(child, "childData", "value");
      const childLocalBefore = { ...child.localMemory };

      isolator.merge(child, parent);

      expect(parent.localMemory).toEqual(parentLocalBefore);
      expect(child.localMemory).toEqual(childLocalBefore);
    });

    it("should handle child overwriting parent keys", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "status", "pending");
      isolator.setLocal(parent, "count", 1);

      const child = isolator.createIsolated(parent);
      isolator.setLocal(child, "status", "completed");
      isolator.setLocal(child, "count", 5);

      const merged = isolator.merge(child, parent);

      expect(merged.localMemory.status).toBe("completed");
      expect(merged.localMemory.count).toBe(5);
    });
  });

  describe("getShared", () => {
    it("should return shared memory as read-only", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "data", { value: 42 });

      const child = isolator.createIsolated(parent);
      const shared = isolator.getShared(child);

      expect(shared).toEqual({ data: { value: 42 } });
      expect(Object.isFrozen(shared)).toBe(true);
    });

    it("should return defensive copy", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "config", { timeout: 5000 });

      const child = isolator.createIsolated(parent);
      const shared1 = isolator.getShared(child);
      const shared2 = isolator.getShared(child);

      expect(shared1).toEqual(shared2);
      expect(shared1).not.toBe(shared2);
    });

    it("should return empty object for root context", () => {
      const isolator = createContextIsolator();
      const root = isolator.createIsolated();
      const shared = isolator.getShared(root);

      expect(shared).toEqual({});
    });
  });

  describe("setLocal", () => {
    it("should set value in local memory", () => {
      const isolator = createContextIsolator();
      const context = isolator.createIsolated();

      isolator.setLocal(context, "key", "value");

      expect(context.localMemory.key).toBe("value");
    });

    it("should deep clone values to prevent reference sharing", () => {
      const isolator = createContextIsolator();
      const context = isolator.createIsolated();
      const originalValue = { nested: { deep: true } };

      isolator.setLocal(context, "data", originalValue);
      originalValue.nested.deep = false;

      const data = context.localMemory.data as { nested?: { deep?: boolean } } | undefined;
      expect(data?.nested?.deep).toBe(true);
    });

    it("should allow overwriting existing keys", () => {
      const isolator = createContextIsolator();
      const context = isolator.createIsolated();

      isolator.setLocal(context, "key", "first");
      isolator.setLocal(context, "key", "second");

      expect(context.localMemory.key).toBe("second");
    });

    it("should handle various value types", () => {
      const isolator = createContextIsolator();
      const context = isolator.createIsolated();

      isolator.setLocal(context, "string", "hello");
      isolator.setLocal(context, "number", 42);
      isolator.setLocal(context, "boolean", true);
      isolator.setLocal(context, "array", [1, 2, 3]);
      isolator.setLocal(context, "object", { a: 1 });
      isolator.setLocal(context, "null", null);

      expect(context.localMemory.string).toBe("hello");
      expect(context.localMemory.number).toBe(42);
      expect(context.localMemory.boolean).toBe(true);
      expect(context.localMemory.array).toEqual([1, 2, 3]);
      expect(context.localMemory.object).toEqual({ a: 1 });
      expect(context.localMemory.null).toBeNull();
    });
  });

  describe("isolation guarantees", () => {
    it("should prevent child from modifying parent's local memory", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      isolator.setLocal(parent, "secret", "original");

      const child = isolator.createIsolated(parent);
      isolator.setLocal(child, "secret", "modified");

      expect(parent.localMemory.secret).toBe("original");
    });

    it("should maintain isolation across multiple generations", () => {
      const isolator = createContextIsolator();

      const gen1 = isolator.createIsolated();
      isolator.setLocal(gen1, "gen", 1);

      const gen2 = isolator.createIsolated(gen1);
      isolator.setLocal(gen2, "gen", 2);

      const gen3 = isolator.createIsolated(gen2);
      isolator.setLocal(gen3, "gen", 3);

      expect(gen1.localMemory.gen).toBe(1);
      expect(gen2.localMemory.gen).toBe(2);
      expect(gen3.localMemory.gen).toBe(3);

      expect(gen2.sharedMemory.gen).toBe(1);
      expect(gen3.sharedMemory.gen).toBe(2);
    });

    it("should maintain file list isolation", () => {
      const isolator = createContextIsolator();
      const parent = isolator.createIsolated();
      parent.files.push("parent.ts");

      const child = isolator.createIsolated(parent);
      child.files.push("child.ts");

      expect(parent.files).toEqual(["parent.ts"]);
      expect(child.files).toEqual(["parent.ts", "child.ts"]);
    });
  });
});

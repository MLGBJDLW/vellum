import { beforeEach, describe, expect, it } from "vitest";
import { Container, Token } from "../container.js";

describe("Token", () => {
  it("should have unique symbol IDs for different tokens", () => {
    const token1 = new Token<string>("test");
    const token2 = new Token<string>("test");

    // Same name but different symbol IDs
    expect(token1.id).not.toBe(token2.id);
    expect(token1.name).toBe(token2.name);
  });

  it("should return formatted string from toString()", () => {
    const token = new Token<number>("MyService");

    expect(token.toString()).toBe("Token(MyService)");
  });
});

describe("Container", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("register()", () => {
    it("should create new instances on each resolve", () => {
      const token = new Token<{ id: number }>("Factory");
      let counter = 0;

      container.register(token, () => ({ id: ++counter }));

      const instance1 = container.resolve(token);
      const instance2 = container.resolve(token);

      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("registerSingleton()", () => {
    it("should return the same instance on subsequent resolves", () => {
      const token = new Token<{ id: number }>("Singleton");
      let counter = 0;

      container.registerSingleton(token, () => ({ id: ++counter }));

      const instance1 = container.resolve(token);
      const instance2 = container.resolve(token);

      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(1);
      expect(instance1).toBe(instance2);
    });

    it("should not create instance until first resolve", () => {
      const token = new Token<string>("Lazy");
      let created = false;

      container.registerSingleton(token, () => {
        created = true;
        return "value";
      });

      expect(created).toBe(false);

      container.resolve(token);

      expect(created).toBe(true);
    });
  });

  describe("registerValue()", () => {
    it("should return the exact registered value", () => {
      const token = new Token<{ name: string }>("Value");
      const value = { name: "test-value" };

      container.registerValue(token, value);

      const resolved = container.resolve(token);

      expect(resolved).toBe(value);
      expect(resolved.name).toBe("test-value");
    });

    it("should work with primitive values", () => {
      const stringToken = new Token<string>("String");
      const numberToken = new Token<number>("Number");
      const boolToken = new Token<boolean>("Boolean");

      container.registerValue(stringToken, "hello");
      container.registerValue(numberToken, 42);
      container.registerValue(boolToken, true);

      expect(container.resolve(stringToken)).toBe("hello");
      expect(container.resolve(numberToken)).toBe(42);
      expect(container.resolve(boolToken)).toBe(true);
    });
  });

  describe("resolve()", () => {
    it("should throw error when token is not registered", () => {
      const token = new Token<string>("Missing");

      expect(() => container.resolve(token)).toThrow("No registration found for Token(Missing)");
    });
  });

  describe("tryResolve()", () => {
    it("should return undefined when token is not registered", () => {
      const token = new Token<string>("Missing");

      expect(container.tryResolve(token)).toBeUndefined();
    });

    it("should return value when token is registered", () => {
      const token = new Token<string>("Present");
      container.registerValue(token, "found");

      expect(container.tryResolve(token)).toBe("found");
    });
  });

  describe("has()", () => {
    it("should return true for registered tokens", () => {
      const token = new Token<string>("Registered");
      container.registerValue(token, "value");

      expect(container.has(token)).toBe(true);
    });

    it("should return false for unregistered tokens", () => {
      const token = new Token<string>("Unregistered");

      expect(container.has(token)).toBe(false);
    });
  });

  describe("createChild()", () => {
    it("should inherit parent registrations", () => {
      const token = new Token<string>("Inherited");
      container.registerValue(token, "parent-value");

      const child = container.createChild();

      expect(child.resolve(token)).toBe("parent-value");
    });

    it("should allow child to override parent registrations", () => {
      const token = new Token<string>("Override");
      container.registerValue(token, "parent-value");

      const child = container.createChild();
      child.registerValue(token, "child-value");

      expect(child.resolve(token)).toBe("child-value");
      expect(container.resolve(token)).toBe("parent-value");
    });

    it("should not affect parent when child overrides", () => {
      const token = new Token<number>("Isolated");
      container.registerValue(token, 100);

      const child = container.createChild();
      child.registerValue(token, 200);

      // Parent unchanged
      expect(container.resolve(token)).toBe(100);
      // Child has override
      expect(child.resolve(token)).toBe(200);
    });

    it("should check parent in has() method", () => {
      const parentToken = new Token<string>("ParentOnly");
      const childToken = new Token<string>("ChildOnly");

      container.registerValue(parentToken, "parent");

      const child = container.createChild();
      child.registerValue(childToken, "child");

      expect(child.has(parentToken)).toBe(true);
      expect(child.has(childToken)).toBe(true);
      expect(container.has(childToken)).toBe(false);
    });

    it("should support multiple levels of nesting", () => {
      const token = new Token<string>("Nested");
      container.registerValue(token, "root");

      const child = container.createChild();
      const grandchild = child.createChild();

      expect(grandchild.resolve(token)).toBe("root");

      child.registerValue(token, "child");
      expect(grandchild.resolve(token)).toBe("child");
    });
  });

  describe("clear()", () => {
    it("should remove all registrations", () => {
      const token1 = new Token<string>("Token1");
      const token2 = new Token<number>("Token2");

      container.registerValue(token1, "value1");
      container.registerValue(token2, 42);

      expect(container.has(token1)).toBe(true);
      expect(container.has(token2)).toBe(true);

      container.clear();

      expect(container.has(token1)).toBe(false);
      expect(container.has(token2)).toBe(false);
    });

    it("should reset singleton cache", () => {
      const token = new Token<{ id: number }>("CachedSingleton");
      let counter = 0;

      container.registerSingleton(token, () => ({ id: ++counter }));

      const instance1 = container.resolve(token);
      expect(instance1.id).toBe(1);

      container.clear();

      // Re-register after clear
      container.registerSingleton(token, () => ({ id: ++counter }));

      const instance2 = container.resolve(token);
      expect(instance2.id).toBe(2);
      expect(instance2).not.toBe(instance1);
    });

    it("should not affect parent container", () => {
      const token = new Token<string>("ParentSafe");
      container.registerValue(token, "parent-value");

      const child = container.createChild();
      child.registerValue(token, "child-value");

      child.clear();

      // Child now resolves from parent
      expect(child.resolve(token)).toBe("parent-value");
      // Parent unchanged
      expect(container.resolve(token)).toBe("parent-value");
    });
  });

  describe("type safety", () => {
    it("should maintain type safety between token and value", () => {
      interface UserService {
        getUser(id: number): string;
      }

      const userServiceToken = new Token<UserService>("UserService");

      container.registerValue(userServiceToken, {
        getUser: (id: number) => `User ${id}`,
      });

      const userService = container.resolve(userServiceToken);

      // This should be type-safe
      expect(userService.getUser(1)).toBe("User 1");
    });
  });
});

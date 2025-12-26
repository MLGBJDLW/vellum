/**
 * Dependency Injection Container
 *
 * Type-safe DI container with support for:
 * - Factory registrations (new instance each resolve)
 * - Singleton registrations (cached instance)
 * - Value registrations (pre-instantiated)
 * - Hierarchical containers (parent-child scopes)
 */

/**
 * Type-safe token for identifying dependencies.
 * Each token has a unique symbol ID to prevent collisions.
 */
export class Token<T> {
  readonly id: symbol;
  /** Phantom property to maintain type relationship (never actually set) */
  declare readonly _type: T;

  constructor(public readonly name: string) {
    this.id = Symbol(name);
  }

  toString(): string {
    return `Token(${this.name})`;
  }
}

/**
 * Registration types for the container
 */
type Registration<T> =
  | { type: "factory"; factory: () => T }
  | { type: "singleton"; factory: () => T; instance?: T }
  | { type: "value"; value: T };

/**
 * Dependency Injection Container
 *
 * Manages dependency registration and resolution with support for:
 * - Factory: Creates new instance on each resolve
 * - Singleton: Creates once, returns same instance
 * - Value: Returns pre-instantiated value
 * - Child containers: Inherit parent registrations with override capability
 */
export class Container {
  private readonly registrations = new Map<symbol, Registration<unknown>>();
  private readonly parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  /**
   * Register a factory function that creates a new instance on each resolve.
   */
  register<T>(token: Token<T>, factory: () => T): void {
    this.registrations.set(token.id, { type: "factory", factory });
  }

  /**
   * Register a factory function that creates a singleton instance.
   * The instance is created on first resolve and cached for subsequent calls.
   */
  registerSingleton<T>(token: Token<T>, factory: () => T): void {
    this.registrations.set(token.id, { type: "singleton", factory });
  }

  /**
   * Register a pre-instantiated value.
   */
  registerValue<T>(token: Token<T>, value: T): void {
    this.registrations.set(token.id, { type: "value", value });
  }

  /**
   * Resolve a dependency by its token.
   * @throws Error if the token is not registered
   */
  resolve<T>(token: Token<T>): T {
    const result = this.tryResolve(token);
    if (result === undefined) {
      throw new Error(`No registration found for ${token.toString()}`);
    }
    return result;
  }

  /**
   * Try to resolve a dependency by its token.
   * @returns The resolved value or undefined if not registered
   */
  tryResolve<T>(token: Token<T>): T | undefined {
    const registration = this.registrations.get(token.id) as Registration<T> | undefined;

    if (registration) {
      return this.resolveRegistration(registration);
    }

    // Walk up to parent if not found locally
    if (this.parent) {
      return this.parent.tryResolve(token);
    }

    return undefined;
  }

  /**
   * Check if a token is registered in this container or its parent chain.
   */
  has<T>(token: Token<T>): boolean {
    if (this.registrations.has(token.id)) {
      return true;
    }
    if (this.parent) {
      return this.parent.has(token);
    }
    return false;
  }

  /**
   * Create a child container that inherits registrations from this container.
   * Child registrations override parent registrations without affecting the parent.
   */
  createChild(): Container {
    return new Container(this);
  }

  /**
   * Clear all registrations and reset singleton cache.
   * Does not affect parent container.
   */
  clear(): void {
    this.registrations.clear();
  }

  /**
   * Resolve a registration to its value
   */
  private resolveRegistration<T>(registration: Registration<T>): T {
    switch (registration.type) {
      case "factory":
        return registration.factory();

      case "singleton":
        if (!("instance" in registration) || registration.instance === undefined) {
          registration.instance = registration.factory();
        }
        return registration.instance;

      case "value":
        return registration.value;
    }
  }
}

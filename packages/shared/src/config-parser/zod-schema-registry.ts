/**
 * Centralized Zod schema registry for managing config schemas.
 * Provides type-safe registration, retrieval, and extension of schemas.
 *
 * @module config-parser/zod-schema-registry
 * @see REQ-032
 */

import type { ZodObject, ZodRawShape, ZodSchema, ZodType, z } from "zod";

/**
 * Options for creating a parser from a registered schema
 */
export interface CreateParserOptions {
  /** Whether to throw on validation errors (default: false) */
  strict?: boolean;
  /** Default values to merge with parsed data */
  defaults?: Record<string, unknown>;
}

/**
 * Result of a validation attempt
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: z.ZodError;
}

/**
 * Thread-safe singleton registry for Zod schemas.
 * Enables schema registration, retrieval, extension, and parser creation.
 *
 * @example
 * ```typescript
 * const registry = ZodSchemaRegistry.getInstance();
 *
 * // Register a base schema
 * registry.registerBase('metadata', baseMetadataSchema);
 *
 * // Extend the base schema
 * const agentsSchema = registry.extend('metadata', {
 *   allowedTools: z.array(z.string()).optional(),
 * });
 *
 * // Register extended schema
 * registry.register('agents', agentsSchema);
 *
 * // Create a parser
 * const parser = registry.createParser('agents');
 * const result = parser.safeParse(data);
 * ```
 */
export class ZodSchemaRegistry {
  private static instance: ZodSchemaRegistry | null = null;

  private readonly schemas = new Map<string, ZodSchema>();
  private readonly baseSchemas = new Map<string, ZodObject<ZodRawShape>>();

  /**
   * Private constructor to enforce singleton pattern.
   * Use `getInstance()` to access the registry.
   */
  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of the schema registry.
   * Thread-safe implementation using double-checked locking pattern.
   *
   * @returns The singleton ZodSchemaRegistry instance
   */
  public static getInstance(): ZodSchemaRegistry {
    if (!ZodSchemaRegistry.instance) {
      ZodSchemaRegistry.instance = new ZodSchemaRegistry();
    }
    return ZodSchemaRegistry.instance;
  }

  /**
   * Resets the singleton instance.
   * Primarily for testing purposes.
   */
  public static resetInstance(): void {
    ZodSchemaRegistry.instance = null;
  }

  /**
   * Registers a base schema that can be extended.
   * Base schemas must be ZodObjects to support extension.
   *
   * @param name - Unique identifier for the base schema
   * @param schema - ZodObject schema to register
   * @returns This registry instance for chaining
   * @throws Error if name is already registered as a base schema
   */
  public registerBase<T extends ZodRawShape>(name: string, schema: ZodObject<T>): this {
    if (this.baseSchemas.has(name)) {
      throw new Error(`Base schema "${name}" is already registered`);
    }
    this.baseSchemas.set(name, schema as ZodObject<ZodRawShape>);
    // Also register as a regular schema for retrieval
    this.schemas.set(name, schema);
    return this;
  }

  /**
   * Registers a schema with the given name.
   *
   * @param name - Unique identifier for the schema
   * @param schema - Zod schema to register
   * @returns This registry instance for chaining
   * @throws Error if name is already registered
   */
  public register<T extends ZodType>(name: string, schema: T): this {
    if (this.schemas.has(name)) {
      throw new Error(`Schema "${name}" is already registered`);
    }
    this.schemas.set(name, schema);
    return this;
  }

  /**
   * Retrieves a registered schema by name.
   *
   * @param name - The name of the schema to retrieve
   * @returns The registered schema
   * @throws Error if schema is not found
   */
  public get<T extends ZodType = ZodType>(name: string): T {
    const schema = this.schemas.get(name);
    if (!schema) {
      throw new Error(`Schema "${name}" is not registered`);
    }
    return schema as T;
  }

  /**
   * Checks if a schema is registered.
   *
   * @param name - The name to check
   * @returns True if schema exists
   */
  public has(name: string): boolean {
    return this.schemas.has(name);
  }

  /**
   * Gets all registered schema names.
   *
   * @returns Array of registered schema names
   */
  public getRegisteredNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Extends a base schema with additional fields.
   *
   * @param baseName - Name of the base schema to extend
   * @param extension - Additional fields to add
   * @returns A new ZodObject with merged fields
   * @throws Error if base schema is not found or not extensible
   */
  public extend<T extends ZodRawShape>(baseName: string, extension: T): ZodObject<T & ZodRawShape> {
    const baseSchema = this.baseSchemas.get(baseName);
    if (!baseSchema) {
      throw new Error(`Base schema "${baseName}" is not registered or is not extensible`);
    }
    return baseSchema.extend(extension) as ZodObject<T & ZodRawShape>;
  }

  /**
   * Creates a validator function for a registered schema.
   *
   * @param name - Name of the registered schema
   * @param options - Parser options
   * @returns Object with parse methods
   */
  public createParser<T>(
    name: string,
    options: CreateParserOptions = {}
  ): {
    parse: (data: unknown) => T;
    safeParse: (data: unknown) => ValidationResult<T>;
    validate: (data: unknown) => boolean;
  } {
    const schema = this.get(name);
    const { defaults = {} } = options;

    return {
      /**
       * Parses data and throws on validation failure.
       */
      parse: (data: unknown): T => {
        const merged = { ...defaults, ...(data as object) };
        return schema.parse(merged) as T;
      },

      /**
       * Safely parses data without throwing.
       */
      safeParse: (data: unknown): ValidationResult<T> => {
        const merged = { ...defaults, ...(data as object) };
        const result = schema.safeParse(merged);
        if (result.success) {
          return { success: true, data: result.data as T };
        }
        return { success: false, error: result.error };
      },

      /**
       * Validates data and returns boolean result.
       */
      validate: (data: unknown): boolean => {
        const merged = { ...defaults, ...(data as object) };
        return schema.safeParse(merged).success;
      },
    };
  }

  /**
   * Unregisters a schema by name.
   *
   * @param name - The name of the schema to unregister
   * @returns True if schema was unregistered, false if not found
   */
  public unregister(name: string): boolean {
    const deleted = this.schemas.delete(name);
    this.baseSchemas.delete(name);
    return deleted;
  }

  /**
   * Clears all registered schemas.
   */
  public clear(): void {
    this.schemas.clear();
    this.baseSchemas.clear();
  }
}

// Export singleton accessor for convenience
export const schemaRegistry = (): ZodSchemaRegistry => ZodSchemaRegistry.getInstance();

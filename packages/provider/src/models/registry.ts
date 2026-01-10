/**
 * Model registry for lookup and management
 * @module models/registry
 */

import type { ProviderType } from "../types.js";
import type { ModelInfo, ModelLookupOptions, ProviderCatalog } from "./types.js";

/**
 * ModelRegistry provides centralized model lookup and management
 */
export class ModelRegistry {
  private models: Map<string, ModelInfo> = new Map();
  private aliases: Map<string, string> = new Map();
  private providerDefaults: Map<ProviderType, string> = new Map();
  private providerModels: Map<ProviderType, ModelInfo[]> = new Map();

  /**
   * Register a single model
   */
  register(model: ModelInfo): void {
    this.models.set(model.id, model);

    // Register aliases
    if (model.aliases) {
      for (const alias of model.aliases) {
        this.aliases.set(alias, model.id);
      }
    }

    // Update provider index
    const providerList = this.providerModels.get(model.provider) ?? [];
    providerList.push(model);
    this.providerModels.set(model.provider, providerList);
  }

  /**
   * Register multiple models from a provider catalog
   */
  registerCatalog(catalog: ProviderCatalog): void {
    for (const model of catalog.models) {
      this.register(model);
    }
    this.providerDefaults.set(catalog.provider, catalog.defaultModelId);
  }

  /**
   * Get a model by ID
   */
  get(id: string, options: ModelLookupOptions = {}): ModelInfo | undefined {
    const { includeDeprecated = false, searchAliases = true } = options;

    // Direct lookup
    let model = this.models.get(id);

    // Try alias lookup
    if (!model && searchAliases) {
      const primaryId = this.aliases.get(id);
      if (primaryId) {
        model = this.models.get(primaryId);
      }
    }

    // Filter deprecated if needed
    if (model?.deprecated && !includeDeprecated) {
      return undefined;
    }

    return model;
  }

  /**
   * Check if a model exists
   */
  has(id: string, options: ModelLookupOptions = {}): boolean {
    return this.get(id, options) !== undefined;
  }

  /**
   * Get all models for a provider
   */
  getByProvider(provider: ProviderType, options: ModelLookupOptions = {}): ModelInfo[] {
    const { includeDeprecated = false } = options;
    const models = this.providerModels.get(provider) ?? [];

    if (includeDeprecated) {
      return models;
    }

    return models.filter((m) => !m.deprecated);
  }

  /**
   * Get the default model for a provider
   */
  getDefault(provider: ProviderType): ModelInfo | undefined {
    const defaultId = this.providerDefaults.get(provider);
    if (!defaultId) return undefined;
    return this.get(defaultId);
  }

  /**
   * Set the default model for a provider
   */
  setDefault(provider: ProviderType, modelId: string): void {
    if (!this.has(modelId)) {
      throw new Error(`Model ${modelId} not found in registry`);
    }
    this.providerDefaults.set(provider, modelId);
  }

  /**
   * Get all registered models
   */
  getAll(options: ModelLookupOptions = {}): ModelInfo[] {
    const { includeDeprecated = false } = options;
    const models = Array.from(this.models.values());

    if (includeDeprecated) {
      return models;
    }

    return models.filter((m) => !m.deprecated);
  }

  /**
   * Get all registered providers
   */
  getProviders(): ProviderType[] {
    return Array.from(this.providerModels.keys());
  }

  /**
   * Search models by criteria
   */
  search(criteria: {
    provider?: ProviderType;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsReasoning?: boolean;
    minContextWindow?: number;
    maxInputPrice?: number;
  }): ModelInfo[] {
    let results = this.getAll();

    if (criteria.provider) {
      results = results.filter((m) => m.provider === criteria.provider);
    }

    if (criteria.supportsTools !== undefined) {
      results = results.filter((m) => m.supportsTools === criteria.supportsTools);
    }

    if (criteria.supportsVision !== undefined) {
      results = results.filter((m) => m.supportsVision === criteria.supportsVision);
    }

    if (criteria.supportsReasoning !== undefined) {
      results = results.filter((m) => m.supportsReasoning === criteria.supportsReasoning);
    }

    if (criteria.minContextWindow !== undefined) {
      const minContextWindow = criteria.minContextWindow;
      results = results.filter((m) => m.contextWindow >= minContextWindow);
    }

    if (criteria.maxInputPrice !== undefined) {
      const maxInputPrice = criteria.maxInputPrice;
      results = results.filter((m) => m.inputPrice <= maxInputPrice);
    }

    return results;
  }

  /**
   * Get model count
   */
  get size(): number {
    return this.models.size;
  }

  /**
   * Clear all registered models
   */
  clear(): void {
    this.models.clear();
    this.aliases.clear();
    this.providerDefaults.clear();
    this.providerModels.clear();
  }

  /**
   * Resolve a model ID, following aliases
   */
  resolveId(id: string): string {
    return this.aliases.get(id) ?? id;
  }
}

/**
 * Global model registry instance
 */
export const modelRegistry = new ModelRegistry();

// ============================================
// Provider Fallback Chain (T035 - REQ-012)
// ============================================

import type { FallbackResult } from "./types.js";

/**
 * Interface for a fallback provider.
 *
 * @template T - The type of value the provider returns
 */
export interface FallbackProvider<T> {
  /** Unique name identifying the provider */
  name: string;
  /** Function to execute to get the value */
  execute: () => Promise<T>;
  /** Optional function to check if the provider is healthy */
  isHealthy?: () => boolean;
}

/**
 * Provider fallback chain that executes providers in order on failure.
 * AC-012-2: ProviderFallbackChain executes providers in order on failure
 *
 * @template T - The type of value returned by providers
 *
 * @example
 * ```typescript
 * const chain = new ProviderFallbackChain([
 *   { name: 'openai', execute: () => callOpenAI() },
 *   { name: 'anthropic', execute: () => callAnthropic() },
 *   { name: 'local', execute: () => callLocalModel() },
 * ]);
 *
 * const result = await chain.execute();
 * console.log(`Got response from: ${result.source === 'primary' ? 'primary' : `fallback #${result.fallbackIndex}`}`);
 * ```
 */
export class ProviderFallbackChain<T> {
  private providers: FallbackProvider<T>[];
  private preferredIndex: number = 0;

  /**
   * Creates a new provider fallback chain.
   *
   * @param providers - Array of providers to use in fallback order
   * @throws Error if providers array is empty
   */
  constructor(providers: FallbackProvider<T>[]) {
    if (providers.length === 0) {
      throw new Error("ProviderFallbackChain requires at least one provider");
    }
    this.providers = [...providers];
  }

  /**
   * Executes the provider chain, trying each provider in order until one succeeds.
   * AC-012-2: Executes providers in order on failure
   *
   * @returns FallbackResult with the value and source information
   * @throws Error if all providers fail
   */
  async execute(): Promise<FallbackResult<T>> {
    let lastError: Error | undefined;
    let attempts = 0;

    // Start from the preferred provider
    const orderedProviders = this.getOrderedProviders();

    for (const provider of orderedProviders) {
      attempts++;

      // Skip unhealthy providers if health check is available
      if (provider.isHealthy && !provider.isHealthy()) {
        continue;
      }

      try {
        const value = await provider.execute();

        // Calculate actual index in original array
        const actualIndex = this.providers.findIndex((p) => p.name === provider.name);
        const isPrimary = actualIndex === this.preferredIndex;

        return {
          value,
          source: isPrimary ? "primary" : "fallback",
          fallbackIndex: isPrimary ? undefined : actualIndex,
          error: lastError,
          attempts,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next provider
      }
    }

    // All providers failed
    throw new Error(
      `All ${this.providers.length} providers failed. Last error: ${lastError?.message ?? "Unknown error"}`
    );
  }

  /**
   * Sets the preferred provider by name.
   * The preferred provider will be tried first before falling back to others.
   *
   * @param name - Name of the provider to prefer
   * @throws Error if provider with given name is not found
   */
  setPreferred(name: string): void {
    const index = this.providers.findIndex((p) => p.name === name);
    if (index === -1) {
      throw new Error(`Provider "${name}" not found in chain`);
    }
    this.preferredIndex = index;
  }

  /**
   * Resets the preferred provider to the first provider in the chain.
   */
  reset(): void {
    this.preferredIndex = 0;
  }

  /**
   * Returns a readonly view of the providers in the chain.
   */
  getProviders(): readonly FallbackProvider<T>[] {
    return this.providers;
  }

  /**
   * Gets providers ordered with preferred first.
   */
  private getOrderedProviders(): FallbackProvider<T>[] {
    if (this.preferredIndex === 0) {
      return this.providers;
    }

    // Move preferred to front while preserving relative order of others
    const preferred = this.providers[this.preferredIndex];
    if (!preferred) return this.providers;
    const others = this.providers.filter((_, i) => i !== this.preferredIndex);
    return [preferred, ...others];
  }
}

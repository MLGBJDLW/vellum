// ============================================
// T006: Environment Variable Expansion Utility
// ============================================

/**
 * Pattern for matching environment variable placeholders.
 * Matches: ${env:VAR_NAME}
 * - Captures the variable name (alphanumeric and underscores)
 */
const ENV_VAR_PATTERN = /\$\{env:(\w+)\}/g;

/**
 * Recursively expands environment variable placeholders in a configuration object.
 * Supports the `${env:VAR_NAME}` syntax.
 *
 * @template T - Type of the configuration object
 * @param config - Configuration value to expand (can be string, array, object, or primitive)
 * @returns Configuration with environment variables expanded
 *
 * @example
 * ```typescript
 * // String expansion
 * process.env.API_KEY = 'secret123';
 * expandEnvironmentVariables('Bearer ${env:API_KEY}');
 * // Returns: 'Bearer secret123'
 *
 * // Object expansion
 * expandEnvironmentVariables({
 *   headers: { Authorization: '${env:API_KEY}' },
 *   env: { NODE_ENV: '${env:NODE_ENV}' }
 * });
 * // Returns: { headers: { Authorization: 'secret123' }, env: { NODE_ENV: 'production' } }
 *
 * // Missing variable returns empty string
 * expandEnvironmentVariables('${env:MISSING_VAR}');
 * // Returns: ''
 * ```
 */
export function expandEnvironmentVariables<T>(config: T): T {
  // Handle string values - the core expansion logic
  if (typeof config === "string") {
    return config.replace(ENV_VAR_PATTERN, (_, varName: string) => {
      return process.env[varName] ?? "";
    }) as T;
  }

  // Handle arrays - recursively expand each element
  if (Array.isArray(config)) {
    return config.map(expandEnvironmentVariables) as T;
  }

  // Handle objects - recursively expand each value
  if (typeof config === "object" && config !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = expandEnvironmentVariables(value);
    }
    return result as T;
  }

  // Return primitives unchanged (number, boolean, null, undefined)
  return config;
}

/**
 * Check if a string contains any environment variable placeholders.
 *
 * @param value - String to check
 * @returns True if the string contains `${env:...}` patterns
 *
 * @example
 * ```typescript
 * hasEnvironmentVariables('Bearer ${env:API_KEY}'); // true
 * hasEnvironmentVariables('static-value'); // false
 * ```
 */
export function hasEnvironmentVariables(value: string): boolean {
  // Reset lastIndex for global regex
  ENV_VAR_PATTERN.lastIndex = 0;
  return ENV_VAR_PATTERN.test(value);
}

/**
 * Extract all environment variable names from a string.
 *
 * @param value - String to extract variable names from
 * @returns Array of variable names (without the ${env:} wrapper)
 *
 * @example
 * ```typescript
 * extractEnvironmentVariables('${env:API_KEY} and ${env:SECRET}');
 * // Returns: ['API_KEY', 'SECRET']
 * ```
 */
export function extractEnvironmentVariables(value: string): string[] {
  const variables: string[] = [];
  let match: RegExpExecArray | null;

  // Create new regex to avoid state issues with global flag
  const pattern = /\$\{env:(\w+)\}/g;

  while ((match = pattern.exec(value)) !== null) {
    const varName = match[1];
    if (varName !== undefined) {
      variables.push(varName);
    }
  }

  return variables;
}

/**
 * Validate that all required environment variables are defined.
 *
 * @param value - String containing environment variable placeholders
 * @returns Object with missing variable names (empty if all are defined)
 *
 * @example
 * ```typescript
 * process.env.API_KEY = 'secret';
 * delete process.env.MISSING;
 *
 * validateEnvironmentVariables('${env:API_KEY} ${env:MISSING}');
 * // Returns: { missing: ['MISSING'], valid: false }
 *
 * validateEnvironmentVariables('${env:API_KEY}');
 * // Returns: { missing: [], valid: true }
 * ```
 */
export function validateEnvironmentVariables(value: string): {
  missing: string[];
  valid: boolean;
} {
  const variables = extractEnvironmentVariables(value);
  const missing = variables.filter((varName) => process.env[varName] === undefined);

  return {
    missing,
    valid: missing.length === 0,
  };
}

/**
 * Recursively validate all environment variables in a configuration object.
 *
 * @param config - Configuration to validate
 * @returns Object with all missing variable names
 */
export function validateConfigEnvironmentVariables(config: unknown): {
  missing: string[];
  valid: boolean;
} {
  const allMissing: string[] = [];

  function collectMissing(value: unknown): void {
    if (typeof value === "string") {
      const { missing } = validateEnvironmentVariables(value);
      allMissing.push(...missing);
    } else if (Array.isArray(value)) {
      value.forEach(collectMissing);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(collectMissing);
    }
  }

  collectMissing(config);

  // Remove duplicates
  const uniqueMissing = [...new Set(allMissing)];

  return {
    missing: uniqueMissing,
    valid: uniqueMissing.length === 0,
  };
}

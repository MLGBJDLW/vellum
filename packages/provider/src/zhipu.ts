/**
 * Zhipu Provider (智谱)
 *
 * Implements support for Zhipu AI's GLM models with JWT authentication.
 * Zhipu uses a unique JWT-based authentication system where the API key
 * is in the format {id}.{secret} and requires generating a signed JWT.
 *
 * @module @vellum/provider/zhipu
 */

import { ZHIPU_MODELS } from "./models/providers/zhipu.js";
import { OpenAICompatibleProvider } from "./openai-compat.js";
import type { ModelInfo, ProviderOptions } from "./types.js";

// =============================================================================
// JWT Token Generation for Zhipu
// =============================================================================

/**
 * Base64URL encode a string (URL-safe base64)
 * @param str - String to encode
 * @returns Base64URL encoded string
 */
function base64UrlEncode(str: string): string {
  // Convert string to base64
  const base64 = Buffer.from(str).toString("base64");
  // Make URL-safe: replace + with -, / with _, remove padding =
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * HMAC-SHA256 signature using Web Crypto API or Node.js crypto
 * @param message - Message to sign
 * @param secret - Secret key for signing
 * @returns Base64URL encoded signature
 */
async function hmacSha256(message: string, secret: string): Promise<string> {
  // Use Node.js crypto module
  const crypto = await import("node:crypto");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(message);
  const signature = hmac.digest("base64");
  // Make URL-safe
  return signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate JWT token for Zhipu API authentication
 *
 * The API key format is {id}.{secret}. We generate a JWT with:
 * - Header: { alg: "HS256", sign_type: "SIGN" }
 * - Payload: { api_key: id, exp: now + 30 minutes, timestamp: now }
 * - Signature: HMAC-SHA256(header.payload, secret)
 *
 * @param apiKey - Zhipu API key in format {id}.{secret}
 * @returns JWT token for Authorization header
 * @throws Error if API key format is invalid
 */
export async function generateZhipuToken(apiKey: string): Promise<string> {
  const parts = apiKey.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid Zhipu API key format. Expected format: {id}.{secret}");
  }

  const [id, secret] = parts as [string, string];

  // JWT Header
  const header = {
    alg: "HS256",
    sign_type: "SIGN",
  };

  // JWT Payload - exp is 30 minutes from now (in milliseconds for Zhipu)
  const now = Date.now();
  const payload = {
    api_key: id,
    exp: now + 30 * 60 * 1000, // 30 minutes in milliseconds
    timestamp: now,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(signatureInput, secret);

  // Return complete JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// =============================================================================
// Zhipu Provider Implementation
// =============================================================================

/**
 * Zhipu AI LLM Provider (智谱)
 *
 * Supports Zhipu's GLM model family including:
 * - GLM-4: Flagship model with strong general capabilities
 * - GLM-4-Flash: Fast, cost-effective model
 * - GLM-4V: Vision-enabled multimodal model
 * - GLM-4-Plus: Enhanced reasoning capabilities
 *
 * Uses JWT authentication - the API key is split into id and secret,
 * and a JWT is generated for each request.
 *
 * @example
 * ```typescript
 * const provider = new ZhipuProvider();
 * await provider.initialize({ apiKey: 'your-id.your-secret' });
 *
 * const result = await provider.complete({
 *   model: 'glm-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class ZhipuProvider extends OpenAICompatibleProvider {
  /**
   * Default base URL for Zhipu API
   */
  readonly defaultBaseUrl = "https://open.bigmodel.cn/api/paas/v4";

  /**
   * Provider identifier
   */
  readonly providerName = "zhipu";

  /**
   * Initialize the provider with JWT-based authentication
   *
   * Zhipu requires JWT tokens instead of simple Bearer tokens.
   * We generate a JWT from the API key and use it for auth.
   *
   * @param options - Provider configuration
   */
  async initialize(options: ProviderOptions): Promise<void> {
    if (!options.apiKey) {
      throw new Error("Zhipu API key is required");
    }

    // Generate JWT token from API key
    const jwtToken = await generateZhipuToken(options.apiKey);

    // Initialize with JWT token as the "apiKey" for Bearer auth
    const finalOptions: ProviderOptions = {
      ...options,
      apiKey: jwtToken,
      baseUrl: options.baseUrl ?? this.defaultBaseUrl,
    };

    // Call grandparent's initialize (OpenAIProvider)
    return super.initialize(finalOptions);
  }

  /**
   * Get the model catalog for Zhipu
   *
   * @returns Array of available Zhipu models
   */
  protected getModelCatalog(): ModelInfo[] {
    return ZHIPU_MODELS;
  }

  /**
   * Get the default model for Zhipu
   *
   * @returns Default model ID
   */
  getDefaultModel(): string {
    return "glm-4";
  }
}

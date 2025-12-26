import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { OpenAIProvider } from "./openai.js";
import type { Provider, ProviderType } from "./types.js";

const providers: Map<ProviderType, Provider> = new Map();

export function createProvider(type: ProviderType): Provider {
  switch (type) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "google":
      return new GoogleProvider();
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}

export function getProvider(type: ProviderType): Provider {
  const existing = providers.get(type);
  if (existing) {
    return existing;
  }
  const provider = createProvider(type);
  providers.set(type, provider);
  return provider;
}

/** One provider-scoped environment map for adapters and the application's credential store. */
export const PROVIDER_CREDENTIAL_ENV_VARS: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY", "AZURE_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  replicate: ["REPLICATE_API_TOKEN", "REPLICATE_API_KEY"],
  huggingface: ["HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  qwen: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY", "MOONSHOTAI_API_KEY"],
  zhipu: ["ZHIPU_API_KEY", "ZHIPUAI_API_KEY", "ZAI_API_KEY"],
  yi: ["YI_API_KEY"],
  baichuan: ["BAICHUAN_API_KEY"],
  doubao: ["DOUBAO_API_KEY", "ARK_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  lmstudio: ["LMSTUDIO_API_KEY"],
};

export function getCredentialEnvVars(provider: string): readonly string[] {
  const normalized = provider.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PROVIDER_CREDENTIAL_ENV_VARS[normalized] ?? [`${provider.toUpperCase()}_API_KEY`];
}

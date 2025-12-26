export interface ProviderConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

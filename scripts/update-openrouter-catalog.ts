/** Refresh the offline shortlist; /model refresh openrouter discovers the complete catalog. */
import { writeFile } from "node:fs/promises";
import { normalizeDiscoveredModels } from "../packages/provider/src/models/discovery.js";

const response = await fetch("https://openrouter.ai/api/v1/models", {
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`OpenRouter catalog returned HTTP ${response.status}`);
const body: unknown = await response.json();
if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
  throw new Error("OpenRouter catalog is missing its data array");
}
const families =
  /^(openai\/gpt-6|anthropic\/claude-(?:opus|sonnet|haiku)-5|anthropic\/claude-fable-5|google\/gemini-(?:4|3\.8)|deepseek\/deepseek-v4|moonshotai\/kimi-k3|minimax\/minimax-m3|mistralai\/mistral-large-4|qwen\/qwen3\.8|z-ai\/glm-5\.3|x-ai\/grok-4\.[67])/;
const models = normalizeDiscoveredModels("openrouter", body.data).filter((model) =>
  families.test(model.id)
);
if (models.length === 0 || !models.some((model) => model.id === "openai/gpt-6.1-sol")) {
  throw new Error(
    "OpenRouter catalog is empty or missing the configured default; keeping the previous snapshot"
  );
}
const date = new Date().toISOString().slice(0, 10);
await writeFile(
  new URL("../packages/provider/src/models/providers/openrouter.ts", import.meta.url),
  `/** OpenRouter offline shortlist from https://openrouter.ai/api/v1/models, ${date}.\n * Regenerate: pnpm exec tsx scripts/update-openrouter-catalog.ts\n */\nimport type { ModelInfo } from "../types.js";\nexport const OPENROUTER_MODELS: ModelInfo[] = ${JSON.stringify(models, null, 2)};\n`
);
console.log(
  `Updated ${models.length} OpenRouter models from ${body.data.length} endpoint records.`
);

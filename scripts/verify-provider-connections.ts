/** Read existing credentials without displaying them. --live enables bounded billable probes. */

import { createCredentialManager } from "../packages/cli/src/commands/auth.js";
import {
  fetchTool,
  resolveWebProvider,
  searchTool,
  UnifiedToolContainer,
} from "../packages/core/dist/index.js";
import { DEFAULT_MODEL_IDS, ProviderRegistry } from "../packages/provider/dist/index.js";

process.env.VELLUM_DEBUG = "";
const live = process.argv.includes("--live");
const selected = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1];
const manager = await createCredentialManager();
const registry = new ProviderRegistry({ credentialManager: manager });
const container = new UnifiedToolContainer();
container.registerBuiltins();
const tools = container.getProviderToolDefinitions();
const reports: Record<string, unknown>[] = [];
function report(result: Record<string, unknown>) {
  reports.push(result);
  console.log(JSON.stringify(result));
}

for (const [provider, model] of Object.entries(DEFAULT_MODEL_IDS)) {
  if (selected && selected !== provider) continue;
  if (provider === "ollama" || provider === "lmstudio") continue;
  let resolvedKey: string | undefined;
  let mode = "complete";
  try {
    const credential = await manager.resolve(provider);
    if (!credential.ok || !credential.value) {
      report({
        provider,
        status: credential.ok ? "not_configured" : "credential_store_unavailable",
      });
      continue;
    }
    resolvedKey = credential.value.value;
    if (!live) {
      report({ provider, status: "configured_not_probed" });
      continue;
    }
    const adapter = await registry.get({ type: provider as keyof typeof DEFAULT_MODEL_IDS, model });
    if (!adapter.complete) throw new Error("Adapter has no completion method");
    const result = await adapter.complete({
      model,
      messages: [
        { role: "user", content: "Connection verification only. Reply OK; do not call any tools." },
      ],
      tools,
      maxTokens: 64,
      thinking: { enabled: false },
      abortSignal: AbortSignal.timeout(30_000),
    });
    report({
      provider,
      model,
      status: "passed",
      mode,
      toolSchemas: tools.length,
      stopReason: result.stopReason,
    });
    mode = "stream";
    if (!adapter.stream) throw new Error("Adapter has no stream method");
    let completed = false;
    let textCharacters = 0;
    for await (const event of adapter.stream({
      model,
      messages: [
        { role: "user", content: "Connection verification only. Reply OK; do not call any tools." },
      ],
      tools,
      maxTokens: 64,
      thinking: { enabled: false },
      abortSignal: AbortSignal.timeout(30_000),
    })) {
      if (event.type === "error") throw new Error(`Provider stream failed (${event.code})`);
      if (event.type === "text") textCharacters += event.content.length;
      if (event.type === "done") completed = true;
    }
    if (!completed) throw new Error("Provider stream did not reach a terminal event");
    report({ provider, model, mode, status: "passed", toolSchemas: tools.length, textCharacters });
  } catch (error) {
    const problem = error as {
      statusCode?: number;
      code?: string | number;
      category?: string;
      message?: string;
    };
    let detail = problem.message ?? "Connection failed";
    if (resolvedKey) detail = detail.split(resolvedKey).join("<REDACTED>");
    detail = detail
      .replace(/Bearer\s+\S+/gi, "Bearer <REDACTED>")
      .replace(/api[_-]?key[=:][^&\s]+/gi, "api_key=<REDACTED>");
    report({
      provider,
      mode,
      status: "failed",
      httpStatus: problem.statusCode,
      code: problem.code,
      category: problem.category ?? "connection_error",
      detail: detail.slice(0, 1200),
    });
  }
}

if (!selected || selected === "deepseek") {
  const service = await resolveWebProvider("deepseek");
  if (live && service.enabled && service.apiKey) {
    const context = {
      workingDir: process.cwd(),
      sessionId: "connection-check",
      messageId: "connection-check",
      callId: "connection-check",
      abortSignal: AbortSignal.timeout(30_000),
      checkPermission: async () => true,
    };
    const search = await searchTool.execute(
      { query: "DeepSeek API documentation", maxResults: 1, engine: "deepseek" },
      context
    );
    report({
      service: "deepseek_search",
      status: search.success ? "passed" : "failed",
      ...(search.success ? { results: search.output.totalResults } : {}),
    });
    const fetched = await fetchTool.execute(
      { url: "https://example.com/", provider: "deepseek", maxChars: 500, timeout: 20000 },
      { ...context, abortSignal: AbortSignal.timeout(25_000) }
    );
    report({
      service: "deepseek_fetch",
      status: fetched.success ? "passed" : "failed",
      ...(fetched.success ? { contentCharacters: fetched.output.content.length } : {}),
    });
  } else {
    report({
      service: "deepseek_search_fetch",
      status: !service.enabled
        ? "disabled"
        : service.apiKey
          ? "configured_not_probed"
          : "not_configured",
    });
  }
}
if (reports.some((entry) => entry.status === "failed")) process.exitCode = 1;

import { type CredentialManager, configureWebTools } from "@vellum/core";
import { loadSettings } from "../tui/i18n/settings-integration.js";

/** Use the same live settings and credential owner as interactive and headless inference. */
export function configureWebToolsForCli(manager: CredentialManager): void {
  configureWebTools({
    getSettings: () => loadSettings().search ?? {},
    resolveCredential: async (provider) => {
      for (const namespace of [`web:${provider}`, provider]) {
        const result = await manager.resolve(namespace);
        if (result.ok && result.value?.type === "api_key" && result.value.value.trim()) {
          return { apiKey: result.value.value };
        }
      }
      return undefined;
    },
  });
}

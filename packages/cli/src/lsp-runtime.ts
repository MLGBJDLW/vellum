import type { LspHub } from "@vellum/lsp";

// Shared by the active workspace's tools and /lsp commands. Prepared hubs stay
// private until the workspace commits, so config and caches never cross roots.
let activeHub: LspHub | null = null;
const listeners = new Set<() => void>();

export function getWorkspaceLspHub(): LspHub | null {
  return activeHub;
}

export function setWorkspaceLspHub(hub: LspHub | null): void {
  activeHub = hub;
  notifyWorkspaceLspChanged();
}

export function notifyWorkspaceLspChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("[Vellum] LSP status listener failed:", error);
    }
  }
}

export function subscribeWorkspaceLsp(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

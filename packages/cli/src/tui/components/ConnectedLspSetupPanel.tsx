import { LanguageDetector } from "@vellum/lsp";
import { Text } from "ink";
import { useCallback, useEffect, useState } from "react";
import { useLsp } from "../context/LspContext.js";
import { getLspManager } from "../lsp-integration.js";
import { LspSetupPanel, type LspSetupPanelProps, type ServerInfo } from "./LspSetupPanel.js";

/** Connect setup actions to the same hub used by language tools and auto mode. */
export function ConnectedLspSetupPanel(
  props: Omit<LspSetupPanelProps, "servers" | "onInstall" | "onDetect">
) {
  const { isInitialized, refresh } = useLsp();
  const hub = isInitialized ? getLspManager().getHub() : null;
  const [servers, setServers] = useState<readonly ServerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setServers([]);
    setError(null);
    if (hub) {
      const config = hub.getConfig();
      void Promise.all(
        hub.getServers().map(async (server): Promise<ServerInfo> => {
          const entry = config?.servers[server.id];
          return {
            id: server.id,
            name: server.name,
            installed: await hub.isServerInstalled(server.id),
            installMethod: entry?.install?.method,
            requiresSystem: !entry?.install || entry.install.method === "system",
            systemRequirement: entry?.install?.package ?? entry?.command,
          };
        })
      ).then(
        (result) => {
          if (!cancelled) setServers(result);
        },
        (reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [hub]);

  const install = useCallback(
    async (server: ServerInfo) => {
      if (!hub) throw new Error("LSP is not initialized");
      await hub.installServer(server.id);
      if (!(await hub.isServerInstalled(server.id))) {
        throw new Error(`Installation completed but ${server.name} is not available`);
      }
      setServers((current) =>
        current.map((item) => (item.id === server.id ? { ...item, installed: true } : item))
      );
      refresh();
    },
    [hub, refresh]
  );

  const detect = useCallback(async () => {
    const config = hub?.getConfig();
    if (!hub || !config) throw new Error("LSP is not initialized");
    // Detection is read-only; the auto-mode trigger also starts/installs servers.
    const detector = new LanguageDetector({
      workspaceRoot: process.cwd(),
      serverConfigs: new Map(
        Object.entries(config.servers).filter(([id]) => !config.disabled.includes(id))
      ),
      isServerInstalled: (id) => hub.isServerInstalled(id),
      isServerRunning: (id) => hub.isServerRunning(id),
    });
    return (await detector.detect()).map((language) => language.serverId);
  }, [hub]);

  return (
    <>
      {error && <Text color="red">{error}</Text>}
      <LspSetupPanel
        {...props}
        servers={servers}
        onInstall={hub ? install : undefined}
        onDetect={hub ? detect : undefined}
      />
    </>
  );
}

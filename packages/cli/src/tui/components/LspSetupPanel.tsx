/**
 * LSP Setup Panel
 *
 * Interactive TUI component for managing Language Server Protocol servers.
 * Provides installation status, keyboard navigation, and progress display.
 *
 * @module tui/components/LspSetupPanel
 */

import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMouseScroll } from "../hooks/useMouseScroll.js";
import { useInput } from "../hooks/useTerminalInput.js";
import { useTheme } from "../theme/index.js";
import { Clickable, getVisibleClickBounds } from "./common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Information about an LSP server.
 */
export interface ServerInfo {
  /** Unique server identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Whether the server is installed */
  readonly installed: boolean;
  /** Approximate size (e.g., "2.3 MB") */
  readonly size?: string;
  /** Requires system installation (e.g., gopls requires Go) */
  readonly requiresSystem?: boolean;
  /** System requirement description */
  readonly systemRequirement?: string;
  /** Recommended based on project detection */
  readonly recommended?: boolean;
  /** Installation method */
  readonly installMethod?: "npm" | "pip" | "cargo" | "system";
}

/**
 * Props for the LspSetupPanel component.
 */
export interface LspSetupPanelProps {
  /** Whether the panel is currently active/focused */
  readonly isActive?: boolean;
  /** Allow visible sidebar mouse actions without claiming keyboard focus. */
  readonly mouseEnabled?: boolean;
  /** Maximum panel height in terminal rows, including fixed action buttons. */
  readonly maxHeight?: number;
  /** Callback when user wants to close the panel */
  readonly onClose?: () => void;
  /** Server status read from the configured LSP owner. */
  readonly servers?: readonly ServerInfo[];
  /** Performs real installation; rejects when installation or verification fails. */
  readonly onInstall?: (server: ServerInfo) => Promise<void>;
  /** Reads workspace language evidence and returns recommended configured server IDs. */
  readonly onDetect?: () => Promise<readonly string[]>;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Server list item component.
 */
function ServerItem({
  server,
  isSelected,
  isInstalling,
  canInstall,
}: {
  server: ServerInfo;
  isSelected: boolean;
  isInstalling: boolean;
  canInstall: boolean;
}): React.JSX.Element {
  const { theme } = useTheme();

  const statusIcon = useMemo(() => {
    if (isInstalling) return "⏳";
    if (server.installed) return "✓";
    return "○";
  }, [server.installed, isInstalling]);

  const statusColor = useMemo(() => {
    if (isInstalling) return theme.colors.info;
    if (server.installed) return theme.colors.success;
    if (server.recommended) return theme.colors.warning;
    return theme.colors.muted;
  }, [server.installed, server.recommended, isInstalling, theme]);

  const actionLabel = useMemo(() => {
    if (server.installed) return "";
    if (server.requiresSystem) return "[Guide]";
    if (!canInstall) return "[Unavailable]";
    return "[Install]";
  }, [server.installed, server.requiresSystem, canInstall]);

  return (
    <Box width="100%" height={1} flexShrink={0}>
      <Text wrap="truncate">
        <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
          {isSelected ? "▶" : " "}{" "}
        </Text>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text
          color={isSelected ? theme.colors.primary : undefined}
          bold={isSelected || server.recommended}
        >
          {server.name}
          {server.recommended && !server.installed ? " ★" : ""}
        </Text>
        <Text color={theme.colors.muted}>{server.size ? ` ${server.size}` : ""}</Text>
        <Text
          color={
            server.requiresSystem
              ? theme.colors.info
              : canInstall
                ? theme.colors.primary
                : theme.colors.muted
          }
        >
          {actionLabel ? ` ${actionLabel}` : ""}
        </Text>
      </Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * LspSetupPanel - Interactive LSP server management component.
 *
 * Features:
 * - Displays installed and available LSP servers
 * - Keyboard navigation with up/down arrows
 * - Enter to install selected server
 * - Esc to close panel
 * - Progress indicator during installation
 * - Project detection recommendations (highlighted)
 *
 * @example
 * ```tsx
 * function App() {
 *   const [showLsp, setShowLsp] = useState(false);
 *
 *   return (
 *     <>
 *       {showLsp && (
 *         <LspSetupPanel
 *           isActive
 *           onClose={() => setShowLsp(false)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function LspSetupPanel({
  isActive = true,
  mouseEnabled = isActive,
  maxHeight = 20,
  onClose,
  servers = [],
  onInstall,
  onDetect,
}: LspSetupPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const panelId = useId();
  const listNode = useRef<DOMElement>(null);
  const installInFlight = useRef(false);
  const detectionInFlight = useRef(false);
  const getBounds = useCallback(() => {
    const bounds = getVisibleClickBounds(listNode.current);
    return bounds && { ...bounds, left: bounds.left - 1, top: bounds.top - 1 };
  }, []);

  // State
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Batch install state
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  // Detected project recommendations
  const [detectedServers, setDetectedServers] = useState<Set<string>>(new Set());

  // Separate installed vs available servers, merging detection recommendations
  const { installed, available } = useMemo(() => {
    const installedServers: ServerInfo[] = [];
    const availableServers: ServerInfo[] = [];

    for (const server of servers) {
      const enhanced = {
        ...server,
        recommended: server.recommended || detectedServers.has(server.id),
      };
      if (enhanced.installed) {
        installedServers.push(enhanced);
      } else {
        availableServers.push(enhanced);
      }
    }

    // Sort available: recommended first
    availableServers.sort((a, b) => {
      if (a.recommended && !b.recommended) return -1;
      if (!a.recommended && b.recommended) return 1;
      return 0;
    });

    return { installed: installedServers, available: availableServers };
  }, [servers, detectedServers]);

  // Include installed entries in navigation so every configured server remains inspectable.
  const orderedServers = useMemo(() => [...available, ...installed], [available, installed]);
  const selectableCount = orderedServers.length;
  const selectedServer = orderedServers[selectedIndex];
  const panelHeight = Math.max(1, Math.floor(maxHeight));
  const showSummary = panelHeight >= 10;
  const statusLines = [
    error ? `⚠ ${error}` : null,
    installing
      ? `Installing ${servers.find((server) => server.id === installing)?.name ?? installing}...${batchProgress ? ` (${batchProgress.current}/${batchProgress.total})` : ""}`
      : null,
    isDetecting ? "Detecting project..." : null,
    !onInstall ? "Installation unavailable. Use /lsp install <server>." : null,
    !onDetect ? "Project detection unavailable." : null,
    servers.length === 0 ? "No language server status available." : null,
  ].filter((line): line is string => line !== null);
  // Borders + header + two action rows and their divider stay outside the list.
  const chromeRows = 6 + Number(showSummary);
  const visibleStatusLines = statusLines.slice(0, Math.max(0, panelHeight - chromeRows - 1));
  const maxVisible = Math.max(1, panelHeight - chromeRows - visibleStatusLines.length);
  const startIndex = Math.min(
    Math.max(0, selectedIndex - maxVisible + 1),
    Math.max(0, selectableCount - maxVisible)
  );
  const visibleServers = orderedServers.slice(startIndex, startIndex + maxVisible);
  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, selectableCount - 1)));
  }, [selectableCount]);
  useMouseScroll({
    enabled: mouseEnabled && !installing && !isDetecting,
    bounds: getBounds,
    onScroll: (delta) =>
      setSelectedIndex((index) => Math.max(0, Math.min(selectableCount - 1, index + delta))),
  });

  // NPM-installable servers
  const npmServers = useMemo(
    () => available.filter((s) => s.installMethod === "npm" && !s.installed),
    [available]
  );

  // Handle batch install all NPM servers
  const handleInstallAllNpm = useCallback(async () => {
    if (
      !onInstall ||
      installInFlight.current ||
      detectionInFlight.current ||
      npmServers.length === 0
    )
      return;
    installInFlight.current = true;

    setBatchProgress({ current: 0, total: npmServers.length });
    setError(null);

    for (let i = 0; i < npmServers.length; i++) {
      const server = npmServers[i];
      if (!server) continue;

      setBatchProgress({ current: i + 1, total: npmServers.length });
      setInstalling(server.id);

      try {
        await onInstall(server);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Install failed: ${message} (${server.name})`);
        break;
      }
    }

    setInstalling(null);
    setBatchProgress(null);
    installInFlight.current = false;
  }, [npmServers, onInstall]);

  // Handle project detection
  const handleDetectProject = useCallback(async () => {
    if (!onDetect || detectionInFlight.current || installInFlight.current) return;
    detectionInFlight.current = true;
    setIsDetecting(true);
    setDetectedServers(new Set());
    setError(null);
    try {
      setDetectedServers(new Set(await onDetect()));
      setSelectedIndex(0);
    } catch (err) {
      setError(`Project detection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      detectionInFlight.current = false;
      setIsDetecting(false);
    }
  }, [onDetect]);

  // Handle installation
  const handleInstall = useCallback(
    async (server: ServerInfo) => {
      if (server.installed || installInFlight.current || detectionInFlight.current) return;

      // For system-required servers, just show a guide message
      if (server.requiresSystem) {
        setError(`${server.name} ${server.systemRequirement}. Please install manually.`);
        return;
      }
      if (!onInstall) return;

      installInFlight.current = true;
      setInstalling(server.id);
      setError(null);

      try {
        await onInstall(server);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Install failed: ${message} (${server.name})`);
      } finally {
        setInstalling(null);
        installInFlight.current = false;
      }
    },
    [onInstall]
  );

  // Keyboard navigation
  useInput(
    useCallback(
      (input: string, key) => {
        if (!isActive) return;

        // Clear error on any key press
        if (error) {
          setError(null);
        }

        if (key.escape) {
          onClose?.();
          return;
        }

        if (key.upArrow || input === "k") {
          setSelectedIndex((i) => Math.max(0, i - 1));
          return;
        }

        if (key.downArrow || input === "j") {
          setSelectedIndex((i) => Math.max(0, Math.min(selectableCount - 1, i + 1)));
          return;
        }

        if (key.return && !installing) {
          const server = orderedServers[selectedIndex];
          if (server) {
            void handleInstall(server);
          }
          return;
        }

        // Install all NPM servers
        if (input === "a" && !installing) {
          void handleInstallAllNpm();
          return;
        }

        // Detect project
        if (input === "d" && !installing) {
          void handleDetectProject();
          return;
        }
      },
      [
        isActive,
        onClose,
        selectableCount,
        orderedServers,
        selectedIndex,
        handleInstall,
        installing,
        error,
        handleInstallAllNpm,
        handleDetectProject,
      ]
    )
  );

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={panelHeight}
      flexShrink={0}
      overflow="hidden"
      borderStyle="round"
      borderColor={theme.semantic.border.default}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Box height={1} flexShrink={0}>
        <Box flexGrow={1} minWidth={0}>
          <Text bold color={theme.colors.primary} wrap="truncate">
            🔧 LSP Setup {selectableCount > 0 ? `${selectedIndex + 1}/${selectableCount}` : ""}
          </Text>
        </Box>
        <Box flexGrow={1} />
        <Clickable
          id={`${panelId}-close-header`}
          width="auto"
          enabled={mouseEnabled}
          onClick={() => onClose?.()}
        >
          <Text color={theme.colors.muted} dimColor wrap="truncate">
            Esc to close
          </Text>
        </Clickable>
      </Box>

      {showSummary && (
        <Box height={1} flexShrink={0}>
          <Text color={theme.colors.muted} wrap="truncate">
            Available ({available.length}) • Installed ({installed.length})
          </Text>
        </Box>
      )}
      {/* Only the list pages; every server row occupies one terminal line. */}
      <Box
        ref={listNode}
        flexDirection="column"
        height={maxVisible}
        flexShrink={0}
        overflow="hidden"
      >
        {visibleServers.map((server, idx) => (
          <Clickable
            key={server.id}
            id={`${panelId}-server-${server.id}`}
            enabled={
              mouseEnabled &&
              !installing &&
              !isDetecting &&
              (server.installed || !!onInstall || !!server.requiresSystem)
            }
            onClick={() => {
              setSelectedIndex(startIndex + idx);
              void handleInstall(server);
            }}
          >
            <ServerItem
              server={server}
              isSelected={startIndex + idx === selectedIndex}
              isInstalling={installing === server.id}
              canInstall={!!onInstall}
            />
          </Clickable>
        ))}
      </Box>
      <Box
        flexDirection="column"
        height={visibleStatusLines.length}
        flexShrink={0}
        overflow="hidden"
      >
        {visibleStatusLines.map((line) => (
          <Text
            key={line}
            color={line.startsWith("⚠") ? theme.colors.error : theme.colors.muted}
            wrap="truncate"
          >
            {line}
          </Text>
        ))}
      </Box>

      {/* Footer with hints */}
      <Box
        flexDirection="column"
        height={3}
        flexShrink={0}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.semantic.border.default}
      >
        <Box height={1} gap={2} flexShrink={0}>
          <Clickable
            id={`${panelId}-install`}
            width="auto"
            enabled={
              mouseEnabled &&
              !installing &&
              !isDetecting &&
              !!selectedServer &&
              !selectedServer.installed &&
              (!!onInstall || !!selectedServer.requiresSystem)
            }
            onClick={() => {
              const server = orderedServers[selectedIndex];
              if (server) void handleInstall(server);
            }}
          >
            <Text color={theme.colors.muted}>Enter Install</Text>
          </Clickable>
          <Clickable
            id={`${panelId}-install-all`}
            width="auto"
            enabled={
              mouseEnabled && !installing && !isDetecting && !!onInstall && npmServers.length > 0
            }
            onClick={() => {
              void handleInstallAllNpm();
            }}
          >
            <Text color={theme.colors.info}>a Install All</Text>
          </Clickable>
        </Box>
        <Box height={1} gap={2} flexShrink={0}>
          <Clickable
            id={`${panelId}-detect`}
            width="auto"
            enabled={mouseEnabled && !installing && !isDetecting && !!onDetect}
            onClick={() => {
              void handleDetectProject();
            }}
          >
            <Text color={theme.colors.info}>d Detect</Text>
          </Clickable>
          <Clickable
            id={`${panelId}-close`}
            width="auto"
            enabled={mouseEnabled}
            onClick={() => onClose?.()}
          >
            <Text color={theme.colors.muted}>Esc Close</Text>
          </Clickable>
        </Box>
      </Box>
    </Box>
  );
}

export default LspSetupPanel;

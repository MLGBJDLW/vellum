/**
 * LSP Setup Panel
 *
 * Interactive TUI component for managing Language Server Protocol servers.
 * Provides installation status, keyboard navigation, and progress display.
 *
 * @module tui/components/LspSetupPanel
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../theme/index.js";

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
  /** Callback when user wants to close the panel */
  readonly onClose?: () => void;
  /** Optional custom server list (for testing) */
  readonly servers?: readonly ServerInfo[];
  /** Optional callback when install is triggered */
  readonly onInstall?: (server: ServerInfo) => Promise<void>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default LSP servers list.
 * In production, this could be fetched from LspHub or a config file.
 */
const DEFAULT_LSP_SERVERS: readonly ServerInfo[] = [
  {
    id: "typescript-language-server",
    name: "TypeScript Language Server",
    installed: false,
    size: "2.3 MB",
    installMethod: "npm",
  },
  {
    id: "pyright",
    name: "Pyright",
    installed: false,
    size: "19 MB",
    installMethod: "npm",
  },
  {
    id: "bash-language-server",
    name: "Bash Language Server",
    installed: false,
    size: "2 MB",
    installMethod: "npm",
  },
  {
    id: "yaml-language-server",
    name: "YAML Language Server",
    installed: false,
    size: "3.5 MB",
    installMethod: "npm",
  },
  {
    id: "vscode-json-languageserver",
    name: "JSON Language Server",
    installed: false,
    size: "1.5 MB",
    installMethod: "npm",
  },
  {
    id: "gopls",
    name: "gopls",
    installed: false,
    size: "50 MB",
    requiresSystem: true,
    systemRequirement: "requires Go",
    installMethod: "system",
  },
  {
    id: "rust-analyzer",
    name: "rust-analyzer",
    installed: false,
    size: "80 MB",
    requiresSystem: true,
    systemRequirement: "requires Rust",
    installMethod: "system",
  },
] as const;

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Section header component.
 */
function SectionHeader({ title, count }: { title: string; count: number }): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <Box marginTop={1} marginBottom={0}>
      <Text color={theme.colors.muted} dimColor>
        ── {title} ({count}) ──
      </Text>
    </Box>
  );
}

/**
 * Server list item component.
 */
function ServerItem({
  server,
  isSelected,
  isInstalling,
}: {
  server: ServerInfo;
  isSelected: boolean;
  isInstalling: boolean;
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
    return "[Install]";
  }, [server.installed, server.requiresSystem]);

  return (
    <Box>
      <Box width={2}>
        <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
          {isSelected ? "▶" : " "}
        </Text>
      </Box>
      <Box width={3}>
        <Text color={statusColor}>{statusIcon}</Text>
      </Box>
      <Box width={32}>
        <Text
          color={isSelected ? theme.colors.primary : undefined}
          bold={isSelected || server.recommended}
        >
          {server.name}
          {server.recommended && !server.installed ? " ★" : ""}
        </Text>
      </Box>
      <Box width={10}>
        <Text color={theme.colors.muted} dimColor>
          {server.size ?? ""}
        </Text>
      </Box>
      {server.requiresSystem && !server.installed && (
        <Box width={16}>
          <Text color={theme.colors.warning} dimColor>
            ({server.systemRequirement})
          </Text>
        </Box>
      )}
      {!server.installed && (
        <Box>
          <Text
            color={server.requiresSystem ? theme.colors.info : theme.colors.primary}
            bold={isSelected}
          >
            {actionLabel}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Installation progress indicator with batch support.
 */
function InstallProgress({
  serverName,
  progress,
  batchProgress,
}: {
  serverName: string;
  progress: number;
  batchProgress?: { current: number; total: number } | null;
}): React.JSX.Element {
  const { theme } = useTheme();

  const barWidth = 20;
  const filledWidth = Math.round((progress / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  // Build progress bar: [████████░░]
  const progressBar = `[${"█".repeat(filledWidth)}${"░".repeat(emptyWidth)}]`;

  return (
    <Box marginTop={1} flexDirection="column">
      {batchProgress && (
        <Text color={theme.colors.info}>
          Batch install: {batchProgress.current}/{batchProgress.total}
        </Text>
      )}
      <Box gap={1}>
        <Text color={theme.colors.info}>Installing {serverName}...</Text>
        <Text color={theme.colors.primary}>{progressBar}</Text>
        <Text color={theme.colors.info}>{progress}%</Text>
      </Box>
    </Box>
  );
}

/**
 * Description section about LSP features.
 */
function FeatureDescription(): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.colors.muted}>Language servers provide code intelligence features:</Text>
      <Box paddingLeft={2} flexDirection="column">
        <Text color={theme.colors.muted}>• Diagnostics (errors, warnings)</Text>
        <Text color={theme.colors.muted}>• Go to definition, Find references</Text>
        <Text color={theme.colors.muted}>• Hover documentation</Text>
      </Box>
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
  onClose,
  servers = DEFAULT_LSP_SERVERS,
  onInstall,
}: LspSetupPanelProps): React.JSX.Element {
  const { theme } = useTheme();

  // State
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
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

  // Total selectable items (only available servers are selectable)
  const selectableCount = available.length;

  // NPM-installable servers
  const npmServers = useMemo(
    () => available.filter((s) => s.installMethod === "npm" && !s.installed),
    [available]
  );

  // Handle batch install all NPM servers
  const handleInstallAllNpm = useCallback(async () => {
    if (installing || npmServers.length === 0) return;

    setBatchProgress({ current: 0, total: npmServers.length });
    setError(null);

    for (let i = 0; i < npmServers.length; i++) {
      const server = npmServers[i];
      if (!server) continue;

      setBatchProgress({ current: i + 1, total: npmServers.length });
      setInstalling(server.id);
      setProgress(0);

      try {
        if (onInstall) {
          await onInstall(server);
        } else {
          // Simulate installation progress
          for (let p = 0; p <= 100; p += 10) {
            setProgress(p);
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to install ${server.name}: ${message}`);
        break;
      }
    }

    setInstalling(null);
    setProgress(0);
    setBatchProgress(null);
  }, [installing, npmServers, onInstall]);

  // Handle project detection
  const handleDetectProject = useCallback(() => {
    // In production, this would call LspHub.detectProjectServers()
    // For now, simulate detection based on common patterns
    const detected = new Set<string>();

    // Simulate: always recommend TypeScript for now
    detected.add("typescript-language-server");
    detected.add("vscode-json-languageserver");

    setDetectedServers(detected);
    setError(null);
  }, []);

  // Handle installation
  const handleInstall = useCallback(
    async (server: ServerInfo) => {
      if (server.installed || installing) return;

      // For system-required servers, just show a guide message
      if (server.requiresSystem) {
        setError(`${server.name} ${server.systemRequirement}. Please install manually.`);
        return;
      }

      setInstalling(server.id);
      setProgress(0);
      setError(null);

      try {
        if (onInstall) {
          await onInstall(server);
        } else {
          // Simulate installation progress
          for (let p = 0; p <= 100; p += 10) {
            setProgress(p);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        setInstalling(null);
        setProgress(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to install ${server.name}: ${message}`);
        setInstalling(null);
        setProgress(0);
      }
    },
    [installing, onInstall]
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
          setSelectedIndex((i) => Math.min(selectableCount - 1, i + 1));
          return;
        }

        if (key.return && !installing) {
          const server = available[selectedIndex];
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
          handleDetectProject();
          return;
        }
      },
      [
        isActive,
        onClose,
        selectableCount,
        available,
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
      borderStyle="round"
      borderColor={theme.semantic.border.default}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          🔧 LSP Setup
        </Text>
        <Box flexGrow={1} />
        <Text color={theme.colors.muted} dimColor>
          Esc to close
        </Text>
      </Box>

      {/* Feature description */}
      <FeatureDescription />

      {/* Installed Section */}
      {installed.length > 0 && (
        <>
          <SectionHeader title="Installed" count={installed.length} />
          <Box flexDirection="column" paddingLeft={1}>
            {installed.map((server) => (
              <ServerItem
                key={server.id}
                server={server}
                isSelected={false}
                isInstalling={installing === server.id}
              />
            ))}
          </Box>
        </>
      )}

      {/* Available Section */}
      {available.length > 0 && (
        <>
          <SectionHeader title="Available" count={available.length} />
          <Box flexDirection="column" paddingLeft={1}>
            {available.map((server, idx) => (
              <ServerItem
                key={server.id}
                server={server}
                isSelected={idx === selectedIndex}
                isInstalling={installing === server.id}
              />
            ))}
          </Box>
        </>
      )}

      {/* Installation progress */}
      {installing && (
        <InstallProgress
          serverName={available.find((s) => s.id === installing)?.name ?? installing}
          progress={progress}
          batchProgress={batchProgress}
        />
      )}

      {/* Error message */}
      {error && (
        <Box marginTop={1}>
          <Text color={theme.colors.error}>⚠ {error}</Text>
        </Box>
      )}

      {/* Footer with hints */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.semantic.border.default}
        gap={2}
      >
        <Text color={theme.colors.muted}>↑↓ Navigate</Text>
        <Text color={theme.colors.muted}>Enter Install</Text>
        <Text color={theme.colors.info}>a Install All</Text>
        <Text color={theme.colors.info}>d Detect</Text>
        <Text color={theme.colors.muted}>Esc Close</Text>
      </Box>
    </Box>
  );
}

export default LspSetupPanel;

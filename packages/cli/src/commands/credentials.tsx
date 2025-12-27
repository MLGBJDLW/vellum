#!/usr/bin/env node

/**
 * Credentials CLI Command
 *
 * Provides CLI interface for managing API credentials:
 * - vellum credentials list - Show all stored credentials (masked values)
 * - vellum credentials add <provider> - Interactive prompt to add credential
 * - vellum credentials remove <provider> - Remove credential
 *
 * @module cli/commands/credentials
 */

import {
  CredentialManager,
  type CredentialRef,
  type CredentialSource,
  EncryptedFileStore,
  EnvCredentialStore,
  KeychainStore,
} from "@vellum/core";
import { Box, render, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

type CommandAction = "list" | "add" | "remove";

interface CredentialsAppProps {
  action: CommandAction;
  provider?: string;
}

interface CredentialListResult {
  credentials: CredentialRef[];
  storeAvailability: Record<string, boolean>;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "azure",
  "bedrock",
  "vertex",
  "ollama",
  "openrouter",
  "together",
  "mistral",
  "cohere",
  "groq",
] as const;

type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

const PROVIDER_ENV_VARS: Record<SupportedProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  bedrock: "AWS_ACCESS_KEY_ID",
  vertex: "GOOGLE_APPLICATION_CREDENTIALS",
  ollama: "OLLAMA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together: "TOGETHER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  groq: "GROQ_API_KEY",
};

// =============================================================================
// Credential Manager Factory
// =============================================================================

async function createCredentialManager(): Promise<CredentialManager> {
  const stores = [
    new EnvCredentialStore(),
    new KeychainStore(),
    new EncryptedFileStore({
      filePath: `${process.env.HOME ?? process.env.USERPROFILE}/.vellum/credentials.enc`,
      password: process.env.VELLUM_CREDENTIAL_PASSWORD ?? "vellum-default-key",
    }),
  ];

  return new CredentialManager(stores, {
    preferredWriteStore: "keychain",
  });
}

// =============================================================================
// List Component
// =============================================================================

interface ListCredentialsProps {
  onComplete: () => void;
}

function ListCredentials({ onComplete }: ListCredentialsProps) {
  const { exit } = useApp();
  const [result, setResult] = useState<CredentialListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const manager = await createCredentialManager();
        const listResult = await manager.list();
        const availability = await manager.getStoreAvailability();

        if (!mounted) return;

        if (!listResult.ok) {
          setResult({
            credentials: [],
            storeAvailability: availability,
            error: listResult.error.message,
          });
        } else {
          setResult({
            credentials: [...listResult.value],
            storeAvailability: availability,
          });
        }
      } catch (err) {
        if (!mounted) return;
        setResult({
          credentials: [],
          storeAvailability: {},
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  useInput((_, key) => {
    if (key.escape || key.return) {
      onComplete();
      exit();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">⏳ Loading credentials...</Text>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Failed to load credentials</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          🔐 Vellum Credentials
        </Text>
      </Box>

      {/* Store Availability */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold underline>
          Storage Backends:
        </Text>
        {Object.entries(result.storeAvailability).map(([store, available]) => (
          <Box key={store}>
            <Text color={available ? "green" : "red"}>{available ? "✓" : "✗"} </Text>
            <Text>{store}</Text>
          </Box>
        ))}
      </Box>

      {/* Credentials List */}
      <Box flexDirection="column">
        <Text bold underline>
          Stored Credentials:
        </Text>
        {result.error ? (
          <Text color="red">Error: {result.error}</Text>
        ) : result.credentials.length === 0 ? (
          <Text dimColor>
            No credentials found. Use &apos;vellum credentials add &lt;provider&gt;&apos; to add
            one.
          </Text>
        ) : (
          result.credentials.map((cred) => (
            <Box key={cred.id} paddingLeft={1}>
              <Text color="yellow">{cred.provider}</Text>
              <Text> ({cred.source}): </Text>
              <Text dimColor>{cred.maskedHint ?? "***"}</Text>
              <Text dimColor> [{cred.type}]</Text>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter or ESC to exit</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Add Credential Component
// =============================================================================

interface AddCredentialProps {
  provider: string;
  onComplete: () => void;
}

type AddStep = "confirm" | "input" | "saving" | "done" | "error";

function AddCredential({ provider, onComplete }: AddCredentialProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<AddStep>("confirm");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedStore, setSavedStore] = useState<CredentialSource | null>(null);

  const normalizedProvider = provider.toLowerCase();
  const isSupported = SUPPORTED_PROVIDERS.includes(normalizedProvider as SupportedProvider);
  const envVar = isSupported
    ? PROVIDER_ENV_VARS[normalizedProvider as SupportedProvider]
    : `${normalizedProvider.toUpperCase()}_API_KEY`;

  useInput(
    (input, key) => {
      if (key.escape) {
        onComplete();
        exit();
        return;
      }

      if (step === "confirm") {
        if (input.toLowerCase() === "y" || key.return) {
          setStep("input");
        } else if (input.toLowerCase() === "n") {
          onComplete();
          exit();
        }
      }

      if (step === "done" || step === "error") {
        if (key.return || key.escape) {
          onComplete();
          exit();
        }
      }
    },
    { isActive: step !== "input" && step !== "saving" }
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setError("API key cannot be empty");
        setStep("error");
        return;
      }

      setStep("saving");

      try {
        const manager = await createCredentialManager();
        const result = await manager.store({
          provider: normalizedProvider,
          type: "api_key",
          value: value.trim(),
          metadata: {
            label: `${normalizedProvider} API Key`,
          },
        });

        if (!result.ok) {
          setError(result.error.message);
          setStep("error");
          return;
        }

        setSavedStore(result.value.source);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    },
    [normalizedProvider]
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          🔐 Add Credential: {normalizedProvider}
        </Text>
      </Box>

      {!isSupported && (
        <Box marginBottom={1}>
          <Text color="yellow">
            ⚠️ Provider &apos;{normalizedProvider}&apos; is not in the standard list. Proceeding
            anyway.
          </Text>
        </Box>
      )}

      {step === "confirm" && (
        <Box flexDirection="column">
          <Text>
            Add API key for <Text color="yellow">{normalizedProvider}</Text>?
          </Text>
          <Text dimColor>(You can also set the {envVar} environment variable)</Text>
          <Box marginTop={1}>
            <Text color="green">[Y]</Text>
            <Text>es / </Text>
            <Text color="red">[N]</Text>
            <Text>o</Text>
          </Box>
        </Box>
      )}

      {step === "input" && (
        <Box flexDirection="column">
          <Text>Enter API key for {normalizedProvider}:</Text>
          <Box marginTop={1}>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleSubmit}
              placeholder="sk-..."
              mask="*"
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>(Input is masked for security. Press Enter to save, ESC to cancel)</Text>
          </Box>
        </Box>
      )}

      {step === "saving" && (
        <Box>
          <Text color="cyan">⏳ Saving credential...</Text>
        </Box>
      )}

      {step === "done" && (
        <Box flexDirection="column">
          <Text color="green">✅ Credential saved to {savedStore ?? "store"}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to exit</Text>
          </Box>
        </Box>
      )}

      {step === "error" && (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to exit</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press ESC to cancel</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Remove Credential Component
// =============================================================================

interface RemoveCredentialProps {
  provider: string;
  onComplete: () => void;
}

type RemoveStep = "confirm" | "removing" | "done" | "error" | "not_found";

function RemoveCredential({ provider, onComplete }: RemoveCredentialProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<RemoveStep>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);

  const normalizedProvider = provider.toLowerCase();

  useInput((input, key) => {
    if (key.escape) {
      onComplete();
      exit();
      return;
    }

    if (step === "confirm") {
      if (input.toLowerCase() === "y") {
        handleRemove();
      } else if (input.toLowerCase() === "n" || key.return) {
        onComplete();
        exit();
      }
    }

    if (step === "done" || step === "error" || step === "not_found") {
      if (key.return || key.escape) {
        onComplete();
        exit();
      }
    }
  });

  const handleRemove = useCallback(async () => {
    setStep("removing");

    try {
      const manager = await createCredentialManager();

      // First check if credential exists
      const existsResult = await manager.exists(normalizedProvider);
      if (!existsResult.ok || !existsResult.value) {
        setStep("not_found");
        return;
      }

      const result = await manager.delete(normalizedProvider);

      if (!result.ok) {
        setError(result.error.message);
        setStep("error");
        return;
      }

      setDeletedCount(result.value);
      setStep(result.value > 0 ? "done" : "not_found");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [normalizedProvider]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <Text bold color="red">
          🗑️ Remove Credential: {normalizedProvider}
        </Text>
      </Box>

      {step === "confirm" && (
        <Box flexDirection="column">
          <Text>
            Remove credential for <Text color="yellow">{normalizedProvider}</Text>?
          </Text>
          <Text dimColor>This will remove the credential from all writable stores.</Text>
          <Box marginTop={1}>
            <Text color="green">[Y]</Text>
            <Text>es / </Text>
            <Text color="red">[N]</Text>
            <Text>o (default)</Text>
          </Box>
        </Box>
      )}

      {step === "removing" && (
        <Box>
          <Text color="cyan">⏳ Removing credential...</Text>
        </Box>
      )}

      {step === "done" && (
        <Box flexDirection="column">
          <Text color="green">✅ Credential removed from {deletedCount} store(s)</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to exit</Text>
          </Box>
        </Box>
      )}

      {step === "not_found" && (
        <Box flexDirection="column">
          <Text color="yellow">⚠️ No credential found for {normalizedProvider}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to exit</Text>
          </Box>
        </Box>
      )}

      {step === "error" && (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to exit</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press ESC to cancel</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

function CredentialsApp({ action, provider }: CredentialsAppProps) {
  const handleComplete = useCallback(() => {
    // Cleanup if needed
  }, []);

  switch (action) {
    case "list":
      return <ListCredentials onComplete={handleComplete} />;
    case "add":
      if (!provider) {
        return (
          <Box padding={1}>
            <Text color="red">❌ Error: Provider name required for &apos;add&apos; command</Text>
          </Box>
        );
      }
      return <AddCredential provider={provider} onComplete={handleComplete} />;
    case "remove":
      if (!provider) {
        return (
          <Box padding={1}>
            <Text color="red">❌ Error: Provider name required for &apos;remove&apos; command</Text>
          </Box>
        );
      }
      return <RemoveCredential provider={provider} onComplete={handleComplete} />;
    default:
      return (
        <Box padding={1}>
          <Text color="red">❌ Unknown action: {action}</Text>
        </Box>
      );
  }
}

// =============================================================================
// Render Functions (for commander integration)
// =============================================================================

export function renderCredentialsList(): void {
  render(<CredentialsApp action="list" />);
}

export function renderCredentialsAdd(provider: string): void {
  render(<CredentialsApp action="add" provider={provider} />);
}

export function renderCredentialsRemove(provider: string): void {
  render(<CredentialsApp action="remove" provider={provider} />);
}

// =============================================================================
// Export for testing
// =============================================================================

export {
  CredentialsApp,
  ListCredentials,
  AddCredential,
  RemoveCredential,
  createCredentialManager,
  SUPPORTED_PROVIDERS,
  PROVIDER_ENV_VARS,
};

# Credential Management

Vellum's credential management system provides secure storage and retrieval of API keys, tokens, and credentials for LLM providers and external services.

## Overview

The credential system features:

- **Multi-source resolution**: Environment variables → OS keychain → Encrypted file
- **OS-native keychain integration**: macOS Keychain, Windows Credential Vault, Linux Secret Service
- **Encrypted fallback**: AES-256-GCM encryption for file-based storage
- **Memory protection**: Secure string handling with auto-cleanup
- **Audit logging**: All credential operations are logged (values never exposed)

## Quick Start

### 1. Store a credential

```bash
# Using CLI
vellum credentials add anthropic

# Using slash commands in TUI
/login anthropic
```markdown

### 2. Use in configuration

```yaml
# vellum.config.yaml
providers:
  - name: anthropic
    model: claude-sonnet-4-20250514
    credential:
      type: api_key
      provider: anthropic
      # Automatically resolves from keychain/env/file
```markdown

### 3. Programmatic access

```typescript
import { CredentialManager, EnvCredentialStore, KeychainStore } from "@vellum/core";

const manager = new CredentialManager([
  new EnvCredentialStore(),
  new KeychainStore(),
]);

// Resolve credential
const result = await manager.resolve("anthropic");
if (result.ok) {
  console.log(`Found credential from ${result.value.source}`);
}
```markdown

## CredentialManager API

### Constructor

```typescript
new CredentialManager(stores: CredentialStore[], options?: CredentialManagerOptions)
```markdown

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preferredWriteStore` | `CredentialSource` | First writable | Preferred store for writes |
| `cacheTTL` | `number` | `300000` (5min) | Cache time-to-live in ms |
| `validator` | `CredentialValidator` | Built-in | Custom validation function |

### Methods

#### `resolve(provider: string, key?: string): Promise<Result<Credential>>`

Resolve a credential from the store chain.

```typescript
const result = await manager.resolve("anthropic");
if (result.ok) {
  const credential = result.value;
  // credential.value contains the API key
}
```markdown

#### `store(input: CredentialInput): Promise<Result<CredentialRef>>`

Store a new credential.

```typescript
await manager.store({
  provider: "openai",
  type: "api_key",
  value: "sk-...",
  metadata: { label: "Production Key" },
});
```markdown

#### `delete(provider: string, key?: string): Promise<Result<void>>`

Delete a credential.

```typescript
await manager.delete("anthropic");
```markdown

#### `list(): Promise<Result<CredentialRef[]>>`

List all stored credentials (values masked).

```typescript
const result = await manager.list();
if (result.ok) {
  for (const ref of result.value) {
    console.log(`${ref.provider}: ${ref.source}`);
  }
}
```markdown

#### `exists(provider: string, key?: string): Promise<Result<boolean>>`

Check if a credential exists.

```typescript
const exists = await manager.exists("anthropic");
```markdown

#### `validate(provider: string): Promise<Result<CredentialValidationResult>>`

Validate a credential's format and optionally test with provider.

```typescript
const validation = await manager.validate("anthropic");
if (validation.ok && validation.value.valid) {
  console.log("Credential is valid");
}
```markdown

### Events

Subscribe to credential operations:

```typescript
manager.on((event) => {
  switch (event.type) {
    case "credential:resolved":
      console.log(`Resolved ${event.provider} from ${event.source}`);
      break;
    case "credential:stored":
      console.log(`Stored ${event.provider} to ${event.store}`);
      break;
    case "credential:not_found":
      console.log(`${event.provider} not found`);
      break;
  }
});
```markdown

## Storage Backends

### EnvCredentialStore

Reads credentials from environment variables. **Read-only**.

```typescript
import { EnvCredentialStore } from "@vellum/core";

const store = new EnvCredentialStore();
```markdown

**Environment variable mapping:**

| Provider | Environment Variable |
|----------|---------------------|
| anthropic | `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| google | `GOOGLE_API_KEY` |
| azure | `AZURE_OPENAI_API_KEY` |
| mistral | `MISTRAL_API_KEY` |
| cohere | `COHERE_API_KEY` |
| groq | `GROQ_API_KEY` |

### KeychainStore

OS-native secure storage.

```typescript
import { KeychainStore } from "@vellum/core";

const store = new KeychainStore({
  service: "vellum", // Service name in keychain
});
```markdown

**Platform support:**

| OS | Backend |
|----|---------|
| macOS | Keychain |
| Windows | Credential Vault |
| Linux | Secret Service (via libsecret) |

### EncryptedFileStore

AES-256-GCM encrypted file storage.

```typescript
import { EncryptedFileStore } from "@vellum/core";

const store = new EncryptedFileStore({
  filePath: "~/.vellum/credentials.enc",
  password: process.env.VELLUM_CREDENTIAL_PASSWORD,
});
```markdown

**Encryption details:**

- Algorithm: AES-256-GCM
- Key derivation: scrypt (N=16384, r=8, p=1)
- Salt: 32 bytes (random per file)
- IV: 16 bytes (random per encryption)
- Auth tag: 16 bytes
- File permissions: 0o600 (owner read/write only)

### HybridCredentialStore

Auto-switches between keychain and file storage.

```typescript
import { HybridCredentialStore } from "@vellum/core";

const store = new HybridCredentialStore({
  fileStorePath: "~/.vellum/credentials.enc",
  password: process.env.VELLUM_CREDENTIAL_PASSWORD,
});
```text

Uses keychain when available, falls back to encrypted file automatically.

**Force file storage:**

```bash
export VELLUM_FORCE_FILE_STORAGE=true
```markdown

## CLI Commands

### `vellum credentials`

Manage stored credentials.

```bash
# List all credentials
vellum credentials list

# Add a credential (interactive)
vellum credentials add <provider>

# Remove a credential
vellum credentials remove <provider>
```markdown

**Example output:**

```
🔐 Vellum Credentials

Storage Backends:
✓ env
✓ keychain
✓ file

Stored Credentials:
┌──────────┬──────────┬─────────────────────┐
│ Provider │ Source   │ Added               │
├──────────┼──────────┼─────────────────────┤
│ anthropic│ keychain │ 2025-12-26 10:30:00 │
│ openai   │ env      │ -                   │
│ google   │ file     │ 2025-12-25 14:20:00 │
└──────────┴──────────┴─────────────────────┘
```markdown

### Slash Commands (TUI)

Use these commands in the interactive chat:

#### `/login [provider]`

Add or update a credential.

```
/login anthropic
🔐 Adding credential for anthropic. Enter your API key:
> sk-ant-api03-...
✅ Credential for anthropic saved to keychain
```markdown

#### `/logout [provider]`

Remove a credential.

```
/logout anthropic
✅ Credential for anthropic removed
```markdown

#### `/credentials`

Show credential status.

```
/credentials
📋 Credential Status:
  anthropic: ✓ keychain
  openai:    ✓ env
  google:    ✗ not configured
```markdown

## Configuration

### YAML Configuration

```yaml
# vellum.config.yaml
providers:
  # Recommended: Use credential reference
  - name: anthropic
    model: claude-sonnet-4-20250514
    credential:
      type: api_key
      provider: anthropic

  # With explicit key name
  - name: openai
    model: gpt-4
    credential:
      type: api_key
      provider: openai
      key: production  # Specific key name

  # DEPRECATED: Direct API key (will warn)
  - name: google
    model: gemini-pro
    apiKey: ${GOOGLE_API_KEY}
```markdown

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VELLUM_CREDENTIAL_PASSWORD` | Password for encrypted file store |
| `VELLUM_FORCE_FILE_STORAGE` | Skip keychain, use file storage |
| `VELLUM_CREDENTIAL_CACHE_TTL` | Cache TTL in milliseconds |

## Security Considerations

### Best Practices

1. **Use OS keychain** when available - provides hardware-backed security
2. **Set strong password** for `VELLUM_CREDENTIAL_PASSWORD` in non-interactive environments
3. **Never commit** credential files or `.env` files with API keys
4. **Rotate keys** regularly using `vellum credentials add` to replace existing

### What's Protected

- **In memory**: SecureString class zeros memory on disposal
- **On disk**: AES-256-GCM encryption with scrypt key derivation
- **In logs**: Values never logged, only provider names and sources
- **In audit**: All operations logged without credential values

### File Permissions

Encrypted credential files are created with `0o600` permissions (owner read/write only). The system verifies permissions on every access.

### Memory Safety

```typescript
import { SecureString } from "@vellum/core";

// Credential automatically cleared from memory
using secure = new SecureString(apiKey);
// ... use secure.value
// Memory cleared when scope exits
```markdown

## Troubleshooting

### Keychain not available

```
⚠️ Keychain unavailable, using encrypted file storage
```markdown

**Solutions:**

- Linux: Install `libsecret-1-dev` and a secret service (e.g., gnome-keyring)
- Docker: Use `VELLUM_FORCE_FILE_STORAGE=true`
- CI/CD: Use environment variables instead

### Permission denied on credential file

```
❌ EPERM: Cannot read ~/.vellum/credentials.enc
```markdown

**Solution:**

```bash
chmod 600 ~/.vellum/credentials.enc
```markdown

### Invalid credential format

```text
❌ Invalid API key format for anthropic
```

**Expected formats:**

| Provider | Format |
|----------|--------|
| Anthropic | `sk-ant-api03-*` |
| OpenAI | `sk-*` or `sk-proj-*` |
| Google | `AIza*` |
| Azure | 32-character hex |

## See Also

- [Migration Guide](./migration/credential-migration.md) - Migrate from `apiKey` to `credential`
- [Provider Configuration](./providers.md) - Configure LLM providers
- [Security](./security.md) - Security best practices

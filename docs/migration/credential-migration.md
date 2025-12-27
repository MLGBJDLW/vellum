# Migration Guide: apiKey to Credential

This guide helps you migrate from the deprecated `apiKey` field to the new `credential` system.

## Why Migrate?

The new credential system provides:

| Feature | Old (`apiKey`) | New (`credential`) |
|---------|----------------|-------------------|
| Storage | Config file only | Keychain, encrypted file, env |
| Security | Plain text in YAML | AES-256-GCM encrypted |
| Management | Manual editing | CLI commands (`/login`, `/logout`) |
| Rotation | Replace entire config | Atomic in-place rotation |
| Audit | None | Full operation logging |
| Multi-key | Single key per provider | Named keys per provider |

## Before & After

### Before (Deprecated)

```yaml
# vellum.config.yaml
providers:
  - name: anthropic
    model: claude-sonnet-4-20250514
    apiKey: sk-ant-api03-xxxxx  # ⚠️ DEPRECATED

  - name: openai
    model: gpt-4
    apiKey: ${OPENAI_API_KEY}   # ⚠️ DEPRECATED
```

### After (Recommended)

```yaml
# vellum.config.yaml
providers:
  - name: anthropic
    model: claude-sonnet-4-20250514
    credential:
      type: api_key
      provider: anthropic
      # Resolved from: keychain → env → encrypted file

  - name: openai
    model: gpt-4
    credential:
      type: api_key
      provider: openai
```

## Step-by-Step Migration

### Step 1: Store credentials securely

For each provider with a direct `apiKey`:

```bash
# Option A: CLI command
vellum credentials add anthropic
# Enter your API key when prompted

# Option B: Slash command in TUI
/login anthropic
```

This stores your credential in the OS keychain (preferred) or encrypted file.

### Step 2: Update configuration

Replace `apiKey` with `credential` reference:

```yaml
# Before
- name: anthropic
  model: claude-sonnet-4-20250514
  apiKey: sk-ant-api03-xxxxx

# After
- name: anthropic
  model: claude-sonnet-4-20250514
  credential:
    type: api_key
    provider: anthropic
```

### Step 3: Verify migration

```bash
# Check credential is stored
vellum credentials list

# Test provider works
vellum chat --provider anthropic
```

### Step 4: Remove old keys

Once verified:

1. Delete `apiKey` lines from config
2. Remove API keys from `.env` files (if desired)
3. Rotate keys at provider dashboard for maximum security

## Migration Patterns

### Pattern 1: Direct key → Credential reference

```yaml
# Before
apiKey: sk-ant-api03-xxxxx

# After
credential:
  type: api_key
  provider: anthropic
```

### Pattern 2: Environment variable → Credential reference

```yaml
# Before
apiKey: ${ANTHROPIC_API_KEY}

# After (env vars still work!)
credential:
  type: api_key
  provider: anthropic
  # EnvCredentialStore reads ANTHROPIC_API_KEY automatically
```

Keep environment variables - they're checked first in resolution order.

### Pattern 3: Multiple keys per provider

```yaml
# Before (not supported)
# Had to create multiple config files

# After
credential:
  type: api_key
  provider: openai
  key: production  # Named key

# Store with:
# vellum credentials add openai --key production
```

### Pattern 4: OAuth/Token credentials

```yaml
# Before (not supported)

# After
credential:
  type: oauth_token
  provider: vertex
  # Token stored securely with refresh support
```

## Deprecation Timeline

| Version | Status |
|---------|--------|
| v1.0.0 | `apiKey` supported, `credential` introduced |
| v1.1.0 | `apiKey` triggers deprecation warning |
| v1.2.0 | `apiKey` triggers prominent warning |
| v2.0.0 | `apiKey` **removed** - migration required |

### Current Behavior (v1.1.0+)

When `apiKey` is used, you'll see:

```
⚠️ DEPRECATION WARNING: 'apiKey' field is deprecated.
   Migrate to 'credential' for secure storage.
   See: https://vellum.dev/docs/migration/credential-migration
```

## Programmatic Migration

### Config loader migration

```typescript
// Before
const config = {
  providers: [{
    name: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
  }],
};

// After
import { CredentialManager } from "@vellum/core";

const manager = new CredentialManager([...stores]);
const config = {
  providers: [{
    name: "anthropic",
    credential: {
      type: "api_key",
      provider: "anthropic",
    },
  }],
};

// Credential resolved automatically during provider creation
```

### Provider creation migration

```typescript
// Before
const provider = createProvider({
  name: "anthropic",
  apiKey: "sk-ant-...",
});

// After
const provider = createProvider({
  name: "anthropic",
  credential: await manager.resolve("anthropic"),
});
```

## FAQ

### Q: Do I have to migrate immediately?

**A:** No. The `apiKey` field continues to work but shows deprecation warnings. Plan to migrate before v2.0.0.

### Q: Will my environment variables stop working?

**A:** No. `EnvCredentialStore` reads environment variables automatically. The credential system checks env vars **first** in the resolution chain.

### Q: What if keychain isn't available (Docker, CI)?

**A:** Use one of these approaches:

```bash
# Option 1: Force file storage
export VELLUM_FORCE_FILE_STORAGE=true
export VELLUM_CREDENTIAL_PASSWORD=your-secure-password

# Option 2: Continue using env vars (they work with credential system)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 3: Mount credentials file
docker run -v ~/.vellum:/root/.vellum vellum
```

### Q: How do I migrate in CI/CD pipelines?

**A:** Environment variables are recommended for CI/CD:

```yaml
# GitHub Actions
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

# Config still uses credential reference
providers:
  - name: anthropic
    credential:
      type: api_key
      provider: anthropic
      # Resolved from ANTHROPIC_API_KEY env var
```

### Q: Can I use both old and new format during migration?

**A:** Yes. If both are present, `credential` takes precedence:

```yaml
providers:
  - name: anthropic
    apiKey: sk-old-key  # Ignored if credential resolves
    credential:
      type: api_key
      provider: anthropic  # Used first
```

### Q: How do I verify credentials are migrated correctly?

**A:** Use the credentials command:

```bash
vellum credentials list

# Output shows source of each credential:
# anthropic: keychain (migrated ✓)
# openai: env (OPENAI_API_KEY)
# google: file (encrypted)
```

### Q: What about shared team configurations?

**A:** Use credential references in shared config, let each team member store their own keys:

```yaml
# shared vellum.config.yaml (committed)
providers:
  - name: anthropic
    model: claude-sonnet-4-20250514
    credential:
      type: api_key
      provider: anthropic
      # Each developer runs: vellum credentials add anthropic
```

## Rollback

If you need to rollback to `apiKey`:

```yaml
# Temporarily revert
providers:
  - name: anthropic
    model: claude-sonnet-4-20250514
    apiKey: ${ANTHROPIC_API_KEY}  # Works but shows warning
```

Your stored credentials remain intact and will be used once you switch back to `credential`.

## Support

- [Credential System Documentation](../credentials.md)
- [GitHub Issues](https://github.com/vellum/vellum/issues)
- [Discord Community](https://discord.gg/vellum)

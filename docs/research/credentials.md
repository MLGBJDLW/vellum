# Credential flow review — 2026-10-29

Zed puts provider key entry in provider settings, stores submitted keys in the system keychain, and gives nonempty provider environment variables precedence. Model choice and credential storage are separate concerns. [Zed API access documentation](https://zed.dev/docs/ai/use-api-access)

Pi's `AuthStorage` shares read state, serializes storage changes, and coalesces concurrent reloads. Its metadata listing does not resolve secret values. The useful principle here is one coherent credential owner across selection and inference, with mutations invalidating stale consumers. [Pi auth-storage.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/auth-storage.ts)

Vellum already had a masked `/auth set` prompt and a `CredentialManager`. The model command and selector bypassed that owner. The fix reuses this prompt before switching to a cloud provider without a locally resolved credential, and before submitting the first task. Saving resumes the requested operation; cancellation leaves the selection unchanged. Local servers do not require a key. Local presence is not a claim that the remote provider accepts the key.

The CLI now shares one credential manager with inference. Credential writes/deletions clear configured provider clients. Environment discovery includes the supported providers and common DashScope, Zhipu, and Ark aliases. Concurrent keychain initialization waits for one promise. Onboarding no longer advances with a false “saved” result after persistence fails, and Enter is handled once by the active selector.

The file fallback now uses a generated local secret when no `VELLUM_CREDENTIAL_PASSWORD` is supplied. The existing encrypted-file owner publishes a complete secret at `credentials.enc.key` atomically; concurrent creators reuse the winning file. POSIX creation uses mode 0600. On Windows, an empty staging file receives a current-user DACL before any secret bytes are written; child process arguments contain paths and the account SID only. [Microsoft icacls documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)

Legacy files encrypted with the former shared default are fully validated before any key is created, then rotated through the existing atomic save operation. Failed validation/save preserves the original ciphertext. A managed-key marker prevents legacy fallback if a modern key file is missing. Explicit custom passwords remain supported, and wrong passwords cannot mutate existing ciphertext. Tests use temporary fixture paths only; this development task does not migrate the user's live store.

Regression coverage exercises missing keys, masked entry, cancellation/save failure, successful resumption, local models, environment aliases, concurrent initialization, client invalidation, and failed onboarding persistence. No real keys were written or inference requests sent by these tests.

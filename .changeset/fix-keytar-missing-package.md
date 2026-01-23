---
"@vellum/cli": patch
"@vellum/core": patch
---

fix(credentials): resolve keytar missing package error in npm install

- Add `keytar` as optionalDependency in cli package to ensure it's available at runtime
- Switch from explicit KeychainStore to HybridCredentialStore for automatic fallback
- When keytar is unavailable (e.g., missing build tools), gracefully fall back to encrypted file storage
- Fixes "Cannot find package 'keytar'" error when running global npm install

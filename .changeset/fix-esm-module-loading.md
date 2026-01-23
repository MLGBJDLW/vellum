---
"@butlerw/vellum": patch
---

Fix ESM module loading error when running CLI globally

Changes build output from CJS to ESM format with CJS compatibility banner to properly handle ESM-only dependencies (ink, shiki, etc.) that use top-level await.

---
"@butlerw/vellum": patch
---

### security(credentials)
- Upgraded scrypt cost parameter from N=16384 to N=65536 (OWASP 2023 compliant)
- Added maxmem parameter to prevent Node.js memory limit errors

### fix(credentials)
- Fixed migration state rollback on failure - prevents corrupted state
- Implemented atomic file writes (write-temp + rename) to prevent data loss on crash

### feat(credentials)
- Added scrypt version tracking in encrypted credential files
- Added transparent v1→v2 migration support with autoMigrate option
- Added `requiresScryptMigration()` and `migrate()` public methods

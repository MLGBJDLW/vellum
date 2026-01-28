---
"@butlerw/vellum": patch
---

### feat(shell)
- Added `isBackground` parameter for detached process support with PID return
- Implemented cross-platform `killProcessTree()` for process group management
- Added output truncation warning instead of silent discard
- Added output persistence to `~/.vellum/tool-output/` when truncated
- Added `inactivityTimeout` option with output-based timeout reset

### feat(security)
- Extended environment variable filtering for sensitive tokens (JWT, AWS, GitHub, etc.)

### fix(security)
- Whitelisted SSH_AUTH_SOCK and related SSH/GPG/X11 variables from filtering

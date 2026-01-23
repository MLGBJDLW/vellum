---
"@vellum/cli": patch
---

Fix slash commands broken chains and complete implementations

- Connect 7 groups of broken command chains to registry (agent, trust, mcp, workflow, copy, open, commit)
- Fix 8 additional unregistered commands (status, usage, spec-workflow, env, sandbox, init-prompts, validate-prompts, migrate-prompts)
- Resolve /spec naming conflict by renaming workflow spec to /spec-workflow
- Connect WIP commands (progress, install, uninstall) to their backends
- Implement sandbox commands (status, enable, disable) connecting to @vellum/sandbox
- Implement /env command for environment variable display with sensitive value filtering
- Implement /session list connecting to SessionListService
- Complete /mcp remove with auto-delete from config
- Add /metrics export functionality
- Fix /tutorial stop subcommand
- Remove unused subcommand definitions (/custom-agents edit, /tutorial prev, /tutorial demo)
- Delete redundant setup.ts (already covered by /onboard alias)

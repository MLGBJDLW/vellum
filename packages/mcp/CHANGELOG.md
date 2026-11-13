# @vellum/mcp

## 0.2.0

### Minor Changes

- Discover all pages of MCP tools, resources, resource templates, and prompts. Keep tool filters during refresh and reject repeated cursors without replacing the last complete inventory.

  Preserve structured tool output and mark server-reported application errors as failed receipts so the agent can repair them. Release transports, clients, and watchers when connection setup fails.

### Patch Changes

- Updated dependencies [`ee3651c`]:
  - @vellum/core@0.4.2

## 0.1.10

### Patch Changes

- Isolate task plans and transcript loading by session, submit complete slash commands on the first Enter, and preserve new input while commands run. Unify footer colors and tool activity around theme-aware Vellum ink motion with reduced-motion and ASCII support. Add coordinated workspace switching for the interactive primary agent, keeping project services, tools and the workspace header synchronized without restarting the conversation.
- Updated dependencies []:
  - @vellum/core@0.4.1

## 0.1.9

### Patch Changes

- Updated dependencies [`0c56c85`]:
  - @vellum/core@0.4.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`c194fa5`](https://github.com/MLGBJDLW/vellum/commit/c194fa5cead41ec7e8993a4c274837237520fd77)]:
  - @vellum/core@0.3.1

## 0.1.7

### Patch Changes

- Keep the composer available during active tasks and apply steering immediately by interrupting model generation while preserving running tools and their receipts. Restore full-width input, add a persistent sidebar control, and expose model-aware reasoning effort next to Thinking.

  Remove implicit shell, tool, verification and MCP execution deadlines; propagate explicit cancellation and stream large shell output to disk with bounded memory. Refresh provider metadata, recognize local reasoning capabilities, and migrate additional retired model IDs.
- Updated dependencies [`adc7f89`]:
  - @vellum/core@0.3.0

## 0.1.6

### Patch Changes

- Updated dependencies:
  - @vellum/core@0.2.2

## 0.1.5

### Patch Changes

- Updated dependencies [[`29d57e4`](https://github.com/MLGBJDLW/vellum/commit/29d57e424fcd2c1561c116b661be69fe4030865b)]:
  - @vellum/core@0.2.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`3e393db`](https://github.com/MLGBJDLW/vellum/commit/3e393db36c44f6346d4d1e74232aefb8da940f69)]:
  - @vellum/core@0.2.0
  - @vellum/shared@0.1.1

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @vellum/core@0.1.15

## 0.1.2

### Patch Changes

- Updated dependencies [[`24d366c`](https://github.com/MLGBJDLW/vellum/commit/24d366c90b959f563d578f301203e832ebe51833)]:
  - @vellum/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`dc3472a`](https://github.com/MLGBJDLW/vellum/commit/dc3472a50181e6a4d49d5177e2030167191ff233)]:
  - @vellum/core@0.1.1

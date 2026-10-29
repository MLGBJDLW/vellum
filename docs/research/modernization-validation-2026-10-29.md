# Terminal and provider modernization validation

This record distinguishes actual CLI use, local protocol fixtures, and isolated
tests. It does not claim paid inference against every vendor or coverage of every
physical terminal emulator. The release is prepared through PR #87.

## Functional checks

| Surface | Evidence | Result |
| --- | --- | --- |
| Composer editing | Packaged CLI in Windows ConPTY: DEL Backspace, forward Delete, Home/End, bracketed Chinese/emoji paste, and the exact reported SGR click/release bytes | Input edits remain ordered; mouse reports do not become text; Unicode deletion preserves complete characters. |
| Enhanced shortcuts | Real Ink modifier regressions and packaged CLI Ctrl+Shift+C | Modified copy shortcuts remain distinct from cancellation and no longer trigger a second persistence listener. |
| Model selection | Full 166-model catalog at 80×24 and 120×34; packaged CLI first/last/page navigation | The picker stays within its viewport. Actual CLI validation also repaired overlay paint order, opacity, and Escape dismissal; returning to the composer restores usable editing. |
| Interactive forms | Packaged CLI `/mcp add`, bracketed paste plus Enter, then cancel | The current value reaches the handler and advances to the next prompt. No server configuration is saved. |
| Credential input | Packaged CLI `/auth set openai`, synthetic text paste, Backspace, then Escape; onboarding fixture | Input stays masked and cancellation does not save the synthetic credential. The onboarding handler receives the current submitted value once. |
| Agent tools and delegation | Built CLI against a local HTTP model fixture; delegated worker reads an isolated file and returns its marker | Four actual HTTP requests complete the parent/worker/tool-result flow. |
| Local model refresh | Actual local HTTP discovery → shared catalog → LLM stream → SDK request tests | Native capabilities, configured authentication, explicit rejection, unknown capability, cancellation, and bounded metadata lookup are covered. |
| Git snapshots | Real temporary repositories plus namespace tests | Snapshot creation, diff, restore, checkpoint integration, and safe environment routing pass. |
| Persisted session metadata | Saved JSON → reopened storage → list service → real session picker; archived index and malformed-entry cases; packaged CLI Ctrl+S/Escape | Date objects are restored at the existing storage boundary. The actual picker opens with stored dates and previews, closes without losing the draft, and editing continues. Unsupported records survive unrelated updates and archives until explicit repair or removal. |
| Instruction watching | Real temporary file changes | Windows case aliases, newly created nested files, and constrained parent-directory subscriptions are covered. |

The complete local run passed 439 test files and 13,069 tests (32 skipped and five
existing TODOs). The six hosted OS/Node combinations also passed after fixture
cleanup. The final unsupported-record preservation change has an additional
119-test storage/list check; final commit checks and public release identity are
recorded in the PR/release validation updates.

## Review and retained boundaries

Independent review reproduced and repaired enhanced-key modifier loss, lost
settings paste, stale form submission, draft resurrection after submission, local
refresh disabling tools, and local discovery dropping authentication. Follow-up
review verified those corrections. Actual CLI use additionally identified model
picker overflow, overlay compositing/cancellation, and persisted session dates.

The existing execution loop, provider catalog, context manager, persistence
service, and shortcut registry remain the owners. No second scheduler, model
registry, or terminal renderer is introduced. Explicit budgets, cancellation,
repetition checks, transport retry limits, and bounded discovery remain active.

Detailed source references are in [terminal input](terminal-input-2026-10-29.md),
[provider modernization](provider-modernization-2026-10-29.md),
[dependency migration](dependency-modernization-2026-10-29.md), and the
[agent harness comparison](agent-harness.md).

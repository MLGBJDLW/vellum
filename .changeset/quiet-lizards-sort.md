---
"@butlerw/vellum": patch
---

Disable Ink Static message rendering to keep history inside the layout and prevent scrollback bleed in the TUI, and make several related improvements:

- Update translations and branding (Assistant → Vellum).
- Remove unused UI components (ChatView, status-bar, message-list, input, header).
- Remove the unused `useScrollEventBatcher` hook.
- Enhance the mode controller with message count thresholds and hysteresis.
- Improve input history storage with `localStorage` plus a file-based fallback.
- Add comprehensive tests for session, agent, and integration controllers.
- Add responsive overlay positioning logic for better TUI layout behavior.

# Terminal interaction review — 2026-10-29

Gemini CLI keeps a measured viewport, an item anchor, and an explicit sticky-bottom state in its virtualized list. This permits height changes without replacing reading intent. Vellum already derived its virtualized list from that approach; the useful change was to restore one active owner instead of adding another controller. [Gemini CLI VirtualizedList source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/shared/VirtualizedList.tsx)

Zed exposes a persistent message editor, streamed tool activity, and a discoverable sidebar for switching work. Its panel documentation also distinguishes queued input and steering rather than silently interpreting typing as a navigation action. This informed separate keyboard focus for Vellum's workspace panels and preservation of the message draft. [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel)

## Implemented changes

- Streamed and completed messages now share the existing virtualized viewport. The former split could clip a 100-line response to its first 11 lines permanently.
- Removed the controller-to-list and global-context synchronization loops. The list reports a read-only snapshot; PageUp pauses following until the user returns to the bottom. Typing and later stream chunks do not move history. Ink's native scrollbar is the single visible scrollbar.
- One binary-search helper replaces three linear offset scans. A 100,000-offset regression requires fewer than 20 reads to locate a row.
- Sidebar focus uses the existing AppContext. Narrow terminals present a temporary full-width sidebar while the chat stays mounted. Task/memory rows use the available width, activity previews are bounded, and panel navigation is visible.
- Animation controls no longer subscribe the input editor to frame updates. Spinners only mount in active tool rows. Reduced-motion mode stops decorative animations; a paused shimmer cannot start its own fallback timer.

## Evidence and limits

The focused Ink test paints a 100-line response in a 12-row viewport, confirms the tail is reachable, scrolls upward with real input events, appends streaming output, and verifies reading position is unchanged. Sidebar tests cover draft subtree preservation, unfocused input isolation, and narrow memory previews. An animation test confirms frame changes do not repaint control-only consumers.

Local capture fixtures produced actual Ink/React/Yoga frames at 120×34 and 76×24 for follow, history, streaming while reading, two sidebar panels, and return to chat. Frame heights stayed within the terminal rows and the draft returned after the narrow pane closed. These are deterministic rendering checks, not proof of every terminal emulator, OS compositor, or live provider response.

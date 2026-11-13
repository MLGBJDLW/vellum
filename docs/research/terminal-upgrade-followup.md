# Composer reliability follow-up

Source audit: 2026-11-13. This follow-up improves the existing terminal editor and
history owner. It adds no dependency, transport, background service, or CI job.

## Upstream references

| Project | Inspected source | Applied principle |
| --- | --- | --- |
| Codex | [`textarea.rs`, `69231e1`](https://github.com/openai/codex/blob/69231e119bfca0b14453515e97d99688ce1c47c9/codex-rs/tui/src/bottom_pane/textarea.rs) | Its editor distinguishes the full draft from displayed visual rows, keeps the caret in view, and reserves an insertion cell at full-width boundaries. Vellum now applies these principles inside its existing `TextInput`. |
| Hermes | [`textInput.tsx`, `5c1abd2`](https://github.com/NousResearch/hermes-agent/blob/5c1abd257d0cc1b531ffee6e50bef0621aa49dc4/ui-tui/src/components/textInput.tsx) | Grapheme-aware editing, terminal cell measurement and synchronous handling of batched input avoid splitting Unicode or losing adjacent input. Vellum reuses its existing terminal reader and editor refs for history replacement. |
| Zed | [`message_editor.rs`, `faf97b0`](https://github.com/zed-industries/zed/blob/faf97b0a0c1249f64b29bbc3f26d4503fa9bddf2/crates/agent_ui/src/message_editor.rs) | Draft snapshots and outgoing content come from the editor buffer. Display transformations must leave submitted contents intact. Vellum's viewport never truncates the actual draft. |

## Reproduced problems and changes

- A long draft rendered every logical or wrapped row, consuming the terminal and
  expensive Ink layout work. The editor now renders a cursor-following viewport
  sized to the terminal height, measuring its actual parent width through Ink's
  existing resize observer. Small terminal windows and nested prompts reflow
  without losing the draft. Above/below indicators expose hidden content.
- The previous wrapping estimate counted CJK and emoji as one column. The shared
  width utility and grapheme segmentation now determine rows; multiline vertical
  movement uses the same rows. The wrapping result is reused while navigating.
- Browsing down past the latest history entry required an extra key to restore
  the draft. Several arrow keys in one stdin chunk reused a stale history index,
  and loading an entry left the cursor at its previous position. History now
  advances synchronously and restores empty or non-empty drafts on the first
  Down. Edits leave history browsing; the existing editor replacement operation
  owns both the text and its cursor.
- `/model refresh` now forwards command cancellation and checks it again before
  updating the shared inventory. A cancelled late result retains the old catalog
  and reports cancellation instead of suggesting an authentication failure.

## Validation and limits

Existing editor, completion, history and model-command tests remain in use.
Focused regressions exercise 24/40-column parent layouts and resizing, long
Unicode drafts, a 200-line bracketed paste, full-content submission, visual
navigation, coalesced history keys, and cancelled discovery. These are terminal
rendering and input tests, not physical mobile-device certification or paid
provider inference. The viewport limits rendered rows only; it introduces no
draft-length or task-iteration limit. Existing submission/newline shortcuts are
unchanged.

# Terminal input repair — 2026-10-29

## Reproduced failures

An integration test rendered the actual Ink `TextInput` and wrote terminal bytes through its stdin. Before the repair, a coalesced click/release sequence inserted exactly `[<0;6;2M[<0;6;2m[<0;15;8M[<0;15;8m` into the controlled input value. Sending DEL (`0x7f`), the Backspace encoding used by modern terminals, to `hello` produced no change. Both assertions failed before implementation.

## Root causes

Ink consumes the `readable` event and calls `stdin.read()`. The existing mouse hook only prepended a `data` listener; the paste provider overrode `emit("data")`. Neither intercepted Ink's actual read boundary, and a prepended listener does not consume an event for later listeners. The mouse parser also assumed one complete report per chunk.

The published Ink fork still classifies DEL as forward Delete, as it does CSI `3~`. The input component therefore attempted to delete after the cursor, which does nothing at the end of the line. Separately, delayed paste buffering and render-captured values allowed a subsequent editing key or Enter to overtake pending text. A custom memo comparator retained callbacks and omitted the Tab-suppression prop.

## Repair

The existing mouse, paste, and text-input owners now share one reader per stdin, with reference-counted subscriptions and exact restoration on final unsubscribe. It frames keyboard input, SGR/X10 reports, and bracketed paste before Ink consumes them. Split UTF-8 and escape/paste markers are retained; complete reports are dispatched individually; focus and capability responses are consumed. Literal text such as `[<0;6;2M` remains text when it has no ESC prefix. Recognized mouse reports remain buffered across slow transport delays. Paste timeout handling uses the existing configuration.

DEL is normalized separately from forward Delete. Text edits and cursor changes advance synchronous refs, and the redundant paste-delay timer is removed. Home/End, word deletion, Kitty Enter modifiers and key-release filtering are supported. Deletion and horizontal navigation preserve Unicode graphemes. The standard React memo comparison replaces the incomplete custom comparison. Existing paste sanitization removes actual terminal control escapes, while retaining ordinary literal text.

## Validation and limits

After upgrading to Ink 7.1.0 and React 19.3.1, **61 tests passed across six focused files**:

```powershell
pnpm exec vitest run packages/cli/src/tui/components/Input/__tests__/TextInput.stdin.test.tsx packages/cli/src/tui/components/Input/__tests__/TextInput.test.tsx packages/cli/src/tui/utils/__tests__/terminal-input.test.ts packages/cli/src/tui/utils/__tests__/kitty-keyboard-protocol.test.ts packages/cli/src/tui/hooks/__tests__/useHotkeys.ctrl-input.test.tsx packages/cli/src/tui/hooks/__tests__/useBracketedPaste.test.tsx
```

Coverage includes the exact reported garbage, DEL versus Delete, coalesced text/edit/submit, split Unicode and paste markers, delayed mouse reports, focus reports, graphemes, Kitty Backspace/release, Shift+Enter/Ctrl+Enter, Ctrl+Backspace/Ctrl+Delete, shared-reader restoration, and incomplete-paste cleanup. Targeted Biome checks passed. These results establish behavior at the real Ink stdin/component boundary; they do not claim native visual or physical-keyboard verification.

## Review follow-up

The first review reproduced three integration gaps and added bounded regression coverage. Settings now uses the existing focused `TextInput` for edits and paste. A shared `useInput` hook restores enhanced-key modifiers for every consumer, so Ctrl+Shift+C cannot become Ctrl+C; the reader also preserves modified sequences before Ink's own exit handler. Keyboard delivery yields after Enter so a parent can clear or replace its form before queued keys arrive, and input refs reconcile on every commit, including a batched change back to the same controlled value. Clearing and non-clearing forms are both covered. Onboarding passes the editor's submitted credential directly, keeps it masked, and disables editing during validation.

After these changes, 155 tests passed across 12 focused files. A broader 66-file TUI run found two paste-context compatibility assertions; the outside-provider boolean contract and the signal fixture's TTY precondition were corrected, and the affected 20 tests passed. CLI type checking passed. The full repository check remains the release validation authority.

Native integration subsequently exposed an unbounded model-picker overlay. Full-catalog Ink fixtures reproduced 207 rows at 80×24 and 212 rows at 120×34. The existing picker now renders a terminal-sized model window, keeping the current model, thinking controls, focused details, and navigation footer visible. Provider labels remain on each row in catalog order. Home/End, PageUp/PageDown, and synchronous focus updates keep the first and last of all 166 catalog entries selectable, including a coalesced navigation-plus-Enter input. Both viewport fixtures pass without clipping the footer or exceeding terminal width/height. Missing model-picker entries in the embedded English/Chinese translation dictionaries were restored as part of this verification.

The packaged CLI was also launched in a Windows pseudo-terminal with the local
Ollama fixture model selected. Real terminal input produced `hell` after
`hello` plus DEL; both click/release pairs from the report left the composer
unchanged; Home/Delete/End produced `ell!`; bracketed paste of Chinese text and
an emoji followed by DEL preserved the Chinese text. Ctrl+C shut down cleanly
and emitted mouse/paste mode teardown sequences. No model request was submitted.
This verifies the actual CLI and pseudo-terminal byte path, not a physical mouse
or every terminal emulator.

The expanded CLI smoke also exposed a duplicate persistence shortcut listener:
Ctrl+Shift+C attempted checkpoint creation while the existing hotkey registry
entered copy mode, producing a persistence error in a fresh session. The unused
parallel shortcut hook and its export are removed. Copy mode and the session
manager retain their registered shortcuts; persistence remains available through
automatic saving, existing commands, and the snapshot panel.

## Primary references

- [pi-tui input framing](https://github.com/badlogic/pi-mono/blob/main/packages/tui/src/stdin-buffer.ts): retain fragmented sequences and distinguish keyboard data from paste before dispatch.
- [pi-tui key handling](https://github.com/badlogic/pi-mono/blob/main/packages/tui/src/keys.ts): preserve terminal key identity and distinguish legacy encodings from enhanced events.
- [Published Ink 7.1.0 input reader](https://unpkg.com/@jrichman/ink@7.1.0/build/components/App.js) and [keypress parser](https://unpkg.com/@jrichman/ink@7.1.0/build/parse-keypress.js): verified the `readable`/`read()` path and retained DEL/Delete classification.
- [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/): event types use the modifier field's colon subfield; release is event type 3. The previous implementation incorrectly extracted event type from modifier bits.

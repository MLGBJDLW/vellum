---
"@butlerw/vellum": minor
---

### feat(tui): NO_FLICKER rendering mode with full mouse support

Implements Claude Code-level terminal rendering upgrades for Vellum TUI, adding synchronized output across all major terminals, complete mouse interaction support, and a self-built layout position system.

### feat(tui): SGR mouse event system
- Add zero-dependency SGR mouse event parser (mouse-parser.ts) supporting SGR DEC 1000/1002/1003/1006 and X10 legacy formats
- Add useMouse hook with stdin prependListener to capture mouse events before Ink processes them
- Add MouseContext provider with subscribe/unsubscribe pattern for wheel and click events
- Wire MouseProvider into RootProvider with dynamic mode (full / wheel-only / disabled) from config

### feat(tui): mouse scroll for VirtualizedList
- Add useMouseScroll hook integrating with MouseContext wheel events
- Wire mouse wheel scroll into MessageList (3 lines/tick; auto-exits follow mode on scroll-up, re-enters on scroll-to-bottom)
- Graceful degradation via useMouseContextOptional() when no MouseProvider present

### feat(tui): layout position tracking and clickable regions
- Add LayoutPositionContext computing absolute terminal coordinates from Layout header/footer/sidebar dimensions
- Add ItemPositionContext inside VirtualizedList providing each visible item relative position
- Add useLayoutPosition hook converting relative-to-content coordinates to absolute terminal coordinates
- Add ClickRegionRegistry singleton for hit-tested click dispatch with priority-sorted bounding-box
- Add useClickRegion hook for registering and unregistering click regions on mount/unmount
- Add Clickable wrapper component auto-resolving position via props -> item context -> layout context chain

### feat(tui): interactive elements
- ThinkingBlock header: click to toggle expand/collapse; shows hint when mouse active
- MarkdownRenderer links: click to open in default browser (http/https only via execFile, metachar-escaped)
- StatusBar mode indicator: click to cycle coding mode (vibe/plan/spec)
- PermissionDialog approve/reject/always-approve buttons: click in addition to keyboard
- OptionSelector rows: click to select immediately

### feat(tui): DEC 2026 synchronized output extended to all terminals
- Extend BufferedStdout DEC 2026 activation beyond Windows+VS Code to all supported terminals: iTerm2, Kitty, WezTerm, Alacritty, Ghostty, Windows Terminal, and any COLORTERM=truecolor terminal
- Add synchronizedOutput capability to TerminalCapabilities in detectTerminal.ts
- Centralize detection in supportsSynchronizedOutput() used by both BufferedStdout and synchronized-update.ts

### perf(tui): frame rendering optimizations
- Add 16ms frame throttle (~60fps) with trailing flush to BufferedStdout
- Add cursor parking (ESC[H) in alt-screen mode for self-healing cursor drift
- Add full-damage detection to useFlickerDetector: height change >5 lines triggers full repaint instead of incremental diff
- Add FrameMonitor for per-frame performance diagnostics; wire into BufferedStdout.flush(); enable via VELLUM_FRAME_STATS=1

### feat(tui): NO_FLICKER configuration system
- Add no-flicker.ts with VELLUM_NO_FLICKER, VELLUM_DISABLE_MOUSE, VELLUM_DISABLE_MOUSE_CLICKS env vars
- Read persistent settings from ~/.vellum/settings.json (noFlicker.enabled, mouseEnabled, mouseClicksEnabled, scrollSpeed, frameRate); env vars take priority over settings file
- Add /mouse slash command (on / off / wheel / status) for runtime mouse mode switching without restart
- Add open-url.ts secure URL opener using execFile with http/https protocol whitelist and Windows cmd metachar escaping
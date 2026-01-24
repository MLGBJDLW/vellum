---
"@butlerw/vellum": patch
---

### Virtual Scroll Optimization

Complete implementation of virtual scroll optimization for the TUI message list, delivering smooth 60fps scrolling even with large conversation histories.

#### Key Features

**Performance Architecture**
- O(1) anchor compensation using block sums for instant scroll position recalculation
- Render budget monitoring with automatic quality degradation under pressure
- Incremental markdown parsing to avoid blocking the main thread

**Scroll Behavior**
- 3-state follow mode FSM: `auto` (tracks new content), `locked` (manual position), `off` (disabled)
- Terminal-specific scroll normalization handling differences between VS Code, ConPTY, and native terminals
- Smooth scroll animation with configurable easing curves
- Scroll past end with rubberband effect for natural feel

**UX Improvements**
- Streaming message separation keeping partial content visually distinct
- New messages banner when scrolled up with unread content below
- Nested scroll focus regions for code blocks and tool outputs

This is an internal performance improvement with no API changes.

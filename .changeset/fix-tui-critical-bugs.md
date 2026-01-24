---
"@butlerw/vellum": patch
---

fix(tui): resolve critical rendering and scroll issues

- Fix thinking block not auto-collapsing after streaming ends
- Fix header duplication/flickering with tighter render batching
- Fix virtual scroll follow mode losing sticky-to-bottom state
- Add LRU eviction to collapsible storage (max 100 entries)
- Add React.memo to 4 components for render optimization

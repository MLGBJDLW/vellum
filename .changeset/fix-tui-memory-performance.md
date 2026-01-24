---
"@butlerw/vellum": patch
---

fix(tui): memory and performance improvements

- Fix abort listener memory leak in permission handler
- Optimize shell output updates with O(1) lookup
- Clear tool call tracking map on execution clear

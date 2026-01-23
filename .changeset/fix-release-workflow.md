---
"@butlerw/vellum": patch
---

fix(ci): improve release workflow zip creation and title formatting

- Recursively exclude all node_modules directories from release zip (fixes 592MB bloat)
- Exclude build artifacts, logs, and temporary files from zip
- Fix release notes title to show "vellum v0.1.7" instead of "@butlerw/vellum @butlerw/vellum@0.1.7"

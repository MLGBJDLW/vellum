---
"@vellum/core": patch
"@vellum/sandbox": patch
"@butlerw/vellum": patch
---

Prevent non-interactive commands from hanging on open stdin, preserve UTF-8 output
across stream boundaries, and retain the available prefix when sandbox output exceeds
its byte limit. Cancel complete subprocess trees through one shared implementation,
correctly distinguish cancellation from timeout, and avoid blocking the Windows
event loop during process cleanup. Handle background startup failures without
unhandled process errors and preserve captured output when display callbacks fail.

---
"@butlerw/vellum": patch
---

### fix(web-search)
- Sanitize SerpAPI key from error messages to prevent log leaks

### feat(web-search)
- Add exponential backoff retry for 429 and 5xx errors (max 3 retries)
- Add warning log when all DuckDuckGo HTML parsers fail

### test(web-search)
- Add 12 new tests for fallback patterns, retry, timeout, Bing engine

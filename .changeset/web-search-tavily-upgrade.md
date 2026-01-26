---
"@vellum/core": patch
"@vellum/cli": patch
---

### feat(tools)
- Integrate Tavily search engine with AI-powered summarization
- Add advanced search parameters: searchDepth, timeRange, domains filtering
- Extend WebSearchParams schema to support new parameters

### feat(cli)
- Add `/websearch` command for search engine configuration

### fix(tools)
- Fix position reset bug in DuckDuckGo alt pattern matching
- Fix sleep timer memory leak during search retries
- Migrate Tavily URL to CONFIG_DEFAULTS.externalApis
- Add timeout budget tracking for search operations
- Update User-Agent to Chrome/131
- Improve HTML tag cleanup with stripHtmlTags()

### test(tools)
- Add 9 test cases for Tavily search engine

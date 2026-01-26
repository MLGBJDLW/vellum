---
"@butlerw/vellum": minor
---

### feat(tools)
- 集成 Tavily 搜索引擎，支持 AI 智能总结功能
- 新增高级搜索参数：searchDepth（basic/advanced）、timeRange（day/week/month/year）、domains 域名过滤
- 扩展 WebSearchParams Schema 支持新参数

### feat(cli)
- 新增 `/websearch` 命令，支持交互式 web 搜索

### fix(tools)
- 增强 DuckDuckGo 搜索引擎稳定性
- 更新 User-Agent 为 Chrome/131
- 优化 HTML 标签清理逻辑

### test(tools)
- 新增 9 个 Tavily 搜索引擎测试用例

---
"@butlerw/vellum": patch
---

### feat(skill)
- Implemented mode trigger type matching in evaluateTrigger()
- Return ScanResult from scanAll() with scanned count and failed list
- Return discriminated union from loadL2() - distinguish not-found vs error

### fix(skill)
- Fixed async initialization race condition - added skillInitPromise to await before skill matching
- Enforce maxActiveSkills limit (default 10) in getActiveSkills()
- Populate projectContext with provider/model/mode info instead of empty object
- Wire up builtin skills loading - discovery now returns actual path
- Apply sources config filter in discoverAll()
- Graceful circular dependency handling - warn and skip instead of crash
- Add guard clause for ctx.checkPermission in skill-tool
- Wire up setSkillManager() call in AgentLoop to enable skill tool

### refactor(skill)
- Unified permission checking logic into shared checkSkillPermission() function

### test(skill)
- Add permission.test.ts and skill-tool.test.ts for test coverage
